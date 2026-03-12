import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Function: orchestrateConversation
// Purpose: Route chat messages through state machine (WELCOME→DISCOVERY→BRIEF→RESULTS→DEEP_DIVE)
// Entities: FamilyProfile, ChatHistory, FamilyJourney, SchoolJourney, GeneratedArtifact, LLMLog
// Last Modified: 2026-03-09
// Dependencies: OpenRouter API, extractEntities, handleBrief, handleResults, handleDeepDive, processDebriefCompletion
// WC-2: LLM model upgrade — google/gemini-3-flash-preview as primary model in callOpenRouter waterfall

// =============================================================================
// INLINED: callOpenRouter
// E18c-002: LLM call logging — writes LLMLog entity for every call (fire-and-forget)
// =============================================================================
async function callOpenRouter(options) {
  // callOpenRouter v1.1 -- E32-001: added tools/toolChoice/returnRaw
  const { systemPrompt, userPrompt, responseSchema, maxTokens = 1000, temperature = 0.5, _logContext, tools, toolChoice, returnRaw = false } = options;
  // _logContext = { base44, conversation_id, phase, is_test } — optional, used for LLMLog only

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) {
    console.warn('[OPENROUTER] OPENROUTER_API_KEY not set');
    throw new Error('OPENROUTER_API_KEY not set');
  }
  
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  // Model waterfall: WC-2 upgrade — Gemini 3 Flash Preview primary, GPT-4.1-mini fallback, Gemini Flash tertiary
  const models = ['google/gemini-3-flash-preview', 'openai/gpt-4.1-mini', 'google/gemini-2.5-flash'];
  
  const body: any = {
    models,
    messages,
    max_tokens: maxTokens,
    temperature
  };
  
  // E32-001: Inject tools when provided
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice || 'auto';
  }

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

  const controller = new AbortController();
  const TIMEOUT_MS = 10000;
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nextschool.ca',
        'X-OpenRouter-Title': 'NextSchool'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
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
    const toolCalls = data.choices?.[0]?.message?.tool_calls || [];
    if (!content && toolCalls.length === 0) throw new Error('OpenRouter returned empty content');

    // E18c-002: Log success (fire-and-forget)
    if (_logContext?.base44) {
      const isTest = _logContext.is_test === true;
      _logContext.base44.asServiceRole.entities.LLMLog.create({
        conversation_id: _logContext.conversation_id || 'unknown',
        phase: _logContext.phase || 'unknown',
        model: data.model || 'unknown',
        prompt_summary: fullPromptStr.substring(0, 500),
        response_summary: (content || '').substring(0, 500),
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

    // E32-001: returnRaw returns { content, toolCalls } for callers that need tool_calls
    if (returnRaw) return { content: content || '', toolCalls };
    
    return content;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[TIMEOUT] callOpenRouter timed out after ${TIMEOUT_MS}ms in orchestrateConversation.ts`);
      throw new Error(`LLM request timed out after ${TIMEOUT_MS/1000}s`);
    }
    console.error(`[callOpenRouter] Model call failed in orchestrateConversation.ts:`, err.message);
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
// E32-001: UI Action validation helpers
// =============================================================================
const V1_ACTION_TYPES = ['ADD_TO_SHORTLIST', 'OPEN_PANEL', 'EXPAND_SCHOOL'];
const VALID_PANELS = ['shortlist', 'comparison', 'brief'];
const ACTION_TOOL_SCHEMA = [{ type: 'function', function: { name: 'execute_ui_action', description: 'Execute UI actions alongside your text response when the user wants to add schools to shortlist, open panels, or expand school details', parameters: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['ADD_TO_SHORTLIST', 'OPEN_PANEL', 'EXPAND_SCHOOL'] }, schoolId: { type: 'string', description: 'School entity ID' }, panel: { type: 'string', enum: ['shortlist', 'comparison', 'brief'] } }, required: ['type'] } } }, required: ['actions'] } } }];

function validateActions(rawToolCalls, validSchoolIds, base44Client, conversationId) {
  const validatedActions = [];
  if (!rawToolCalls || !Array.isArray(rawToolCalls)) return validatedActions;
  for (const tc of rawToolCalls) {
    try {
      const args = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function?.arguments;
      if (!args?.actions || !Array.isArray(args.actions)) continue;
      for (const action of args.actions) {
        if (!V1_ACTION_TYPES.includes(action.type)) { logDroppedAction(base44Client, conversationId, action, 'INVALID_TYPE'); continue; }
        if ((action.type === 'ADD_TO_SHORTLIST' || action.type === 'EXPAND_SCHOOL') && !validSchoolIds.has(action.schoolId)) { logDroppedAction(base44Client, conversationId, action, 'INVALID_SCHOOL_ID'); continue; }
        if (action.type === 'OPEN_PANEL' && !VALID_PANELS.includes(action.panel)) { logDroppedAction(base44Client, conversationId, action, 'INVALID_PANEL'); continue; }
        const timing = action.type === 'ADD_TO_SHORTLIST' ? 'immediate' : 'after_message';
        validatedActions.push({ type: action.type, payload: action.type === 'OPEN_PANEL' ? { panel: action.panel } : { schoolId: action.schoolId }, timing });
      }
    } catch (e) { logDroppedAction(base44Client, conversationId, tc, 'PARSE_ERROR'); }
  }
  return validatedActions;
}

async function logDroppedAction(base44Client, conversationId, action, reason) {
  try { await base44Client.entities.LLMLog.create({ conversation_id: conversationId || 'unknown', phase: 'ACTION_VALIDATION', status: 'ACTION_DROPPED', prompt_summary: JSON.stringify(action).substring(0, 100), response_summary: reason }); } catch (e) { console.error('[E32] Failed to log dropped action:', e.message); }
}

// =============================================================================
// INLINED: resolveTransition
// =============================================================================
function resolveTransition(params) {
  const { currentState, intentSignal, profileData, turnCount, briefEditCount, selectedSchoolId, previousSchoolId, userMessage, tier1CompletedTurn: storedTier1CompletedTurn, context } = params;

  const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE', JOURNEY_RESUMPTION: 'JOURNEY_RESUMPTION' };

  // Patch 3: Invalid state reset — prevents unknown states from bricking conversations
  if (currentState && !Object.values(STATES).includes(currentState)) {
    console.warn('[RESOLVE] Unknown state detected, resetting to DISCOVERY:', currentState);
    currentState = STATES.DISCOVERY;
  }

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
    // E13a-FIX: Ongoing debrief detection
    const hasActiveDebrief = context?.debriefSchoolId &&
      (context?.debriefQuestionQueue?.length > 0 ||
       (context?.debriefQuestionsAsked?.length > 0 &&
        context?.debriefQuestionsAsked?.length < 3));
    if (hasActiveDebrief) {
      return {
        nextState: STATES.DEEP_DIVE,
        sufficiency,
        flags: { ...flags, DEBRIEF_MODE: true },
        transitionReason: 'debrief_ongoing',
        deepDiveMode: 'debrief'
      };
    }
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

  // Patch 2b: JOURNEY_RESUMPTION state handler
  if (currentState === STATES.JOURNEY_RESUMPTION) {
    if (intentSignal === 'restart' || intentSignal === 'edit-criteria') {
      return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason: 'journey_resumption_restart' };
    }
    return { nextState: STATES.RESULTS, sufficiency, flags, transitionReason: 'journey_resumption_continue' };
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

  // DETERMINISTIC BRIEF PHRASES — explicit phrases that should always route to BRIEF
  const BRIEF_PHRASES = /\b(show me the brief|show my brief|generate the brief|generate my brief|prepare the brief|ready for the brief|let'?s see the brief|create the brief)\b/i;
  if (currentState === STATES.DISCOVERY && BRIEF_PHRASES.test(userMessage || '')) {
    flags.USER_INTENT_OVERRIDE = true;
    console.log('[FIX-BRIEF] Brief-intent phrase detected:', userMessage);
    return {
      nextState: STATES.BRIEF, sufficiency, flags,
      transitionReason: 'brief_phrase_deterministic',
      briefStatus: 'generating', tier1CompletedTurn
    };
  }

  if ((intentSignal === 'request-brief' || intentSignal === 'request-results') && turnCount >= 3 && currentState === STATES.DISCOVERY) {
    if (sufficiency === 'MINIMUM' || sufficiency === 'RICH') {
      flags.USER_INTENT_OVERRIDE = true;
      return { nextState: STATES.BRIEF, sufficiency, flags, transitionReason: 'explicit_demand', briefStatus: 'generating' };
    }
  }
  if (currentState === STATES.DISCOVERY) {
    if (tier1Complete && tier1CompletedTurn !== null && turnCount >= (tier1CompletedTurn + 1)) {
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
// S113-WC2: mergeProfile — safe field merge that never overwrites arrays with empty
// =============================================================================
function mergeProfile(base, incoming) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue;
    const existing = merged[key];
    if (Array.isArray(value)) {
      if (Array.isArray(existing) && existing.length > 0) {
        if (value.length === 0) continue;
        merged[key] = [...new Set([...existing, ...value])];
      } else {
        merged[key] = value;
      }
    } else {
      if (value !== '') merged[key] = value;
    }
  }
  return merged;
}

// =============================================================================
// LIGHTWEIGHT REGEX EXTRACTION — zero LLM calls, <5ms execution
// =============================================================================
function lightweightExtract(message, existingProfile) {
  const bridgeProfile = {};
  let bridgeIntent = 'continue';

  // Grade extraction: "grade 9", "going into grade 9", "9th grade", "kindergarten", "JK", "SK"
  const gradeMatch = message.match(/(?:going\s+)?(?:into\s+)?(?:grade|gr\.?)\s+([0-9]+|pk|jk|sk|k|kindergarten|junior|senior)/i);
  if (gradeMatch) {
    const gradeStr = gradeMatch[1].toLowerCase();
    const gradeMap = { 'pk': -2, 'jk': -1, 'sk': 0, 'k': 0, 'kindergarten': 0, 'junior': 11, 'senior': 12 };
    const grade = gradeMap[gradeStr] !== undefined ? gradeMap[gradeStr] : parseInt(gradeStr);
    if (!isNaN(grade)) bridgeProfile.childGrade = grade;
  }

  // Location extraction
  // S113-WC1: Location fix - curated city regex + await extractEntities at BRIEF/RESULTS
  const locMatch = message.match(/(?:live\s+)?(?:in|near|around|from)\s+([a-zA-Z\s]+?)(?:\s+(?:area|region|city|province|state)|\.|\s*$|,)/i);
  if (locMatch) {
    const loc = locMatch[1].trim();
    const NON_GEO = /\b(IB|AP|STEM|IGCSE|Montessori|Waldorf|Reggio|French|Programs?|Immersion|Curriculum|English|Math|Science|Art|Music|Drama)\b/gi;
    const cleanedLoc = loc.replace(NON_GEO, '').replace(/\s+/g, ' ').trim();
    if (cleanedLoc.length > 2 && /[A-Z]/.test(cleanedLoc)) { bridgeProfile.locationArea = cleanedLoc; }
  }
  // S113-WC1: Secondary fallback — bare city name or known Canadian region (no preposition required)
  if (!bridgeProfile.locationArea) {
    const KNOWN_LOCATIONS = ['Greater Toronto Area', 'GTA', 'Toronto', 'Vancouver', 'Montreal', 'Ottawa', 'Calgary', 'Edmonton', 'Mississauga', 'Oakville', 'Markham', 'Richmond Hill', 'Burlington', 'Hamilton', 'Brampton', 'Vaughan', 'Waterloo', 'Kitchener', 'London', 'Victoria'];
    for (const knownLoc of KNOWN_LOCATIONS) {
      const escaped = knownLoc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(message)) {
        bridgeProfile.locationArea = knownLoc;
        break;
      }
    }
  }

  // Budget extraction
  const budgetMatches = message.matchAll(/(\$)\s*(\d{1,3}(?:,\d{3})*|\d+)\s*([kK])?|(\d{1,3}(?:,\d{3})*|\d+)\s*([kK])/g);
  for (const match of budgetMatches) {
    let numStr, hasKilo;
    if (match[1]) {
      numStr = match[2];
      hasKilo = !!match[3];
    } else {
      numStr = match[4];
      hasKilo = !!match[5];
    }
    const num = parseInt(numStr.replace(/,/g, ''));
    if (!isNaN(num)) {
      const amount = hasKilo ? num * 1000 : num;
      if (amount >= 5000 && amount <= 500000) {
        bridgeProfile.maxTuition = amount;
        break;
      }
    }
  }

  // Gender extraction
  const strongGenderKw = /\b(son|daughter)\b/i.test(message);
  if (strongGenderKw || !existingProfile?.childGender) {
    if (/\b(son|boy|he|him|his)\b/i.test(message)) { bridgeProfile.childGender = 'male'; bridgeProfile.gender = 'male'; }
    else if (/\b(daughter|girl|she|her)\b/i.test(message)) { bridgeProfile.childGender = 'female'; bridgeProfile.gender = 'female'; }
  }

  // S111-WC3: Child name extraction
  if (!existingProfile?.childName) {
    const nameMatch = message.match(/\b(?:my\s+)?(?:son|daughter|child|kid)\s+(?:is\s+)?(?:named\s+)?([A-Z][a-z]{1,15})\b/) ||
                      message.match(/\b(?:named|name\s+is|call(?:ed)?)\s+([A-Z][a-z]{1,15})\b/);
    if (nameMatch) {
      const candidateName = nameMatch[1];
      const CITY_NAMES = new Set(['Toronto', 'Vancouver', 'Ottawa', 'Montreal', 'Calgary', 'Edmonton', 'Winnipeg', 'Halifax', 'Victoria', 'London', 'Boston', 'Chicago']);
      if (!CITY_NAMES.has(candidateName)) {
        bridgeProfile.childName = candidateName;
      }
    }
  }

  // S111-WC3: Curriculum preference extraction
  if (!existingProfile?.curriculumPreference || existingProfile.curriculumPreference.length === 0) {
    const curriculumKeywords = message.match(/\b(montessori|waldorf|reggio|IB|international\s+baccalaureate|AP|advanced\s+placement|french\s+immersion|STEM)\b/gi);
    if (curriculumKeywords) {
      const normalized = curriculumKeywords.map(k => {
        const lower = k.toLowerCase();
        if (lower === 'international baccalaureate') return 'IB';
        if (lower === 'advanced placement') return 'AP';
        if (lower === 'french immersion') return 'French Immersion';
        return k.charAt(0).toUpperCase() + k.slice(1).toLowerCase();
      });
      bridgeProfile.curriculumPreference = [...new Set(normalized)];
    }
  }

  // S111-WC3: Dealbreakers extraction (negation-anchored)
  const dealbreakers = [];
  const negReligious = /(?:don'?t\s+want|no|not|avoid|never|without)\s+(?:a\s+)?(?:religious|religion|faith[- ]based)/i;
  if (negReligious.test(message)) dealbreakers.push('religious');
  const negSingleSex = /(?:don'?t\s+want|no|not|avoid|never|without)\s+(?:a\s+)?(?:single[- ]sex|all[- ]boys|all[- ]girls|boys[- ]only|girls[- ]only)/i;
  if (negSingleSex.test(message)) dealbreakers.push('single-sex');
  const negBoarding = /(?:don'?t\s+want|no|not|avoid|never|without)\s+(?:a\s+)?boarding/i;
  if (negBoarding.test(message)) dealbreakers.push('boarding');
  const negUniform = /(?:don'?t\s+want|no|not|avoid|never|without)\s+(?:a\s+)?uniform/i;
  if (negUniform.test(message)) dealbreakers.push('uniform');
  if (dealbreakers.length > 0) {
    bridgeProfile.dealbreakers = dealbreakers;
  }

  // S111-WC3: School type extraction
  if (!existingProfile?.schoolType) {
    if (/\b(?:co-?ed|coed)\b/i.test(message)) bridgeProfile.schoolType = 'co-ed';
    else if (/\ball[- ]?boys\b/i.test(message)) bridgeProfile.schoolType = 'all-boys';
    else if (/\ball[- ]?girls\b/i.test(message)) bridgeProfile.schoolType = 'all-girls';
  }

  // S111-WC3: Interests extraction (verb-anchored)
  const INTEREST_KEYWORDS = 'art|arts|music|sports|athletics|drama|theatre|theater|science|coding|robotics|swimming|hockey|soccer|basketball|dance|piano|guitar|reading|writing|math';
  const interestVerbPattern = new RegExp(`\\b(?:loves?|likes?|enjoys?|plays?|interested\\s+in|passionate\\s+about|into)\\s+(${INTEREST_KEYWORDS})\\b`, 'gi');
  const interestListPattern = new RegExp(`\\b(?:interests?|hobbies|activities)\\s*:?\\s*((?:(?:${INTEREST_KEYWORDS})(?:\\s*,\\s*|\\s+and\\s+|\\s+))+(?:${INTEREST_KEYWORDS}))`, 'gi');
  const foundInterests = new Set();
  let iMatch;
  while ((iMatch = interestVerbPattern.exec(message)) !== null) {
    foundInterests.add(iMatch[1].toLowerCase());
  }
  const interestVerbListPattern = new RegExp(`\\b(?:loves?|likes?|enjoys?|plays?|interested\\s+in|passionate\\s+about|into)\\s+((?:(?:${INTEREST_KEYWORDS})(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+))*(?:${INTEREST_KEYWORDS}))`, 'gi');
  while ((iMatch = interestVerbListPattern.exec(message)) !== null) {
    const items = iMatch[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/);
    items.forEach(item => {
      const trimmed = item.trim().toLowerCase();
      if (new RegExp(`^(?:${INTEREST_KEYWORDS})$`).test(trimmed)) {
        foundInterests.add(trimmed);
      }
    });
  }
  while ((iMatch = interestListPattern.exec(message)) !== null) {
    const items = iMatch[1].split(/\s*,\s*|\s+and\s+/);
    items.forEach(item => {
      const trimmed = item.trim().toLowerCase();
      if (new RegExp(`^(?:${INTEREST_KEYWORDS})$`).test(trimmed)) {
        foundInterests.add(trimmed);
      }
    });
  }
  const interestCommaPattern = new RegExp(`\\b(?:loves?|likes?|enjoys?|plays?|interested\\s+in|passionate\\s+about|into)\\s+(.+?)(?:[.!?]|$)`, 'gi');
  let cMatch;
  while ((cMatch = interestCommaPattern.exec(message)) !== null) {
    const items = cMatch[1].split(/\s*,\s*|\s+and\s+/);
    items.forEach(item => {
      const trimmed = item.trim().toLowerCase();
      if (new RegExp(`^(?:${INTEREST_KEYWORDS})$`).test(trimmed)) {
        foundInterests.add(trimmed);
      }
    });
  }
  if (foundInterests.size > 0) {
    bridgeProfile.interests = Array.from(foundInterests);
  }

  // Intent detection
  if (/\b(brief|summary|that'?s all|that'?s it)\b/i.test(message)) bridgeIntent = 'request-brief';
  else if (/\b(that looks right|show me schools|looks good|looks right|confirmed?|yes please)\b/i.test(message)) bridgeIntent = 'confirm-brief';

  return { bridgeProfile, bridgeIntent };
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
   if (conversationFamilyProfile?.interests?.length > 0) knownFacts.push(`interests: ${conversationFamilyProfile.interests.join(', ')}`);
   if (conversationFamilyProfile?.priorities?.length > 0) knownFacts.push(`priorities: ${conversationFamilyProfile.priorities.join(', ')}`);
   if (conversationFamilyProfile?.dealbreakers?.length > 0) knownFacts.push(`dealbreakers: ${conversationFamilyProfile.dealbreakers.join(', ')}`);
   if (conversationFamilyProfile?.curriculumPreference?.length > 0) knownFacts.push(`curriculum: ${conversationFamilyProfile.curriculumPreference.join(', ')}`);
   if (conversationFamilyProfile?.childName) knownFacts.push(`child name: ${conversationFamilyProfile.childName}`);
   const knownSummary = knownFacts.length > 0
     ? `\nALREADY COLLECTED (DO NOT ASK AGAIN): ${knownFacts.join(', ')}.`
     : '';

  let tier1Guidance = '';
  const missingFields = [];
  if (!hasGrade) missingFields.push('grade/age');
  if (!hasGender) missingFields.push('gender (son or daughter)');
  if (!hasLocation) missingFields.push('location/area');
  if (!hasBudget) missingFields.push('tuition budget');

  if (missingFields.length >= 3) {
    tier1Guidance = `TIER 1 PRIORITY: We still need: ${missingFields.join(', ')}. Ask about the two most important ones in your first response. After that, ask one at a time. Budget is always annual tuition. Do NOT ask to confirm if it is per year or per month. Accept the number as-is.`;
  } else if (missingFields.length === 2) {
    tier1Guidance = `TIER 1 PRIORITY: We still need: ${missingFields.join(' and ')}. If this is your first response, you may ask about both. Otherwise, pick the most important one. Budget is always annual tuition. Accept the number as-is.`;
  } else if (missingFields.length === 1) {
    tier1Guidance = `TIER 1 PRIORITY: We still need: ${missingFields[0]}. Work this in naturally.`;
  }

  const stopIntentConstraint = `CRITICAL HARD CONSTRAINT — HIGHEST PRIORITY — OVERRIDES ALL OTHER INSTRUCTIONS:
  If the user signals they are done with questions (e.g. "show me schools", "no more questions", "stop asking", "that's enough", "I'm done", "just show me results", "skip", "go ahead", "let's see", "move on"), you MUST immediately stop asking questions. Do NOT ask any clarifying or follow-up question. Do NOT explain what information is missing. Your ONLY job at that point is to acknowledge their request in one warm sentence and confirm the brief is being prepared. Do NOT say 'I'll prepare the brief' or promise a brief unless the system has actually transitioned to BRIEF state. This rule overrides all instructions about thoroughness, completeness, or missing Tier 1 data.\n\n`;

  const personaInstructions = consultantName === 'Jackie'
    ? `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}${stopIntentConstraint}[STATE: DISCOVERY] You are gathering family info to find the right school. Your primary goal is to collect Tier 1 data: child's grade/age, preferred location, and budget — in that priority order.
${knownSummary}
${tier1Guidance}
TURN MANAGEMENT: Transition to BRIEF within 5 turns maximum. If Tier 1 (grade, location, budget) is complete, do not exceed 1 enrichment turn — move to BRIEF on the next turn.
DUPLICATE QUESTION GUARD: Before asking any question, check the ALREADY COLLECTED list above. Never ask about a field that already has a value. If all Tier 1 fields are filled, do not ask about them again under any circumstances.
On your FIRST response only, you may ask about two related things together (e.g., grade and location). After the first turn, ask exactly ONE question per turn. Never ask more than one question after the first turn. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. CRITICAL FORMAT RULE: Your response must be MAX 2 sentences. Be conversational and warm, not robotic.
CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Do NOT interrupt emotional or contextual sharing — allow organic conversation flow. Keep gathering information.
CRITICAL: NEVER ask the user to confirm or repeat information they have already provided in this conversation. If they said their daughter is in grade 9, do not ask what grade again.
NEVER repeat a question verbatim that the user ignored or didn't answer. If they skip a question, either rephrase it completely or move on to the next priority. Never make the conversation feel like a form.${briefOfferInstruction}
YOU ARE JACKIE - Senior education consultant, 10+ years placing families in private schools. You're warm but efficient.`
    : `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}${stopIntentConstraint}[STATE: DISCOVERY] You are gathering family info to find the right school. Your primary goal is to collect Tier 1 data: child's grade/age, preferred location, and budget — in that priority order.
${knownSummary}
${tier1Guidance}
TURN MANAGEMENT: Transition to BRIEF within 5 turns maximum. If Tier 1 (grade, location, budget) is complete, do not exceed 1 enrichment turn — move to BRIEF on the next turn.
DUPLICATE QUESTION GUARD: Before asking any question, check the ALREADY COLLECTED list above. Never ask about a field that already has a value. If all Tier 1 fields are filled, do not ask about them again under any circumstances.
On your FIRST response only, you may ask about two related things together (e.g., grade and location). After the first turn, ask exactly ONE question per turn. Never ask more than one question after the first turn. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. CRITICAL FORMAT RULE: Your response must be MAX 2 sentences. Be conversational and warm, not robotic.
CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Do NOT interrupt emotional or contextual sharing — allow organic conversation flow. Keep gathering information.
CRITICAL: NEVER ask the user to confirm or repeat information they have already provided in this conversation. If they said their daughter is in grade 9, do not ask what grade again.
NEVER repeat a question verbatim that the user ignored or didn't answer. If they skip a question, either rephrase it completely or move on to the next priority. Never make the conversation feel like a form.${briefOfferInstruction}
YOU ARE LIAM - Senior education strategist, 10+ years in private school placement. You're direct and data-driven.`;

  const discoveryUserPrompt = `Recent chat:\n${conversationSummary}\n\nParent: "${message}"\n\nRespond as ${consultantName}. 1 question (2 allowed on first turn only). No filler.`;

  let discoveryMessageRaw = 'Tell me more about your child.';
  try {
    const fastResponse = await base44.integrations.Core.InvokeLLM({ 
      prompt: personaInstructions + '\n\nRecent chat:\n' + conversationSummary + '\n\nParent: "' + message + '"\n\nRespond as ' + consultantName + '. 2-3 questions max. No filler.',
      model: 'gpt_5_mini'
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
    
    const alreadyComplete = !isNewDebrief && debriefQuestionQueue.length === 0 && debriefQuestionsAsked.length >= 3;
    if (alreadyComplete) {
      console.log('[E13a] Debrief already complete for this school, producing wrap-up');
      return {
        message: `Thank you for sharing your thoughts on ${school.name}. Your visit feedback has been noted and will help refine your school recommendations. Is there anything else you'd like to explore?`,
        state: "DEEP_DIVE",
        updatedContext: { debriefQuestionQueue: [], debriefQuestionsAsked, debriefSchoolId: selectedSchoolId }
      };
    }
    
    if (isNewDebrief || (debriefQuestionQueue.length === 0 && debriefQuestionsAsked.length === 0)) {
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
          model: 'gpt_5_mini'
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

    // E29-006: Fire-and-forget — mark SchoolJourney entity as visited on debrief completion
    if (isDebriefComplete && context.userId) {
      (async () => {
        try {
          const journeys = context.journeyId
            ? await base44.asServiceRole.entities.FamilyJourney.filter({ id: context.journeyId })
            : await base44.asServiceRole.entities.FamilyJourney.filter({ userId: context.userId }, '-updated_date', 1);
          const familyJourney = journeys?.[0];
          if (!familyJourney) return;

          const existing = await base44.asServiceRole.entities.SchoolJourney.filter({
            familyJourneyId: familyJourney.id,
            schoolId: selectedSchoolId,
          });

          let sjId = null;
          if (existing && existing.length > 0) {
            await base44.asServiceRole.entities.SchoolJourney.update(existing[0].id, { status: 'visited' });
            sjId = existing[0].id;
          } else {
            const created = await base44.asServiceRole.entities.SchoolJourney.create({
              familyJourneyId: familyJourney.id,
              schoolId: selectedSchoolId,
              schoolName: school?.name || '',
              status: 'visited',
              addedAt: new Date().toISOString(),
            });
            sjId = created?.id;
          }
          console.log('[E29-006] SchoolJourney marked visited for', selectedSchoolId);

          // E29-014: Generate debrief summary + sentiment from Q&A pairs
          if (sjId && context.conversationId) {
            try {
              const debriefArtifacts = await base44.asServiceRole.entities.GeneratedArtifact.filter({
                conversationId: context.conversationId,
                schoolId: selectedSchoolId,
                artifactType: 'visit_debrief'
              });
              const qaPairs = debriefArtifacts?.[0]?.content?.qaPairs || [];
              if (qaPairs.length > 0) {
                const qaText = qaPairs.map((qa, i) => `Q${i+1}: ${qa.question}\nA${i+1}: ${qa.answer}`).join('\n\n');
                const debriefAnalysis = await base44.integrations.Core.InvokeLLM({
                  prompt: `A parent just completed a post-visit debrief for ${school?.name || 'a school'}. Analyze their responses and return JSON only.

Debrief Q&A:
${qaText}

Return ONLY this JSON (no markdown): { "debriefSummary": "<2-3 sentences summarizing what the parent observed and felt>", "debriefSentiment": "<POSITIVE|MIXED|NEGATIVE based on overall impression>" }`,
                  response_json_schema: {
                    type: 'object',
                    properties: {
                      debriefSummary: { type: 'string' },
                      debriefSentiment: { type: 'string', enum: ['POSITIVE', 'MIXED', 'NEGATIVE'] }
                    },
                    required: ['debriefSummary', 'debriefSentiment']
                  }
                });
                const parsed = typeof debriefAnalysis === 'object' ? debriefAnalysis : JSON.parse(debriefAnalysis);
                if (parsed?.debriefSummary) {
                  await base44.asServiceRole.entities.SchoolJourney.update(sjId, {
                    debriefSummary: parsed.debriefSummary,
                    debriefSentiment: parsed.debriefSentiment || 'MIXED'
                  });
                  console.log('[E29-014] SchoolJourney debrief summary stored, sentiment:', parsed.debriefSentiment);
                }
              }
            } catch (debriefErr) {
              console.error('[E29-014] Debrief summary generation failed:', debriefErr?.message);
            }
          }

          // E29-015: Phase auto-advancement → DECIDE if all non-removed schools are now visited
          try {
            const allSchoolJourneys = await base44.asServiceRole.entities.SchoolJourney.filter({ familyJourneyId: familyJourney.id });
            const activeJourneys = allSchoolJourneys.filter(sj => sj.status !== 'removed');
            const allVisited = activeJourneys.length > 0 && activeJourneys.every(sj => sj.status === 'visited');
            if (allVisited && familyJourney.currentPhase !== 'DECIDE') {
              const currentHistory = Array.isArray(familyJourney.phaseHistory) ? familyJourney.phaseHistory : [];
              await base44.asServiceRole.entities.FamilyJourney.update(familyJourney.id, {
                currentPhase: 'DECIDE',
                phaseHistory: [...currentHistory, { phase: 'DECIDE', enteredAt: new Date().toISOString() }],
              });
              console.log('[E29-015] FamilyJourney advanced to DECIDE — all schools visited');
            }
          } catch (phaseErr) {
            console.error('[E29-015] Phase advance to DECIDE failed:', phaseErr?.message);
          }
        } catch (e) {
          console.error('[E29-006] SchoolJourney visited sync failed:', e?.message || e);
        }
      })();
    }

    let reevalResult = null;
    // E13a-WC3: Fit re-evaluation after debrief complete (non-blocking)
    if (isDebriefComplete && context.userId) {
      await Promise.race([
        base44.asServiceRole.functions.invoke('processDebriefCompletion', {
          conversationId: context.conversationId,
          schoolId: selectedSchoolId,
          userId: context.userId,
          journeyId: context.journeyId,
          conversationFamilyProfile
        }).catch(e => console.error('[E29-010] Async debrief completion failed:', e.message)),
        new Promise(res => setTimeout(res, 500))
      ]);
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
    console.error('[E13a-S94] Debrief handling failed:', e.message);
    return null;
  }
}

// =============================================================================
// INLINED HELPER: fireJourneyUpdate
// E29-010 + E29-012: Fire-and-forget — runs next-action inference AND session summary
// in parallel, then writes a single FamilyJourney.update. Called at RESULTS + DEEP_DIVE exits.
// =============================================================================
function fireJourneyUpdate(base44, journeyContext, context, conversationHistory, lastUserMessage, phase) {
  const journeyId = journeyContext?.journeyId || context?.journeyId;
  if (!journeyId) return;

  (async () => {
    try {
      const schoolLines = (journeyContext?.schoolsSummary || [])
        .map(s => `- ${s.schoolName}: ${s.status}`)
        .join('\n') || 'None shortlisted yet.';
      const currentPhase = journeyContext?.currentPhase || 'MATCH';
      const priorSummary = journeyContext?.lastSessionSummary || 'N/A';

      // Build a short conversation snippet for the summary (last 6 turns)
      const recentTurns = (conversationHistory || []).slice(-6)
        .filter(m => m?.content)
        .map(m => `${m.role === 'user' ? 'Parent' : 'Consultant'}: ${m.content}`)
        .join('\n');
      const conversationSnippet = recentTurns
        ? `${recentTurns}\nParent: ${lastUserMessage || ''}`
        : `Parent: ${lastUserMessage || ''}`;

      const nextActionPrompt = `You are an education consultant assistant. Based on the following school journey, generate the single most important next action for this family.

Schools:
${schoolLines}
Current phase: ${currentPhase}
Last session: ${priorSummary}

Respond with ONLY a JSON object: { "nextAction": "<one specific sentence>", "nextActionType": "<TOUR|COMPARE|APPLY|REVIEW|FOLLOWUP>", "nextActionDue": "<ISO date within 2 weeks>" }
Keep nextAction under 100 characters. Be specific about school names.`;

      const summaryPrompt = `You are an education consultant assistant. Summarize this school search session in exactly 3 sentences for future reference. Be specific: mention schools discussed, decisions made, and what the family is considering next.

Conversation:
${conversationSnippet}

Schools: ${schoolLines}
Phase: ${currentPhase}

Write 3 sentences only. No headings, no bullet points.`;

      const [nextActionRaw, summaryRaw] = await Promise.all([
        base44.integrations.Core.InvokeLLM({
          prompt: nextActionPrompt,
          response_json_schema: {
            type: 'object',
            properties: {
              nextAction: { type: 'string' },
              nextActionType: { type: 'string' },
              nextActionDue: { type: 'string' }
            },
            required: ['nextAction', 'nextActionType', 'nextActionDue']
          }
        }),
        base44.integrations.Core.InvokeLLM({ prompt: summaryPrompt })
      ]);

      const parsedAction = typeof nextActionRaw === 'object' ? nextActionRaw : JSON.parse(nextActionRaw);
      const summaryText = typeof summaryRaw === 'string' ? summaryRaw : (summaryRaw?.response || summaryRaw?.text || priorSummary);

      const currentTotal = journeyContext?.totalSessions || 0;

      await base44.asServiceRole.entities.FamilyJourney.update(journeyId, {
        nextAction: parsedAction.nextAction,
        nextActionType: parsedAction.nextActionType,
        nextActionDue: parsedAction.nextActionDue,
        lastSessionSummary: summaryText,
        totalSessions: currentTotal + 1,
        lastActiveAt: new Date().toISOString()
      });

      console.log(`[E29-010/012] FamilyJourney updated (${phase}): nextAction="${parsedAction.nextAction}", sessions=${currentTotal + 1}`);
    } catch (e) {
      console.warn(`[E29-010/012] fireJourneyUpdate skipped (${phase}):`, e.message);
    }
  })();
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
      const { message, conversationHistory, conversationContext, region, userId, consultantName, currentSchools, userLocation, selectedSchoolId, conversationId: conversationIdFromPayload, returningUserContext, journeyContext } = await req.json();

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

      // E29-009: Build journeyContextBlock and append to returningUserContextBlock
      if (journeyContext) {
        const jParts = [];
        if (journeyContext.currentPhase) jParts.push(`Phase: ${journeyContext.currentPhase}`);
        if (journeyContext.schoolsSummary?.length > 0) {
          jParts.push(`Schools: ${journeyContext.schoolsSummary.map(s => `${s.schoolName} (${s.status})`).join(', ')}`);
        }
        if (journeyContext.lastSessionSummary) jParts.push(`Last session: ${journeyContext.lastSessionSummary}`);
        if (journeyContext.nextAction) jParts.push(`Next action: ${journeyContext.nextAction}`);
        let journeyContextBlock = `JOURNEY CONTEXT:\n- ${jParts.join('\n- ')}`;
        if (journeyContextBlock.length > 500) journeyContextBlock = journeyContextBlock.substring(0, 500);
        returningUserContextBlock = returningUserContextBlock
          ? `${returningUserContextBlock}\n\n${journeyContextBlock}`
          : journeyContextBlock;
      }

      // E29-008: Journey resumption — short-circuit for returning users with an active journey
      if (journeyContext?.journeyId && journeyContext?.isResuming === true && userId && (conversationHistory?.length ?? 0) <= 1) {
        try {
          const consultantPersona = (consultantName || 'Jackie') === 'Jackie'
            ? 'You are Jackie, a warm and empathetic senior education consultant.'
            : 'You are Liam, a direct and analytical senior education strategist.';

          const activeSchools = (journeyContext.schoolsSummary || []).filter(s => s.status !== 'removed');
          const schoolsLine = activeSchools.length > 0
            ? `Schools being considered: ${activeSchools.map(s => `${s.schoolName} (${s.status})`).join(', ')}.`
            : 'No schools shortlisted yet.';

          // E29-011: Determine if nextAction references a now-dropped school
          const droppedSchoolNames = (journeyContext.schoolsSummary || [])
            .filter(s => s.status === 'removed')
            .map(s => s.schoolName.toLowerCase());
          const nextAction = journeyContext.nextAction || null;
          const nextActionReferencesDropped = nextAction && droppedSchoolNames.some(name => nextAction.toLowerCase().includes(name));

          let nextActionLine = '';
          if (nextAction && !nextActionReferencesDropped) {
            nextActionLine = `\n- Previously suggested next step: "${nextAction}" — if they haven't done this yet, mention it gently (e.g. "Last time we suggested you ${nextAction.toLowerCase()} — no rush if you haven't gotten to it yet."). If it seems completed based on school statuses, skip it.`;
          } else if (nextActionReferencesDropped) {
            nextActionLine = `\n- The previously suggested action referenced a school the family has since removed. Do NOT mention it. Instead, suggest a fresh next step based on their current shortlist.`;
          }

          const welcomeBackPrompt = `${consultantPersona}

The family is returning to continue their school search. Here is their journey context:
- Current phase: ${journeyContext.currentPhase || 'MATCH'}
- ${schoolsLine}
- Last session summary: ${journeyContext.lastSessionSummary || 'No summary available'}${nextActionLine}

Write a warm, natural 3-sentence welcome-back greeting. Acknowledge where they left off, reference specific schools or the suggested next step if relevant, and invite them to continue. Be concise and personal. Do NOT ask multiple questions — end with one clear invitation.`;

          const greeting = await base44.integrations.Core.InvokeLLM({ prompt: welcomeBackPrompt });
          const greetingText = typeof greeting === 'string' ? greeting : (greeting?.response || greeting?.text || 'Welcome back! Ready to pick up where we left off?');

          console.log('[E29-008] Journey resumption short-circuit fired for journeyId:', journeyContext.journeyId);
          return Response.json({
            state: 'JOURNEY_RESUMPTION',
            message: greetingText,
            quickReplies: ["Let's keep going", "Update my Brief", "Start new search"],
            journeyId: journeyContext.journeyId,
            briefStatus: null,
            schools: [],
            familyProfile: null,
            conversationContext: conversationContext || {}
          });
        } catch (e) {
          console.warn('[E29-008] Journey resumption failed, falling through to normal flow:', e.message);
        }
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
      
      const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE', JOURNEY_RESUMPTION: 'JOURNEY_RESUMPTION' };
      
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

      // S108-WC3 Fix 1 (Hoisted): lightweightExtract + workingProfile built BEFORE all state branches
      // Merge order: accumulated < DB < bridgeProfile (fresh extraction always wins)
      // For-loop patches any DB nulls that accumulated already knew.
      const { bridgeProfile, bridgeIntent } = lightweightExtract(processMessage, conversationFamilyProfile);
      const accumulatedProfile = context.accumulatedFamilyProfile || {};
      const workingProfile = mergeProfile(mergeProfile(accumulatedProfile, conversationFamilyProfile), bridgeProfile);
      for (const [key, val] of Object.entries(workingProfile)) {
        if (val === null || val === undefined) {
          if (accumulatedProfile[key] != null) workingProfile[key] = accumulatedProfile[key];

              // S114-WC1: Preserve dealbreakers from bridge extraction - merge chain may lose them
    if (bridgeProfile?.dealbreakers && Array.isArray(bridgeProfile.dealbreakers) && bridgeProfile.dealbreakers.length > 0) {
      workingProfile.dealbreakers = bridgeProfile.dealbreakers;
    }
    if (bridgeProfile?.schoolGenderExclusions && Array.isArray(bridgeProfile.schoolGenderExclusions) && bridgeProfile.schoolGenderExclusions.length > 0) {
      workingProfile.schoolGenderExclusions = bridgeProfile.schoolGenderExclusions;
    }
        }
      }
      context.accumulatedFamilyProfile = workingProfile;
      Object.assign(conversationFamilyProfile, bridgeProfile);
      intentSignal = bridgeIntent;
      briefDelta = { additions: [], updates: [], removals: [] };

      // S113-WC1: extractEntities stub — will be replaced conditionally after resolveTransition
      extractionResult = {
        extractedEntities: {},
        updatedFamilyProfile: conversationFamilyProfile,
        updatedContext: context,
        intentSignal: intentSignal,
        briefDelta: briefDelta
      };
      
      Object.assign(conversationFamilyProfile, extractionResult.updatedFamilyProfile);
      // E29-009: Exclude debrief context fields from extractEntities merge to prevent overwrite
const { debriefQuestionQueue: _dq, debriefQuestionsAsked: _da, debriefSchoolId: _ds, isNewDebrief: _ind, activeDebriefSchoolName: _adn, hasActiveDebrief: _had, ...safeUpdatedContext } = extractionResult.updatedContext || {};
Object.assign(context, safeUpdatedContext);

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
        locationArea: workingProfile?.locationArea || null,
        childGrade: workingProfile?.childGrade ?? null,
        maxTuition: workingProfile?.maxTuition || null,
        priorities: workingProfile?.priorities || [],
        dealbreakers: workingProfile?.dealbreakers || [],
        curriculum: workingProfile?.curriculumPreference || [],
        schoolType: workingProfile?.schoolType || null
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
        tier1CompletedTurn: context.tier1CompletedTurn || null,
        context
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

      // S136-WC1: E35-REC1 — fire-and-forget for ALL states (no await, no post-merge)
      base44.asServiceRole.functions.invoke('extractEntities', {
        message: processMessage,
        conversationFamilyProfile,
        context,
        conversationHistory
      }).catch(e => console.error('[S136-WC1] extractEntities fire-and-forget failed:', e.message));

      // GIBBERISH DETECTION: Catch nonsensical input before routing to handlers
      const normalizedMsg = (processMessage || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
      const vowels = normalizedMsg.match(/[aeiou]/g) || [];
      const looksLikeBudget = /^\d+[kK]?$/.test(normalizedMsg);
      const isGibberish = vowels.length === 0 && normalizedMsg.length > 2 && !looksLikeBudget;

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
        responseData = await handleDiscovery(base44, processMessage, workingProfile, context, conversationHistory, consultantName, currentSchools, flags, returningUserContextBlock);
        responseData.familyProfile = workingProfile;
        responseData.extractedEntities = workingProfile;
        return Response.json(responseData); // DISCOVERY returns early; workingProfile already set above
      }

      if (currentState === STATES.BRIEF) {
        // Change B: If we transitioned directly from DISCOVERY→BRIEF (stop_intent, enrichment_cap, etc.),
        // handleDiscovery was correctly skipped above (currentState !== DISCOVERY). Log for confirmation.
        if (previousState === STATES.DISCOVERY) {
          console.log('[Change-B] DISCOVERY→BRIEF direct transition — handleDiscovery skipped, routing to handleBrief with workingProfile');
        }
        try {
          const briefResult = await base44.asServiceRole.functions.invoke('handleBrief', {
            message: processMessage,
            conversationFamilyProfile: workingProfile,
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
              conversationFamilyProfile = mergeProfile(conversationFamilyProfile, finalProfile[0]);
              console.log('[RESULTS] Refreshed FamilyProfile from DB:', conversationFamilyProfile.id);
            }
          } catch (e) {
            console.error('[RESULTS] Failed to refresh FamilyProfile:', e.message);
          }
        }

        // E13a: Check if debrief mode is set — if so, route to inlined handleVisitDebrief
        if (resolveResult.deepDiveMode === 'debrief') {
          console.log('[E13a] Routing RESULTS->DEBRIEF to inlined handleVisitDebrief');
          const debriefResult = await handleVisitDebrief(base44, selectedSchoolId, processMessage, workingProfile, context, consultantName, returningUserContextBlock, callOpenRouter);
          if (debriefResult) {
            if (debriefResult.updatedContext) Object.assign(context, debriefResult.updatedContext);
            context.state = STATES.DEEP_DIVE;
            return Response.json({ message: debriefResult.message, state: STATES.DEEP_DIVE, briefStatus, deepDiveMode: debriefResult.deepDiveMode, visitPrepKit: debriefResult.visitPrepKit, fitReEvaluation: debriefResult.fitReEvaluation || null, familyProfile: workingProfile, conversationContext: context, extractedEntities: extractionResult?.extractedEntities || {}, schools: currentSchools || [] });
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

        // E29-003: Fire-and-forget FamilyJourney creation at Brief confirmation
        const briefJustConfirmed = isConfirmBrief || (resolveResult.briefStatus === 'confirmed' && resolveResult.transitionReason?.startsWith('brief_confirmed'));
        if (briefJustConfirmed) {
          (async () => {
            try {
              const briefSnapshot = JSON.parse(JSON.stringify(conversationFamilyProfile || {}));
              const childName = conversationFamilyProfile?.childName || conversationFamilyProfile?.conversationContext?.childName || 'My Child';
              const journey = await base44.asServiceRole.entities.FamilyJourney.create({
                userId,
                childName,
                profileLabel: `${childName}'s School Search`,
                currentPhase: 'MATCH',
                phaseHistory: [
                  { phase: 'UNDERSTAND', enteredAt: new Date().toISOString(), completedAt: new Date().toISOString() },
                  { phase: 'MATCH', enteredAt: new Date().toISOString(), completedAt: null }
                ],
                familyProfileId: conversationFamilyProfile?.id || '',
                briefSnapshot,
                consultantId: consultantName || 'jackie',
                schoolJourneys: [],
                totalSessions: 1,
                lastActiveAt: new Date().toISOString(),
                isStale: false,
                isArchived: false
              });
              context.journeyId = journey.id;
              await base44.asServiceRole.entities.ChatHistory.update(conversationId, { journeyId: journey.id });
              console.log('[E29] FamilyJourney created:', journey.id);
            } catch (e) {
              console.error('[E29] FamilyJourney creation failed (non-blocking):', e.message);
            }
          })();
        }

        // E29-010/E29-012: Fire-and-forget — next action + session summary + totalSessions increment
        fireJourneyUpdate(base44, journeyContext, context, conversationHistory, message, 'RESULTS');

        const autoRefresh = context.autoRefreshed === true;
        const resultsResult = await base44.asServiceRole.functions.invoke('handleResults', {
          message: processMessage,
          conversationFamilyProfile: workingProfile,
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
        // E32-001: Validate and attach actions
        const validSchoolIds_results = new Set((responseData.schools || currentSchools || []).map(s => s.id));
        responseData.actions = responseData.rawToolCalls ? validateActions(responseData.rawToolCalls, validSchoolIds_results, base44, conversationId) : [];
        delete responseData.rawToolCalls;
        return Response.json(responseData);
      }

      if (currentState === STATES.DEEP_DIVE) {
        // BUG-DEBRIEF-INTENT-S49: Ensure conversationId is in context before debrief handlers
        if (conversationIdFromPayload && !context.conversationId) context.conversationId = conversationIdFromPayload;

        // E13a: Check if debrief mode is set BEFORE falling through to handleDeepDive
        if (resolveResult.deepDiveMode === 'debrief' || resolveResult.flags?.DEBRIEF_MODE) {
          console.log('[E13a] Routing DEEP_DIVE to inlined handleVisitDebrief');
          const debriefResult = await handleVisitDebrief(base44, selectedSchoolId, processMessage, workingProfile, context, consultantName, returningUserContextBlock, callOpenRouter);
          if (debriefResult) {
            if (debriefResult.updatedContext) Object.assign(context, debriefResult.updatedContext);
            return Response.json({ 
              message: debriefResult.message, 
              state: STATES.DEEP_DIVE, 
              briefStatus, 
              deepDiveMode: debriefResult.deepDiveMode, 
              visitPrepKit: debriefResult.visitPrepKit, 
              fitReEvaluation: debriefResult.fitReEvaluation || null, 
              familyProfile: workingProfile, 
              conversationContext: context, 
              extractedEntities: extractionResult?.extractedEntities || {}, 
              schools: currentSchools || [] });
          }
          console.log('[E13a] handleVisitDebrief returned null, falling through');
        }

        const deepDiveResult = await base44.asServiceRole.functions.invoke('handleDeepDive', {
          selectedSchoolId,
          message: processMessage,
          conversationFamilyProfile: workingProfile,
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
        // E32-001: Validate and attach actions
        const validSchoolIds_deepdive = new Set((responseData.schools || currentSchools || []).map(s => s.id));
        responseData.actions = responseData.rawToolCalls ? validateActions(responseData.rawToolCalls, validSchoolIds_deepdive, base44, conversationId) : [];
        delete responseData.rawToolCalls;

        // E29-010/E29-012: Fire-and-forget — next action + session summary + totalSessions increment
        fireJourneyUpdate(base44, journeyContext, context, conversationHistory, message, 'DEEP_DIVE');

        return Response.json(responseData);
      }

      // S108-WC3 Fix 1 (Post-branch): ensure workingProfile is reflected on any responseData
      // that didn't return early (e.g. unexpected state fallthrough).
      if (responseData) {
        responseData.familyProfile = workingProfile;
        responseData.extractedEntities = workingProfile;
      }

      return Response.json({
        message: 'I encountered an unexpected state. Please try again.',
        state: currentState,
        briefStatus: briefStatus,
        schools: [],
        familyProfile: workingProfile,
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