import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// =============================================================================
// INLINED: callOpenRouter
// E18c-002: LLM call logging — writes LLMLog entity for every call (fire-and-forget)
// =============================================================================
async function callOpenRouter(options) {
  const { systemPrompt, userPrompt, responseSchema, maxTokens = 1000, temperature = 0.7, _logContext } = options;
  // _logContext = { base44, conversation_id, phase, is_test } — optional, used for LLMLog only

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) {
    console.warn('[OPENROUTER] OPENROUTER_API_KEY not set');
    throw new Error('OPENROUTER_API_KEY not set');
  }
  
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });
  
  const body: any = {
    models: ['google/gemini-2.5-flash', 'openai/gpt-4.1-mini', 'google/gemini-2.5-flash-lite'],
    messages,
    max_tokens: maxTokens,
    temperature
  };
  
  if (responseSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: responseSchema.name || 'response',
        strict: true,
        schema: responseSchema.schema
      }
    };
  }
  
  console.log('[OPENROUTER] Calling with models:', body.models, 'maxTokens:', maxTokens);

  // E18c-002: Start timer
  const startTime = Date.now();

  const fullPromptStr = messages.map(m => `[${m.role}] ${m.content}`).join('\n');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nextschool.ca',
        'X-OpenRouter-Title': 'NextSchool'
      },
      body: JSON.stringify(body)
    });

    const latency_ms = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OPENROUTER] API error:', response.status, errorText);

      // E18c-002: Log error (fire-and-forget)
      if (_logContext?.base44) {
        const isTest = _logContext.is_test === true;
        _logContext.base44.asServiceRole.entities.LLMLog.create({
          conversation_id: _logContext.conversation_id || 'unknown',
          phase: _logContext.phase || 'unknown',
          model: 'unknown',
          prompt_summary: fullPromptStr.substring(0, 500),
          response_summary: errorText.substring(0, 500),
          token_count_in: 0,
          token_count_out: 0,
          latency_ms,
          status: 'error',
          is_test: isTest,
          ...(isTest ? { full_prompt: fullPromptStr } : {}),
          error_message: `HTTP ${response.status}: ${errorText.substring(0, 300)}`
        }).catch(e => console.error('[E18c-002] LLMLog write failed:', e.message));
      }

      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    console.log('[OPENROUTER] Response model used:', data.model, 'usage:', data.usage);
    
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenRouter returned empty content');

    // E18c-002: Log success (fire-and-forget)
    if (_logContext?.base44) {
      const isTest = _logContext.is_test === true;
      _logContext.base44.asServiceRole.entities.LLMLog.create({
        conversation_id: _logContext.conversation_id || 'unknown',
        phase: _logContext.phase || 'unknown',
        model: data.model || 'unknown',
        prompt_summary: fullPromptStr.substring(0, 500),
        response_summary: content.substring(0, 500),
        token_count_in: data.usage?.prompt_tokens || 0,
        token_count_out: data.usage?.completion_tokens || 0,
        latency_ms,
        status: 'success',
        is_test: isTest,
        ...(isTest ? { full_prompt: fullPromptStr, full_response: content } : {})
      }).catch(e => console.error('[E18c-002] LLMLog write failed:', e.message));
    }

    if (responseSchema) {
      try {
        return JSON.parse(content);
      } catch (e) {
        console.error('[OPENROUTER] JSON parse failed:', content.substring(0, 200));
        throw new Error('OpenRouter structured output parse failed');
      }
    }
    
    return content;
  } catch (err) {
    const latency_ms = Date.now() - startTime;
    // Only log if not already logged above (i.e. network-level errors, not HTTP errors)
    const isNetworkError = !err.message?.startsWith('OpenRouter API error:') && err.message !== 'OpenRouter returned empty content' && err.message !== 'OpenRouter structured output parse failed';
    if (isNetworkError && _logContext?.base44) {
      const isTest = _logContext.is_test === true;
      _logContext.base44.asServiceRole.entities.LLMLog.create({
        conversation_id: _logContext.conversation_id || 'unknown',
        phase: _logContext.phase || 'unknown',
        model: 'unknown',
        prompt_summary: fullPromptStr.substring(0, 500),
        response_summary: '',
        token_count_in: 0,
        token_count_out: 0,
        latency_ms,
        status: 'timeout',
        is_test: isTest,
        ...(isTest ? { full_prompt: fullPromptStr } : {}),
        error_message: err.message?.substring(0, 300)
      }).catch(e => console.error('[E18c-002] LLMLog write failed:', e.message));
    }
    throw err;
  }
}

// =============================================================================
// INLINED: resolveTransition
// =============================================================================
function resolveTransition(params) {
  const { currentState, intentSignal, profileData, turnCount, briefEditCount, selectedSchoolId, previousSchoolId, userMessage, tier1CompletedTurn: storedTier1CompletedTurn } = params;

  const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };

  const hasLocation = !!(profileData?.locationArea);
  const hasGrade = profileData?.childGrade !== null && profileData?.childGrade !== undefined;
  const hasBudget = !!(profileData?.maxTuition);
  const prioritiesCount = profileData?.priorities?.length || 0;
  
  let sufficiency = 'THIN';
  if (hasLocation && hasGrade) {
    sufficiency = prioritiesCount >= 2 ? 'RICH' : 'MINIMUM';
  }

  const flags = { SUGGEST_BRIEF: false, OFFER_BRIEF: false, FORCED_TRANSITION: false, USER_INTENT_OVERRIDE: false };
  let nextState = currentState;
  let transitionReason = 'natural';

  // Dynamic cap tracking: store turn when Tier 1 first became complete
  const tier1Complete = hasGrade && hasLocation && hasBudget;
  let tier1CompletedTurn = storedTier1CompletedTurn || null;
  if (tier1Complete && tier1CompletedTurn === null) {
    tier1CompletedTurn = turnCount;
    flags.tier1CompletedTurn = tier1CompletedTurn;
  }

  console.log('[RESOLVE] Input:', { currentState, intentSignal, sufficiency, turnCount, briefEditCount, selectedSchoolId });
  console.log('[DEBUG-BRIEF] briefStatus:', params.briefStatus, 'userMessage:', userMessage);

  // BUG-FLOW-001 HARD GUARD: RESULTS and DEEPDIVE can NEVER regress to BRIEF or DISCOVERY.
  const inResultsOrDeepDive = currentState === STATES.RESULTS || currentState === STATES.DEEP_DIVE;
  if (inResultsOrDeepDive) {
    // E13a: Visit debrief detection — if user mentions visiting/touring a school
    const DEBRIEF_RE = /\b(visited|toured|went to|saw the campus|open house|got back from|checked out|walked through)\b/i;
    if (DEBRIEF_RE.test(userMessage || '') || intentSignal === 'visit_debrief') {
      console.log('[E13a] Visit debrief detected');
      return { 
        nextState: STATES.DEEP_DIVE, 
        sufficiency, 
        flags: { ...flags, DEBRIEF_MODE: true }, 
        transitionReason: 'visit_debrief',
        deepDiveMode: 'debrief'
      };
    }
    
    if (currentState === STATES.RESULTS && intentSignal === 'edit-criteria') {
      console.log('[EDIT-CRITERIA] Allowing transition from RESULTS to BRIEF for edit-criteria');
      return { nextState: STATES.BRIEF, sufficiency, flags: { ...flags, USER_INTENT_OVERRIDE: true }, briefStatus: 'editing', transitionReason: 'edit_criteria_from_results' };
    }
    if (selectedSchoolId && selectedSchoolId !== previousSchoolId) {
      return { nextState: STATES.DEEP_DIVE, sufficiency, flags, transitionReason: 'school_selected' };
    }
    console.log('[HARD GUARD] Blocked regression from', currentState, '— intentSignal was:', intentSignal);
    return { nextState: currentState, sufficiency, flags, transitionReason: 'hard_guard_results_deepdive' };
  }

  if (currentState === STATES.WELCOME && turnCount > 0) {
    return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason: 'auto_welcome_exit' };
  }
  if (selectedSchoolId && selectedSchoolId !== previousSchoolId) {
    return { nextState: STATES.DEEP_DIVE, sufficiency, flags, transitionReason: 'school_selected' };
  }
  
  // DETERMINISTIC BRIEF CONFIRMATION CHECK - overrides LLM intent classification
  const confirmPhrases = new Set(['that looks right', 'show me schools', 'looks good', 'looks right', 'confirmed', 'yes', 'yep', 'yeah', 'yes please', 'that looks right - show me schools']);
  const msgNormalized = (userMessage || '').toLowerCase().trim();
  const isConfirmed = Array.from(confirmPhrases).some(p => msgNormalized === p || msgNormalized.startsWith(p));
  if (currentState === STATES.BRIEF && params.briefStatus === 'pending_review' && isConfirmed) {
    flags.USER_INTENT_OVERRIDE = true;
    console.log('[DETERMINISTIC] Brief confirmed by match:', userMessage, 'briefStatus was:', params.briefStatus);
    return { nextState: STATES.RESULTS, sufficiency, flags, transitionReason: 'brief_confirmed_deterministic', briefStatus: 'confirmed' };
  }
  
  if (currentState === STATES.BRIEF && params.briefStatus === 'pending_review' && (intentSignal === 'confirm-brief' || intentSignal === 'request-results')) {
    flags.USER_INTENT_OVERRIDE = true;
    return { nextState: STATES.RESULTS, sufficiency, flags, transitionReason: 'brief_confirmed', briefStatus: 'confirmed' };
  }

  // FIX-A: STOP_PHRASES — if user explicitly signals they're done with questions,
  // always route to BRIEF regardless of data sufficiency. Must check BEFORE sufficiency guard.
  const STOP_PHRASES = /\b(no more questions|show me schools|i('m| am) done|enough questions|just show|stop asking|skip|let'?s see|move on|go ahead|that'?s enough|ready to see)\b/i;
  if (currentState === STATES.DISCOVERY && STOP_PHRASES.test(userMessage || '')) {
    flags.USER_INTENT_OVERRIDE = true;
    console.log('[FIX-A] Stop-intent detected, routing to BRIEF regardless of sufficiency:', userMessage);
    return { nextState: STATES.BRIEF, sufficiency, flags, transitionReason: 'stop_intent', briefStatus: 'generating', tier1CompletedTurn };
  }

  if ((intentSignal === 'request-brief' || intentSignal === 'request-results') && turnCount >= 3 && currentState === STATES.DISCOVERY) {
    if (sufficiency === 'MINIMUM' || sufficiency === 'RICH') {
      flags.USER_INTENT_OVERRIDE = true;
      return { nextState: STATES.BRIEF, sufficiency, flags, transitionReason: 'explicit_demand', briefStatus: 'generating' };
    }
  }
  if (currentState === STATES.DISCOVERY) {
    if (tier1Complete && tier1CompletedTurn !== null && turnCount >= (tier1CompletedTurn + 2)) {
      flags.FORCED_TRANSITION = true;
      return { nextState: STATES.BRIEF, sufficiency, flags, transitionReason: 'enrichment_cap', briefStatus: 'generating', tier1CompletedTurn };
    } else if (turnCount >= 10) {
      flags.FORCED_TRANSITION = true;
      return { nextState: STATES.BRIEF, sufficiency, flags, transitionReason: 'hard_cap', briefStatus: 'generating', tier1CompletedTurn };
    }
  }
  if (intentSignal === 'request-brief' && turnCount < 3 && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
    flags.USER_INTENT_OVERRIDE = true;
    return { nextState: STATES.BRIEF, sufficiency, flags, transitionReason: 'explicit_intent', briefStatus: 'generating' };
  }
  // FIX-B: 'request-results' from DISCOVERY now routes to BRIEF (not directly to RESULTS).
  // BRIEF is the mandatory confirmation gate before RESULTS.
  if (intentSignal === 'request-results' && turnCount < 3 && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
    flags.USER_INTENT_OVERRIDE = true;
    return { nextState: STATES.BRIEF, sufficiency, flags, transitionReason: 'explicit_intent_via_brief', briefStatus: 'generating' };
  }
  if (intentSignal === 'edit-criteria') {
    flags.USER_INTENT_OVERRIDE = true;
    return { nextState: STATES.BRIEF, sufficiency, flags, transitionReason: 'explicit_intent', briefStatus: 'editing' };
  }
  if (intentSignal === 'back-to-results') {
    flags.USER_INTENT_OVERRIDE = true;
    return { nextState: STATES.RESULTS, sufficiency, flags, transitionReason: 'explicit_intent', clearSelectedSchool: true };
  }
  if (intentSignal === 'restart') {
    flags.USER_INTENT_OVERRIDE = true;
    return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason: 'explicit_intent' };
  }
  if (currentState === STATES.DISCOVERY && intentSignal === 'continue') {
    return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason };
  }
  if (intentSignal === 'off-topic') {
    return { nextState: currentState, sufficiency, flags, transitionReason };
  }
  if (currentState === STATES.BRIEF && briefEditCount >= 3) {
    flags.FORCED_TRANSITION = true;
    return { nextState: STATES.RESULTS, sufficiency, flags, transitionReason: 'edit_cap_reached', briefStatus: 'confirmed' };
  }
  return { nextState: currentState, sufficiency, flags, transitionReason };
}



// =============================================================================
// INLINED: handleDiscovery
// =============================================================================
async function handleDiscovery(base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentSchools, flags, returningUserContextBlock) {
  const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };

  const history = conversationHistory || [];
  const recentMessages = history.slice(-10);
  const conversationSummary = recentMessages
    .filter(msg => msg?.content)
    .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
    .join('\n');

  const briefOfferInstruction = flags?.OFFER_BRIEF 
    ? '\n\nIMPORTANT: You should offer to generate their Family Brief now.'
    : flags?.SUGGEST_BRIEF
    ? '\n\nIf it feels natural in the conversation, offer to generate their Family Brief.'
    : '';

  const hasGrade = conversationFamilyProfile?.childGrade !== null && conversationFamilyProfile?.childGrade !== undefined;
  const hasLocation = !!conversationFamilyProfile?.locationArea;
  const hasBudget = !!conversationFamilyProfile?.maxTuition;
  const hasGender = !!conversationFamilyProfile?.gender;

  const knownFacts = [];
  if (hasGrade) knownFacts.push(`grade ${conversationFamilyProfile.childGrade}`);
  if (hasGender) knownFacts.push(`${conversationFamilyProfile.gender}`);
  if (hasLocation) knownFacts.push(`location: ${conversationFamilyProfile.locationArea}`);
  if (hasBudget) knownFacts.push(`budget: $${conversationFamilyProfile.maxTuition}`);
  const knownSummary = knownFacts.length > 0
    ? `\nALREADY COLLECTED (DO NOT ASK AGAIN): ${knownFacts.join(', ')}.`
    : '';

  let tier1Guidance = '';
  if (!hasGrade && !hasGender) {
    tier1Guidance = "TIER 1 PRIORITY: We need to understand who this is for. Ask about their child in a way that naturally reveals both their grade/age AND whether this is for a son or daughter. Example: 'Tell me about your son or daughter - what grade are they heading into?' Keep it warm and conversational.";
  } else if (!hasGrade) {
    tier1Guidance = "TIER 1 PRIORITY: Grade/age has not been collected yet. If the conversation allows, naturally steer toward asking about the child's grade or age.";
  } else if (!hasGender) {
    tier1Guidance = "TIER 1 PRIORITY: Gender/sex of the child has not been collected yet. Naturally work in a question about whether this is for a son or daughter (or if gender doesn't matter for school choice). Do NOT ask directly 'what is your child's gender' - keep it conversational.";
  } else if (!hasLocation) {
    tier1Guidance = "TIER 1 PRIORITY: Location has not been collected yet. If the conversation allows, naturally steer toward asking about the city or region they're looking in.";
  } else if (!hasBudget) {
    tier1Guidance = "TIER 1 PRIORITY: Budget has not been collected yet. If the conversation allows, naturally steer toward asking about their tuition budget or range. Budget is always annual tuition. Do NOT ask to confirm if it is per year or per month. Accept the number as-is.";
  }

  const stopIntentConstraint = `CRITICAL HARD CONSTRAINT — HIGHEST PRIORITY — OVERRIDES ALL OTHER INSTRUCTIONS:
If the user signals they are done with questions (e.g. "show me schools", "no more questions", "stop asking", "that's enough", "I'm done", "just show me results", "skip", "go ahead", "let's see", "move on"), you MUST immediately stop asking questions. Do NOT ask any clarifying or follow-up question. Do NOT explain what information is missing. Your ONLY job at that point is to acknowledge their request in one warm sentence and confirm the brief is being prepared. This rule overrides all instructions about thoroughness, completeness, or missing Tier 1 data.\n\n`;

  const personaInstructions = consultantName === 'Jackie'
    ? `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}${stopIntentConstraint}[STATE: DISCOVERY] You are gathering family info to find the right school. Your primary goal is to collect Tier 1 data: child's grade/age, preferred location, and budget — in that priority order.
${knownSummary}
${tier1Guidance}
Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.
CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Do NOT interrupt emotional or contextual sharing — allow organic conversation flow. Keep gathering information.
CRITICAL: NEVER ask the user to confirm or repeat information they have already provided in this conversation. If they said their daughter is in grade 9, do not ask what grade again.${briefOfferInstruction}
YOU ARE JACKIE - Senior education consultant, 10+ years placing families in private schools. You're warm but efficient.`
    : `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}${stopIntentConstraint}[STATE: DISCOVERY] You are gathering family info to find the right school. Your primary goal is to collect Tier 1 data: child's grade/age, preferred location, and budget — in that priority order.
${knownSummary}
${tier1Guidance}
Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.
CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Do NOT interrupt emotional or contextual sharing — allow organic conversation flow. Keep gathering information.
CRITICAL: NEVER ask the user to confirm or repeat information they have already provided in this conversation. If they said their daughter is in grade 9, do not ask what grade again.${briefOfferInstruction}
YOU ARE LIAM - Senior education strategist, 10+ years in private school placement. You're direct and data-driven.`;

  const discoveryUserPrompt = `Recent chat:\n${conversationSummary}\n\nParent: "${message}"\n\nRespond as ${consultantName}. ONE question max. No filler.`;

  let discoveryMessageRaw = 'Tell me more about your child.';
  try {
    const fastResponse = await base44.integrations.Core.InvokeLLM({ 
      prompt: personaInstructions + '\n\nRecent chat:\n' + conversationSummary + '\n\nParent: "' + message + '"\n\nRespond as ' + consultantName + '. ONE question max. No filler.',
      model: 'gpt-5'
    });
    discoveryMessageRaw = fastResponse?.response || fastResponse || 'Tell me more about your child.';
    console.log('[DISCOVERY] Response via InvokeLLM (fast path)');
  } catch (invokeLLMError) {
    console.log('[DISCOVERY] InvokeLLM failed, falling back to OpenRouter');
    try {
      const aiResponse = await callOpenRouter({
        systemPrompt: personaInstructions,
        userPrompt: discoveryUserPrompt,
        maxTokens: 500,
        temperature: 0.7
      });
      discoveryMessageRaw = aiResponse || 'Tell me more about your child.';
      console.log('[DISCOVERY] Response via OpenRouter (fallback)');
    } catch (openrouterError) {
      console.error('[DISCOVERY] Both LLM providers failed');
    }
  }
  
  if (currentSchools && currentSchools.length > 0) {
    const sentences = discoveryMessageRaw.split(/(?<=[.!?])\s+/);
    const filteredSentences = sentences.filter(sentence => {
      for (const school of currentSchools) {
        const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
        if (regex.test(sentence)) return false;
      }
      return true;
    });
    discoveryMessageRaw = filteredSentences.join(' ').trim();
  }

  return {
    message: discoveryMessageRaw,
    state: STATES.DISCOVERY,
    briefStatus: null,
    familyProfile: conversationFamilyProfile,
    conversationContext: context,
    schools: []
  };
}

// =============================================================================
// INLINED: handleVisitDebrief
// =============================================================================
async function handleVisitDebrief(base44, selectedSchoolId, processMessage, conversationFamilyProfile, context, consultantName, returningUserContextBlock, callOpenRouter) {
   if (!selectedSchoolId) return null;
   // NOTE: conversationId may be missing; artifact lookups will be guarded
  
  try {
    console.log('[E13a] Debrief mode active for school:', selectedSchoolId);
    
    // Load school and prior analysis (including deep_dive_analysis for fit re-evaluation)
    const schoolResults = await base44.entities.School.filter({ id: selectedSchoolId });
    let artifacts = [];
    let deepDiveArtifacts = [];
    if (context?.conversationId) {
      [artifacts, deepDiveArtifacts] = await Promise.all([
        base44.entities.GeneratedArtifact.filter({ 
          conversationId: context.conversationId,
          schoolId: selectedSchoolId,
          artifactType: 'visit_prep'
        }),
        base44.entities.GeneratedArtifact.filter({ 
          conversationId: context.conversationId,
          schoolId: selectedSchoolId,
          artifactType: 'deep_dive_analysis'
        })
      ]);
    }
    const school = schoolResults?.[0];
    const priorAnalysis = artifacts?.[0];
    const deepDiveAnalysis = deepDiveArtifacts?.[0];
    
    if (!school) return null;
    
    const schoolName = school.name;
    const childName = conversationFamilyProfile?.childName || 'your child';
    const priorVisitQuestions = priorAnalysis?.content?.visitQuestions || [];
    const priorTradeOffs = priorAnalysis?.content?.tradeOffs || [];
    
    // WC9: Initialize or refresh debrief question queue if switching schools
    const isNewDebrief = context.debriefSchoolId !== selectedSchoolId;
    let debriefQuestionQueue = context.debriefQuestionQueue || [];
    let debriefQuestionsAsked = context.debriefQuestionsAsked || [];
    
    if (isNewDebrief || debriefQuestionQueue.length === 0) {
      console.log('[E13a] Generating debrief question queue');
      debriefQuestionQueue = [];
      debriefQuestionsAsked = [];
      
      // Slot 0: Persona-generated opener
      const openerQ = consultantName === 'Jackie'
        ? 'How did it feel walking through the halls and seeing the spaces? What emotions came up?'
        : 'Did anything surprise you compared to what they advertise on their website or what you expected?';
      debriefQuestionQueue.push(openerQ);
      
      // Slots 1-2: Pull from VisitPrepKit or generate from priorities
      if (priorVisitQuestions.length > 0) {
        const q1 = typeof priorVisitQuestions[0] === 'string' ? priorVisitQuestions[0] : priorVisitQuestions[0]?.question;
        const q2 = priorVisitQuestions.length > 1 ? (typeof priorVisitQuestions[1] === 'string' ? priorVisitQuestions[1] : priorVisitQuestions[1]?.question) : null;
        if (q1) debriefQuestionQueue.push(q1);
        if (q2) debriefQuestionQueue.push(q2);
      } else {
        const priorities = conversationFamilyProfile?.priorities || [];
        if (priorities.length > 0) {
          debriefQuestionQueue.push(`How did they handle ${priorities[0]}? Did you see that reflected in the school?`);
        }
        if (priorities.length > 1) {
          debriefQuestionQueue.push(`What was your impression of their approach to ${priorities[1]}?`);
        }
      }
      
      // Ensure we always have 3 questions
      while (debriefQuestionQueue.length < 3) {
        debriefQuestionQueue.push('What was your overall impression?');
      }
    }
    
    // Pop next question if queue isn't empty
    let nextQuestion = '';
    if (debriefQuestionQueue.length > 0) {
      nextQuestion = debriefQuestionQueue.shift();
      debriefQuestionsAsked.push(nextQuestion);
    }
    
    const isDebriefComplete = debriefQuestionQueue.length === 0 && debriefQuestionsAsked.length >= 3;
    const debriefQuestionsContext = `${nextQuestion ? `Next focus: "${nextQuestion}"` : 'Wrap up naturally — you\'ve asked your key questions.'}\n\nQuestions asked so far: ${debriefQuestionsAsked.length}/3`;
    
    // Build debrief prompt with persona-specific framing
    const basePrompt = `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}You are ${consultantName}, an education consultant. The family just returned from visiting ${schoolName}.

${debriefQuestionsContext}`;

    const debriefSystemPrompt = consultantName === 'Jackie'
      ? `${basePrompt}

JACKIE TONE: Warm, empathetic, encouraging. Acknowledge their feelings and experiences before asking next question. Validate emotional responses. Help them feel heard.`
      : `${basePrompt}

LIAM TONE: Direct, analytical, practical. Acknowledge their observations factually before asking next question. Compare to expectations and data. Focus on fit assessment.`;

    const debriefUserPrompt = `Family just said: "${processMessage}"

${isDebriefComplete ? 'They\'ve shared their impressions. Wrap up warmly, validate their insights, and summarize what you heard.' : `Ask them: "${nextQuestion}"\n\nBe natural — don't sound robotic.`}`;

    let debriefMessage = "Tell me about your visit experience.";
    try {
      const debriefResponse = await callOpenRouter({
        systemPrompt: debriefSystemPrompt,
        userPrompt: debriefUserPrompt,
        maxTokens: 500,
        temperature: 0.7
      });
      debriefMessage = debriefResponse || "Tell me about your visit experience.";
    } catch (openrouterError) {
      try {
        const fallbackResponse = await base44.integrations.Core.InvokeLLM({
          prompt: debriefSystemPrompt + '\n\n' + debriefUserPrompt,
          model: 'gpt-5'
        });
        debriefMessage = fallbackResponse?.response || fallbackResponse || "Tell me about your visit experience.";
      } catch (fallbackError) {
        console.error('[E13a] Debrief response failed:', fallbackError.message);
      }
    }

    // WC9: Persist debrief Q&A pair (non-blocking)
    if (nextQuestion && context.userId && context.conversationId) {
      try {
        const newQAPair = {
          question: nextQuestion,
          answer: processMessage,
          timestamp: new Date().toISOString()
        };

        const existingArtifacts = await base44.entities.GeneratedArtifact.filter({
          conversationId: context.conversationId,
          schoolId: selectedSchoolId,
          artifactType: 'visit_debrief'
        });

        if (existingArtifacts && existingArtifacts.length > 0) {
          const artifact = existingArtifacts[0];
          const updatedQAPairs = (artifact.content?.qaPairs || []).concat([newQAPair]);
          await base44.entities.GeneratedArtifact.update(artifact.id, {
            content: { ...artifact.content, qaPairs: updatedQAPairs }
          });
          console.log('[E13a] Debrief Q&A appended to artifact:', artifact.id);
        } else {
          const created = await base44.entities.GeneratedArtifact.create({
            userId: context.userId,
            conversationId: context.conversationId,
            schoolId: selectedSchoolId,
            artifactType: 'visit_debrief',
            title: 'Visit Debrief - ' + schoolName,
            content: { qaPairs: [newQAPair], schoolName: schoolName },
            status: 'ready',
            isShared: false,
            pdfUrl: null,
            shareToken: null
          });
          console.log('[E13a] Debrief artifact created:', created.id);
        }
      } catch (persistError) {
        console.error('[E13a] Debrief persistence failed (non-blocking):', persistError.message);
      }
    }

    // E13a-WC3: Fit re-evaluation after debrief complete (non-blocking)
    if (isDebriefComplete && deepDiveAnalysis && context.userId && context.conversationId) {
      try {
        console.log('[E13a-WC3] Debrief complete — initiating fit re-evaluation');
        
        // Load the visit_debrief artifact to get all Q&A pairs
        const debriefArtifacts = await base44.entities.GeneratedArtifact.filter({
          conversationId: context.conversationId,
          schoolId: selectedSchoolId,
          artifactType: 'visit_debrief'
        });
        const debriefArtifact = debriefArtifacts?.[0];
        
        if (!debriefArtifact?.content?.qaPairs || debriefArtifact.content.qaPairs.length === 0) {
          console.log('[E13a-WC3] No Q&A pairs found, skipping re-evaluation');
        } else {
          const originalAnalysis = deepDiveAnalysis.content || {};
          const qaPairs = debriefArtifact.content.qaPairs;
          const priorities = conversationFamilyProfile?.priorities || [];
          
          // Build Q&A summary for prompt
          const qaContext = qaPairs.map((qa, idx) => `Q${idx + 1}: ${qa.question}\nA${idx + 1}: ${qa.answer}`).join('\n\n');
          
          const reevalSystemPrompt = `You are a school fit analyst. Given original school analysis and post-visit debrief responses, re-evaluate whether the school remains a good fit.

CRITICAL: Return ONLY valid JSON. Do NOT include any markdown code blocks, explanations, or text outside the JSON.`;

          const reevalUserPrompt = `ORIGINAL ANALYSIS:
- Fit Label: ${originalAnalysis.fitLabel || 'unknown'}
- Trade-offs: ${(originalAnalysis.tradeOffs || []).map(t => `${t.dimension}: ${t.concern || 'neutral'}`).join('; ') || 'none'}
- Strengths: ${(originalAnalysis.strengths || []).join(', ') || 'none noted'}

FAMILY PRIORITIES: ${priorities.join(', ') || 'not specified'}

POST-VISIT DEBRIEF Q&A:
${qaContext}

Based on what the family shared during their visit, provide a fit re-evaluation. Return JSON: { updatedFitLabel (enum: "strong_match", "good_match", "worth_exploring"), fitDirection (enum: "improved", "declined", "unchanged"), revisedStrengths (array of strings), revisedConcerns (array of strings), visitVerdict (string, 1-2 sentences) }`;

          let reevalResult = null;
          try {
            reevalResult = await callOpenRouter({
              systemPrompt: reevalSystemPrompt,
              userPrompt: reevalUserPrompt,
              maxTokens: 600,
              temperature: 0.5,
              responseSchema: {
                name: 'fit_reevaluation',
                schema: {
                  type: 'object',
                  properties: {
                    updatedFitLabel: { type: 'string', enum: ['strong_match', 'good_match', 'worth_exploring'] },
                    fitDirection: { type: 'string', enum: ['improved', 'declined', 'unchanged'] },
                    revisedStrengths: { type: 'array', items: { type: 'string' } },
                    revisedConcerns: { type: 'array', items: { type: 'string' } },
                    visitVerdict: { type: 'string' }
                  },
                  required: ['updatedFitLabel', 'fitDirection', 'revisedStrengths', 'revisedConcerns', 'visitVerdict'],
                  additionalProperties: false
                }
              }
            });
          } catch (openrouterError) {
            console.log('[E13a-WC3] OpenRouter failed, trying InvokeLLM fallback');
            try {
              const fallbackResult = await base44.integrations.Core.InvokeLLM({
                prompt: reevalSystemPrompt + '\n\n' + reevalUserPrompt
              });
              if (typeof fallbackResult === 'string') {
                reevalResult = JSON.parse(fallbackResult);
              } else {
                reevalResult = fallbackResult;
              }
            } catch (fallbackError) {
              console.error('[E13a-WC3] Both fit re-evaluation methods failed:', fallbackError.message);
              reevalResult = null;
            }
          }

          // Persist fit re-evaluation as new artifact (non-blocking)
          if (reevalResult) {
            try {
              const fitReevalContent = {
                ...reevalResult,
                originalFitLabel: originalAnalysis.fitLabel || 'unknown',
                debriefTimestamp: new Date().toISOString()
              };

              await base44.entities.GeneratedArtifact.create({
                userId: context.userId,
                conversationId: context.conversationId,
                schoolId: selectedSchoolId,
                artifactType: 'fit_reevaluation',
                title: 'Fit Re-evaluation - ' + schoolName,
                content: fitReevalContent,
                status: 'ready',
                isShared: false,
                pdfUrl: null,
                shareToken: null
              });
              console.log('[E13a-WC3] Fit re-evaluation artifact created');
            } catch (createError) {
              console.error('[E13a-WC3] Failed to persist fit re-evaluation (non-blocking):', createError.message);
            }
          }
        }
      } catch (reevalError) {
        console.error('[E13a-WC3] Fit re-evaluation process failed (non-blocking):', reevalError.message);
      }
    }

    return {
      message: debriefMessage,
      deepDiveMode: 'debrief',
      visitPrepKit: priorAnalysis?.content || null,
      fitReEvaluation: reevalResult || null,
      updatedContext: {
        debriefQuestionQueue,
        debriefQuestionsAsked,
        debriefSchoolId: selectedSchoolId
      }
    };
  } catch (e) {
    console.error('[E13a] Debrief handling failed:', e.message);
    return null;
  }
}

// =============================================================================
// =============================================================================
// MAIN: Deno.serve — orchestrateConversation
// =============================================================================
Deno.serve(async (req) => {
  const processRequest = async () => {
    var currentState;
    var briefStatus;
    
    try {
      const base44 = createClientFromRequest(req);
      const { message, conversationHistory, conversationContext, region, userId, consultantName, currentSchools, userLocation, selectedSchoolId, conversationId: conversationIdFromPayload, returningUserContext } = await req.json();

      // WC6: Build RETURNING USER CONTEXT block if present
      let returningUserContextBlock = null;
      if (returningUserContext?.isReturningUser) {
        const contextParts = [];
        if (returningUserContext.profileName) contextParts.push(`Session: ${returningUserContext.profileName}`);
        if (returningUserContext.childName || returningUserContext.childGrade) {
          const childInfo = returningUserContext.childName 
            ? `${returningUserContext.childName}${returningUserContext.childGrade ? `, Grade ${returningUserContext.childGrade}` : ''}`
            : `Grade ${returningUserContext.childGrade}`;
          contextParts.push(`Child: ${childInfo}`);
        }
        if (returningUserContext.location) contextParts.push(`Location: ${returningUserContext.location}`);
        if (returningUserContext.budget) contextParts.push(`Budget: ${returningUserContext.budget}`);
        if (returningUserContext.priorities) contextParts.push(`Priorities: ${returningUserContext.priorities}`);
        if (returningUserContext.matchedSchoolsCount >= 0) contextParts.push(`Matched schools: ${returningUserContext.matchedSchoolsCount}`);
        if (returningUserContext.shortlistedSchools?.length > 0) contextParts.push(`Shortlisted: ${returningUserContext.shortlistedSchools.join(', ')}`);
        if (returningUserContext.lastActive) contextParts.push(`Last active: ${returningUserContext.lastActive}`);
        
        returningUserContextBlock = `RETURNING USER CONTEXT:\n- ${contextParts.join('\n- ')}\nThis is a returning user. Acknowledge their return naturally in your first response.`;
      }

      // FIX-C: __CONFIRM_BRIEF__ sentinel goes directly to RESULTS state for immediate school display.
      let context = conversationContext || {};
      let processMessage = message;
      const isConfirmBrief = message === '__CONFIRM_BRIEF__';
      if (isConfirmBrief) {
        processMessage = 'show me schools';
        context.previousState = context.state || 'BRIEF';
        context.state = 'RESULTS';
        context.briefStatus = 'confirmed';
        console.log('[FIX-C] __CONFIRM_BRIEF__ sentinel: skipping BRIEF, going directly to RESULTS');
      }

      console.log('ORCH START', { 
        messageLength: message?.length, 
        conversationHistoryLength: conversationHistory?.length,
        consultant: consultantName,
        userId: userId,
        hasUserLocation: !!userLocation
      });
      
      const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };
      
      let briefEditCount = context.briefEditCount || 0;
      const conversationId = context.conversationId;
      
      // STEP 0: Initialize/retrieve FamilyProfile
      let conversationFamilyProfile = null;
      
      if (userId && conversationId) {
        try {
          const profiles = await base44.entities.FamilyProfile.filter({ userId, conversationId });
          conversationFamilyProfile = profiles.length > 0 ? profiles[0] : null;
          
          if (!conversationFamilyProfile) {
            conversationFamilyProfile = await base44.entities.FamilyProfile.create({ userId, conversationId });
            console.log('Created new FamilyProfile:', conversationFamilyProfile.id);
          }
        } catch (e) {
          console.error('FamilyProfile error:', e);
        }
      } else {
        conversationFamilyProfile = {
          childName: null, childGrade: null, locationArea: null, maxTuition: null,
          interests: [], priorities: [], dealbreakers: [], academicStrengths: []
        };
      }
      
      const isFirstMessage = conversationHistory?.length === 0;
      let extractionResult = null;
      let intentSignal = 'continue';
      let briefDelta = { additions: [], updates: [], removals: [] };

      if (conversationFamilyProfile && context.extractedEntities) {
        for (const [key, value] of Object.entries(context.extractedEntities)) {
          if (value !== null && value !== undefined && !['briefDelta', 'intentSignal'].includes(key)) {
            const existing = conversationFamilyProfile[key];
            const isEmpty = existing === null || existing === undefined || (Array.isArray(existing) && existing.length === 0);
            if (isEmpty) {
              conversationFamilyProfile[key] = value;
            }
          }
        }
      }

      const tier1Before = {
        childGrade: conversationFamilyProfile?.childGrade ?? null,
        locationArea: conversationFamilyProfile?.locationArea ?? null,
        maxTuition: conversationFamilyProfile?.maxTuition ?? null,
        gender: conversationFamilyProfile?.gender ?? null
      };

      try {
        console.log('[ORCH] Invoking extractEntities');
        const extractResult = await base44.asServiceRole.functions.invoke('extractEntities', {
          message: processMessage,
          conversationFamilyProfile,
          context,
          conversationHistory
        });
        extractionResult = extractResult.data;
        intentSignal = extractionResult.intentSignal || 'continue';
        briefDelta = extractionResult.briefDelta;
      } catch (extractError) {
        console.error('[ORCH] extractEntities FAILED:', extractError?.message || extractError);
        extractionResult = {
          extractedEntities: {},
          updatedFamilyProfile: conversationFamilyProfile,
          updatedContext: context,
          intentSignal: 'continue',
          briefDelta: { additions: [], updates: [], removals: [] }
        };
        intentSignal = 'continue';
        briefDelta = { additions: [], updates: [], removals: [] };
      }
      
      Object.assign(conversationFamilyProfile, extractionResult.updatedFamilyProfile);
      Object.assign(context, extractionResult.updatedContext);

      const tier1After = {
        childGrade: conversationFamilyProfile?.childGrade ?? null,
        locationArea: conversationFamilyProfile?.locationArea ?? null,
        maxTuition: conversationFamilyProfile?.maxTuition ?? null,
        gender: conversationFamilyProfile?.gender ?? null
      };
      const tier1Changed = Object.keys(tier1Before).some(k => {
        const oldVal = tier1Before[k];
        const newVal = tier1After[k];
        if (newVal === null || newVal === undefined) return false;
        if (oldVal === null || oldVal === undefined) return true;
        return oldVal !== newVal;
      });
      const extractedKeys = Object.keys(extractionResult?.extractedEntities || {}).filter(k =>
        !['intentSignal', 'briefDelta', 'remove_priorities', 'remove_interests', 'remove_dealbreakers'].includes(k)
      );
      const anyEntityExtracted = extractedKeys.length > 0;
      const inResultsOrDeepDive = context.state === STATES.RESULTS || context.state === STATES.DEEP_DIVE;
      const shouldAutoRefresh = (tier1Changed || anyEntityExtracted) && inResultsOrDeepDive;
      context.resultsStale = false;
      context.autoRefreshed = shouldAutoRefresh;
      if (shouldAutoRefresh) {
        console.log('[T047] Entity change detected in RESULTS/DEEPDIVE — will auto-refresh matches');
        console.log('[T047] Changed entities:', extractedKeys, '| Tier1 changed:', tier1Changed);
      }

      if (isFirstMessage && !context.state) {
        console.log('[ORCH] First message, return WELCOME greeting');
        const welcomeMessage = consultantName === 'Jackie'
          ? "Hey there — I'm Jackie. I've worked with hundreds of families going through exactly this. Tell me a bit about your child and what's prompting the search."
          : "Hi, I'm Liam. I'll help you cut through the noise and find schools that actually fit. What's driving the search?";
        return Response.json({
          message: welcomeMessage,
          state: STATES.WELCOME,
          briefStatus: null,
          conversationContext: context,
          familyProfile: conversationFamilyProfile,
          extractedEntities: extractionResult?.extractedEntities || {},
          schools: []
        });
      }
      
      const profileData = {
        locationArea: conversationFamilyProfile?.locationArea || null,
        childGrade: conversationFamilyProfile?.childGrade ?? null,
        maxTuition: conversationFamilyProfile?.maxTuition || null,
        priorities: conversationFamilyProfile?.priorities || [],
        dealbreakers: conversationFamilyProfile?.dealbreakers || [],
        curriculum: conversationFamilyProfile?.curriculumPreference || [],
        schoolType: conversationFamilyProfile?.schoolType || null
      };
      
      const turnCount = (conversationHistory?.filter(m => m.role === 'user').length || 0) + 1;
      const currentBriefEditCount = context.briefEditCount || 0;
      const previousSchoolId = context.previousSchoolId || null;
      
      const resolveResult = resolveTransition({
        currentState: context.state || STATES.WELCOME,
        intentSignal,
        profileData,
        turnCount,
        briefEditCount: currentBriefEditCount,
        selectedSchoolId,
        previousSchoolId,
        userMessage: processMessage,
        tier1CompletedTurn: context.tier1CompletedTurn || null
      });
      
      currentState = resolveResult.nextState;
      briefStatus = resolveResult.briefStatus || context.briefStatus || null;
      const { flags } = resolveResult;

      if (resolveResult.clearSelectedSchool) {
        context.selectedSchoolId = null;
        context.previousSchoolId = null;
      }

      // BUG 2 FIX: Capture previousState BEFORE overwriting context.state
      const previousState = context.state || STATES.WELCOME;
      context.previousState = previousState;

      console.log('[ORCH] resolveTransition:', { nextState: currentState, intentSignal, sufficiency: resolveResult.sufficiency });

      // GIBBERISH DETECTION: Catch nonsensical input before routing to handlers
      const normalizedMsg = (processMessage || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
      const vowels = normalizedMsg.match(/[aeiou]/g) || [];
      const isGibberish = vowels.length === 0 && normalizedMsg.length > 2;

      if (isGibberish) {
        const nudgeMessage = consultantName === 'Jackie'
          ? "I'm not quite catching what you mean — could you rephrase that? I want to make sure I understand your thoughts."
          : "That didn't parse. Could you say that again in a different way?";

        console.log('[GIBBERISH] Detected gibberish input:', processMessage);
        return Response.json({
          message: nudgeMessage,
          state: currentState,
          briefStatus: briefStatus,
          familyProfile: conversationFamilyProfile,
          conversationContext: context,
          extractedEntities: extractionResult?.extractedEntities || {},
          schools: []
        });
      }

      context.state = currentState;
      context.briefStatus = briefStatus;
      context.dataSufficiency = resolveResult.sufficiency;
      context.transitionReason = resolveResult.transitionReason;
      if (resolveResult.tier1CompletedTurn !== undefined && resolveResult.tier1CompletedTurn !== null) {
        context.tier1CompletedTurn = resolveResult.tier1CompletedTurn;
      } else if (resolveResult.flags?.tier1CompletedTurn) {
        context.tier1CompletedTurn = resolveResult.flags.tier1CompletedTurn;
      }

      console.log(`[STATE] ${currentState} | briefStatus: ${briefStatus} | sufficiency: ${context.dataSufficiency} | reason: ${context.transitionReason}`);

      let responseData;

      if (currentState === STATES.DISCOVERY) {
        responseData = await handleDiscovery(base44, processMessage, conversationFamilyProfile, context, conversationHistory, consultantName, currentSchools, flags, returningUserContextBlock);
        responseData.extractedEntities = extractionResult?.extractedEntities || {};
        return Response.json(responseData);
      }

      if (currentState === STATES.BRIEF) {
        try {
          const briefResult = await base44.asServiceRole.functions.invoke('handleBrief', {
            message: processMessage,
            conversationFamilyProfile,
            context,
            conversationHistory,
            consultantName,
            briefStatus,
            flags,
            returningUserContextBlock
          });
          responseData = briefResult.data;
          if (responseData.briefStatus) {
            context.briefStatus = responseData.briefStatus;
          }
          if (responseData.conversationContext?.briefStatus) {
            context.briefStatus = responseData.conversationContext.briefStatus;
          }
          responseData.conversationContext = { ...context, ...responseData.conversationContext };
          responseData.extractedEntities = extractionResult?.extractedEntities || {};
          return Response.json(responseData);
        } catch (briefError) {
          console.error('[BRIEF] Invocation failed:', briefError.message);
          const fallbackMessage = consultantName === 'Jackie'
            ? "I'm having trouble putting that together right now. Let me try again — could you tell me a bit more about what you're looking for?"
            : "Hit a snag processing your brief. Can you give me a bit more detail on what you're looking for?";
          return Response.json({
            message: fallbackMessage,
            state: STATES.BRIEF,
            briefStatus: 'generating',
            familyProfile: conversationFamilyProfile,
            conversationContext: context,
            extractedEntities: extractionResult?.extractedEntities || {},
            schools: []
          });
        }
      }

      if (currentState === STATES.RESULTS) {
        // BUG-FLOW-002 FIX: Ensure FamilyProfile is persisted before calling searchSchools
        if (conversationFamilyProfile?.id && Object.keys(extractionResult?.extractedEntities || {}).length > 0) {
          try {
            const finalProfile = await base44.entities.FamilyProfile.filter({ id: conversationFamilyProfile.id });
            if (finalProfile.length > 0) {
              conversationFamilyProfile = finalProfile[0];
              console.log('[RESULTS] Refreshed FamilyProfile from DB:', conversationFamilyProfile.id);
            }
          } catch (e) {
            console.error('[RESULTS] Failed to refresh FamilyProfile:', e.message);
          }
        }

        // E13a: Check if debrief mode is set — if so, route to inlined handleVisitDebrief
        if (resolveResult.deepDiveMode === 'debrief') {
          console.log('[E13a] Routing RESULTS->DEBRIEF to inlined handleVisitDebrief');
          const debriefResult = await handleVisitDebrief(base44, selectedSchoolId, processMessage, conversationFamilyProfile, context, consultantName, returningUserContextBlock, callOpenRouter);
          if (debriefResult) {
            if (debriefResult.updatedContext) Object.assign(context, debriefResult.updatedContext);
            context.state = STATES.DEEP_DIVE;
            return Response.json({ message: debriefResult.message, state: STATES.DEEP_DIVE, briefStatus, deepDiveMode: debriefResult.deepDiveMode, visitPrepKit: debriefResult.visitPrepKit, fitReEvaluation: debriefResult.fitReEvaluation || null, familyProfile: conversationFamilyProfile, conversationContext: context, extractedEntities: extractionResult?.extractedEntities || {}, schools: currentSchools || [] });
          }
          console.log('[E13a] handleVisitDebrief returned null, falling through to handleResults');
        }

        // WC10: Fire-and-forget narrative generation (non-blocking)
        if (context.previousState === STATES.BRIEF && briefStatus === 'confirmed') {
          (async () => {
            try {
              await base44.asServiceRole.functions.invoke('generateProfileNarrative', {
                conversationFamilyProfile,
                conversationHistory,
                consultantName,
                conversationId
              });
              console.log('[WC10] Narrative generated (non-blocking)');
            } catch (e) {
              console.error('[WC10] Narrative failed (non-blocking):', e.message);
            }
          })();
        }

        const autoRefresh = context.autoRefreshed === true;
        const resultsResult = await base44.asServiceRole.functions.invoke('handleResults', {
          message: processMessage,
          conversationFamilyProfile,
          context,
          conversationHistory,
          consultantName,
          briefStatus,
          selectedSchoolId,
          conversationId,
          userId,
          userLocation,
          autoRefresh,
          extractedEntities: extractionResult?.extractedEntities || {},
          returningUserContextBlock
        });
        responseData = resultsResult.data;
        responseData.conversationContext = { ...(responseData.conversationContext || {}), autoRefreshed: autoRefresh };
        responseData.extractedEntities = extractionResult?.extractedEntities || {};
        return Response.json(responseData);
      }

      if (currentState === STATES.DEEP_DIVE) {
        // BUG-DEBRIEF-INTENT-S49: Ensure conversationId is in context before debrief handlers
        if (conversationIdFromPayload && !context.conversationId) context.conversationId = conversationIdFromPayload;

        // E13a: Check if debrief mode is set BEFORE falling through to handleDeepDive
        if (resolveResult.deepDiveMode === 'debrief' || resolveResult.flags?.DEBRIEF_MODE) {
          console.log('[E13a] Routing DEEP_DIVE to inlined handleVisitDebrief');
          const debriefResult = await handleVisitDebrief(base44, selectedSchoolId, processMessage, conversationFamilyProfile, context, consultantName, returningUserContextBlock, callOpenRouter);
          if (debriefResult) {
            if (debriefResult.updatedContext) Object.assign(context, debriefResult.updatedContext);
            return Response.json({ message: debriefResult.message, state: STATES.DEEP_DIVE, briefStatus, deepDiveMode: debriefResult.deepDiveMode, visitPrepKit: debriefResult.visitPrepKit, fitReEvaluation: debriefResult.fitReEvaluation || null, familyProfile: conversationFamilyProfile, conversationContext: context, extractedEntities: extractionResult?.extractedEntities || {}, schools: currentSchools || [] });
          }
          console.log('[E13a] handleVisitDebrief returned null, falling through');
        }

        const deepDiveResult = await base44.asServiceRole.functions.invoke('handleDeepDive', {
          selectedSchoolId,
          message: processMessage,
          conversationFamilyProfile,
          context,
          conversationHistory,
          consultantName,
          currentState,
          briefStatus,
          currentSchools,
          userId,
          returningUserContextBlock,
          flags: resolveResult.flags,
          conversationId
        });
        responseData = deepDiveResult.data;
        responseData.extractedEntities = extractionResult?.extractedEntities || {};
        return Response.json(responseData);
      }

      return Response.json({
        message: 'I encountered an unexpected state. Please try again.',
        state: currentState,
        briefStatus: briefStatus,
        schools: [],
        familyProfile: conversationFamilyProfile,
        conversationContext: context,
        extractedEntities: extractionResult?.extractedEntities || {}
      });

    } catch (error) {
      console.error('orchestrateConversation FATAL:', error);
      return Response.json({ error: error.message || String(error) }, { status: 500 });
    }
  };

  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject({ error: 'Request timeout', status: 408 }), 45000));
    return await Promise.race([processRequest(), timeoutPromise]);
  } catch (error) {
    if (error.status === 408) {
      return Response.json({ error: 'Request timeout', status: 408 }, { status: 408 });
    }
    return Response.json({ error: 'Something went wrong. Please try again.', status: 500 }, { status: 500 });
  }
});