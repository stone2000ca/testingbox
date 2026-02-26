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
      // DIRECT BRIEF GENERATION - handleBrief.ts has permanent deployment error
      console.log('[ORCH BRIEF] Building brief directly in orchestrator (handleBrief bypassed)');
      
      const bullets = [];
      
      // 1. Child name
      const childName = conversationFamilyProfile?.childName || 'your child';
      
      // 2. Grade
      const grade = context.extractedEntities?.childGrade;
      let gradeDisplay = null;
      if (grade === -1) {
        gradeDisplay = 'JK';
      } else if (grade === 0) {
        gradeDisplay = 'SK';
      } else if (grade !== null && grade !== undefined) {
        gradeDisplay = 'Grade ' + grade;
      }
      
      if (childName !== 'your child' && gradeDisplay) {
        bullets.push('Student: ' + childName + ', ' + gradeDisplay);
      } else if (childName !== 'your child') {
        bullets.push('Student: ' + childName);
      } else if (gradeDisplay) {
        bullets.push('Grade: ' + gradeDisplay);
      }
      
      // 3. Location
      const location = context.extractedEntities?.locationArea;
      if (location) bullets.push('Location: ' + location);
      
      // 4. Budget
      const maxTuition = conversationFamilyProfile?.maxTuition;
      if (maxTuition && typeof maxTuition === 'number') {
        bullets.push('Budget: $' + maxTuition.toLocaleString());
      }
      
      // 5. Priorities
      const priorities = conversationFamilyProfile?.priorities;
      if (priorities && priorities.length > 0) {
        bullets.push('Top priorities: ' + priorities.join(', '));
      }
      
      // 6. Interests
      const interests = conversationFamilyProfile?.interests;
      if (interests && interests.length > 0) {
        bullets.push('Interests: ' + interests.join(', '));
      }
      
      // 7. Learning needs
      const learningNeeds = conversationFamilyProfile?.learning_needs;
      if (learningNeeds && learningNeeds.length > 0) {
        bullets.push('Learning needs: ' + learningNeeds.join(', '));
      }
      
      // 8. Gender preference
      const genderPreference = context.extractedEntities?.genderPreference;
      if (genderPreference) bullets.push('Gender preference: ' + genderPreference);
      
      // 9. Curriculum
      const curriculum = conversationFamilyProfile?.curriculumPreference;
      if (curriculum && curriculum.length > 0) {
        bullets.push('Curriculum: ' + curriculum.join(', '));
      }
      
      // 10. Dealbreakers
      const dealbreakers = conversationFamilyProfile?.dealbreakers;
      if (dealbreakers && dealbreakers.length > 0) {
        bullets.push('Dealbreakers: ' + dealbreakers.join(', '));
      }
      
      // Build message
      const intro = consultantName === 'Jackie'
        ? "Let me make sure I've got this right:\n\n"
        : "Here's what I'm hearing:\n\n";
      
      const briefContent = bullets.length > 0
        ? bullets.map(b => '\u2022 ' + b).join('\n')
        : '\u2022 I captured your preferences but need more details.';
      
      const briefMessage = intro + briefContent + "\n\nDoes that capture everything? Anything you'd like to adjust?";
      
      console.log('[ORCH BRIEF] Generated brief with', bullets.length, 'bullets');
      
      return Response.json({
        message: briefMessage,
        state: STATES.BRIEF,
        briefStatus: 'pending_review',
        familyProfile: conversationFamilyProfile,
        conversationContext: context,
        schools: []
      });
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