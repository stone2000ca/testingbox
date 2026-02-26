import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
// Sprint A: extractEntities + resolveTransition integration
// BUG-DD-002 fix: selectedSchoolId destructured
// deploy-trigger-v9 - ALL imports removed, using base44.functions.invoke() instead

// INLINED: resolveTransition function (no imports allowed in Deno functions)
function resolveTransition(params) {
  const {
    currentState,
    intentSignal,
    profileData,
    turnCount,
    briefEditCount,
    selectedSchoolId,
    previousSchoolId,
    message
  } = params;

  const STATES = {
    WELCOME: 'WELCOME',
    DISCOVERY: 'DISCOVERY',
    BRIEF: 'BRIEF',
    RESULTS: 'RESULTS',
    DEEP_DIVE: 'DEEP_DIVE'
  };

  // Calculate sufficiency: RICH=location+grade+2priorities, MINIMUM=location+grade, THIN=missing either
  const hasLocation = !!(profileData?.location);
  const hasGrade = profileData?.gradeLevel !== null && profileData?.gradeLevel !== undefined;
  const prioritiesCount = profileData?.priorities?.length || 0;
  
  let sufficiency = 'THIN';
  if (hasLocation && hasGrade) {
    if (prioritiesCount >= 2) {
      sufficiency = 'RICH';
    } else {
      sufficiency = 'MINIMUM';
    }
  }

  // Initialize flags
  const flags = {
    SUGGEST_BRIEF: false,
    OFFER_BRIEF: false,
    FORCED_TRANSITION: false,
    USER_INTENT_OVERRIDE: false
  };

  let nextState = currentState;
  let briefStatus = null;
  let transitionReason = 'natural';

  console.log('[RESOLVE] Input:', { currentState, intentSignal, sufficiency, turnCount, briefEditCount, selectedSchoolId });

  // R1: WELCOME > DISCOVERY always (if not initial message)
  if (currentState === STATES.WELCOME && turnCount > 0) {
    nextState = STATES.DISCOVERY;
    transitionReason = 'auto_welcome_exit';
    console.log('[R1] WELCOME->DISCOVERY (conversation started)');
    return { nextState, sufficiency, flags, transitionReason };
  }

  // R2: DEEP_DIVE override if selectedSchoolId present
  if (selectedSchoolId && selectedSchoolId !== previousSchoolId) {
    nextState = STATES.DEEP_DIVE;
    transitionReason = 'school_selected';
    console.log('[R2] Override to DEEP_DIVE (school selected)');
    return { nextState, sufficiency, flags, transitionReason };
  }

  // R2.5: DETERMINISTIC INTENT ESCAPE - keyword pattern matching on raw message (no LLM dependency)
  if (message && currentState === STATES.DISCOVERY) {
    const messageLower = message.toLowerCase();
    const briefPatterns = [
      'show me my brief',
      'show me the brief',
      'give me the brief',
      'generate my brief',
      'put together the brief',
      'ready for my brief',
      'show me schools',
      'just show me schools',
      'show me results',
      'i\'ve shared everything',
      'that\'s all i have',
      'i\'ve told you everything',
      'enough questions',
      'stop asking'
    ];

    const matchedKeyword = briefPatterns.find(pattern => messageLower.includes(pattern));
    if (matchedKeyword) {
      console.log('[R2.5] Deterministic intent escape triggered:', matchedKeyword);
      console.log('[RESOLVE] Output:', { nextState: STATES.BRIEF, sufficiency, flags: { USER_INTENT_OVERRIDE: true }, transitionReason: 'deterministic_escape', briefStatus: 'generating' });
      return {
        nextState: STATES.BRIEF,
        sufficiency,
        flags: { ...flags, USER_INTENT_OVERRIDE: true },
        transitionReason: 'deterministic_escape',
        briefStatus: 'generating'
      };
    }
  }

  // R3: ABSOLUTE INTENT ESCAPE - user explicitly asks for brief/results = ALWAYS transition
  // No sufficiency check, no turnCount check. User intent overrides everything.
  if ((intentSignal === 'request-brief' || intentSignal === 'request-results') && currentState === STATES.DISCOVERY) {
    console.log('[R3] ABSOLUTE ESCAPE - intent:', intentSignal, 'sufficiency:', sufficiency, 'turnCount:', turnCount);
    console.log('[RESOLVE] Output:', { nextState: STATES.BRIEF, sufficiency, flags: { USER_INTENT_OVERRIDE: true }, transitionReason: 'explicit_demand' });
    return {
      nextState: STATES.BRIEF,
      sufficiency,
      flags: { ...flags, USER_INTENT_OVERRIDE: true },
      transitionReason: 'explicit_demand',
      briefStatus: 'generating'
    };
  }

  // R4: HARD CAP AT TURN 7
  if (turnCount >= 7 && currentState === STATES.DISCOVERY) {
    nextState = STATES.BRIEF;
    briefStatus = 'generating';
    flags.FORCED_TRANSITION = true;
    transitionReason = 'hard_cap';
    console.log('[R4] Escape Rule: Hard cap at turn 7, forcing BRIEF');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason, briefStatus };
  }

  // R5: SOFT NUDGE AT TURN 5
  if (turnCount >= 5 && currentState === STATES.DISCOVERY && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
    flags.SUGGEST_BRIEF = true;
    transitionReason = 'soft_nudge';
    console.log('[R5] Escape Rule: Soft nudge at turn 5');
    console.log('[RESOLVE] Output:', { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason });
    return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason };
  }

  // R6: Intent maps (legacy, for backward compat - R3/R4 handled above)
  if (intentSignal === 'request-brief' && turnCount < 2 && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
    nextState = STATES.BRIEF;
    briefStatus = 'generating';
    flags.USER_INTENT_OVERRIDE = true;
    transitionReason = 'explicit_intent';
    console.log('[R6] Intent: request-brief -> BRIEF (turnCount < 2)');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason, briefStatus };
  }

  if (intentSignal === 'request-results' && turnCount < 2 && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
    nextState = STATES.RESULTS;
    flags.USER_INTENT_OVERRIDE = true;
    transitionReason = 'explicit_intent';
    console.log('[R6] Intent: request-results -> RESULTS (turnCount < 2)');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason };
  }

  if (intentSignal === 'edit-criteria') {
    nextState = STATES.BRIEF;
    briefStatus = 'editing';
    flags.USER_INTENT_OVERRIDE = true;
    transitionReason = 'explicit_intent';
    console.log('[R6] Intent: edit-criteria -> BRIEF (editing)');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason, briefStatus };
  }

  if (intentSignal === 'back-to-results') {
    nextState = STATES.RESULTS;
    flags.USER_INTENT_OVERRIDE = true;
    transitionReason = 'explicit_intent';
    console.log('[R6] Intent: back-to-results -> RESULTS');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason };
  }

  if (intentSignal === 'restart') {
    nextState = STATES.DISCOVERY;
    // Note: Caller should clear profile
    flags.USER_INTENT_OVERRIDE = true;
    transitionReason = 'explicit_intent';
    console.log('[R6] Intent: restart -> DISCOVERY');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason };
  }

  if (intentSignal === 'ask-about-school') {
    nextState = STATES.DEEP_DIVE;
    flags.USER_INTENT_OVERRIDE = true;
    transitionReason = 'explicit_intent';
    console.log('[R6] Intent: ask-about-school -> DEEP_DIVE');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason };
  }

  // R7: Auto-thresholds in DISCOVERY (turn-based progression)
  if (currentState === STATES.DISCOVERY) {
    if (turnCount >= 8 && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
      nextState = STATES.BRIEF;
      briefStatus = 'generating';
      flags.FORCED_TRANSITION = true;
      transitionReason = 'auto_threshold';
      console.log('[R7] Turn >= 8, force BRIEF');
      console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
      return { nextState, sufficiency, flags, transitionReason, briefStatus };
    }

    if (turnCount >= 6 && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
      flags.OFFER_BRIEF = true;
      transitionReason = 'auto_threshold';
      console.log('[R7] Turn >= 6, set OFFER_BRIEF flag');
      console.log('[RESOLVE] Output:', { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason });
      return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason };
    }

    if (turnCount >= 4 && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
      flags.SUGGEST_BRIEF = true;
      transitionReason = 'auto_threshold';
      console.log('[R7] Turn >= 4, set SUGGEST_BRIEF flag');
      console.log('[RESOLVE] Output:', { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason });
      return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason };
    }
  }

  // R8: Continue in DISCOVERY stays DISCOVERY
  if (currentState === STATES.DISCOVERY && intentSignal === 'continue') {
    console.log('[R8] DISCOVERY + continue intent, stay DISCOVERY');
    console.log('[RESOLVE] Output:', { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason });
    return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason };
  }

  // R9: Off-topic stays current state
  if (intentSignal === 'off-topic') {
    console.log('[R9] Off-topic, stay in current state');
    console.log('[RESOLVE] Output:', { nextState: currentState, sufficiency, flags, transitionReason });
    return { nextState: currentState, sufficiency, flags, transitionReason };
  }

  // R10: Brief edit count max 3
  if (currentState === STATES.BRIEF && briefEditCount >= 3) {
    nextState = STATES.RESULTS;
    briefStatus = 'confirmed';
    flags.FORCED_TRANSITION = true;
    transitionReason = 'edit_cap_reached';
    console.log('[R10] Edit cap reached (3), move to RESULTS');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason, briefStatus };
  }

  // R11: DEEP_DIVE re-entry (stay in DEEP_DIVE unless explicit back intent)
  if (currentState === STATES.DEEP_DIVE && !selectedSchoolId) {
    nextState = STATES.RESULTS;
    console.log('[R11] DEEP_DIVE but no selectedSchoolId, back to RESULTS');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason };
  }

  // Default: maintain current state
  console.log('[DEFAULT] Maintain current state:', currentState);
  console.log('[RESOLVE] Output:', { nextState: currentState, sufficiency, flags, transitionReason });
  return { nextState: currentState, sufficiency, flags, transitionReason };
}

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