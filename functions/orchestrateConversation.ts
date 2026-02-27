import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
  const { currentState, intentSignal, profileData, turnCount, briefEditCount, selectedSchoolId, previousSchoolId, userMessage } = params;

  const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };

  const hasLocation = !!(profileData?.location);
  const hasGrade = profileData?.gradeLevel !== null && profileData?.gradeLevel !== undefined;
  const prioritiesCount = profileData?.priorities?.length || 0;
  
  let sufficiency = 'THIN';
  if (hasLocation && hasGrade) {
    sufficiency = prioritiesCount >= 2 ? 'RICH' : 'MINIMUM';
  }

  const flags = { SUGGEST_BRIEF: false, OFFER_BRIEF: false, FORCED_TRANSITION: false, USER_INTENT_OVERRIDE: false };
  let nextState = currentState;
  let briefStatus = null;
  let transitionReason = 'natural';

  console.log('[RESOLVE] Input:', { currentState, intentSignal, sufficiency, turnCount, briefEditCount, selectedSchoolId });
  console.log('[DEBUG-BRIEF] briefStatus:', params.briefStatus, 'userMessage:', userMessage);

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
  if ((intentSignal === 'request-brief' || intentSignal === 'request-results') && turnCount >= 3 && currentState === STATES.DISCOVERY) {
    if (sufficiency === 'MINIMUM' || sufficiency === 'RICH') {
      flags.USER_INTENT_OVERRIDE = true;
      return { nextState: STATES.BRIEF, sufficiency, flags, transitionReason: 'explicit_demand', briefStatus: 'generating' };
    }
  }
  if (turnCount >= 5 && currentState === STATES.DISCOVERY) {
    flags.FORCED_TRANSITION = true;
    return { nextState: STATES.BRIEF, sufficiency, flags, transitionReason: 'hard_cap', briefStatus: 'generating' };
  }
  if (turnCount >= 5 && currentState === STATES.DISCOVERY && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
    flags.SUGGEST_BRIEF = true;
    return { nextState: STATES.DISCOVERY, sufficiency, flags, transitionReason: 'soft_nudge' };
  }
  if (intentSignal === 'request-brief' && turnCount < 3 && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
    flags.USER_INTENT_OVERRIDE = true;
    return { nextState: STATES.BRIEF, sufficiency, flags, transitionReason: 'explicit_intent', briefStatus: 'generating' };
  }
  if (intentSignal === 'request-results' && turnCount < 3 && (sufficiency === 'MINIMUM' || sufficiency === 'RICH')) {
    flags.USER_INTENT_OVERRIDE = true;
    return { nextState: STATES.RESULTS, sufficiency, flags, transitionReason: 'explicit_intent' };
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

    const systemPrompt = `Extract ONLY factual data explicitly stated. Return JSON with NULL for anything not mentioned.

RESPONSE SCHEMA:
{ 
  entities: { childName, childGrade, locationArea, maxTuition, ... all extraction fields },
  intentSignal: 'continue' | 'request-brief' | 'request-results' | 'edit-criteria' | 'ask-about-school' | 'back-to-results' | 'restart' | 'off-topic' | 'confirm-brief',
  briefDelta: { 
    additions: [{ field, value, confidence }],
    updates: [{ field, old, new, confidence }],
    removals: []
  }
}

CRITICAL: Extract budget/tuition amounts if mentioned (e.g., "$25,000", "25k per year", "budget is unlimited"). Store as maxTuition (number or "unlimited")
Do NOT infer budget if user has not explicitly stated it.

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
              priorities: { type: 'array', items: { type: 'string' } },
              interests: { type: 'array', items: { type: 'string' } },
              dealbreakers: { type: 'array', items: { type: 'string' } },
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
        } else if (value !== '') {
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
async function handleDiscovery(base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentSchools, flags) {
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

  // T038: Tier 1 guided collection — check which core data points are missing
  const hasGrade = conversationFamilyProfile?.childGrade !== null && conversationFamilyProfile?.childGrade !== undefined;
  const hasLocation = !!conversationFamilyProfile?.locationArea;
  const hasBudget = !!conversationFamilyProfile?.maxTuition;
  const hasGender = !!conversationFamilyProfile?.gender;

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
    tier1Guidance = "TIER 1 PRIORITY: Budget has not been collected yet. If the conversation allows, naturally steer toward asking about their tuition budget or range.";
  }

  const personaInstructions = consultantName === 'Jackie'
    ? `[STATE: DISCOVERY] You are gathering family info to find the right school. Your primary goal is to collect Tier 1 data: child's grade/age, preferred location, and budget — in that priority order.
${tier1Guidance}
Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.
CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Do NOT interrupt emotional or contextual sharing — allow organic conversation flow. Keep gathering information.${briefOfferInstruction}
YOU ARE JACKIE - Senior education consultant, 10+ years placing families in private schools. You're warm but efficient.`
    : `[STATE: DISCOVERY] You are gathering family info to find the right school. Your primary goal is to collect Tier 1 data: child's grade/age, preferred location, and budget — in that priority order.
${tier1Guidance}
Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.
CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Do NOT interrupt emotional or contextual sharing — allow organic conversation flow. Keep gathering information.${briefOfferInstruction}
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
async function handleBrief(base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, briefStatus, flags) {
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
    const { childName, childGrade, locationArea, maxTuition, interests, priorities, dealbreakers } = conversationFamilyProfile;
    const interestsStr = interests?.length > 0 ? interests.join(', ') : '';
    const prioritiesStr = priorities?.length > 0 ? priorities.join(', ') : '';
    const dealbreakersStr = dealbreakers?.length > 0 ? dealbreakers.join(', ') : '';

    let budgetDisplay = '(not specified)';
    if (maxTuition === 'unlimited') {
      budgetDisplay = 'Budget is flexible';
    } else if (maxTuition && typeof maxTuition === 'number') {
      budgetDisplay = `$${maxTuition.toLocaleString()}/year`;
    }

    let briefChildDisplayName = childName ? childName : 'your child';

    const briefPrompt = consultantName === 'Jackie'
      ? `[STATE: BRIEF] Generate a factual brief summary using the structured format below. Use ONLY what was explicitly stated by the parent.

CRITICAL RULES:
- Do NOT invent personality traits, motivations, or character descriptions that were not explicitly stated by the parent.
- If no personality was described, skip that section entirely.

FAMILY DATA:
- CHILD: ${briefChildDisplayName}
- GRADE: ${childGrade !== null && childGrade !== undefined ? 'Grade ' + childGrade : '(not specified)'}
- LOCATION: ${locationArea || '(not specified)'}
- BUDGET: ${budgetDisplay}
- PRIORITIES: ${prioritiesStr || '(not specified)'}
- INTERESTS: ${interestsStr || '(not specified)'}
- DEALBREAKERS: ${dealbreakersStr || '(not specified)'}

UNIFIED FORMAT:
[REQUIRED warm, conversational intro - Jackie tone]

1. Student: ${briefChildDisplayName}
2. Location: ${locationArea || '(not specified)'}
3. Budget: ${budgetDisplay}
${prioritiesStr ? '4. Top priorities: ' + prioritiesStr + '\n' : ''}${interestsStr ? '5. Interests: ' + interestsStr + '\n' : ''}${dealbreakersStr ? '6. Dealbreakers: ' + dealbreakersStr + '\n' : ''}
Does that capture it? Anything to adjust?

YOU ARE JACKIE.`
      : `[STATE: BRIEF] Generate a factual brief summary. Use ONLY what was explicitly stated by the parent.

FAMILY DATA:
- CHILD: ${briefChildDisplayName}
- GRADE: ${childGrade || '(not specified)'}
- LOCATION: ${locationArea || '(not specified)'}
- BUDGET: ${budgetDisplay}

Format as a numbered/ordered list (1. Student: ... 2. Location: ... 3. Budget: ... etc.). Be direct.

YOU ARE LIAM.`;

    let briefMessageText = "Let me summarize what you've shared.";
    try {
      const briefResult = await callOpenRouter({
        systemPrompt: briefPrompt.split('\n\n')[0],
        userPrompt: briefPrompt.split('\n\n').slice(1).join('\n\n'),
        maxTokens: 800,
        temperature: 0.5
      });
      briefMessageText = briefResult || "Let me summarize what you've shared.";
    } catch (openrouterError) {
      try {
        const briefResult = await base44.integrations.Core.InvokeLLM({ prompt: briefPrompt });
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
async function handleResults(base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, briefStatus, selectedSchoolId, conversationId, userId) {
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

  const searchParams: any = {
    limit: 50,
    familyProfile: conversationFamilyProfile
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
      
      const resultsSystemPrompt = `[STATE: RESULTS] Explain these school matches. Focus on fit. Do NOT ask intake questions. Max 150 words.

${consultantName === 'Jackie' ? 'YOU ARE JACKIE - Warm, empathetic.' : 'YOU ARE LIAM - Direct, strategic.'}`;

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
async function handleDeepDive(base44, selectedSchoolId, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools) {
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
  
  const deepDiveSystemPrompt = `You are ${consultantName}, an education consultant helping families find the right private school.

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

  // Sanitize aiMessage: remove internal labels that may have leaked from the LLM
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
    schools: selectedSchool ? [selectedSchool] : [],
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
      const { message, conversationHistory, conversationContext, region, userId, consultantName, currentSchools, userLocation, selectedSchoolId } = await req.json();

      // FIX: Force RESULTS state on brief confirmation signal
      let context = conversationContext || {};
      let processMessage = message; // Sanitize sentinel before downstream use
      if (message === '__CONFIRM_BRIEF__') {
        processMessage = 'show me schools'; // Replace sentinel with safe text
        context.state = 'RESULTS';
        context.briefStatus = 'confirmed';
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
      
      // STEP 1: WELCOME HANDLER
      const isFirstMessage = conversationHistory?.length === 0;
      let extractionResult = null;
      let intentSignal = 'continue';
      let briefDelta = { additions: [], updates: [], removals: [] };

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
          schools: []
        });
      }

      // STEP 2: ENTITY EXTRACTION (inlined, no function invoke)
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
      
      // Apply results
      Object.assign(conversationFamilyProfile, extractionResult.updatedFamilyProfile);
      Object.assign(context, extractionResult.updatedContext);
      
      // STEP 3: BUILD PROFILE DATA
      const profileData = {
        location: conversationFamilyProfile?.locationArea || null,
        gradeLevel: conversationFamilyProfile?.childGrade || null,
        priorities: conversationFamilyProfile?.priorities || [],
        dealbreakers: conversationFamilyProfile?.dealbreakers || [],
        curriculum: conversationFamilyProfile?.curriculumPreference || [],
        schoolType: conversationFamilyProfile?.schoolType || null
      };
      
      const turnCount = (conversationHistory?.filter(m => m.role === 'user').length || 0) + 1;
      const currentBriefEditCount = context.briefEditCount || 0;
      const previousSchoolId = context.previousSchoolId || null;
      
      // STEP 4: RESOLVE TRANSITION
      const resolveResult = resolveTransition({
        currentState: context.state || STATES.WELCOME,
        intentSignal,
        profileData,
        turnCount,
        briefEditCount: currentBriefEditCount,
        selectedSchoolId,
        previousSchoolId,
        userMessage: processMessage
      });
      
      currentState = resolveResult.nextState;
      briefStatus = resolveResult.briefStatus || context.briefStatus || null;
      const { flags } = resolveResult;
      
      console.log('[ORCH] resolveTransition:', { nextState: currentState, intentSignal, sufficiency: resolveResult.sufficiency });
      
      context.state = currentState;
      context.briefStatus = briefStatus;
      context.dataSufficiency = resolveResult.sufficiency;
      context.transitionReason = resolveResult.transitionReason;

      console.log(`[STATE] ${currentState} | briefStatus: ${briefStatus} | sufficiency: ${context.dataSufficiency} | reason: ${context.transitionReason}`);

      // STEP 5: STATE-SPECIFIC RESPONSE GENERATION (all inlined)
      let responseData;

      if (currentState === STATES.DISCOVERY) {
        responseData = await handleDiscovery(base44, processMessage, conversationFamilyProfile, context, conversationHistory, consultantName, currentSchools, flags);
        return Response.json(responseData);
      }

      if (currentState === STATES.BRIEF) {
        responseData = await handleBrief(base44, processMessage, conversationFamilyProfile, context, conversationHistory, consultantName, briefStatus, flags);
        return Response.json(responseData);
      }

      if (currentState === STATES.RESULTS) {
        responseData = await handleResults(base44, processMessage, conversationFamilyProfile, context, conversationHistory, consultantName, briefStatus, selectedSchoolId, conversationId, userId);
        return Response.json(responseData);
      }

      if (currentState === STATES.DEEP_DIVE) {
        responseData = await handleDeepDive(base44, selectedSchoolId, processMessage, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools);
        return Response.json(responseData);
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
      return Response.json({ error: 'Request timeout', status: 408 }, { status: 408 });
    }
    return Response.json({ error: 'Something went wrong. Please try again.', status: 500 }, { status: 500 });
  }
});