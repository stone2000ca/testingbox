import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { callOpenRouter } from './callOpenRouter.ts';
import { handleDeepDive } from './handleDeepDive.ts';
import { handleResults } from './handleResults.ts';
import { handleBrief } from './handleBrief.ts';
import { handleDiscovery } from './handleDiscovery.ts';
import { extractEntities } from './extractEntities.ts';
import { resolveTransition } from './resolveTransition.ts';
// Sprint A: extractEntities + resolveTransition integration
// BUG-DD-002 fix: selectedSchoolId destructured
// deploy-trigger-v7

Deno.serve(async (req) => {
  const TIMEOUT_MS = 25000;
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  );

  const processRequest = async () => {
    var classificationResult;
    var currentState;
    var briefStatus;
    
    try {
      const base44 = createClientFromRequest(req);
      const { message, conversationHistory, conversationContext, region, userId, consultantName, currentSchools, userNotes, shortlistedSchools, userLocation, selectedSchoolId } = await req.json();

    console.log('ORCH START', { 
      messageLength: message?.length, 
      hasConversationHistory: !!conversationHistory,
      conversationHistoryLength: conversationHistory?.length,
      hasConversationContext: !!conversationContext, 
      consultant: consultantName,
      userId: userId,
      hasUserLocation: !!userLocation
    });

    const context = conversationContext || {};
    const msgLower = message.toLowerCase();
    
    // STATE MACHINE: 5 states (strictly deterministic)
    const STATES = {
      WELCOME: 'WELCOME',
      DISCOVERY: 'DISCOVERY',
      BRIEF: 'BRIEF',
      RESULTS: 'RESULTS',
      DEEP_DIVE: 'DEEP_DIVE'
    };

    const BRIEF_STATUS = {
      GENERATING: 'generating',
      PENDING_REVIEW: 'pending_review',
      EDITING: 'editing',
      CONFIRMED: 'confirmed'
    };
    
    // KI-12 FIX PART B: City coordinates - MOVED TO handleResults.ts (only consumer)
    // CITY_COORDS removed from orchestrator — not referenced here
    
    let briefEditCount = context.briefEditCount || 0;
    const MAX_BRIEF_EDITS = 3;
    
    const conversationId = context.conversationId;
    
    // STEP 0: Initialize/retrieve FamilyProfile
    let conversationFamilyProfile = null;
    
    if (userId && conversationId) {
      try {
        const profiles = await base44.entities.FamilyProfile.filter({
          userId,
          conversationId: conversationId
        });
        conversationFamilyProfile = profiles.length > 0 ? profiles[0] : null;
        
        if (!conversationFamilyProfile) {
          conversationFamilyProfile = await base44.entities.FamilyProfile.create({
            userId,
            conversationId: conversationId
          });
          console.log('Created new FamilyProfile:', conversationFamilyProfile.id);
        }
      } catch (e) {
        console.error('FamilyProfile error:', e);
      }
    } else {
      conversationFamilyProfile = {
        childName: null,
        childGrade: null,
        locationArea: null,
        maxTuition: null,
        interests: [],
        priorities: [],
        dealbreakers: [],
        academicStrengths: []
      };
    }
    
    // STEP 1: WELCOME HANDLER (skip extraction for true welcome state)
    const isFirstMessage = conversationHistory?.length === 0;
    let extractionResult = null;
    let intentSignal = 'continue';
    let briefDelta = { additions: [], updates: [], removals: [] };
    let resolveResult = null;

    if (isFirstMessage && !context.state) {
      // True WELCOME: return greeting, skip extraction
      console.log('[ORCH] First message, return WELCOME greeting');
      return Response.json({
        message: "I'm your NextSchool education consultant. I help families find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you?",
        state: STATES.WELCOME,
        briefStatus: null,
        conversationContext: context,
        schools: []
      });
    }

    // STEP 2: ENTITY EXTRACTION (all other messages)
    extractionResult = await extractEntities({ base44, message, conversationFamilyProfile, context, conversationHistory });
    const { extractedEntities, updatedFamilyProfile, updatedContext } = extractionResult;
    intentSignal = extractionResult.intentSignal || 'continue';
    briefDelta = extractionResult.briefDelta;
    
    // Apply results
    Object.assign(conversationFamilyProfile, updatedFamilyProfile);
    Object.assign(context, updatedContext);
    
    // STEP 3: BUILD PROFILE DATA FOR TRANSITION RESOLUTION
    const profileData = {
      location: conversationFamilyProfile?.locationArea || context.extractedEntities?.locationArea || null,
      gradeLevel: conversationFamilyProfile?.childGrade || context.extractedEntities?.childGrade || null,
      priorities: conversationFamilyProfile?.priorities || [],
      dealbreakers: conversationFamilyProfile?.dealbreakers || [],
      curriculum: conversationFamilyProfile?.curriculumPreference || [],
      schoolType: conversationFamilyProfile?.schoolType || null
    };
    
    const turnCount = (conversationHistory?.filter(m => m.role === 'user').length || 0) + 1;
    const currentBriefEditCount = context.briefEditCount || 0;
    const previousSchoolId = context.previousSchoolId || null;
    
    // STEP 4: RESOLVE TRANSITION (deterministic state machine)
    resolveResult = resolveTransition({
      currentState: context.state || STATES.WELCOME,
      intentSignal,
      profileData,
      turnCount,
      briefEditCount: currentBriefEditCount,
      selectedSchoolId,
      previousSchoolId,
      message
    });
    
    currentState = resolveResult.nextState;
    briefStatus = resolveResult.briefStatus || context.briefStatus || null;
    const { flags } = resolveResult;
    
    console.log('[ORCH] resolveTransition returned:', { nextState: resolveResult.nextState, intentSignal, sufficiency: resolveResult.sufficiency, flags: resolveResult.flags });
    
    // Update context with resolved state
    context.state = currentState;
    context.briefStatus = briefStatus;
    context.dataSufficiency = resolveResult.sufficiency;
    context.transitionReason = resolveResult.transitionReason;

    console.log(`[STATE] ${currentState} | briefStatus: ${briefStatus} | flags: ${JSON.stringify(flags)} | sufficiency: ${context.dataSufficiency} | reason: ${context.transitionReason}`);

    // SAFETY NET: Deterministic keyword escape at orchestrator level
    // Catches 'show me the brief' etc. even if resolveTransition's R2.5 was overwritten by sync
    if (currentState === STATES.DISCOVERY) {
      const msgCheck = (message || '').toLowerCase();
      const briefEscapeKeywords = ['show me my brief', 'show me the brief', 'give me the brief', 'generate my brief', 'show me schools', 'just show me schools', 'show me results', 'enough questions', 'stop asking'];
      const matchedEscape = briefEscapeKeywords.find(kw => msgCheck.includes(kw));
      if (matchedEscape) {
        console.log('[ORCH SAFETY NET] Keyword escape caught at orchestrator level:', matchedEscape);
        currentState = STATES.BRIEF;
        briefStatus = 'generating';
        context.state = currentState;
        context.briefStatus = briefStatus;
      }
    }

    // STEP 5: STATE-SPECIFIC RESPONSE GENERATION (pass flags to handlers)
    if (currentState === STATES.DISCOVERY) {
      return handleDiscovery({ 
        base44, 
        message, 
        conversationFamilyProfile, 
        context, 
        conversationHistory, 
        consultantName, 
        currentState, 
        briefStatus, 
        currentSchools, 
        conversationId, 
        userId,
        flags 
      });
    }
    
    if (currentState === STATES.BRIEF) {
      const briefResponse = await handleBrief({ 
        base44, 
        message, 
        conversationFamilyProfile, 
        context, 
        conversationHistory, 
        consultantName, 
        currentState, 
        briefStatus, 
        currentSchools, 
        conversationId, 
        userId,
        flags 
      });

      // BRIEF CONTENT SAFETY NET: If handleBrief returned generic/thin content
      // (Base44 version may be stale), rebuild programmatically from extracted entities.
      try {
        const briefData = await briefResponse.json();
        const briefMsg = briefData.message || '';
        const hasStructuredContent = briefMsg.includes('Grade') || briefMsg.includes('grade') || 
          briefMsg.includes('Location') || briefMsg.includes('Budget') || briefMsg.includes('Student:');
        const isGenericBrief = briefMsg.length < 150 || !hasStructuredContent;

        if (isGenericBrief && (context.extractedEntities || conversationFamilyProfile)) {
          console.log('[ORCH BRIEF SAFETY NET] Generic brief detected, length:', briefMsg.length, 'rebuilding programmatically');
          const bullets = [];
          if (conversationFamilyProfile?.childName) bullets.push('Student: ' + conversationFamilyProfile.childName);
          const grade = conversationFamilyProfile?.childGrade ?? context.extractedEntities?.childGrade;
          if (grade !== null && grade !== undefined) {
            bullets.push('Grade: ' + (grade === -1 ? 'JK' : grade === 0 ? 'SK' : 'Grade ' + grade));
          }
          const loc = conversationFamilyProfile?.locationArea || context.extractedEntities?.locationArea;
          if (loc) bullets.push('Location: ' + loc);
          const budget = conversationFamilyProfile?.maxTuition || context.extractedEntities?.budgetSingle;
          if (budget) bullets.push('Budget: $' + Number(budget).toLocaleString());
          if (conversationFamilyProfile?.genderPreference || context.extractedEntities?.genderPreference) {
            bullets.push('Gender preference: ' + (conversationFamilyProfile?.genderPreference || context.extractedEntities?.genderPreference));
          }
          if (conversationFamilyProfile?.curriculumPreference?.length) {
            bullets.push('Curriculum: ' + conversationFamilyProfile.curriculumPreference.join(', '));
          }
          if (conversationFamilyProfile?.programPreferences?.length) {
            bullets.push('Program preferences: ' + conversationFamilyProfile.programPreferences.join(', '));
          }
          if (conversationFamilyProfile?.priorities?.length) {
            bullets.push('Top priorities: ' + conversationFamilyProfile.priorities.join(', '));
          }
          const learningNeeds = conversationFamilyProfile?.learning_needs || conversationFamilyProfile?.specialNeeds || [];
          if (learningNeeds.length) bullets.push('Learning needs: ' + learningNeeds.join(', '));
          if (conversationFamilyProfile?.wellbeing_needs?.length) {
            bullets.push('Wellbeing needs: ' + conversationFamilyProfile.wellbeing_needs.join(', '));
          }
          if (conversationFamilyProfile?.interests?.length) {
            bullets.push('Interests: ' + conversationFamilyProfile.interests.join(', '));
          }
          if (conversationFamilyProfile?.dealbreakers?.length) {
            bullets.push('Dealbreakers: ' + conversationFamilyProfile.dealbreakers.join(', '));
          }
          if (context.extractedEntities?.boardingPreference) bullets.push('Boarding: Yes');
          if (context.extractedEntities?.religiousPreference) {
            bullets.push('Religious preference: ' + context.extractedEntities.religiousPreference);
          }

          if (bullets.length > 0) {
            const intro = consultantName === 'Jackie'
              ? "Let me make sure I've got this right:\n\n"
              : "Here's what I'm hearing:\n\n";
            briefData.message = intro + bullets.map(b => '\u2022 ' + b).join('\n') + "\n\nDoes that capture everything? Anything you'd like to adjust?";
            console.log('[ORCH BRIEF SAFETY NET] Rebuilt brief with', bullets.length, 'bullets');
          }
        }
        return new Response(JSON.stringify(briefData), { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' } 
        });
      } catch (safetyNetError) {
        console.error('[ORCH BRIEF SAFETY NET] Error:', safetyNetError.message, '- returning original response');
        // Can't re-read the response body (already consumed), so rebuild a minimal response
        return Response.json({
          message: "Here's what I've captured so far. Does that look right? Feel free to adjust anything.",
          state: STATES.BRIEF,
          briefStatus: briefStatus,
          familyProfile: conversationFamilyProfile,
          conversationContext: context,
          schools: []
        });
      }
    }

    if (currentState === STATES.RESULTS) {
      return handleResults({ 
        base44, 
        message, 
        conversationFamilyProfile, 
        context, 
        conversationHistory, 
        consultantName, 
        currentState, 
        briefStatus, 
        currentSchools, 
        selectedSchoolId, 
        userLocation, 
        region, 
        conversationId, 
        userId,
        flags 
      });
    }

    if (currentState === STATES.DEEP_DIVE) {
      return handleDeepDive({ 
        base44, 
        selectedSchoolId, 
        message, 
        conversationFamilyProfile, 
        context, 
        conversationHistory, 
        consultantName, 
        currentState, 
        briefStatus, 
        currentSchools, 
        conversationId, 
        userId,
        flags 
      });
    }

      // Fallback
      return Response.json({
       message: 'I encountered an unexpected state. Please try again.',
       state: currentState,
       briefStatus: briefStatus,
       schools: [],
       familyProfile: conversationFamilyProfile,
       conversationContext: context
      });

    } catch (error) {
      console.error('orchestrateConversation FATAL:', error);
      return Response.json({ error: error.message || String(error) }, { status: 500 });
    }
  };

  try {
    return await Promise.race([processRequest(), timeoutPromise]);
  } catch (error) {
    if (error.message === 'TIMEOUT') {
      return Response.json({ 
        error: 'Request timeout',
        status: 408 
      }, { status: 408 });
    }
    return Response.json({ 
      error: 'Something went wrong. Please try again.',
      status: 500 
    }, { status: 500 });
  }
});