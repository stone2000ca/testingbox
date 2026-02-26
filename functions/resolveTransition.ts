// Pure function: deterministic state resolution based on intent signal and profile data
export function resolveTransition(params) {
  const {
    currentState,
    intentSignal,
    profileData,
    turnCount,
    briefEditCount,
    selectedSchoolId,
    previousSchoolId
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

  // R3: EXPLICIT INTENT ESCAPE (highest priority after R1/R2)
  if ((intentSignal === 'request-brief' || intentSignal === 'request-results') && turnCount >= 3 && currentState === STATES.DISCOVERY) {
    if (sufficiency === 'MINIMUM' || sufficiency === 'RICH') {
      nextState = STATES.BRIEF;
      briefStatus = 'generating';
      flags.USER_INTENT_OVERRIDE = true;
      transitionReason = 'explicit_demand';
      console.log('[R3] Escape Rule: Explicit intent at turn', turnCount, 'sufficiency:', sufficiency);
      console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
      return { nextState, sufficiency, flags, transitionReason, briefStatus };
    } else if (sufficiency === 'THIN') {
      flags.ONE_SHOT_RECOVERY = true;
      transitionReason = 'fast_collect';
      console.log('[R3] Escape Rule: Explicit intent at turn', turnCount, 'sufficiency:', sufficiency);
      console.log('[RESOLVE] Output:', { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason });
      return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason };
    }
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

  // R6: Intent maps (only for turnCount < 3, escape rules above handle turnCount >= 3)
  if (intentSignal === 'request-brief' && turnCount < 3 && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
    nextState = STATES.BRIEF;
    briefStatus = 'generating';
    flags.USER_INTENT_OVERRIDE = true;
    transitionReason = 'explicit_intent';
    console.log('[R6] Intent: request-brief -> BRIEF (turnCount < 3)');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason, briefStatus };
  }

  if (intentSignal === 'request-results' && turnCount < 3 && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
    nextState = STATES.RESULTS;
    flags.USER_INTENT_OVERRIDE = true;
    transitionReason = 'explicit_intent';
    console.log('[R6] Intent: request-results -> RESULTS (turnCount < 3)');
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

// Note: Deno.serve wrapper removed — this module is imported directly by orchestrateConversation.ts