import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
// All functions inlined to avoid 404 errors with Deno local imports

// INLINED: callOpenRouter (InvokeLLM fallback removed per user request)
async function callOpenRouter(options) {
  const { systemPrompt, userPrompt, responseSchema, maxTokens = 1000, temperature = 0.7 } = options;
  
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set');
  }
  
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });
  
  const body = {
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

// INLINED: extractEntities
async function extractEntities(params) {
  const { base44, message, conversationFamilyProfile, context, conversationHistory } = params;

  let extractedData = {};
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

    const systemPrompt = `Extract ONLY factual data explicitly stated. Return JSON with NULL for anything not mentioned.

    RESPONSE SCHEMA:
    { 
      entities: { childName, childGrade, locationArea, ... all extraction fields },
      intentSignal: 'continue' | 'request-brief' | 'request-results' | 'edit-criteria' | 'ask-about-school' | 'back-to-results' | 'restart' | 'off-topic',
      briefDelta: { 
        additions: [{ field, value, confidence }],
        updates: [{ field, old, new, confidence }],
        removals: []
      }
    }
    Confidence values: 'explicit' (directly stated) | 'inferred' (clear from context) | 'contextual' (weak signal).

    EXTRACTION FIELDS:
    - childName: string or null
    - childAge: number or null (KI-14: extract if user mentions age in years, e.g., "14 years old" → 14)
    - childGrade: number or null (e.g., 3 for Grade 3, -1 for JK, 0 for SK)
    - childGender: "male" OR "female" OR null (KI-16: "son", "boy", "he/him" → "male"; "daughter", "girl", "she/her" → "female")
    - locationArea: string (city name)
    - budgetMin: number or null (minimum budget in dollars)
    - budgetMax: number or null (maximum budget in dollars)
    - budgetSingle: number or null (KI-15: Set if user states a budget amount, INCLUDING approximate or hedged amounts like "around", "about", "roughly", "up to", "no more than", "hoping to stay under". Extract the numeric value. Convert shorthand: $25K=25000, $30K=30000, 30k=30000. If user gives a range, use budgetMin/budgetMax instead.)
    - maxTuition: "unlimited" OR number OR null (for backward compatibility)
    - interests: array of strings or null
    - priorities: array of strings or null (FIX 4: When user says "arts", "music", "theater", "drama" → priorities: ["Arts"]. When "STEM", "science", "math" → priorities: ["STEM"]. When "sports" → priorities: ["Sports"]. When "languages", "French", "Spanish" → priorities: ["Languages"])
    - dealbreakers: array or null
    - learning_needs: array or null (e.g., "ADHD", "ASD", "dyslexia", "ESL", "gifted", "learning disability")
    - wellbeing_needs: array or null (KI-13: "anxiety", "behavioral issues", "acting out", "feeling unsafe", "divorce impact", "depression", "social struggles", "confidence issues")
    - childrenJson: string or null (KI-10: If the parent mentions MORE THAN ONE child, return a JSON array string of child objects. Example: '[{"name":"Emma","grade":9,"gender":"female","interests":["STEM","robotics"],"priorities":["AP courses"],"learningNeeds":[]},{"name":"Noah","grade":3,"gender":"male","interests":[],"priorities":["small classes"],"learningNeeds":["dyslexia"]}]'. If only ONE child mentioned, return null.)
    - curriculumPreference: array or null (e.g., "French immersion", "IB", "AP", "Montessori", "progressive", "traditional")
    - programPreferences: array or null (e.g., "outdoor education", "French immersion", "arts focus", "STEM", "athletics", "music program")
    - religiousPreference: string or null
    - boardingPreference: boolean or null
    - genderPreference: "Co-Ed" OR "All Boys" OR "All Girls" OR null
    - classSize: string or null (e.g., "small", "standard", "15 students", "intimate")
    - requestedSchools: array of school names or null
    - financialAidInterest: boolean or null
    - specialNeeds: array or null (e.g., "ADHD", "ASD", "dyslexia", "ESL support")

    INTENT CLASSIFICATION:
    Also classify the user's intent with intentSignal. Possible values:
    - 'continue': User is providing info, asking questions during discovery
    - 'request-brief': User asks to generate brief or summary
    - 'request-results': User asks to see school matches/results
    - 'edit-criteria': User wants to change/adjust brief details
    - 'ask-about-school': User asks about a specific school
    - 'back-to-results': User wants to go back to results list
    - 'restart': User wants to start over
    - 'off-topic': Message is off-topic or unclear`;

    const userPrompt = `CURRENT KNOWN DATA:
    ${JSON.stringify(knownData, null, 2)}

    CONVERSATION HISTORY (last 10 messages):
    ${conversationSummary}

    PARENT'S MESSAGE:
    "${message}"

    Extract all factual data from the parent's message. Return ONLY valid JSON. Do NOT explain.`;

    let result;
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
              childAge: { type: ['number', 'null'] },
              childGrade: { type: ['number', 'null'] },
              childGender: { type: ['string', 'null'] },
              locationArea: { type: ['string', 'null'] },
              budgetMin: { type: ['number', 'null'] },
              budgetMax: { type: ['number', 'null'] },
              budgetSingle: { type: ['number', 'null'] },
              maxTuition: { type: ['number', 'null'] },
              priorities: { type: 'array', items: { type: 'string' } },
              interests: { type: 'array', items: { type: 'string' } },
              dealbreakers: { type: 'array', items: { type: 'string' } },
              learning_needs: { type: 'array', items: { type: 'string' } },
              wellbeing_needs: { type: 'array', items: { type: 'string' } },
              curriculumPreference: { type: 'array', items: { type: 'string' } },
              programPreferences: { type: 'array', items: { type: 'string' } },
              genderPreference: { type: ['string', 'null'] },
              boardingPreference: { type: ['boolean', 'null'] },
              religiousPreference: { type: ['string', 'null'] },
              intentSignal: { type: 'string', enum: ['continue', 'request-brief', 'request-results', 'edit-criteria', 'ask-about-school', 'back-to-results', 'restart', 'off-topic'] },
              briefDelta: {
                type: 'object',
                properties: {
                  additions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string' },
                        value: {},
                        confidence: { type: 'string', enum: ['explicit', 'inferred', 'contextual'] }
                      },
                      required: ['field', 'value', 'confidence']
                    }
                  },
                  updates: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string' },
                        old: {},
                        new: {},
                        confidence: { type: 'string', enum: ['explicit', 'inferred', 'contextual'] }
                      },
                      required: ['field', 'old', 'new', 'confidence']
                    }
                  },
                  removals: { type: 'array', items: { type: 'string' } }
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
      intentSignal = result.intentSignal;
      console.log('[INTENT SIGNAL]', intentSignal);
      console.log('[EXTRACT] OpenRouter returned intentSignal:', intentSignal);
    } catch (openrouterError) {
      console.error('[EXTRACT ERROR] OpenRouter failed:', openrouterError.message);
      result = {
        intentSignal: 'continue',
        briefDelta: { additions: [], updates: [], removals: [] }
      };
      intentSignal = 'continue';
    }

    let finalResult = result;
    if (extractedGrade !== null && !result.childGrade) {
     finalResult = { ...result, childGrade: extractedGrade };
    }
    
    if (finalResult.childAge && !finalResult.childGrade) {
      const ageToGradeMap = {
        4: -1, 5: 0, 6: 1, 7: 2, 8: 3, 9: 4, 10: 5, 11: 6, 12: 7, 13: 8, 14: 9, 15: 10, 16: 11, 17: 12, 18: 12
      };
      const convertedGrade = ageToGradeMap[finalResult.childAge];
      if (convertedGrade !== undefined) {
        finalResult = { ...finalResult, childGrade: convertedGrade };
        console.log('[KI-14] Converted age', finalResult.childAge, 'to grade', convertedGrade);
      }
    }
    
    if (finalResult.budgetSingle && !finalResult.budgetMin && !finalResult.budgetMax) {
      finalResult = { ...finalResult, maxTuition: finalResult.budgetSingle };
      console.log('[KI-15] Set budgetSingle', finalResult.budgetSingle, 'as maxTuition');
    }

    const cleaned = {};
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
  
  if (extractedData.childrenJson) {
    updatedContext.extractedEntities.childrenJson = extractedData.childrenJson;
  }
  
  const updatedFamilyProfile = { ...conversationFamilyProfile };
  if (Object.keys(extractedData).length > 0) {
    for (const [key, value] of Object.entries(extractedData)) {
      if (value !== null && value !== undefined) {
        const existing = updatedFamilyProfile[key];
        
        if (Array.isArray(value)) {
          if (Array.isArray(existing) && existing.length > 0) {
            updatedFamilyProfile[key] = [...new Set([...existing, ...value])];
          } else {
            updatedFamilyProfile[key] = value;
          }
        } 
        else if (value !== '') {
          updatedFamilyProfile[key] = value;
        }
      }
    }
    if (updatedFamilyProfile?.id) {
      try {
        const persistedProfile = await base44.entities.FamilyProfile.update(updatedFamilyProfile.id, updatedFamilyProfile);
        Object.assign(updatedFamilyProfile, persistedProfile);
      } catch (e) {
        console.error('FamilyProfile update failed:', e);
      }
    }
  }
  
  const briefDelta = result?.briefDelta || { additions: [], updates: [], removals: [] };
  intentSignal = intentSignal || 'continue';
  
  return {
    extractedEntities: extractedData,
    updatedFamilyProfile,
    updatedContext,
    intentSignal,
    briefDelta
  };
}

// INLINED: resolveTransition
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

  if (currentState === STATES.WELCOME && turnCount > 0) {
    nextState = STATES.DISCOVERY;
    transitionReason = 'auto_welcome_exit';
    console.log('[R1] WELCOME->DISCOVERY (conversation started)');
    return { nextState, sufficiency, flags, transitionReason };
  }

  if (selectedSchoolId && selectedSchoolId !== previousSchoolId) {
    nextState = STATES.DEEP_DIVE;
    transitionReason = 'school_selected';
    console.log('[R2] Override to DEEP_DIVE (school selected)');
    return { nextState, sufficiency, flags, transitionReason };
  }

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

  if (turnCount >= 7 && currentState === STATES.DISCOVERY) {
    nextState = STATES.BRIEF;
    briefStatus = 'generating';
    flags.FORCED_TRANSITION = true;
    transitionReason = 'hard_cap';
    console.log('[R4] Escape Rule: Hard cap at turn 7, forcing BRIEF');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason, briefStatus };
  }

  if (turnCount >= 5 && currentState === STATES.DISCOVERY && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
    flags.SUGGEST_BRIEF = true;
    transitionReason = 'soft_nudge';
    console.log('[R5] Escape Rule: Soft nudge at turn 5');
    console.log('[RESOLVE] Output:', { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason });
    return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason };
  }

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

  if (currentState === STATES.DISCOVERY && intentSignal === 'continue') {
    console.log('[R8] DISCOVERY + continue intent, stay DISCOVERY');
    console.log('[RESOLVE] Output:', { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason });
    return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason };
  }

  if (intentSignal === 'off-topic') {
    console.log('[R9] Off-topic, stay in current state');
    console.log('[RESOLVE] Output:', { nextState: currentState, sufficiency, flags, transitionReason });
    return { nextState: currentState, sufficiency, flags, transitionReason };
  }

  if (currentState === STATES.BRIEF && briefEditCount >= 3) {
    nextState = STATES.RESULTS;
    briefStatus = 'confirmed';
    flags.FORCED_TRANSITION = true;
    transitionReason = 'edit_cap_reached';
    console.log('[R10] Edit cap reached (3), move to RESULTS');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason, briefStatus };
  }

  if (currentState === STATES.DEEP_DIVE && !selectedSchoolId) {
    nextState = STATES.RESULTS;
    console.log('[R11] DEEP_DIVE but no selectedSchoolId, back to RESULTS');
    console.log('[RESOLVE] Output:', { nextState, sufficiency, flags, transitionReason });
    return { nextState, sufficiency, flags, transitionReason };
  }

  console.log('[DEFAULT] Maintain current state:', currentState);
  console.log('[RESOLVE] Output:', { nextState: currentState, sufficiency, flags, transitionReason });
  return { nextState: currentState, sufficiency, flags, transitionReason };
}

// INLINED: handleDiscovery
async function handleDiscovery(params) {
  const { base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId, flags } = params;

  const STATES = {
    WELCOME: 'WELCOME',
    DISCOVERY: 'DISCOVERY',
    BRIEF: 'BRIEF',
    RESULTS: 'RESULTS',
    DEEP_DIVE: 'DEEP_DIVE'
  };

  let discoveryMessage;
  try {
    const history = conversationHistory || [];
    const recentMessages = history.slice(-10);
    const conversationSummary = recentMessages
      .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
      .join('\n');

    const allText = history.map(m => m.content).join(' ') + ' ' + message;
    let hasLocation = false, hasBudget = false, hasChildGrade = false;
    try {
      hasLocation = /mississauga|toronto|vancouver|calgary|ottawa|montreal|brampton|oakville|markham|vaughan|richmond hill|burnaby|surrey|london|hamilton|winnipeg|quebec|edmonton/i.test(allText);
      hasBudget = /(\$|budget|tuition|cost)\s*\d+/.test(allText) || /\d{2,3}\s*k\b/i.test(allText);
      hasChildGrade = /grade|kindergarten|preschool|elementary|middle|high school/i.test(allText);
    } catch (e) {}

    const briefOfferInstruction = flags?.OFFER_BRIEF 
      ? '\n\nIMPORTANT: You should offer to generate their Family Brief now. Use a natural transition like: "I think I have a good sense of what you\'re looking for. Would you like me to put together a brief summary of your family\'s needs so we can find the best matches?"'
      : flags?.SUGGEST_BRIEF
      ? '\n\nIf it feels natural in the conversation, offer to generate their Family Brief.'
      : '';

    const personaInstructions = consultantName === 'Jackie'
     ? `[STATE: DISCOVERY] You are gathering family info. Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.

    CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Keep gathering information.${briefOfferInstruction}

    NEVER USE THESE PHRASES (HARD BAN): "That's wonderful", "How exciting", "It sounds like you're looking for", "I understand you're eager", "I'd love to help you explore", "That's great", "I appreciate you sharing". If you catch yourself starting with any of these, DELETE IT and start over.

    YOU ARE JACKIE - Senior education consultant, 10+ years placing families in private schools. You're warm but efficient - you respect the parent's time. You have real opinions and share them. You sound like a knowledgeable friend, not a customer service bot.

    VOICE RULES: Use contractions. Short sentences. One question per message. Lead with insight, not reflection. Name real schools when relevant. Never parrot the user's words back. Never use performative enthusiasm. Never start with "I understand" or "That's wonderful." Max one sentence of acknowledgment before advancing the conversation.

   🚫 IF THEY SAID LOCATION → NEVER ask where they live
   🚫 IF THEY SAID BUDGET → NEVER ask budget
   🚫 IF THEY SAID GRADE → NEVER ask grade
   🚫 ONE QUESTION ONLY. NO filler.

   TONE & LANGUAGE RULES (FIX 15):
   - Never call any budget "generous", "modest", "tight", or "comfortable". Use neutral factual language only.
   - If parent expresses budget worry, respond with empathy first, then explain options without judgment.
   - If parent mentions ADHD, ASD, ESL, or learning differences, name them explicitly. Do NOT euphemize as "unique learning style".
   - If the parent appears to have limited English (simple grammar, mentions ESL/newcomer), use shorter sentences and simpler vocabulary.
   
   MULTI-CHILD ACKNOWLEDGMENT (FIX 16):
   - If the parent mentions multiple children with different grades, explicitly acknowledge each child by name and grade.
   - Do NOT collapse multiple children into a single anonymous "student".

   CRITICAL INSTRUCTIONS:
   - Do NOT mention any specific school names
   - Do NOT suggest or recommend schools
   - Your only job in this phase is to understand the family's needs
   - If the user asks about a specific school, respond: "I'd love to tell you about that school - let me first understand what you're looking for so I can give you the best perspective."`
      : `[STATE: DISCOVERY] You are gathering family info. Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.

      CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Keep gathering information.${briefOfferInstruction}

      NEVER USE THESE PHRASES (HARD BAN): "That's wonderful", "How exciting", "It sounds like you're looking for", "I understand you're eager", "I'd love to help you explore", "That's great", "I appreciate you sharing". If you catch yourself starting with any of these, DELETE IT and start over.

      YOU ARE LIAM - Senior education strategist, 10+ years in private school placement. You're direct and data-driven - you cut to what matters. You give straight answers and move fast. You sound like a sharp advisor, not a chatbot.

      VOICE RULES: Use contractions. Short sentences. One question per message. Lead with data or strategy, not feelings. Name real schools when relevant. Never parrot the user's words back. Never use filler phrases. Never hedge with "I'd love to" or "perhaps we could." Get to the point.

   🚫 IF THEY SAID LOCATION → NEVER ask where they live
   🚫 IF THEY SAID BUDGET → NEVER ask budget
   🚫 IF THEY SAID GRADE → NEVER ask grade
   🚫 ONE QUESTION ONLY. NO filler.

   TONE & LANGUAGE RULES (FIX 15):
   - Never call any budget "generous", "modest", "tight", or "comfortable". Use neutral factual language only.
   - If parent expresses budget worry, respond with empathy first, then explain options without judgment.
   - If parent mentions ADHD, ASD, ESL, or learning differences, name them explicitly. Do NOT euphemize as "unique learning style".
   - If the parent appears to have limited English (simple grammar, mentions ESL/newcomer), use shorter sentences and simpler vocabulary.
   
   MULTI-CHILD ACKNOWLEDGMENT (FIX 16):
   - If the parent mentions multiple children with different grades, explicitly acknowledge each child by name and grade.
   - Do NOT collapse multiple children into a single anonymous "student".

   CRITICAL INSTRUCTIONS:
   - Do NOT mention any specific school names
   - Do NOT suggest or recommend schools
   - Your only job in this phase is to understand the family's needs
   - If the user asks about a specific school, respond: "I'd love to tell you about that school - let me first understand what you're looking for so I can give you the best perspective."`;

    const discoverySystemPrompt = personaInstructions;

    const discoveryUserPrompt = `ENTITY EXTRACTION STATUS:
    - LOCATION: ${hasLocation ? 'YES' : 'NO'}
    - BUDGET: ${hasBudget ? 'YES' : 'NO'}
    - GRADE: ${hasChildGrade ? 'YES' : 'NO'}

    Recent chat:
    ${conversationSummary}

    Parent: "${message}"

    Respond as ${consultantName}. ONE question max. No filler.`;

    let discoveryMessageRaw = 'Tell me more about your child.';
    try {
      const aiResponse = await callOpenRouter({
        systemPrompt: discoverySystemPrompt,
        userPrompt: discoveryUserPrompt,
        maxTokens: 500,
        temperature: 0.7
      });
      discoveryMessageRaw = aiResponse || 'Tell me more about your child.';
      console.log('[OPENROUTER] DISCOVERY response');
    } catch (openrouterError) {
      console.error('[DISCOVERY ERROR] OpenRouter failed:', openrouterError.message);
      discoveryMessageRaw = 'Tell me more about your child.';
    }
    
    if (currentSchools && currentSchools.length > 0) {
      const sentences = discoveryMessageRaw.split(/(?<=[.!?])\s+/);
      const filteredSentences = sentences.filter(sentence => {
        for (const school of currentSchools) {
          const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
          if (regex.test(sentence)) {
            console.warn('[VALIDATOR] Removed sentence containing school name:', school.name);
            return false;
          }
        }
        return true;
      });
      discoveryMessageRaw = filteredSentences.join(' ').trim();
    }
    
    discoveryMessage = discoveryMessageRaw;
  } catch (e) {
    console.error('[ERROR] DISCOVERY response failed:', e.message);
    discoveryMessage = 'Tell me about your child — what grade are they in and what matters most to you?';
  }

  return Response.json({
    message: discoveryMessage,
    state: STATES.DISCOVERY,
    briefStatus: null,
    familyProfile: conversationFamilyProfile,
    conversationContext: context,
    schools: []
  });
}

// INLINED: handleBrief
async function handleBrief(params) {
  const { base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId } = params;

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

  let msgLower = message.toLowerCase();
  let updatedBriefStatus = briefStatus;
  let briefMessage;
  
  const isInitialAdjustRequest = /\b(change|adjust|edit|actually|wait|hold on|no|not right|different|let me|redo)\b/i.test(msgLower) && 
                                  !/budget|grade|location|school|curriculum|priority/i.test(msgLower);
  
  if (updatedBriefStatus === BRIEF_STATUS.EDITING && isInitialAdjustRequest) {
    const adjustSystemPrompt = consultantName === 'Jackie'
      ? `You are Jackie, a warm and encouraging education consultant. The parent wants to adjust something in their brief. Ask them a warm, open-ended question about what they'd like to change. Max 50 words. Be encouraging.`
      : `You are Liam, a direct and strategic education consultant. The parent wants to adjust their brief. Ask them directly what needs to change. Max 50 words.`;

    const adjustUserPrompt = `The parent message was: "${message}"

  Ask what needs adjustment in their brief.`;

    let adjustMessage = "What would you like to adjust?";
    try {
      const adjustResponse = await callOpenRouter({
        systemPrompt: adjustSystemPrompt,
        userPrompt: adjustUserPrompt,
        maxTokens: 300,
        temperature: 0.5
      });
      adjustMessage = adjustResponse || "What would you like to adjust?";
      console.log('[OPENROUTER] BRIEF adjustment');
    } catch (openrouterError) {
      console.error('[BRIEF ERROR] OpenRouter failed:', openrouterError.message);
      adjustMessage = "What would you like to adjust?";
    }
    
    return Response.json({
      message: adjustMessage,
      state: STATES.BRIEF,
      briefStatus: BRIEF_STATUS.EDITING,
      familyProfile: conversationFamilyProfile,
      conversationContext: context,
      schools: []
    });
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
    const { childName, childGrade, childGender, locationArea, budgetRange, budgetMin, budgetMax, maxTuition, interests, priorities, dealbreakers, currentSituation, academicStrengths, genderPreference, classSize, programPreferences, wellbeing_needs } = conversationFamilyProfile;
    const interestsStr = interests?.length > 0 ? interests.join(', ') : '';
    const prioritiesStr = priorities?.length > 0 ? priorities.join(', ') : '';
    const strengthsStr = academicStrengths?.length > 0 ? academicStrengths.join(', ') : '';
    const dealbreakersStr = dealbreakers?.length > 0 ? dealbreakers.join(', ') : '';
    const programPreferencesStr = programPreferences?.length > 0 ? programPreferences.join(', ') : '';
    const wellbeingNeedsStr = wellbeing_needs?.length > 0 ? wellbeing_needs.join(', ') : '';

    let budgetDisplay = budgetRange || '(not specified)';
    if (maxTuition === 'unlimited') {
      budgetDisplay = 'Budget is flexible';
    } else if (budgetMin && budgetMax && budgetMin !== budgetMax) {
      budgetDisplay = `$${budgetMin.toLocaleString()}-$${budgetMax.toLocaleString()}/year`;
    } else if (budgetMin && budgetMax && budgetMin === budgetMax) {
      budgetDisplay = `$${budgetMin.toLocaleString()}/year`;
    } else if (budgetMax) {
      budgetDisplay = `Up to $${budgetMax.toLocaleString()}/year`;
    } else if (maxTuition && typeof maxTuition === 'number') {
      budgetDisplay = `$${maxTuition.toLocaleString()}/year`;
    }

    let briefChildDisplayName = childName ? childName : 'your child';
    if (!childName && childGender === 'male') {
      briefChildDisplayName = 'your son';
    } else if (!childName && childGender === 'female') {
      briefChildDisplayName = 'your daughter';
    }
    const childDisplayName = briefChildDisplayName;

    const conversationText = conversationHistory?.map(m => m.content).join(' ') || '';
    const multiChildPatterns = /\b(two kids|two children|both kids|both children|my son and daughter|my daughter and son|older one and younger|younger one and older|first child|second child|one child.*another child|siblings|each child|each of them)\b/i;
    const isMultiChild = multiChildPatterns.test(conversationText);
    console.log('[KI-10 MULTI-CHILD CHECK]', {isMultiChild, conversationSnippet: conversationText.substring(0, 200)});

    const learningNeeds = conversationFamilyProfile.learning_needs || conversationFamilyProfile.specialNeeds || [];
    const learningNeedsStr = learningNeeds.length > 0 ? learningNeeds.join(', ') : '';
    const curriculumStr = conversationFamilyProfile.curriculumPreference?.length > 0 ? conversationFamilyProfile.curriculumPreference.join(', ') : '';

    console.log('[BRIEF] Using programmatic brief generation (no LLM call)');
    console.log('[BRIEF] Data available:', {
      childName: childName || null,
      childGrade: childGrade ?? context.extractedEntities?.childGrade ?? null,
      location: locationArea || context.extractedEntities?.locationArea || null,
      budget: budgetDisplay,
      prioritiesCount: priorities?.length || 0,
      interestsCount: interests?.length || 0,
      isMultiChild
    });

    const resolvedGrade = childGrade ?? context.extractedEntities?.childGrade;
    const gradeStr = resolvedGrade !== null && resolvedGrade !== undefined
      ? (resolvedGrade === -1 ? 'JK' : resolvedGrade === 0 ? 'SK' : 'Grade ' + resolvedGrade)
      : null;

    const resolvedLocation = locationArea || context.extractedEntities?.locationArea;

    let briefContent;
    if (isMultiChild) {
      let parsedChildren = null;
      try {
        if (context.extractedEntities?.childrenJson) {
          parsedChildren = JSON.parse(context.extractedEntities.childrenJson);
        }
      } catch (e) {
        console.error('[KI-10] Failed to parse childrenJson:', e);
      }

      if (parsedChildren && Array.isArray(parsedChildren) && parsedChildren.length >= 2) {
        const childBullets = parsedChildren.map((child, idx) => {
          const num = idx + 1;
          const name = child.name || 'Child ' + num;
          const grade = child.grade !== null && child.grade !== undefined
            ? (child.grade === -1 ? 'JK' : child.grade === 0 ? 'SK' : 'Grade ' + child.grade)
            : '(not specified)';
          let section = 'Child ' + num + ': ' + name + '\n';
          section += '  • Grade: ' + grade;
          if (child.interests?.length) section += '\n  • Interests: ' + child.interests.join(', ');
          if (child.priorities?.length) section += '\n  • Priorities: ' + child.priorities.join(', ');
          if (child.learningNeeds?.length) section += '\n  • Learning needs: ' + child.learningNeeds.join(', ');
          return section;
        }).join('\n\n');

        const sharedBullets = [];
        if (resolvedLocation) sharedBullets.push('• Location: ' + resolvedLocation);
        if (budgetDisplay && budgetDisplay !== '(not specified)') sharedBullets.push('• Budget: ' + budgetDisplay);
        if (curriculumStr) sharedBullets.push('• Curriculum: ' + curriculumStr);
        if (dealbreakersStr) sharedBullets.push('• Dealbreakers: ' + dealbreakersStr);

        briefContent = childBullets;
        if (sharedBullets.length > 0) {
          briefContent += '\n\nShared family preferences:\n' + sharedBullets.join('\n');
        }
      } else {
        briefContent = null;
      }
    }

    if (!briefContent) {
      const bullets = [];
      if (childName && gradeStr) {
        bullets.push('Student: ' + childDisplayName + ', ' + gradeStr);
      } else if (childName) {
        bullets.push('Student: ' + childDisplayName);
      } else if (gradeStr) {
        bullets.push('Grade: ' + gradeStr);
      }
      if (resolvedLocation) bullets.push('Location: ' + resolvedLocation);
      if (budgetDisplay && budgetDisplay !== '(not specified)') bullets.push('Budget: ' + budgetDisplay);
      if (genderPreference) bullets.push('Gender preference: ' + genderPreference);
      if (classSize || context.extractedEntities?.classSize) bullets.push('Class size: ' + (classSize || context.extractedEntities.classSize));
      if (curriculumStr) bullets.push('Curriculum: ' + curriculumStr);
      if (programPreferencesStr) bullets.push('Program preferences: ' + programPreferencesStr);
      if (prioritiesStr) bullets.push('Top priorities: ' + prioritiesStr);
      if (learningNeedsStr) bullets.push('Learning needs: ' + learningNeedsStr);
      if (wellbeingNeedsStr) bullets.push('Wellbeing needs: ' + wellbeingNeedsStr);
      if (interestsStr) bullets.push('Interests: ' + interestsStr);
      if (strengthsStr) bullets.push('Academic strengths: ' + strengthsStr);
      if (dealbreakersStr) bullets.push('Dealbreakers: ' + dealbreakersStr);
      if (context.extractedEntities?.boardingPreference) bullets.push('Boarding: Yes');
      if (context.extractedEntities?.religiousPreference) bullets.push('Religious preference: ' + context.extractedEntities.religiousPreference);
      if (currentSituation) bullets.push('Current situation: ' + currentSituation);

      briefContent = bullets.length > 0
        ? bullets.map(b => '• ' + b).join('\n')
        : 'I captured your preferences but could not format them.';
    }
    
    const intro = consultantName === 'Jackie' 
      ? "Let me make sure I've got this right:\n\n"
      : "Here's what I'm hearing:\n\n";
    
    let briefMessageText = intro + briefContent + "\n\nDoes that capture everything? Anything you'd like to adjust?";

    briefMessageText = briefMessageText.replace(/\[Child\]/gi, briefChildDisplayName);
    briefMessageText = briefMessageText.replace(/\[child's name\]/gi, briefChildDisplayName);
    briefMessageText = briefMessageText.replace(/\[child\]/gi, briefChildDisplayName);
    briefMessage = briefMessageText;
    console.log('[BRIEF] Programmatic brief generated, length:', briefMessage?.length, 'preview:', briefMessage?.substring(0, 120));
  } catch (e) {
    console.error('[ERROR] All BRIEF generation failed:', e.message);
    
    const fallbackBrief = [];
    if (conversationFamilyProfile.childName) fallbackBrief.push(`Student: ${conversationFamilyProfile.childName}`);
    if (context.extractedEntities?.childGrade) {
      const gradeDisplay = context.extractedEntities.childGrade === -1 ? 'JK' : context.extractedEntities.childGrade === 0 ? 'SK' : `Grade ${context.extractedEntities.childGrade}`;
      fallbackBrief.push(`Grade: ${gradeDisplay}`);
    }
    if (context.extractedEntities?.locationArea) fallbackBrief.push(`Location: ${context.extractedEntities.locationArea}`);
    if (conversationFamilyProfile.maxTuition) fallbackBrief.push(`Budget: $${conversationFamilyProfile.maxTuition.toLocaleString()}`);
    if (conversationFamilyProfile.priorities?.length) fallbackBrief.push(`Priorities: ${conversationFamilyProfile.priorities.join(', ')}`);
    if (conversationFamilyProfile.interests?.length) fallbackBrief.push(`Interests: ${conversationFamilyProfile.interests.join(', ')}`);
    if (conversationFamilyProfile.learning_needs?.length) fallbackBrief.push(`Learning needs: ${conversationFamilyProfile.learning_needs.join(', ')}`);
    if (context.extractedEntities?.genderPreference) fallbackBrief.push(`Gender preference: ${context.extractedEntities.genderPreference}`);
    if (context.extractedEntities?.boardingPreference) fallbackBrief.push('Boarding: Yes');
    if (context.extractedEntities?.religiousPreference) fallbackBrief.push(`Religious preference: ${context.extractedEntities.religiousPreference}`);
    
    const briefContent = fallbackBrief.length > 0 ? fallbackBrief.map(b => `• ${b}`).join('\n') : 'I captured your preferences but could not format them.';
    briefMessage = `Here's what I've captured so far:\n\n${briefContent}\n\nDoes that look right? Feel free to adjust anything.`;
  }

  if (currentState === STATES.DISCOVERY && currentSchools?.length > 0) {
    currentSchools.forEach(school => {
      const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<!\\[)\\b${escapedName}\\b(?!\\])`, 'gi');
      briefMessage = briefMessage.replace(regex, '');
    });
  }

  if (updatedBriefStatus === BRIEF_STATUS.GENERATING) {
    updatedBriefStatus = BRIEF_STATUS.PENDING_REVIEW;
    context.briefStatus = updatedBriefStatus;
    console.log('[BRIEF GENERATED] Set briefStatus to pending_review');
  }

  return Response.json({
    message: briefMessage,
    state: STATES.BRIEF,
    briefStatus: updatedBriefStatus,
    familyProfile: conversationFamilyProfile,
    conversationContext: context,
    schools: []
  });
}

// INLINED: handleResults
async function handleResults(params) {
  const { base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, selectedSchoolId, userLocation, region, conversationId, userId } = params;

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

  const CITY_COORDS = {
    'vancouver': { lat: 49.2827, lng: -123.1207 },
    'toronto': { lat: 43.6532, lng: -79.3832 },
    'montreal': { lat: 45.5017, lng: -73.5673 },
    'ottawa': { lat: 45.4215, lng: -75.6972 },
    'calgary': { lat: 51.0447, lng: -114.0719 },
    'edmonton': { lat: 53.5461, lng: -113.4938 },
    'victoria': { lat: 48.4284, lng: -123.3656 },
    'winnipeg': { lat: 49.8951, lng: -97.1384 },
    'halifax': { lat: 44.6488, lng: -63.5752 },
    'new york': { lat: 40.7128, lng: -74.0060 },
    'los angeles': { lat: 34.0522, lng: -118.2437 },
    'chicago': { lat: 41.8781, lng: -87.6298 },
    'boston': { lat: 42.3601, lng: -71.0589 },
    'san francisco': { lat: 37.7749, lng: -122.4194 },
    'london': { lat: 51.5074, lng: -0.1278 },
    'mississauga': { lat: 43.5890, lng: -79.6441 },
    'hamilton': { lat: 43.2557, lng: -79.8711 },
    'kingston': { lat: 44.2312, lng: -76.4860 },
    'kelowna': { lat: 49.8880, lng: -119.4960 },
    'surrey': { lat: 49.1913, lng: -122.8490 },
    'burnaby': { lat: 49.2488, lng: -122.9805 },
    'oakville': { lat: 43.4675, lng: -79.6877 },
    'richmond hill': { lat: 43.8828, lng: -79.4403 },
    'markham': { lat: 43.8561, lng: -79.3370 },
    'north vancouver': { lat: 49.3200, lng: -123.0724 },
    'west vancouver': { lat: 49.3272, lng: -123.1601 }
  };

  if (selectedSchoolId) {
    console.log('[RESULTS GUARD] selectedSchoolId present, this should not happen — resolveTransition R2 should route to DEEP_DIVE');
    return Response.json({
      message: "Let me pull up that school's details for you.",
      state: 'DEEP_DIVE',
      briefStatus: briefStatus,
      schools: [],
      familyProfile: conversationFamilyProfile,
      conversationContext: { ...context, state: 'DEEP_DIVE' }
    });
  }

  console.log('[SEARCH] Running fresh school search in RESULTS state');
  console.log('[KI-12 DIAG] LocationArea BEFORE fallbacks:', conversationFamilyProfile?.locationArea);
  
  if (!conversationFamilyProfile?.locationArea && context.extractedEntities?.locationArea) {
    conversationFamilyProfile.locationArea = context.extractedEntities.locationArea;
    console.log('[KI-12 FALLBACK 1] Recovered from extractedEntities:', context.extractedEntities.locationArea);
  }
  if (!conversationFamilyProfile?.locationArea && context.extractedEntities?.city) {
    conversationFamilyProfile.locationArea = context.extractedEntities.city;
    console.log('[KI-12 FALLBACK 1] Recovered from city:', context.extractedEntities.city);
  }
  
  if (!conversationFamilyProfile?.locationArea && conversationFamilyProfile?.id) {
    console.log('[KI-12 FALLBACK 2] Attempting fresh DB read...');
    try {
      const freshProfiles = await base44.entities.FamilyProfile.filter({userId, conversationId});
      if (freshProfiles.length > 0 && freshProfiles[0].locationArea) {
        conversationFamilyProfile.locationArea = freshProfiles[0].locationArea;
        console.log('[KI-12 FALLBACK 2] Recovered from fresh DB:', conversationFamilyProfile.locationArea);
      }
    } catch (e) {
      console.error('[KI-12 FALLBACK 2] DB read failed:', e);
    }
  }
  
  if (!conversationFamilyProfile?.locationArea && conversationHistory) {
    console.log('[KI-12 FALLBACK 3] Parsing Brief text from history...');
    const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Location:/i.test(m.content));
    if (briefMsg) {
      const locMatch = briefMsg.content.match(/•\s*Location:\s*([^\n•]+)/i);
      if (locMatch && locMatch[1]) {
        const extractedLoc = locMatch[1].trim();
        if (!/not specified/i.test(extractedLoc)) {
          conversationFamilyProfile.locationArea = extractedLoc;
          console.log('[KI-12 FALLBACK 3] Recovered from Brief text:', conversationFamilyProfile.locationArea);
        }
      }
    }
  }
  
  let parsedGrade = null;
  const rawGrade = conversationFamilyProfile?.childGrade;
  if (rawGrade !== null && rawGrade !== undefined) {
    if (typeof rawGrade === 'number') { parsedGrade = rawGrade; }
    else if (typeof rawGrade === 'string') {
      const cleaned = rawGrade.toString().toLowerCase().trim();
      if (cleaned === 'jk' || cleaned === 'junior kindergarten') { parsedGrade = -1; }
      else if (cleaned === 'k' || cleaned === 'kindergarten') { parsedGrade = 0; }
      else if (cleaned === 'sk' || cleaned === 'senior kindergarten') { parsedGrade = 0; }
      else if (cleaned.startsWith('grade ')) { parsedGrade = parseInt(cleaned.replace('grade ', '')); }
      else if (cleaned.startsWith('gr')) { parsedGrade = parseInt(cleaned.replace(/^gr\.?\s*/, '')); }
      else { parsedGrade = parseInt(cleaned); }
      if (isNaN(parsedGrade)) { parsedGrade = null; }
    }
  }
  console.log('[GRADE FALLBACK 1] conversationFamilyProfile.childGrade:', rawGrade, '→ parsedGrade:', parsedGrade);
  
  if (parsedGrade === null && context.extractedEntities?.childGrade !== null && context.extractedEntities?.childGrade !== undefined) {
    const extracted = context.extractedEntities.childGrade;
    parsedGrade = typeof extracted === 'number' ? extracted : parseInt(extracted);
    if (isNaN(parsedGrade)) { parsedGrade = null; }
    console.log('[GRADE FALLBACK 2] context.extractedEntities.childGrade:', extracted, '→ parsedGrade:', parsedGrade);
  }
  
  if (parsedGrade === null && conversationHistory) {
    const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Student:/i.test(m.content));
    if (briefMsg) {
      const gradeMatch = briefMsg.content.match(/•\s*Student:.*?\b(?:Grade\s+(\d+)|JK|SK|Kindergarten|K)\b/i);
      if (gradeMatch) {
        if (/JK/i.test(gradeMatch[0])) { parsedGrade = -1; }
        else if (/SK|Kindergarten|(?<!\d)K(?!\w)/i.test(gradeMatch[0])) { parsedGrade = 0; }
        else if (gradeMatch[1]) { parsedGrade = parseInt(gradeMatch[1]); }
        console.log('[GRADE FALLBACK 3] Parsed from Brief text:', gradeMatch[0], '→ parsedGrade:', parsedGrade);
      }
    }
  }
  
  if (parsedGrade === null && context.conversationContext?.familyProfile?.childGrade !== null && context.conversationContext?.familyProfile?.childGrade !== undefined) {
    parsedGrade = parseInt(context.conversationContext.familyProfile.childGrade);
    if (isNaN(parsedGrade)) { parsedGrade = null; }
    console.log('[GRADE FALLBACK 4] context.conversationContext.familyProfile.childGrade:', context.conversationContext.familyProfile.childGrade, '→ parsedGrade:', parsedGrade);
  }
  
  console.log('[GRADE FINAL] parsedGrade:', parsedGrade);
  
  let parsedTuition = null;
  if (conversationFamilyProfile?.maxTuition) {
    parsedTuition = typeof conversationFamilyProfile.maxTuition === 'number' ? conversationFamilyProfile.maxTuition : parseInt(conversationFamilyProfile.maxTuition);
    if (isNaN(parsedTuition)) { parsedTuition = null; }
    console.log('[BUDGET FALLBACK 1] conversationFamilyProfile.maxTuition:', conversationFamilyProfile.maxTuition, '→ parsedTuition:', parsedTuition);
  }
  
  if (parsedTuition === null && context.extractedEntities?.budgetSingle) {
    parsedTuition = parseInt(context.extractedEntities.budgetSingle);
    if (isNaN(parsedTuition)) { parsedTuition = null; }
    console.log('[BUDGET FALLBACK 2] context.extractedEntities.budgetSingle:', context.extractedEntities.budgetSingle, '→ parsedTuition:', parsedTuition);
  }
  
  if (parsedTuition === null && context.extractedEntities?.budgetMax) {
    parsedTuition = parseInt(context.extractedEntities.budgetMax);
    if (isNaN(parsedTuition)) { parsedTuition = null; }
    console.log('[BUDGET FALLBACK 3] context.extractedEntities.budgetMax:', context.extractedEntities.budgetMax, '→ parsedTuition:', parsedTuition);
  }
  
  if (parsedTuition === null && conversationHistory) {
    const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Budget:/i.test(m.content));
    if (briefMsg) {
      const budgetMatch = briefMsg.content.match(/•\s*Budget:.*?\$?([\d,]+)(?:,000|K)?/i);
      if (budgetMatch) {
        let extracted = budgetMatch[1].replace(/,/g, '');
        if (/K$/i.test(budgetMatch[0])) {
          extracted = parseInt(extracted) * 1000;
        } else if (!/,000/.test(budgetMatch[0]) && extracted.length <= 2) {
          extracted = parseInt(extracted) * 1000;
        } else {
          extracted = parseInt(extracted);
        }
        parsedTuition = extracted;
        console.log('[BUDGET FALLBACK 4] Parsed from Brief text:', budgetMatch[0], '→ parsedTuition:', parsedTuition);
      }
    }
  }
  
  console.log('[BUDGET FINAL] parsedTuition:', parsedTuition);
  
  let parsedDealbreakers = null;
  if (conversationFamilyProfile?.dealbreakers && Array.isArray(conversationFamilyProfile.dealbreakers) && conversationFamilyProfile.dealbreakers.length > 0) {
    parsedDealbreakers = conversationFamilyProfile.dealbreakers;
    console.log('[DEALBREAKER FALLBACK 1] conversationFamilyProfile.dealbreakers:', parsedDealbreakers);
  }
  
  if ((!parsedDealbreakers || parsedDealbreakers.length === 0) && context.extractedEntities?.dealbreakers && Array.isArray(context.extractedEntities.dealbreakers) && context.extractedEntities.dealbreakers.length > 0) {
    parsedDealbreakers = context.extractedEntities.dealbreakers;
    console.log('[DEALBREAKER FALLBACK 2] context.extractedEntities.dealbreakers:', parsedDealbreakers);
  }
  
  if ((!parsedDealbreakers || parsedDealbreakers.length === 0) && conversationHistory) {
    const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Dealbreakers:/i.test(m.content));
    if (briefMsg) {
      const dbMatch = briefMsg.content.match(/•\s*Dealbreakers:\s*([^\n•]+)/i);
      if (dbMatch && dbMatch[1]) {
        const extractedDb = dbMatch[1].trim();
        if (!/not specified|none/i.test(extractedDb)) {
          parsedDealbreakers = extractedDb.split(',').map(s => s.trim()).filter(Boolean);
          console.log('[DEALBREAKER FALLBACK 3] Parsed from Brief text:', parsedDealbreakers);
        }
      }
    }
  }
  
  if ((!parsedDealbreakers || parsedDealbreakers.length === 0) && context.conversationContext?.familyProfile?.dealbreakers && Array.isArray(context.conversationContext.familyProfile.dealbreakers) && context.conversationContext.familyProfile.dealbreakers.length > 0) {
    parsedDealbreakers = context.conversationContext.familyProfile.dealbreakers;
    console.log('[DEALBREAKER FALLBACK 4] context.conversationContext.familyProfile.dealbreakers:', parsedDealbreakers);
  }
  
  console.log('[DEALBREAKER FINAL] parsedDealbreakers:', parsedDealbreakers);
  
  const searchParams = {
    limit: 50,
    familyProfile: conversationFamilyProfile,
    dealbreakers: parsedDealbreakers
  };

  if (conversationFamilyProfile?.locationArea) {
    const locationParts = conversationFamilyProfile.locationArea.split(',').map(s => s.trim());
    if (locationParts.length >= 2) {
      searchParams.city = locationParts[0];
      searchParams.provinceState = locationParts[1];
    } else if (locationParts.length === 1) {
      searchParams.city = locationParts[0];
    }
  }
  
  if (conversationFamilyProfile?.provinceState) {
    searchParams.provinceState = conversationFamilyProfile.provinceState;
  }
  
  if (region && !conversationFamilyProfile?.locationArea) {
    searchParams.region = region;
    console.log('[KI-12] Using auto-detected region as fallback:', region);
  } else if (conversationFamilyProfile?.locationArea) {
    console.log('[KI-12] Prioritizing explicit location:', conversationFamilyProfile.locationArea, 'over auto-detected region:', region);
  }
  
  if (parsedGrade !== null) {
    searchParams.minGrade = parsedGrade;
    searchParams.maxGrade = parsedGrade;
    console.log('[GRADE FILTER] Passing minGrade/maxGrade:', parsedGrade);
  }
  
  if (parsedTuition && parsedTuition !== 'unlimited') {
    searchParams.maxTuition = parsedTuition;
    console.log('[BUDGET FILTER] Passing maxTuition:', parsedTuition);
  }
  if (conversationFamilyProfile?.curriculumPreference?.length > 0) {
    searchParams.curriculumType = conversationFamilyProfile.curriculumPreference[0];
  }
  if (conversationFamilyProfile?.priorities?.length > 0) {
    const priorityToSpec = { 'Arts': 'Arts', 'STEM': 'STEM', 'Sports': 'Sports', 'Languages': 'Languages', 'Leadership': 'Leadership', 'Environmental': 'Environmental' };
    const mappedSpecs = conversationFamilyProfile.priorities.map(p => priorityToSpec[p]).filter(Boolean);
    if (mappedSpecs.length > 0) {
      searchParams.specializations = mappedSpecs;
    }
  }
  
  console.log('[KI-12 DIAG] LocationArea AFTER fallbacks:', conversationFamilyProfile?.locationArea);
  
  const statedLocation = conversationFamilyProfile?.locationArea?.toLowerCase()?.trim();
  console.log('[KI-12 DIAG] StatedLocation for CITY_COORDS lookup:', statedLocation);
  console.log('[KI-12 DIAG] CITY_COORDS lookup result:', statedLocation ? CITY_COORDS[statedLocation] : 'N/A');
  
  if (statedLocation && CITY_COORDS[statedLocation]) {
    searchParams.userLat = CITY_COORDS[statedLocation].lat;
    searchParams.userLng = CITY_COORDS[statedLocation].lng;
    console.log('[KI-12 GEOCODE] Using geocoded coords for stated location:', statedLocation);
  }
  
  if (!searchParams.userLat && !searchParams.userLng && userLocation?.lat && userLocation?.lng) {
    searchParams.userLat = userLocation.lat;
    searchParams.userLng = userLocation.lng;
    console.log('[KI-12 GEOCODE] Using browser coords as fallback');
  }
  
  console.log('[KI-12 DIAG] Final searchParams.userLat:', searchParams.userLat);
  console.log('[KI-12 DIAG] Final searchParams.userLng:', searchParams.userLng);
  console.log('[KI-12 LOCATION FILTER]', {
    locationArea: conversationFamilyProfile?.locationArea,
    city: searchParams.city,
    provinceState: searchParams.provinceState,
    region: searchParams.region
  });

  console.log('[SEARCH] Final searchParams:', { minGrade: searchParams.minGrade, maxGrade: searchParams.maxGrade, maxTuition: searchParams.maxTuition, city: searchParams.city, dealbreakers: searchParams.dealbreakers });
  
  console.log('=== ORCHESTRATE -> SEARCHSCHOOLS CALL ===', JSON.stringify({
    dealbreakersBeingPassed: searchParams?.dealbreakers,
    familyProfileDealbreakers: searchParams?.familyProfile?.dealbreakers,
    familyProfileKeys: Object.keys(searchParams?.familyProfile || {})
  }));
  
  let schools = [];
  try {
    const searchResult = await base44.asServiceRole.functions.invoke('searchSchools', {
      ...searchParams,
      conversationId: conversationId,
      userId: userId,
      searchQuery: message
    });
    schools = searchResult.data.schools || [];
    console.log('[SEARCH] Returned', schools.length, 'schools. First 3:', schools.slice(0, 3).map(s => `${s.name} (${s.lowestGrade}-${s.highestGrade})`));
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
  
  let updatedCurrentState = STATES.RESULTS;
  context.state = updatedCurrentState;
  
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
          return `${s.name} | ${s.city} | Grade ${s.lowestGrade}-${s.highestGrade} | ${s.curriculumType||'Trad'} | Tuition: ${tuitionStr}`;
        }).join('\n');
      
      const resultsSystemPrompt = consultantName === 'Jackie'
        ? `[STATE: RESULTS] Explain these school matches. Focus on fit. Do NOT ask intake questions. Max 150 words.

      NEVER USE THESE PHRASES (HARD BAN): "That's wonderful", "How exciting", "It sounds like you're looking for", "I understand you're eager", "I'd love to help you explore", "That's great", "I appreciate you sharing". If you catch yourself starting with any of these, DELETE IT and start over.

      YOU ARE JACKIE - Senior education consultant, 10+ years placing families in private schools. You're warm but efficient - you respect the parent's time. You have real opinions and share them. You sound like a knowledgeable friend, not a customer service bot.

      VOICE RULES: Use contractions. Short sentences. Focus on fit and strategy. Lead with insight, not reflection. Name real schools when relevant. Never parrot the user's words back. Never use performative enthusiasm.`
        : `[STATE: RESULTS] Explain these school matches. Focus on fit. Do NOT ask intake questions. Max 150 words.

      NEVER USE THESE PHRASES (HARD BAN): "That's wonderful", "How exciting", "It sounds like you're looking for", "I understand you're eager", "I'd love to help you explore", "That's great", "I appreciate you sharing". If you catch yourself starting with any of these, DELETE IT and start over.

      YOU ARE LIAM - Senior education strategist, 10+ years in private school placement. You're direct and data-driven - you cut to what matters. You give straight answers and move fast. You sound like a sharp advisor, not a chatbot.

      VOICE RULES: Use contractions. Short sentences. Lead with data or strategy, not feelings. Name real schools when relevant. Never parrot the user's words back. Never use filler phrases.`;

      const resultsUserPrompt = `Recent chat:
      ${conversationSummary}
      ${schoolContext}

      Parent: "${message}"

      Respond as ${consultantName}. ONE question max.`;

      let messageWithLinks = 'Here are the schools I found:';
      try {
        const aiResponse = await callOpenRouter({
          systemPrompt: resultsSystemPrompt,
          userPrompt: resultsUserPrompt,
          maxTokens: 800,
          temperature: 0.7
        });
        messageWithLinks = aiResponse || 'Here are the schools I found:';
        console.log('[OPENROUTER] RESULTS response');
      } catch (openrouterError) {
        console.error('[RESULTS ERROR] OpenRouter failed:', openrouterError.message);
        messageWithLinks = 'Here are the schools I found:';
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
  
  return Response.json({
    message: aiMessage,
    state: updatedCurrentState,
    briefStatus: BRIEF_STATUS.CONFIRMED,
    schools: matchingSchools,
    familyProfile: conversationFamilyProfile,
    conversationContext: context
  });
}

// INLINED: handleDeepDive
async function handleDeepDive(params) {
  const { base44, selectedSchoolId, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId } = params;
  
  console.log('DEEPDIVE_START', selectedSchoolId);
  console.log('[DEEPDIVE] Handler entered. selectedSchoolId:', selectedSchoolId, 'currentState:', currentState);
  let aiMessage = '';
  let selectedSchool = null;
  
  try {
    if (selectedSchoolId) {
      try {
        console.log('[DEEPDIVE] Fetching school with ID:', selectedSchoolId);
        const schoolResults = await base44.entities.School.filter({ id: selectedSchoolId });
        console.log('[DEEPDIVE] School fetch results:', schoolResults.length);
        if (schoolResults.length > 0) {
          selectedSchool = schoolResults[0];
          console.log('[DEEPDIVE] Loaded school:', selectedSchool.name);
        } else {
          console.error('[DEEPDIVE ERROR] School not found for ID:', selectedSchoolId);
        }
      } catch (e) {
        console.error('[DEEPDIVE ERROR] Failed to load selected school:', e.message, e.stack);
      }
    } else {
      console.error('[DEEPDIVE ERROR] No selectedSchoolId provided');
    }
    
    if (!selectedSchool) {
      console.error('[BUG-DD-002] No school loaded, cannot generate Deep Dive');
      return Response.json({
        message: "I couldn't load that school's details. Please try selecting it again.",
        state: currentState,
        briefStatus: briefStatus,
        schools: currentSchools || [],
        familyProfile: conversationFamilyProfile,
        conversationContext: context
      });
    }
    
    let childDisplayName = 'your child';
    if (conversationFamilyProfile?.childName) {
      childDisplayName = conversationFamilyProfile.childName;
    } else if (context.extractedEntities?.childName) {
      childDisplayName = context.extractedEntities.childName;
    } else {
      const childGender = conversationFamilyProfile?.childGender || context.extractedEntities?.childGender;
      if (childGender === 'male') {
        childDisplayName = 'your son';
      } else if (childGender === 'female') {
        childDisplayName = 'your daughter';
      }
    }
    
    let resolvedMaxTuition = null;
    if (conversationFamilyProfile?.maxTuition) {
      resolvedMaxTuition = typeof conversationFamilyProfile.maxTuition === 'number' ? conversationFamilyProfile.maxTuition : parseInt(conversationFamilyProfile.maxTuition);
      if (isNaN(resolvedMaxTuition)) { resolvedMaxTuition = null; }
      console.log('[DEEPDIVE BUDGET FALLBACK 1] conversationFamilyProfile.maxTuition:', conversationFamilyProfile.maxTuition, '→ resolvedMaxTuition:', resolvedMaxTuition);
    }
    
    if (resolvedMaxTuition === null && context.extractedEntities?.budgetSingle) {
      resolvedMaxTuition = parseInt(context.extractedEntities.budgetSingle);
      if (isNaN(resolvedMaxTuition)) { resolvedMaxTuition = null; }
      console.log('[DEEPDIVE BUDGET FALLBACK 2] context.extractedEntities.budgetSingle:', context.extractedEntities.budgetSingle, '→ resolvedMaxTuition:', resolvedMaxTuition);
    }
    
    if (resolvedMaxTuition === null && context.extractedEntities?.budgetMax) {
      resolvedMaxTuition = parseInt(context.extractedEntities.budgetMax);
      if (isNaN(resolvedMaxTuition)) { resolvedMaxTuition = null; }
      console.log('[DEEPDIVE BUDGET FALLBACK 3] context.extractedEntities.budgetMax:', context.extractedEntities.budgetMax, '→ resolvedMaxTuition:', resolvedMaxTuition);
    }
    
    if (resolvedMaxTuition === null && conversationHistory) {
      const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Budget:/i.test(m.content));
      if (briefMsg) {
        const budgetMatch = briefMsg.content.match(/•\s*Budget:.*?\$?([\d,]+)(?:,000|K)?/i);
        if (budgetMatch) {
          let extracted = budgetMatch[1].replace(/,/g, '');
          if (/K$/i.test(budgetMatch[0])) {
            extracted = parseInt(extracted) * 1000;
          } else if (!/,000/.test(budgetMatch[0]) && extracted.length <= 2) {
            extracted = parseInt(extracted) * 1000;
          } else {
            extracted = parseInt(extracted);
          }
          resolvedMaxTuition = extracted;
          console.log('[DEEPDIVE BUDGET FALLBACK 4] Parsed from Brief text:', budgetMatch[0], '→ resolvedMaxTuition:', resolvedMaxTuition);
        }
      }
    }
    
    if (resolvedMaxTuition === null && context.conversationContext?.familyProfile?.maxTuition) {
      resolvedMaxTuition = parseInt(context.conversationContext.familyProfile.maxTuition);
      if (isNaN(resolvedMaxTuition)) { resolvedMaxTuition = null; }
      console.log('[DEEPDIVE BUDGET FALLBACK 5] context.conversationContext.familyProfile.maxTuition:', context.conversationContext.familyProfile.maxTuition, '→ resolvedMaxTuition:', resolvedMaxTuition);
    }
    
    console.log('[DEEPDIVE BUDGET FINAL] resolvedMaxTuition:', resolvedMaxTuition);
    
    let resolvedPriorities = null;
    if (conversationFamilyProfile?.priorities && Array.isArray(conversationFamilyProfile.priorities) && conversationFamilyProfile.priorities.length > 0) {
      resolvedPriorities = conversationFamilyProfile.priorities;
      console.log('[DEEPDIVE PRIORITIES FALLBACK 1] conversationFamilyProfile.priorities:', resolvedPriorities);
    }
    
    if ((!resolvedPriorities || resolvedPriorities.length === 0) && context.extractedEntities?.priorities && Array.isArray(context.extractedEntities.priorities) && context.extractedEntities.priorities.length > 0) {
      resolvedPriorities = context.extractedEntities.priorities;
      console.log('[DEEPDIVE PRIORITIES FALLBACK 2] context.extractedEntities.priorities:', resolvedPriorities);
    }
    
    if ((!resolvedPriorities || resolvedPriorities.length === 0) && conversationHistory) {
      const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*(?:Top )?priorities:/i.test(m.content));
      if (briefMsg) {
        const prioritiesMatch = briefMsg.content.match(/•\s*(?:Top )?priorities:\s*([^\n•]+)/i);
        if (prioritiesMatch && prioritiesMatch[1]) {
          const extractedPriorities = prioritiesMatch[1].trim();
          if (!/not specified|none/i.test(extractedPriorities)) {
            resolvedPriorities = extractedPriorities.split(',').map(s => s.trim()).filter(Boolean);
            console.log('[DEEPDIVE PRIORITIES FALLBACK 3] Parsed from Brief text:', resolvedPriorities);
          }
        }
      }
    }
    
    if ((!resolvedPriorities || resolvedPriorities.length === 0) && context.conversationContext?.familyProfile?.priorities && Array.isArray(context.conversationContext.familyProfile.priorities) && context.conversationContext.familyProfile.priorities.length > 0) {
      resolvedPriorities = context.conversationContext.familyProfile.priorities;
      console.log('[DEEPDIVE PRIORITIES FALLBACK 4] context.conversationContext.familyProfile.priorities:', resolvedPriorities);
    }
    
    console.log('[DEEPDIVE PRIORITIES FINAL] resolvedPriorities:', resolvedPriorities);
    
    let resolvedInterests = null;
    if (conversationFamilyProfile?.interests && Array.isArray(conversationFamilyProfile.interests) && conversationFamilyProfile.interests.length > 0) {
      resolvedInterests = conversationFamilyProfile.interests;
      console.log('[DEEPDIVE INTERESTS FALLBACK 1] conversationFamilyProfile.interests:', resolvedInterests);
    }
    
    if ((!resolvedInterests || resolvedInterests.length === 0) && context.extractedEntities?.interests && Array.isArray(context.extractedEntities.interests) && context.extractedEntities.interests.length > 0) {
      resolvedInterests = context.extractedEntities.interests;
      console.log('[DEEPDIVE INTERESTS FALLBACK 2] context.extractedEntities.interests:', resolvedInterests);
    }
    
    if ((!resolvedInterests || resolvedInterests.length === 0) && conversationHistory) {
      const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Interests:/i.test(m.content));
      if (briefMsg) {
        const interestsMatch = briefMsg.content.match(/•\s*Interests:\s*([^\n•]+)/i);
        if (interestsMatch && interestsMatch[1]) {
          const extractedInterests = interestsMatch[1].trim();
          if (!/not specified|none/i.test(extractedInterests)) {
            resolvedInterests = extractedInterests.split(',').map(s => s.trim()).filter(Boolean);
            console.log('[DEEPDIVE INTERESTS FALLBACK 3] Parsed from Brief text:', resolvedInterests);
          }
        }
      }
    }
    
    if ((!resolvedInterests || resolvedInterests.length === 0) && context.conversationContext?.familyProfile?.interests && Array.isArray(context.conversationContext.familyProfile.interests) && context.conversationContext.familyProfile.interests.length > 0) {
      resolvedInterests = context.conversationContext.familyProfile.interests;
      console.log('[DEEPDIVE INTERESTS FALLBACK 4] context.conversationContext.familyProfile.interests:', resolvedInterests);
    }
    
    console.log('[DEEPDIVE INTERESTS FINAL] resolvedInterests:', resolvedInterests);
    
    const compressedSchoolData = {
      name: selectedSchool.name,
      gradesOffered: `${selectedSchool.lowestGrade}-${selectedSchool.highestGrade}`,
      tuitionFee: selectedSchool.tuition || selectedSchool.dayTuition || 'Not specified',
      programTags: [
        ...(selectedSchool.curriculum || []),
        ...(selectedSchool.specializations || []),
        selectedSchool.curriculumType
      ].filter(Boolean),
      location: `${selectedSchool.city}, ${selectedSchool.provinceState || selectedSchool.country}`,
      genderPolicy: selectedSchool.genderPolicy || 'Co-ed',
      religiousAffiliation: selectedSchool.religiousAffiliation || 'Non-denominational',
      description: selectedSchool.description ? selectedSchool.description.substring(0, 150) : 'No description available'
    };
    
    const systemPrompt = `You are ${consultantName}, an education consultant helping Canadian families find the right private school.

${consultantName === 'Jackie' 
  ? "JACKIE PERSONA: Warm, empathetic, supportive. Uses phrases like 'I love that...', 'What a great fit...'. Speaks like a knowledgeable friend." 
  : "LIAM PERSONA: Direct, strategic, no-BS. Leads with data and fit logic. Speaks like a trusted advisor."}

OUTPUT FORMAT - DEEPDIVE Card with 6 areas:
1. Fit Label - 2-4 word label using FIRST NAME ONLY from childDisplayName (e.g., 'Strong Fit for Emma' not 'Strong Fit for Emma Johnson'). If childDisplayName is null/undefined/empty, use 'your child' instead (e.g., 'Strong Fit for your child').
2. Why This School - In the Why section, you MUST name each of the family's stated priorities and evaluate whether this school meets, partially meets, or does not meet each one. If the school's listed programs do not include a family priority, say so directly. Example: 'Sophia wants IB and arts/theatre. Lakeside offers full IB diploma, but arts and theatre are not listed as program specializations - ask whether they offer these as IB electives.' Never assume a school offers something that isn't in the provided data.
3. What to Know - 2-3 honest bullets including one genuine limitation or thing to ask about. CRITICAL: If the school's genderPolicy is null, undefined, or empty string, do NOT include any bullet about gender policy. Simply omit it entirely. Never show "Gender policy: Not specified" or similar text.
4. Cost Reality - Compare school tuition to family budget. If BOTH school tuition AND family maxTuition are known numbers: calculate the difference and format as "Tuition: $XX,XXX/yr - within your $YYK budget" or "Tuition: $XX,XXX/yr - $XK over your $YYK budget" or "Tuition: $XX,XXX/yr - right at your $YYK budget". If family budget (maxTuition) is NOT known: simply show "Tuition: $XX,XXX/yr" with no comparison. Never use the word "stated" when referring to budget.
5. Dealbreaker Check - explicitly confirm no dealbreakers are violated (especially religious, grade)
6. Tone Bridge - one sentence inviting the parent to explore more or ask questions

HONESTY PATTERN: Always include at least one genuine tradeoff or limitation. Never write marketing copy. If data is missing, say so.

DEALBREAKER ELEVATION: If the family has dealbreakers (religious, grade, budget), explicitly state that this school does NOT violate them.

PERSONA TONE BRIDGE EXAMPLES:
${consultantName === 'Jackie'
  ? "- Jackie: 'I'd love to tell you more about their [strongest fit area] — want me to dig in?'"
  : "- Liam: 'The [strongest fit area] stands out here. Want the details?'"}

EXACT FORMAT TO USE:
**[Fit Label]**

**Why ${compressedSchoolData.name} for ${childDisplayName}**
[2-3 sentences]

**What to Know**
• [Positive point]
• [Honest limitation or unknown]
• [Another consideration]

**Cost Reality**
[Dollar comparison with actual math]

**Dealbreaker Check**
[Explicitly confirm no violations]

[Tone bridge question]`;

    const userPrompt = `FAMILY BRIEF:
- Child: ${childDisplayName}
- Grade: ${conversationFamilyProfile?.childGrade !== null && conversationFamilyProfile?.childGrade !== undefined ? conversationFamilyProfile.childGrade : 'Not specified'}
- Location: ${conversationFamilyProfile?.locationArea || 'Not specified'}
- Budget: ${resolvedMaxTuition ? '$' + resolvedMaxTuition : 'Not specified'}
- Interests: ${resolvedInterests?.join(', ') || 'Not specified'}
- Priorities: ${resolvedPriorities?.join(', ') || 'Not specified'}
- Dealbreakers: ${conversationFamilyProfile?.dealbreakers?.join(', ') || 'None specified'}

SCHOOL DATA:
${JSON.stringify(compressedSchoolData, null, 2)}

Generate the 6-area DEEPDIVE card for this family-school match.`;

    console.log('[DEEPDIVE] Attempting AI-generated card');
    let aiGeneratedCard = null;

    try {
      const aiResponse = await callOpenRouter({
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
        maxTokens: 2000,
        temperature: 0.6
      });
      aiGeneratedCard = aiResponse || null;

      if (aiGeneratedCard) {
        console.log('[OPENROUTER] DEEPDIVE card generation');
        console.log('[DEEPDIVE] AI card generated successfully, length:', aiGeneratedCard.length);
        aiMessage = aiGeneratedCard;
      }
    } catch (llmError) {
      console.log('[OPENROUTER FALLBACK] DEEPDIVE falling back to programmatic card');
      console.error('[DEEPDIVE] OpenRouter failed:', llmError.message);
      aiGeneratedCard = null;
    }
    
    if (!aiGeneratedCard) {
      console.log('[DEEPDIVE] Building programmatic fallback card');
    
      const determineFitLabel = (school, brief) => {
        const dealbreakers = brief?.dealbreakers || [];
        const priorities = brief?.priorities || [];
        
        let hasMissingDealbreaker = false;
        for (const db of dealbreakers) {
          const dbLower = db.toLowerCase();
          if (dbLower.includes('single-sex') && !school.genderPolicy) hasMissingDealbreaker = true;
          if (dbLower.includes('religious') && !school.religiousAffiliation) hasMissingDealbreaker = true;
          if (dbLower.includes('boarding') && school.boardingAvailable === null) hasMissingDealbreaker = true;
        }
        
        if (hasMissingDealbreaker) return 'Worth a Closer Look';
        
        let priorityMatches = 0;
        for (const priority of priorities) {
          const pLower = priority.toLowerCase();
          if (pLower.includes('arts') && school.artsPrograms?.length > 0) priorityMatches++;
          if (pLower.includes('stem') && school.specializations?.includes('STEM')) priorityMatches++;
          if (pLower.includes('sports') && school.sportsPrograms?.length > 0) priorityMatches++;
          if (pLower.includes('language') && school.languages?.length > 1) priorityMatches++;
        }
        
        const priorityMatchRate = priorities.length > 0 ? priorityMatches / priorities.length : 0.5;
        
        if (priorityMatchRate >= 0.7) return `Great Fit for ${childDisplayName}`;
        if (priorityMatchRate >= 0.4) return `Solid Option for ${childDisplayName}`;
        return 'Worth a Closer Look';
      };
      
      const fitLabel = determineFitLabel(selectedSchool, conversationFamilyProfile);
      
      const schoolTuition = selectedSchool.tuition || selectedSchool.dayTuition;
      const familyBudget = conversationFamilyProfile?.maxTuition || conversationFamilyProfile?.budgetMax || context.extractedEntities?.maxTuition || context.extractedEntities?.budgetSingle;
      let costRealityText = '';
      
      if (schoolTuition && familyBudget && familyBudget !== 'unlimited') {
        const tuitionNum = typeof schoolTuition === 'number' ? schoolTuition : parseFloat(schoolTuition);
        const budgetNum = typeof familyBudget === 'number' ? familyBudget : parseFloat(familyBudget);
        
        if (tuitionNum <= budgetNum) {
          const difference = budgetNum - tuitionNum;
          costRealityText = `$${tuitionNum.toLocaleString()}/year — Under your $${budgetNum.toLocaleString()} budget by $${difference.toLocaleString()}`;
        } else {
          const difference = tuitionNum - budgetNum;
          costRealityText = `$${tuitionNum.toLocaleString()}/year — Above your $${budgetNum.toLocaleString()} budget by $${difference.toLocaleString()}`;
        }
      } else if (schoolTuition) {
        costRealityText = `$${(typeof schoolTuition === 'number' ? schoolTuition : parseFloat(schoolTuition)).toLocaleString()}/year`;
      } else {
        costRealityText = 'Tuition not specified';
      }
      
      const interests = conversationFamilyProfile?.interests || [];
      const priorities = conversationFamilyProfile?.priorities || [];
      let whySection = `**Why ${selectedSchool.name} for ${childDisplayName}**\n`;
      
      const matchReasons = [];
      if (priorities.includes('Arts') && selectedSchool.artsPrograms?.length > 0) {
        matchReasons.push(`strong arts programs including ${selectedSchool.artsPrograms.slice(0, 2).join(' and ')}`);
      }
      if (priorities.includes('STEM') && selectedSchool.specializations?.includes('STEM')) {
        matchReasons.push('STEM specialization');
      }
      if (priorities.includes('Sports') && selectedSchool.sportsPrograms?.length > 0) {
        matchReasons.push(`athletics with ${selectedSchool.sportsPrograms.slice(0, 2).join(' and ')}`);
      }
      if (selectedSchool.avgClassSize && selectedSchool.avgClassSize <= 15) {
        matchReasons.push(`small class sizes (average ${selectedSchool.avgClassSize} students)`);
      }
      
      if (matchReasons.length > 0) {
        whySection += `${selectedSchool.name} stands out with ${matchReasons.join(', ')}. `;
      } else {
        whySection += `${selectedSchool.name} offers a ${selectedSchool.curriculumType || 'traditional'} curriculum. `;
      }
      
      if (selectedSchool.description) {
        whySection += selectedSchool.description.substring(0, 150) + '...';
      }
      whySection += '\n\n';
      
      let whatToKnowSection = '**What to Know**\n';
      const bullets = [];
      
      if (selectedSchool.enrollment) {
        bullets.push(`• Community of ${selectedSchool.enrollment} students across grades ${selectedSchool.lowestGrade}-${selectedSchool.highestGrade}`);
      }
      
      if (selectedSchool.curriculum?.length > 0) {
        bullets.push(`• Offers ${selectedSchool.curriculum.join(', ')} curriculum`);
      }
      
      if (selectedSchool.genderPolicy && selectedSchool.genderPolicy !== 'Co-ed' && !conversationFamilyProfile?.genderPreference) {
        bullets.push(`• This is a ${selectedSchool.genderPolicy} school`);
      }
      
      if (!selectedSchool.facilities || selectedSchool.facilities.length === 0) {
        bullets.push(`• Facility details not listed — worth asking on a visit`);
      }
      
      whatToKnowSection += bullets.join('\n') + '\n\n';
      
      const costSection = `**Cost Reality**\n${costRealityText}\n\n`;
      
      const bridge = consultantName === 'Jackie' 
        ? `What stands out to you about ${selectedSchool.name}?`
        : `Want me to dig into any specific aspect?`;
      
      aiMessage = `**${fitLabel}**\n\n${whySection}${whatToKnowSection}${costSection}${bridge}`;
      console.log('[DEEPDIVE] Programmatic fallback card built successfully');
    }
  } catch (e) {
    console.error('[DEEPDIVE ERROR] Card builder failed:', e.message, 'Stack:', e.stack);
    aiMessage = "I'm having trouble loading that school's details right now. Could you try selecting it again?";
  }
  
  console.log('[DEEPDIVE] Returning aiMessage length:', aiMessage?.length, 'starts with:', aiMessage?.substring(0, 50));
  console.log('[DEEPDIVE] selectedSchool:', selectedSchool?.name, 'state:', currentState);
  return Response.json({
    message: aiMessage,
    state: currentState,
    briefStatus: briefStatus,
    schools: selectedSchool ? [selectedSchool] : [],
    familyProfile: conversationFamilyProfile,
    conversationContext: context
  });
}

Deno.serve(async (req) => {