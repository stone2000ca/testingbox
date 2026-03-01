import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// =============================================================================
// T045: Canadian Metro Coordinates Lookup
// =============================================================================
const CANADIAN_METRO_COORDS = {
  // Toronto & GTA
  'toronto': { lat: 43.6532, lng: -79.3832 },
  'gta': { lat: 43.6532, lng: -79.3832 },
  'greater toronto area': { lat: 43.6532, lng: -79.3832 },
  'toronto area': { lat: 43.6532, lng: -79.3832 },
  'north york': { lat: 43.7615, lng: -79.4111 },
  'scarborough': { lat: 43.7764, lng: -79.2318 },
  'markham': { lat: 43.8561, lng: -79.3370 },
  'richmond hill': { lat: 43.8828, lng: -79.4403 },
  'vaughan': { lat: 43.8361, lng: -79.4983 },
  'oakville': { lat: 43.4675, lng: -79.6877 },
  'burlington': { lat: 43.3255, lng: -79.7990 },
  'mississauga': { lat: 43.5890, lng: -79.6441 },
  'brampton': { lat: 43.7315, lng: -79.7624 },
  // Vancouver & Lower Mainland
  'vancouver': { lat: 49.2827, lng: -123.1207 },
  'greater vancouver': { lat: 49.2827, lng: -123.1207 },
  'greater vancouver area': { lat: 49.2827, lng: -123.1207 },
  'lower mainland': { lat: 49.2827, lng: -123.1207 },
  'metro vancouver': { lat: 49.2827, lng: -123.1207 },
  // Quebec
  'montreal': { lat: 45.5017, lng: -73.5673 },
  'québec city': { lat: 46.8139, lng: -71.2080 },
  'quebec city': { lat: 46.8139, lng: -71.2080 },
  // Ontario
  'ottawa': { lat: 45.4215, lng: -75.6972 },
  'hamilton': { lat: 43.2557, lng: -79.8711 },
  'london on': { lat: 42.9849, lng: -81.2453 },
  'london ontario': { lat: 42.9849, lng: -81.2453 },
  'london': { lat: 42.9849, lng: -81.2453 },
  'kitchener': { lat: 43.4516, lng: -80.4925 },
  'waterloo': { lat: 43.4668, lng: -80.5164 },
  'windsor': { lat: 42.3149, lng: -83.0364 },
  // Alberta
  'calgary': { lat: 51.0447, lng: -114.0719 },
  'edmonton': { lat: 53.5461, lng: -113.4938 },
  // Manitoba
  'winnipeg': { lat: 49.8951, lng: -97.1384 },
  // Saskatchewan
  'saskatoon': { lat: 52.1332, lng: -106.6700 },
  'regina': { lat: 50.4452, lng: -104.6189 },
  // Nova Scotia
  'halifax': { lat: 44.6488, lng: -63.5752 },
  // BC
  'victoria': { lat: 48.4284, lng: -123.3656 },
  // Newfoundland
  'st. john\'s': { lat: 47.5615, lng: -52.7126 },
  'st johns': { lat: 47.5615, lng: -52.7126 },
  'st johns nl': { lat: 47.5615, lng: -52.7126 },
  // Yukon
  'whitehorse': { lat: 60.7212, lng: -135.0568 },
};

function resolveLocationCoords(locationArea) {
  if (!locationArea) return null;
  const key = locationArea.toLowerCase().trim();
  // Direct match first
  if (CANADIAN_METRO_COORDS[key]) return CANADIAN_METRO_COORDS[key];
  // Partial match — key contains a known city name, or vice versa
  for (const [cityKey, coords] of Object.entries(CANADIAN_METRO_COORDS)) {
    if (key.includes(cityKey) || cityKey.includes(key)) {
      console.log(`[T045] Partial match: '${key}' → '${cityKey}'`);
      return coords;
    }
  }
  return null;
}

// =============================================================================
// INLINED: callOpenRouter
// =============================================================================
async function callOpenRouter(options) {
  const { systemPrompt, userPrompt, responseSchema, maxTokens = 1000, temperature = 0.7 } = options;
  
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
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[OPENROUTER] API error:', response.status, errorText);
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  console.log('[OPENROUTER] Response model used:', data.model, 'usage:', data.usage);
  
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned empty content');
  
  if (responseSchema) {
    try {
      return JSON.parse(content);
    } catch (e) {
      console.error('[OPENROUTER] JSON parse failed:', content.substring(0, 200));
      throw new Error('OpenRouter structured output parse failed');
    }
  }
  
  return content;
}

// =============================================================================
// INLINED: resolveTransition
// =============================================================================
function resolveTransition(params) {
  const { currentState, intentSignal, profileData, turnCount, briefEditCount, selectedSchoolId, previousSchoolId, userMessage, tier1CompletedTurn: storedTier1CompletedTurn } = params;

  const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };

  const hasLocation = !!(profileData?.location);
  const hasGrade = profileData?.gradeLevel !== null && profileData?.gradeLevel !== undefined;
  const hasBudget = !!(profileData?.budget);
  const prioritiesCount = profileData?.priorities?.length || 0;
  
  let sufficiency = 'THIN';
  if (hasLocation && hasGrade) {
    sufficiency = prioritiesCount >= 2 ? 'RICH' : 'MINIMUM';
  }

  const flags = { SUGGEST_BRIEF: false, OFFER_BRIEF: false, FORCED_TRANSITION: false, USER_INTENT_OVERRIDE: false };
  let nextState = currentState;
  let briefStatus = null;
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
  const confirmPhrases = ['that looks right', 'show me schools', 'looks good', 'looks right', 'confirmed', 'yes'];
  const msgLower = (userMessage || '').toLowerCase();
  if (currentState === STATES.BRIEF && confirmPhrases.some(p => msgLower.includes(p))) {
    flags.USER_INTENT_OVERRIDE = true;
    console.log('[DETERMINISTIC] Brief confirmed by string match:', userMessage, 'briefStatus was:', params.briefStatus);
    return { nextState: STATES.RESULTS, sufficiency, flags, transitionReason: 'brief_confirmed_deterministic', briefStatus: 'confirmed' };
  }
  
  if (currentState === STATES.BRIEF && briefStatus === 'pending_review' && (intentSignal === 'confirm-brief' || intentSignal === 'request-results')) {
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
    return { nextState: STATES.RESULTS, sufficiency, flags, transitionReason: 'explicit_intent' };
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
// INLINED: extractEntitiesLogic
// =============================================================================
async function extractEntitiesLogic(base44, message, conversationFamilyProfile, context, conversationHistory) {
  let result: any = {};
  let extractedData: any = {};
  let intentSignal = 'continue';

  try {
    const t1 = Date.now();
    
    const knownData = conversationFamilyProfile ? {
      childName: conversationFamilyProfile.childName,
      childGrade: conversationFamilyProfile.childGrade,
      locationArea: conversationFamilyProfile.locationArea,
      maxTuition: conversationFamilyProfile.maxTuition,
      interests: conversationFamilyProfile.interests,
      priorities: conversationFamilyProfile.priorities,
      dealbreakers: conversationFamilyProfile.dealbreakers,
      curriculumPreference: conversationFamilyProfile.curriculumPreference,
      religiousPreference: conversationFamilyProfile.religiousPreference,
      boardingPreference: conversationFamilyProfile.boardingPreference
    } : {};

    const conversationSummary = conversationHistory?.slice(-5)
      .map(m => `${m.role === 'user' ? 'Parent' : 'AI'}: ${m.content}`)
      .join('\n') || '';

    const gradeMatch = message.match(/\b(?:grade|gr\.?)\s*([0-9]+|\b(?:pk|jk|k|junior|senior)\b)/i);
    let extractedGrade = null;
    if (gradeMatch) {
      const gradeStr = gradeMatch[1].toLowerCase();
      const gradeMap = { 'pk': -2, 'jk': -1, 'k': 0, 'junior': 11, 'senior': 12 };
      extractedGrade = gradeMap[gradeStr] !== undefined ? gradeMap[gradeStr] : parseInt(gradeStr);
    }

    let extractedGender = null;
    if (/\b(son|boy|he|him|his)\b/i.test(message)) extractedGender = 'male';
    else if (/\b(daughter|girl|she|her|hers)\b/i.test(message)) extractedGender = 'female';

    // Regex detection for explicit school gender preference / exclusions
    let extractedSchoolGenderPref = null;
    let extractedSchoolGenderExclusions = [];
    if (/\b(all[\s-]girls?|girls?[\s-]only|single[\s-]gender.*girl|only girls?)\b/i.test(message)) extractedSchoolGenderPref = 'all-girls';
    else if (/\b(all[\s-]boys?|boys?[\s-]only|single[\s-]gender.*boy|only boys?)\b/i.test(message)) extractedSchoolGenderPref = 'all-boys';
    else if (/\b(co[\s-]?ed|coeducational|mixed gender)\b/i.test(message)) extractedSchoolGenderPref = 'co-ed';
    if (/\bno (all[\s-]?boys?|boys?[\s-]?only)\b/i.test(message)) extractedSchoolGenderExclusions.push('all-boys');
    if (/\bno (all[\s-]?girls?|girls?[\s-]?only)\b/i.test(message)) extractedSchoolGenderExclusions.push('all-girls');

    // FIX-LOC-004: Helper function to clean non-geographic words from location strings
    const cleanLocation = (loc) => {
      if (!loc) return null;
      // Strip common non-geographic words that might be appended by LLM or regex
      const nonGeographicKeywords = /\b(budget|tuition|price|cost|afford|pay|spend|priority|priorities|interest|looking|need|want)\b/gi;
      let cleaned = loc.replace(nonGeographicKeywords, '').replace(/\s,/, ',').trim();
      // Remove trailing commas and collapse multiple spaces
      cleaned = cleaned.replace(/,+$/, '').replace(/\s\s+/g, ' ').trim();
      return cleaned === '' ? null : cleaned;
    };

    let extractedLocation = null;
    const locationMatch = message.match(/\b(?:in|near|around|from)\s+([A-Z][a-zA-Z]+(?:[\s-][A-Z][a-zA-Z]+)?(?:,\s*[A-Za-z]{2,})?)/);
    if (locationMatch && locationMatch[1]) {
      extractedLocation = cleanLocation(locationMatch[1].trim());
    }

    // BUG-ENT-004: Budget extraction with ALWAYS-RUN regex fallback
    let extractedBudget = null;
    // More reliable regex: explicitly handles patterns like $30k, 30k, 30000, $30,000
    const budgetMatch = message.match(/(?:budget|tuition|cost|price|afford|pay|spend)?[\s:]*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\s*(?:k|K|thousand)?(?:\b|$)/i);
    if (budgetMatch) {
      const raw = budgetMatch[0];
      const numStr = budgetMatch[1].replace(/,/g, '');
      const num = parseInt(numStr);
      if (!isNaN(num)) {
        const isThousands = /[kK]/.test(raw) || /thousand/i.test(raw);
        const amount = isThousands ? num * 1000 : num;
        if (amount >= 5000 && amount <= 500000) {
          extractedBudget = amount;
        }
      }
    }

    const systemPrompt = `Extract factual data from the parent's message. Return JSON with NULL for anything not mentioned.

GENDER INFERENCE (BUG-ENT-004): Infer the child's gender from relational terms even if not stated directly:
- "my son", "my boy", "he", "him", "his" → gender = "male"
- "my daughter", "my girl", "she", "her" → gender = "female"
- If gender is ambiguous or not mentioned, return null for gender.

BUDGET EXTRACTION (BUG-ENT-004): Extract budget/tuition even in conversational formats:
- "$25K", "25k", "25 thousand", "around $25,000", "about 25K", "up to 30k" → extract the number (e.g. 25000, 30000)
- Store as maxTuition (integer number of dollars, or the string "unlimited" if they say no limit/flexible)
- Do NOT infer budget if user has not explicitly stated it.

CRITICAL: If the user explicitly negates or removes a previously stated preference (e.g. "actually, not interested in sports", "remove arts from my priorities", "I changed my mind about boarding"), populate the corresponding remove_* field (remove_interests, remove_priorities, remove_dealbreakers) with the items to remove. Leave additive arrays for new additions only.

LOCATION SPECIFICITY (BUG-LOC-003): For locationArea, always use the most specific location the user mentioned — city name, NOT province or state. Examples: "Montreal" not "Quebec", "Vancouver" not "British Columbia", "Calgary" not "Alberta". If the user says a region alias like "GTA" or "Greater Toronto Area", preserve that exact term as-is.

CRITICAL: If the user confirms the brief or says something like "that looks right", "show me schools", "yes", "confirmed", "let's see", "go ahead", set intentSignal to 'confirm-brief'.`;

    const userPrompt = `CURRENT KNOWN DATA:
${JSON.stringify(knownData, null, 2)}

CONVERSATION HISTORY (last 5 messages):
${conversationSummary}

PARENT'S MESSAGE:
"${message}"

Extract all factual data from the parent's message. Return ONLY valid JSON. Do NOT explain.`;

    try {
      result = await callOpenRouter({
        systemPrompt,
        userPrompt,
        responseSchema: {
          name: 'entity_extraction_with_intent',
          schema: {
            type: 'object',
            properties: {
              childName: { type: ['string', 'null'] },
              childGrade: { type: ['number', 'null'] },
              locationArea: { type: ['string', 'null'] },
              maxTuition: { type: ['number', 'null'] },
              gender: { type: ['string', 'null'] },
              schoolGenderPreference: { type: ['string', 'null'] },
              schoolGenderExclusions: { type: 'array', items: { type: 'string' } },
              priorities: { type: 'array', items: { type: 'string' } },
              interests: { type: 'array', items: { type: 'string' } },
              dealbreakers: { type: 'array', items: { type: 'string' } },
              remove_priorities: { type: 'array', items: { type: 'string' } },
              remove_interests: { type: 'array', items: { type: 'string' } },
              remove_dealbreakers: { type: 'array', items: { type: 'string' } },
              intentSignal: { type: 'string', enum: ['continue', 'request-brief', 'request-results', 'edit-criteria', 'ask-about-school', 'back-to-results', 'restart', 'off-topic', 'confirm-brief'] },
              briefDelta: {
                type: 'object',
                properties: {
                  additions: { type: 'array' },
                  updates: { type: 'array' },
                  removals: { type: 'array' }
                }
              }
            },
            required: ['intentSignal', 'briefDelta'],
            additionalProperties: false
          }
        },
        maxTokens: 500,
        temperature: 0.1
      });
      intentSignal = result?.intentSignal || 'continue';
      console.log('[INTENT SIGNAL]', intentSignal);
    } catch (openrouterError) {
      console.error('[EXTRACT ERROR] OpenRouter failed:', openrouterError.message);
      try {
        const fallbackResult = await base44.integrations.Core.InvokeLLM({
          prompt: `Extract data from: "${message}". Return JSON with intentSignal and briefDelta.`
        });
        result = fallbackResult || {};
        intentSignal = result?.intentSignal || 'continue';
      } catch (fallbackError) {
        console.error('[FALLBACK ERROR] InvokeLLM extraction failed:', fallbackError.message);
        result = {};
        intentSignal = 'continue';
      }
    }

    let finalResult = result || {};
    if (extractedGrade !== null && !finalResult.childGrade) {
      finalResult = { ...finalResult, childGrade: extractedGrade };
    }
    if (extractedGender !== null && !finalResult.gender) {
      finalResult = { ...finalResult, gender: extractedGender };
    }
    // Map extracted gender to childGender on FamilyProfile
    if (finalResult.gender) {
      finalResult.childGender = finalResult.gender;
    }
    if (extractedSchoolGenderPref && !finalResult.schoolGenderPreference) {
      finalResult = { ...finalResult, schoolGenderPreference: extractedSchoolGenderPref };
    }
    if (extractedSchoolGenderExclusions.length > 0 && (!finalResult.schoolGenderExclusions || finalResult.schoolGenderExclusions.length === 0)) {
      finalResult = { ...finalResult, schoolGenderExclusions: extractedSchoolGenderExclusions };
    }
    // BUG-ENT-004 FIX: Simplified — use regex budget if LLM did not provide one
    if ((finalResult.maxTuition === null || finalResult.maxTuition === undefined) && extractedBudget !== null) {
      finalResult = { ...finalResult, maxTuition: extractedBudget };
    }
    // FIX-LOC-004: Always clean LLM's location, then fallback to regex if needed
    let effectiveLocation = finalResult.locationArea;
    if (effectiveLocation) {
      effectiveLocation = cleanLocation(effectiveLocation);
    }
    if ((effectiveLocation === null || effectiveLocation === undefined) && extractedLocation !== null) {
      effectiveLocation = extractedLocation;
    }
    if (effectiveLocation !== null && effectiveLocation !== undefined) {
      finalResult = { ...finalResult, locationArea: effectiveLocation };
    }

    const cleaned: any = {};
    for (const [key, value] of Object.entries(finalResult)) {
      if (value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)) {
        cleaned[key] = value;
      }
    }

    extractedData = cleaned;
    console.log('[EXTRACT] took', Date.now() - t1, 'ms');
  } catch (e) {
    console.error('[ERROR] Extraction failed:', e.message);
  }
  
  const updatedContext = { ...context };
  if (!updatedContext.extractedEntities) {
    updatedContext.extractedEntities = {};
  }
  for (const [key, value] of Object.entries(extractedData)) {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value) && Array.isArray(updatedContext.extractedEntities[key]) && updatedContext.extractedEntities[key].length > 0) {
        updatedContext.extractedEntities[key] = [...new Set([...updatedContext.extractedEntities[key], ...value])];
      } else {
        updatedContext.extractedEntities[key] = value;
      }
    }
  }
  
  const REMOVAL_MAP: Record<string, string> = {
    remove_priorities: 'priorities',
    remove_interests: 'interests',
    remove_dealbreakers: 'dealbreakers'
  };

  const updatedFamilyProfile = { ...conversationFamilyProfile };
  if (Object.keys(extractedData).length > 0) {
    for (const [removeKey, targetField] of Object.entries(REMOVAL_MAP)) {
      const toRemove = extractedData[removeKey];
      if (Array.isArray(toRemove) && toRemove.length > 0 && Array.isArray(updatedFamilyProfile[targetField])) {
        const removeSet = new Set(toRemove.map((s: string) => s.toLowerCase()));
        updatedFamilyProfile[targetField] = (updatedFamilyProfile[targetField] as string[]).filter(
          (item: string) => !removeSet.has(item.toLowerCase())
        );
        console.log(`[REMOVE] ${targetField}: removed [${toRemove.join(', ')}]`);
      }
    }

    for (const [key, value] of Object.entries(extractedData)) {
      if (key in REMOVAL_MAP) continue;
      if (value !== null && value !== undefined) {
        const existing = updatedFamilyProfile[key];
        if (Array.isArray(value)) {
          if (Array.isArray(existing) && existing.length > 0) {
            updatedFamilyProfile[key] = [...new Set([...existing, ...value])];
          } else {
            updatedFamilyProfile[key] = value;
          }
        } else if (value !== '') {
          updatedFamilyProfile[key] = value;
        }
      }
    }
    if (updatedFamilyProfile?.id) {
      try {
        const persistedProfile = await base44.entities.FamilyProfile.update(updatedFamilyProfile.id, updatedFamilyProfile);
        Object.assign(updatedFamilyProfile, persistedProfile);
        console.log('[EXTRACT] FamilyProfile persisted successfully:', updatedFamilyProfile.id);
      } catch (e) {
        console.error('[EXTRACT] CRITICAL: FamilyProfile update failed:', e.message);
        throw new Error(`FamilyProfile persistence failed: ${e.message}`);
      }
    }
  }
  
  const briefDelta = extractedData?.briefDelta || { additions: [], updates: [], removals: [] };
  intentSignal = intentSignal || 'continue';
  
  return {
    extractedEntities: extractedData,
    updatedFamilyProfile,
    updatedContext,
    intentSignal,
    briefDelta
  };
}

// =============================================================================
// INLINED: handleDiscovery
// =============================================================================
async function handleDiscovery(base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentSchools, flags, returningUserContextBlock) {
  const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };

  const history = conversationHistory || [];
  const recentMessages = history.slice(-10);
  const conversationSummary = recentMessages
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
    const aiResponse = await callOpenRouter({
      systemPrompt: personaInstructions,
      userPrompt: discoveryUserPrompt,
      maxTokens: 500,
      temperature: 0.7
    });
    discoveryMessageRaw = aiResponse || 'Tell me more about your child.';
    console.log('[OPENROUTER] DISCOVERY response');
  } catch (openrouterError) {
    console.log('[OPENROUTER FALLBACK] DISCOVERY falling back to InvokeLLM');
    try {
      const responsePrompt = `${personaInstructions}\n\nRecent chat:\n${conversationSummary}\n\nParent: "${message}"\n\nRespond as ${consultantName}. ONE question max.`;
      const fallbackResponse = await base44.integrations.Core.InvokeLLM({ prompt: responsePrompt });
      discoveryMessageRaw = fallbackResponse?.response || fallbackResponse || 'Tell me more about your child.';
    } catch (fallbackError) {
      console.error('[FALLBACK ERROR] DISCOVERY response failed:', fallbackError.message);
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
// INLINED: handleBrief
// =============================================================================
async function handleBrief(base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, briefStatus, flags, returningUserContextBlock) {
  const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };
  const BRIEF_STATUS = { GENERATING: 'generating', PENDING_REVIEW: 'pending_review', EDITING: 'editing', CONFIRMED: 'confirmed' };

  let msgLower = message.toLowerCase();
  let updatedBriefStatus = briefStatus;
  let briefMessage;
  
  const isInitialAdjustRequest = /\b(change|adjust|edit|actually|wait|hold on|no|not right|different|let me|redo)\b/i.test(msgLower) && 
                                  !/budget|grade|location|school|curriculum|priority/i.test(msgLower);
  
  if (updatedBriefStatus === BRIEF_STATUS.EDITING && isInitialAdjustRequest) {
    const adjustSystemPrompt = consultantName === 'Jackie'
      ? `You are Jackie, a warm and encouraging education consultant. The parent wants to adjust something in their brief. Ask them a warm, open-ended question about what they'd like to change. Max 50 words.`
      : `You are Liam, a direct and strategic education consultant. The parent wants to adjust their brief. Ask them directly what needs to change. Max 50 words.`;

    const adjustUserPrompt = `The parent message was: "${message}"\n\nAsk what needs adjustment in their brief.`;

    let adjustMessage = "What would you like to adjust?";
    try {
      const adjustResponse = await callOpenRouter({ systemPrompt: adjustSystemPrompt, userPrompt: adjustUserPrompt, maxTokens: 300, temperature: 0.5 });
      adjustMessage = adjustResponse || "What would you like to adjust?";
    } catch (openrouterError) {
      try {
        const fallbackResponse = await base44.integrations.Core.InvokeLLM({ prompt: adjustSystemPrompt });
        adjustMessage = fallbackResponse?.response || fallbackResponse || "What would you like to adjust?";
      } catch (fallbackError) {
        console.error('[FALLBACK ERROR] BRIEF adjustment failed:', fallbackError.message);
      }
    }
    
    return {
      message: adjustMessage,
      state: STATES.BRIEF,
      briefStatus: BRIEF_STATUS.EDITING,
      familyProfile: conversationFamilyProfile,
      conversationContext: context,
      schools: []
    };
  } else if (updatedBriefStatus === BRIEF_STATUS.EDITING && !isInitialAdjustRequest) {
    updatedBriefStatus = BRIEF_STATUS.GENERATING;
    context.briefStatus = updatedBriefStatus;
  }
  
  if (context.extractedEntities) {
    for (const [key, value] of Object.entries(context.extractedEntities)) {
      if (value !== null && value !== undefined) {
        if (conversationFamilyProfile[key] === null || conversationFamilyProfile[key] === undefined || 
            (Array.isArray(conversationFamilyProfile[key]) && conversationFamilyProfile[key].length === 0)) {
          conversationFamilyProfile[key] = value;
        }
      }
    }
  }
  
  try {
     const { childName, childGrade, locationArea, interests, priorities, dealbreakers } = conversationFamilyProfile;
     // BUG-ENT-005 FIX: Check context.extractedEntities for maxTuition if not in FamilyProfile
     let maxTuition = conversationFamilyProfile.maxTuition;
     if ((!maxTuition || maxTuition === null || maxTuition === undefined) && context.extractedEntities?.maxTuition) {
       maxTuition = context.extractedEntities.maxTuition;
       console.log('[BRIEF] Using extracted maxTuition:', maxTuition);
     }
     const interestsStr = interests?.length > 0 ? interests.join(', ') : '';
     const prioritiesStr = priorities?.length > 0 ? priorities.join(', ') : '';
     const dealbreakersStr = dealbreakers?.length > 0 ? dealbreakers.join(', ') : '';

     let budgetDisplay = '(not specified)';
     if (maxTuition === 'unlimited') {
       budgetDisplay = 'Budget is flexible';
     } else if (maxTuition && typeof maxTuition === 'number') {
       budgetDisplay = `$${maxTuition.toLocaleString()}/year`;
     }

    const briefChildGenderLabel = conversationFamilyProfile?.gender === 'male'
      ? 'Your son'
      : conversationFamilyProfile?.gender === 'female'
      ? 'Your daughter'
      : 'Your child';
    let briefChildDisplayName = childName ? childName : briefChildGenderLabel;

    const jackieBriefSystemPrompt = `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}[STATE: BRIEF] You are Jackie, a warm and experienced education consultant. Generate a brief summary of what the family has shared. Use ONLY what was explicitly stated by the parent.

    CRITICAL RULES:
    - Start with a warm, natural conversational sentence (1-2 sentences) acknowledging the family's situation before the numbered summary.
    - Do NOT invent personality traits, motivations, or character descriptions that were not explicitly stated by the parent.
    - If no personality was described, skip that section entirely.
    - End with: "Does that capture it? Anything to adjust?"

    YOU ARE JACKIE — warm, empathetic, experienced.`;

    const jackieBriefUserPrompt = `Generate the family brief summary.

FAMILY DATA:
- CHILD: ${briefChildDisplayName}
- GRADE: ${childGrade !== null && childGrade !== undefined ? 'Grade ' + childGrade : '(not specified)'}
- LOCATION: ${locationArea || '(not specified)'}
- BUDGET: ${budgetDisplay}
- PRIORITIES: ${prioritiesStr || '(not specified)'}
- INTERESTS: ${interestsStr || '(not specified)'}
- DEALBREAKERS: ${dealbreakersStr || '(not specified)'}

Format:
- Open with a warm 1-2 sentence intro
- Then a numbered list:
  1. ${briefChildDisplayName}: ${childGrade !== null && childGrade !== undefined ? 'Grade ' + childGrade : '(not specified)'}
  2. Location: ${locationArea || '(not specified)'}
  3. Budget: ${budgetDisplay}
  ${prioritiesStr ? '4. Top priorities: ' + prioritiesStr : ''}
  ${interestsStr ? '5. Interests: ' + interestsStr : ''}
  ${dealbreakersStr ? '6. Dealbreakers: ' + dealbreakersStr : ''}
- End with: "Does that capture it? Anything to adjust?"`;

    const liamBriefSystemPrompt = `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}[STATE: BRIEF] You are Liam, a direct and strategic education consultant. Generate a brief summary of what the family has shared. Use ONLY what was explicitly stated by the parent. Format as a numbered list. End with "Does that look right? Anything to change?"

YOU ARE LIAM — direct, strategic.`;

    const liamBriefUserPrompt = `Generate the family brief summary.

FAMILY DATA:
- CHILD: ${briefChildDisplayName}
- GRADE: ${childGrade !== null && childGrade !== undefined ? 'Grade ' + childGrade : '(not specified)'}
- LOCATION: ${locationArea || '(not specified)'}
- BUDGET: ${budgetDisplay}
- PRIORITIES: ${prioritiesStr || '(not specified)'}
- INTERESTS: ${interestsStr || '(not specified)'}
- DEALBREAKERS: ${dealbreakersStr || '(not specified)'}

Format as a numbered list. Start the first item with "${briefChildDisplayName}:" (NOT "Student:" or "Child:"). Example: "1. ${briefChildDisplayName}: Grade 7". Be direct.`;

    let briefMessageText = "Let me summarize what you've shared.";
    const briefSysPrompt = consultantName === 'Jackie' ? jackieBriefSystemPrompt : liamBriefSystemPrompt;
    const briefUsrPrompt = consultantName === 'Jackie' ? jackieBriefUserPrompt : liamBriefUserPrompt;
    try {
      const briefResult = await callOpenRouter({
        systemPrompt: briefSysPrompt,
        userPrompt: briefUsrPrompt,
        maxTokens: 800,
        temperature: 0.5
      });
      briefMessageText = briefResult || "Let me summarize what you've shared.";
    } catch (openrouterError) {
      try {
        const briefResult = await base44.integrations.Core.InvokeLLM({ prompt: briefSysPrompt + '\n\n' + briefUsrPrompt });
        briefMessageText = briefResult?.response || briefResult || "Let me summarize what you've shared.";
      } catch (fallbackError) {
        console.error('[ERROR] InvokeLLM BRIEF fallback failed:', fallbackError.message);
      }
    }

    briefMessage = briefMessageText;
  } catch (e) {
    console.error('[ERROR] All BRIEF generation failed:', e.message);
    briefMessage = "Let me summarize what you've shared.";
  }

  if (updatedBriefStatus === BRIEF_STATUS.GENERATING) {
    updatedBriefStatus = BRIEF_STATUS.PENDING_REVIEW;
    context.briefStatus = updatedBriefStatus;
    console.log('[BRIEF GENERATED] Set briefStatus to pending_review');
  }

  return {
    message: briefMessage,
    state: STATES.BRIEF,
    briefStatus: updatedBriefStatus,
    familyProfile: conversationFamilyProfile,
    conversationContext: context,
    schools: []
  };
}

// =============================================================================
// INLINED: handleResults
// =============================================================================
async function handleResults(base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, briefStatus, selectedSchoolId, conversationId, userId, userLocation, autoRefresh = false, extractedEntities = {}, returningUserContextBlock) {
  const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };

  if (selectedSchoolId) {
    return {
      message: "Let me pull up that school's details for you.",
      state: 'DEEP_DIVE',
      briefStatus: briefStatus,
      schools: [],
      familyProfile: conversationFamilyProfile,
      conversationContext: { ...context, state: 'DEEP_DIVE' }
    };
  }

  console.log('[SEARCH] Running fresh school search in RESULTS state');
  
  if (!conversationFamilyProfile?.locationArea && context.extractedEntities?.locationArea) {
    conversationFamilyProfile.locationArea = context.extractedEntities.locationArea;
  }

  let parsedGrade = null;
  const rawGrade = conversationFamilyProfile?.childGrade;
  if (rawGrade !== null && rawGrade !== undefined) {
    parsedGrade = typeof rawGrade === 'number' ? rawGrade : parseInt(rawGrade);
  }

  let parsedTuition = null;
  if (conversationFamilyProfile?.maxTuition) {
    parsedTuition = typeof conversationFamilyProfile.maxTuition === 'number' ? conversationFamilyProfile.maxTuition : parseInt(conversationFamilyProfile.maxTuition);
  }

  const locationCoords = resolveLocationCoords(conversationFamilyProfile?.locationArea);
  const resolvedLat = locationCoords?.lat ?? userLocation?.lat ?? null;
  const resolvedLng = locationCoords?.lng ?? userLocation?.lng ?? null;
  if (locationCoords) {
    console.log(`[T045] Resolved "${conversationFamilyProfile?.locationArea}" to coords:`, locationCoords);
  }

  const searchParams: any = {
    limit: 50,
    familyProfile: conversationFamilyProfile
  };

  if (conversationFamilyProfile?.locationArea) {
    const locationAreaLower = conversationFamilyProfile.locationArea.toLowerCase().trim();
    const regionAliases = ['gta', 'greater toronto area', 'lower mainland', 'metro vancouver', 'greater vancouver'];
    if (regionAliases.includes(locationAreaLower)) {
      searchParams.region = conversationFamilyProfile.locationArea;
    } else {
      // BUG-SEARCH-002 FIX: Auto-infer province from major Canadian cities
      const cityToProvinceMap = {
        'toronto': 'Ontario',
        'vancouver': 'British Columbia',
        'calgary': 'Alberta',
        'edmonton': 'Alberta',
        'montreal': 'Quebec',
        'ottawa': 'Ontario',
        'winnipeg': 'Manitoba',
        'halifax': 'Nova Scotia',
        'victoria': 'British Columbia',
        'quebec city': 'Quebec',
        'saskatoon': 'Saskatchewan',
        'regina': 'Saskatchewan'
      };
      const locationParts = conversationFamilyProfile.locationArea.split(',').map(s => s.trim());
      if (locationParts.length >= 2) {
        searchParams.city = locationParts[0];
        searchParams.provinceState = locationParts[1];
      } else if (locationParts.length === 1) {
        searchParams.city = locationParts[0];
        // Auto-infer province from city lookup
        const inferredProvince = cityToProvinceMap[locationParts[0].toLowerCase()];
        if (inferredProvince) {
          searchParams.provinceState = inferredProvince;
          console.log(`[AUTO-INFER] City "${locationParts[0]}" → Province "${inferredProvince}"`);
        }
      }
    }
  }

  if (resolvedLat && resolvedLng) {
    searchParams.resolvedLat = resolvedLat;
    searchParams.resolvedLng = resolvedLng;
  }

  if (parsedGrade !== null) {
    searchParams.minGrade = parsedGrade;
    searchParams.maxGrade = parsedGrade;
  }

  if (parsedTuition && parsedTuition !== 'unlimited') {
    searchParams.maxTuition = parsedTuition;
  }

  let schools = [];
  try {
    const searchResult = await base44.asServiceRole.functions.invoke('searchSchools', {
      ...searchParams,
      conversationId: conversationId,
      userId: userId,
      searchQuery: message
    });
    schools = searchResult.data.schools || [];
  } catch (e) {
    console.error('[ERROR] searchSchools failed:', e.message);
  }

  schools = schools.filter(s => s.schoolType !== 'Special Needs' && s.schoolType !== 'Public');
  
  const seen = new Set();
  const deduplicated = [];
  for (const school of schools) {
    if (!seen.has(school.name)) {
      seen.add(school.name);
      deduplicated.push(school);
    }
  }
  
  const matchingSchools = deduplicated.slice(0, 20);
  context.state = STATES.RESULTS;
  
  let aiMessage = '';
  try {
    if (!matchingSchools || matchingSchools.length === 0) {
      aiMessage = "I don't have any schools matching your criteria yet. Try a nearby city or broader criteria.";
    } else {
      const history = conversationHistory || [];
      const recentMessages = history.slice(-10);
      const conversationSummary = recentMessages
        .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
        .join('\n');
      
      const schoolContext = `\n\nSCHOOLS (${matchingSchools.length}):\n` + 
        matchingSchools.map(s => {
          const tuitionStr = s.tuition ? `$${s.tuition}` : 'N/A';
          return `${s.name} | ${s.city} | Grade ${s.lowestGrade}-${s.highestGrade} | Tuition: ${tuitionStr}`;
        }).join('\n');
      
      const autoRefreshEntitiesStr = Object.keys(extractedEntities).filter(k =>
        !['intentSignal', 'briefDelta', 'remove_priorities', 'remove_interests', 'remove_dealbreakers', 'gender'].includes(k)
      ).join(', ');

      const schoolCount = matchingSchools.length;
      const isFirstResults = !autoRefresh && conversationHistory?.filter(m => m.role === 'assistant' && m.content?.includes('school')).length === 0;
      const isThinResults = schoolCount < 5 && schoolCount > 0;

      // T-RES-007: Consultant Narration
      // Build the narration instruction for initial results presentation
      let narrateInstruction = '';
      if (autoRefresh && autoRefreshEntitiesStr) {
        narrateInstruction = `AUTO-REFRESH MODE: New information was just extracted (${autoRefreshEntitiesStr}). The matches have ALREADY been silently updated. You MUST:
1. In ONE natural sentence, tell the parent you've updated their matches based on the new info. E.g. "I've refreshed your matches based on the STEM interest — here's what changed." or "Updated your matches now that I know the budget is $30K."
2. Then briefly describe the top results shown, as usual. Max 150 words total.
3. Do NOT ask "Does that look right?" or any confirmation question.`;
      } else if (isThinResults) {
        narrateInstruction = `THIN RESULTS MODE: Only ${schoolCount} school${schoolCount === 1 ? '' : 's'} matched. You MUST:
1. Open with something like: "I found ${schoolCount} school${schoolCount === 1 ? '' : 's'} that fit your criteria. Want me to ask a few more questions to widen the search?"
2. Briefly describe the school(s) available. Max 100 words total.`;
      } else if (isFirstResults) {
        narrateInstruction = `INITIAL RESULTS PRESENTATION: This is the first time showing results. You MUST:
1. Open with a warm, natural lead-in like: "Here are your strongest matches based on everything you've told me." (Jackie: warm & encouraging, Liam: direct & confident — use your voice)
2. Briefly highlight 1-2 notable schools. 
3. End with: "Take your time browsing. When a school catches your eye, save it to your shortlist."
Max 160 words total.`;
      } else {
        narrateInstruction = `If the parent updates any preference (e.g. "actually grade 6", "our budget changed", "we want boarding", "looking in Vancouver now"), you MUST:
1. Acknowledge it in ONE short sentence only. Example: "Got it, noted grade 6 — I've updated your matches."
2. STOP. Do not write anything else.`;
      }

      const comparingSchoolsNote = context.comparingSchools?.length >= 2
        ? `\n\nCOMPARISON CONTEXT: The parent is currently viewing a side-by-side comparison of: ${context.comparingSchools.join(', ')}. If they ask questions about these schools, answer with that comparison context in mind.`
        : '';

      const resultsSystemPrompt = `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}[STATE: RESULTS] You are currently showing school results to the parent.

CRITICAL STATE RULE — READ THIS FIRST:
You are in RESULTS state. The parent is viewing their school matches.

${narrateInstruction}${comparingSchoolsNote}

ABSOLUTE PROHIBITIONS in RESULTS state when a preference update is detected:
- Do NOT generate a numbered list of their preferences (Student, Location, Budget, etc.)
- Do NOT produce a brief summary or profile recap
- Do NOT ask "Does that look right?" or any confirmation question
- Do NOT re-list what you know about their family
- Do NOT produce more than 2 sentences total for a preference update (unless in AUTO-REFRESH or THIN RESULTS mode)
- NEVER mention a "Refresh Matches" button — it does not exist

If the parent is asking about the schools (not updating preferences), explain the matches. Focus on fit. Max 150 words.

${consultantName === 'Jackie' ? 'YOU ARE JACKIE - Warm, empathetic, experienced.' : 'YOU ARE LIAM - Direct, strategic, no-BS.'}`;

      const resultsUserPrompt = `Recent chat:\n${conversationSummary}\n${schoolContext}\n\nParent: "${message}"\n\nRespond as ${consultantName}. ONE question max.`;

      let messageWithLinks = 'Here are the schools I found:';
      try {
        const aiResponse = await callOpenRouter({
          systemPrompt: resultsSystemPrompt,
          userPrompt: resultsUserPrompt,
          maxTokens: 800,
          temperature: 0.7
        });
        messageWithLinks = aiResponse || 'Here are the schools I found:';
      } catch (openrouterError) {
        try {
          const fallbackResponse = await base44.integrations.Core.InvokeLLM({
            prompt: resultsSystemPrompt + '\n\n' + resultsUserPrompt
          });
          messageWithLinks = fallbackResponse?.response || fallbackResponse || 'Here are the schools I found:';
        } catch (fallbackError) {
          console.error('[FALLBACK ERROR] RESULTS response failed:', fallbackError.message);
        }
      }
      
      matchingSchools.forEach(school => {
        const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const schoolNameRegex = new RegExp(`(?<!\\[)\\b${escapedName}\\b(?!\\]\\()`, 'gi');
        messageWithLinks = messageWithLinks.replace(
          schoolNameRegex,
          `[${school.name}](school:${school.slug})`
        );
      });
      
      aiMessage = messageWithLinks;
    }
  } catch (e) {
    console.error('[ERROR] RESULTS response failed:', e.message);
    aiMessage = matchingSchools.length > 0 ? 'Here are the schools I found:' : "I don't have matching schools.";
  }
  
  return {
    message: aiMessage,
    state: STATES.RESULTS,
    briefStatus: 'confirmed',
    schools: matchingSchools,
    familyProfile: conversationFamilyProfile,
    conversationContext: context
  };
}

// =============================================================================
// INLINED: handleDeepDive
// =============================================================================
async function handleDeepDive(base44, selectedSchoolId, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, returningUserContextBlock) {
  const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };

  console.log('[DEEPDIVE_START]', selectedSchoolId);
  let aiMessage = '';
  let selectedSchool = null;
  
  if (selectedSchoolId) {
    try {
      const schoolResults = await base44.entities.School.filter({ id: selectedSchoolId });
      if (schoolResults.length > 0) {
        selectedSchool = schoolResults[0];
        console.log('[DEEPDIVE] Loaded school:', selectedSchool.name);
      }
    } catch (e) {
      console.error('[DEEPDIVE ERROR] Failed to load selected school:', e.message);
    }
  }
  
  if (!selectedSchool) {
    return {
      message: "I couldn't load that school's details. Please try selecting it again.",
      state: currentState,
      briefStatus: briefStatus,
      schools: currentSchools || [],
      familyProfile: conversationFamilyProfile,
      conversationContext: context
    };
  }
  
  let childDisplayName = 'your child';
  if (conversationFamilyProfile?.childName) {
    childDisplayName = conversationFamilyProfile.childName;
  }
  
  let resolvedMaxTuition = null;
  if (conversationFamilyProfile?.maxTuition) {
    resolvedMaxTuition = typeof conversationFamilyProfile.maxTuition === 'number' ? conversationFamilyProfile.maxTuition : parseInt(conversationFamilyProfile.maxTuition);
    if (isNaN(resolvedMaxTuition)) { resolvedMaxTuition = null; }
  }

  let resolvedPriorities = null;
  if (conversationFamilyProfile?.priorities && Array.isArray(conversationFamilyProfile.priorities) && conversationFamilyProfile.priorities.length > 0) {
    resolvedPriorities = conversationFamilyProfile.priorities;
  }

  const compressedSchoolData = {
    name: selectedSchool.name,
    tuitionFee: selectedSchool.tuition || selectedSchool.dayTuition || 'Not specified',
    location: `${selectedSchool.city}, ${selectedSchool.provinceState || selectedSchool.country}`,
    genderPolicy: selectedSchool.genderPolicy || 'Co-ed'
  };
  
  const deepDiveSystemPrompt = `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}You are ${consultantName}, an education consultant. The parent is currently in a deep-dive on a specific school.

CRITICAL STATE RULE — READ THIS FIRST:
You are in DEEPDIVE state. If the parent updates any preference mid-conversation (e.g. "actually grade 6", "budget changed", "we want boarding"), you MUST:
1. Acknowledge it in ONE short sentence only. Example: "Got it, noted grade 6 — your matches will update shortly."
2. STOP. Do not write anything else. NEVER mention a "Refresh Matches" button — it does not exist.

ABSOLUTE PROHIBITIONS when a preference update is detected:
- Do NOT generate a numbered list of their preferences (Student, Location, Budget, etc.)
- Do NOT produce a brief summary or profile recap
- Do NOT ask "Does that look right?" or any confirmation question
- Do NOT produce more than 2 sentences total for a preference update

${consultantName === 'Jackie' 
  ? "JACKIE PERSONA: Warm, empathetic, supportive." 
  : "LIAM PERSONA: Direct, strategic, no-BS."}

Write naturally in conversational prose about why this school fits the family. Cover the student-school alignment, any trade-offs or concerns, and the cost reality. Speak like a consultant would—no headers, labels, or formatting markers. Just natural, helpful conversation. End your response with a brief, clear sentence summarizing whether this school is a strong fit for this family and the primary reason why or why not, based on what they shared in their brief.`;

  const deepDiveUserPrompt = `FAMILY BRIEF:
- Child: ${childDisplayName}
- Budget: ${resolvedMaxTuition ? '$' + resolvedMaxTuition : 'Not specified'}
- Priorities: ${resolvedPriorities?.join(', ') || 'Not specified'}

SCHOOL DATA:
${JSON.stringify(compressedSchoolData, null, 2)}

Generate the DEEPDIVE card for this family-school match.`;

  console.log('[DEEPDIVE] Attempting AI-generated card');

  try {
    const aiResponse = await callOpenRouter({
      systemPrompt: deepDiveSystemPrompt,
      userPrompt: deepDiveUserPrompt,
      maxTokens: 2000,
      temperature: 0.6
    });
    if (aiResponse) {
      console.log('[DEEPDIVE] AI card generated successfully');
      aiMessage = aiResponse;
    }
  } catch (llmError) {
    console.error('[DEEPDIVE] OpenRouter failed:', llmError.message);
    aiMessage = `**Great Fit for ${childDisplayName}**\n\n**Why ${selectedSchool.name} for ${childDisplayName}**\n${selectedSchool.description?.substring(0, 150) || 'School details available upon request.'}\n\n**Cost Reality**\nTuition: ${compressedSchoolData.tuitionFee}/year\n\nWhat would you like to know more about?`;
  }

  const sanitizedMessage = aiMessage
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !/^(DEEPDIVE Card:|Fit Label|Why This School|What to Know|Cost Reality|Dealbreaker Check|Tone Bridge)/.test(trimmed);
    })
    .join('\n')
    .trim();

  console.log('[DEEPDIVE] Returning aiMessage length:', sanitizedMessage?.length);
  return {
    message: sanitizedMessage,
    state: currentState,
    briefStatus: briefStatus,
    schools: currentSchools || [],
    familyProfile: conversationFamilyProfile,
    conversationContext: context
  };
}

// =============================================================================
// MAIN: Deno.serve — orchestrateConversation
// =============================================================================
Deno.serve(async (req) => {
  const TIMEOUT_MS = 25000;
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  );

  const processRequest = async () => {
    var currentState;
    var briefStatus;
    
    try {
      const base44 = createClientFromRequest(req);
      const { message, conversationHistory, conversationContext, region, userId, consultantName, currentSchools, userLocation, selectedSchoolId, returningUserContext } = await req.json();

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
        console.log('[ORCH] Running extractEntities inline');
        extractionResult = await extractEntitiesLogic(base44, processMessage, conversationFamilyProfile, context, conversationHistory);
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
        location: conversationFamilyProfile?.locationArea || null,
        gradeLevel: conversationFamilyProfile?.childGrade || null,
        budget: conversationFamilyProfile?.maxTuition || null,
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
      
      console.log('[ORCH] resolveTransition:', { nextState: currentState, intentSignal, sufficiency: resolveResult.sufficiency });
      
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

      // Track previous state for WC10 narrative generation
      context.previousState = context.state;

      let responseData;

      if (currentState === STATES.DISCOVERY) {
        responseData = await handleDiscovery(base44, processMessage, conversationFamilyProfile, context, conversationHistory, consultantName, currentSchools, flags, returningUserContextBlock);
        responseData.extractedEntities = extractionResult?.extractedEntities || {};
        return Response.json(responseData);
      }

      if (currentState === STATES.BRIEF) {
        responseData = await handleBrief(base44, processMessage, conversationFamilyProfile, context, conversationHistory, consultantName, briefStatus, flags, returningUserContextBlock);
        responseData.extractedEntities = extractionResult?.extractedEntities || {};
        return Response.json(responseData);
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

        // WC10: Generate AI narrative if transitioning from BRIEF to RESULTS for the first time
        if (context.previousState === STATES.BRIEF && briefStatus === 'confirmed' && conversationId) {
          try {
            console.log('[WC10] Generating AI narrative for ChatSession');
            
            const { childName, childGrade, childAge, locationArea, maxTuition, priorities, learningDifferences, commuteToleranceMinutes } = conversationFamilyProfile;
            
            const budgetDisplay = maxTuition 
              ? `$${(maxTuition / 1000).toFixed(0)}K/year`
              : 'not specified';
            
            const prioritiesDisplay = priorities?.length > 0 ? priorities.join(', ') : 'none specified';
            const specialNeedsDisplay = learningDifferences?.length > 0 ? learningDifferences.join(', ') : 'none';
            const commuteDisplay = commuteToleranceMinutes ? `${commuteToleranceMinutes} minutes` : 'flexible';
            
            const narrativePrompt = `Write a 2-3 sentence narrative about this child for their School Search Profile. Be warm, professional, and personal. Feel free to reference the specific data provided.

Child: ${childName || 'Not named yet'}
Grade: ${childGrade !== null && childGrade !== undefined ? 'Grade ' + childGrade : 'not specified'}
Age: ${childAge || 'not specified'}
Location: ${locationArea || 'not specified'}
Budget: ${budgetDisplay}
Priorities: ${prioritiesDisplay}
Special needs: ${specialNeedsDisplay}
Commute preference: ${commuteDisplay}

Example output: "Emma is a creative Grade 5 student who thrives in smaller, nurturing environments. Her family values strong arts programming alongside rigorous academics, with a preference for schools within a 30-minute commute of downtown Toronto."`;
            
            let aiNarrative = null;
            try {
              aiNarrative = await callOpenRouter({
                systemPrompt: 'You are a skilled education consultant writing warm, personalized school profile narratives. Keep it 2-3 sentences max.',
                userPrompt: narrativePrompt,
                maxTokens: 300,
                temperature: 0.7
              });
              console.log('[WC10] Narrative generated via OpenRouter');
            } catch (openrouterError) {
              console.log('[WC10] OpenRouter failed, trying InvokeLLM');
              try {
                const fallback = await base44.integrations.Core.InvokeLLM({ prompt: narrativePrompt });
                aiNarrative = fallback?.response || fallback;
              } catch (fallbackError) {
                console.error('[WC10] Both narrative generation methods failed:', fallbackError.message);
              }
            }
            
            // Update ChatSession with narrative if generated
            if (aiNarrative) {
              try {
                const chatSessions = await base44.entities.ChatSession.filter({ id: conversationId });
                if (chatSessions.length > 0) {
                  await base44.entities.ChatSession.update(conversationId, { aiNarrative });
                  console.log('[WC10] ChatSession updated with aiNarrative');
                }
              } catch (updateError) {
                console.error('[WC10] Failed to update ChatSession with narrative:', updateError.message);
              }
            }
          } catch (e) {
            console.error('[WC10] Narrative generation failed:', e.message);
          }
        }

        const autoRefresh = context.autoRefreshed === true;
        responseData = await handleResults(base44, processMessage, conversationFamilyProfile, context, conversationHistory, consultantName, briefStatus, selectedSchoolId, conversationId, userId, userLocation, autoRefresh, extractionResult?.extractedEntities || {}, returningUserContextBlock);
        responseData.conversationContext = { ...(responseData.conversationContext || {}), autoRefreshed: autoRefresh };
        responseData.extractedEntities = extractionResult?.extractedEntities || {};
        return Response.json(responseData);
      }

      if (currentState === STATES.DEEP_DIVE) {
        responseData = await handleDeepDive(base44, selectedSchoolId, processMessage, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, returningUserContextBlock);
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
    return await Promise.race([processRequest(), timeoutPromise]);
  } catch (error) {
    if (error.message === 'TIMEOUT') {
      return Response.json({ error: 'Request timeout', status: 408 }, { status: 408 });
    }
    return Response.json({ error: 'Something went wrong. Please try again.', status: 500 }, { status: 500 });
  }
});