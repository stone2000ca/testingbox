// Function: handleResults
// Purpose: Handle the RESULTS state — run school search, generate consultant narration, and optionally generate WC10 AI narrative on first transition from BRIEF
// Entities: FamilyProfile (read), SchoolAnalysis (read), ChatSession (update for WC10 narrative)
// Last Modified: 2026-03-09
// Dependencies: OpenRouter API, searchSchools (invoked via base44.asServiceRole.functions.invoke)
// WC-2: LLM model upgrade — MiniMax M2.5 as primary model in callOpenRouter waterfall

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// =============================================================================
// T045: Canadian Metro Coordinates Lookup
// =============================================================================
const CANADIAN_METRO_COORDS = {
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
  'vancouver': { lat: 49.2827, lng: -123.1207 },
  'greater vancouver': { lat: 49.2827, lng: -123.1207 },
  'greater vancouver area': { lat: 49.2827, lng: -123.1207 },
  'lower mainland': { lat: 49.2827, lng: -123.1207 },
  'metro vancouver': { lat: 49.2827, lng: -123.1207 },
  'montreal': { lat: 45.5017, lng: -73.5673 },
  'québec city': { lat: 46.8139, lng: -71.2080 },
  'quebec city': { lat: 46.8139, lng: -71.2080 },
  'ottawa': { lat: 45.4215, lng: -75.6972 },
  'hamilton': { lat: 43.2557, lng: -79.8711 },
  'london on': { lat: 42.9849, lng: -81.2453 },
  'london ontario': { lat: 42.9849, lng: -81.2453 },
  'london': { lat: 42.9849, lng: -81.2453 },
  'kitchener': { lat: 43.4516, lng: -80.4925 },
  'waterloo': { lat: 43.4668, lng: -80.5164 },
  'windsor': { lat: 42.3149, lng: -83.0364 },
  'calgary': { lat: 51.0447, lng: -114.0719 },
  'edmonton': { lat: 53.5461, lng: -113.4938 },
  'winnipeg': { lat: 49.8951, lng: -97.1384 },
  'saskatoon': { lat: 52.1332, lng: -106.6700 },
  'regina': { lat: 50.4452, lng: -104.6189 },
  'halifax': { lat: 44.6488, lng: -63.5752 },
  'victoria': { lat: 48.4284, lng: -123.3656 },
  'st. john\'s': { lat: 47.5615, lng: -52.7126 },
  'st johns': { lat: 47.5615, lng: -52.7126 },
  'st johns nl': { lat: 47.5615, lng: -52.7126 },
  'whitehorse': { lat: 60.7212, lng: -135.0568 },
};

function resolveLocationCoords(locationArea) {
  if (!locationArea) return null;
  const key = locationArea.toLowerCase().trim();
  if (CANADIAN_METRO_COORDS[key]) return CANADIAN_METRO_COORDS[key];
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
// E32-002a: upgraded to v2 signature (tools/toolChoice/returnRaw/_logContext added)
// =============================================================================
async function callOpenRouter(options) {
  // callOpenRouter v2.0 -- E32-002a: v1→v2 upgrade (tools/toolChoice/returnRaw/_logContext)
  const { systemPrompt, userPrompt, responseSchema, maxTokens = 1000, temperature = 0.7, _logContext, tools, toolChoice, returnRaw = false } = options;
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
  const TIMEOUT_MS = 30000;
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
      console.error(`[TIMEOUT] callOpenRouter timed out after ${TIMEOUT_MS}ms in handleResults.ts`);
      throw new Error(`LLM request timed out after ${TIMEOUT_MS/1000}s`);
    }
    console.error(`[callOpenRouter] Model call failed in handleResults.ts:`, err.message);
    const latency_ms = Date.now() - startTime;
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
// E32-002b: ACTION_TOOL_SCHEMA — inlined copy (cannot import from orchestrateConversation.ts)
// =============================================================================
const ACTION_TOOL_SCHEMA = [{ type: 'function', function: { name: 'execute_ui_action', description: 'Execute UI actions alongside your text response when the user wants to add schools to shortlist, open panels, or expand school details', parameters: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['ADD_TO_SHORTLIST', 'OPEN_PANEL', 'EXPAND_SCHOOL'] }, schoolId: { type: 'string', description: 'School entity ID' }, panel: { type: 'string', enum: ['shortlist', 'comparison', 'brief'] } }, required: ['type'] } } }, required: ['actions'] } } }];

// =============================================================================
// MAIN: Deno.serve — handleResults
// =============================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const {
      message,
      conversationFamilyProfile: rawProfile,
      context: rawContext,
      conversationHistory,
      consultantName,
      briefStatus,
      selectedSchoolId,
      conversationId,
      userId,
      userLocation,
      autoRefresh,
      extractedEntities,
      returningUserContextBlock
    } = await req.json();

    let conversationFamilyProfile = rawProfile || {};
    let context = rawContext || {};

    // S108-WC3 Fix 3: Belt-and-suspenders fallback — merge accumulatedFamilyProfile into conversationFamilyProfile
    // for any key that is null/undefined/empty in conversationFamilyProfile but present in accumulated context.
    const accumulated = context.accumulatedFamilyProfile || {};
    for (const [key, value] of Object.entries(accumulated)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      const existing = conversationFamilyProfile[key];
      const isEmpty = existing === null || existing === undefined || (Array.isArray(existing) && existing.length === 0);
      if (isEmpty) {
        conversationFamilyProfile[key] = value;
        console.log(`[RESULTS-S108] Backfilled from accumulatedFamilyProfile: ${key} =`, value);
      }
    }

    const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };

    // =========================================================================
    // WC10: Generate AI narrative if transitioning from BRIEF to RESULTS
    // =========================================================================
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
          const fastResponse = await base44.integrations.Core.InvokeLLM({ 
            prompt: 'You are a skilled education consultant writing warm, personalized school profile narratives. Keep it 2-3 sentences max.\n\n' + narrativePrompt,
            model: 'gpt_5_mini'
          });
          aiNarrative = fastResponse?.response || fastResponse;
          console.log('[WC10] Narrative generated via InvokeLLM (fast path)');
        } catch (invokeLLMError) {
          console.log('[WC10] InvokeLLM failed, falling back to OpenRouter');
          try {
            aiNarrative = await callOpenRouter({
              systemPrompt: 'You are a skilled education consultant writing warm, personalized school profile narratives. Keep it 2-3 sentences max.',
              userPrompt: narrativePrompt,
              maxTokens: 300,
              temperature: 0.7
            });
            console.log('[WC10] Narrative generated via OpenRouter (fallback)');
          } catch (openrouterError) {
            console.error('[WC10] Both narrative generation methods failed:', openrouterError.message);
          }
        }

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

    // =========================================================================
    // handleResults logic
    // =========================================================================
    if (selectedSchoolId) {
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

    // Validate that conversationFamilyProfile has minimum required data
    if (!conversationFamilyProfile || typeof conversationFamilyProfile !== 'object') {
      console.error('[SEARCH] conversationFamilyProfile is not an object:', conversationFamilyProfile);
      return Response.json({
        message: "I need a bit more information to find the right schools. Could you remind me — where are you looking and what grade?",
        state: STATES.RESULTS,
        briefStatus: briefStatus,
        schools: [],
        familyProfile: conversationFamilyProfile || {},
        conversationContext: context
      });
    }

    if (!conversationFamilyProfile?.locationArea && context.extractedEntities?.locationArea) {
      conversationFamilyProfile.locationArea = context.extractedEntities.locationArea;
    }

    // BUG-FLOW-003: Check for critical missing data before calling searchSchools
    if (!conversationFamilyProfile?.locationArea && !conversationFamilyProfile?.childGrade) {
      console.error('[SEARCH] Missing both location and grade — insufficient data for search');
      return Response.json({
        message: "I need to know your location and your child's grade to search for schools. Could you tell me both?",
        state: STATES.RESULTS,
        briefStatus: briefStatus,
        schools: [],
        familyProfile: conversationFamilyProfile,
        conversationContext: context
      });
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

    const searchParams = {
      limit: 50,
      familyProfile: conversationFamilyProfile
    };

    if (conversationFamilyProfile?.locationArea) {
      const locationAreaLower = conversationFamilyProfile.locationArea.toLowerCase().trim();
      const regionAliases = ['gta', 'greater toronto area', 'lower mainland', 'metro vancouver', 'greater vancouver'];
      if (regionAliases.includes(locationAreaLower)) {
        searchParams.region = conversationFamilyProfile.locationArea;
      } else {
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
          const inferredProvince = cityToProvinceMap[locationParts[0].toLowerCase()];
          if (inferredProvince) {
            searchParams.provinceState = inferredProvince;
            console.log(`[AUTO-INFER] City "${locationParts[0]}" → Province "${inferredProvince}"`);
          }
        }
      }
      
      // BUG-FLOW-004: Fallback — if city wasn't set, use locationArea directly
      if (!searchParams.city && !searchParams.region && locationAreaLower) {
        searchParams.city = conversationFamilyProfile.locationArea;
        console.log(`[FALLBACK] Using locationArea directly as city: "${searchParams.city}"`);
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
      
      // Defensive: Handle various response structures
      if (!searchResult || !searchResult.data) {
        console.error('[ERROR] searchSchools returned invalid response:', searchResult);
        return Response.json({
          message: "I'm having trouble searching for schools right now. Could you tell me a bit more about your preferences?",
          state: STATES.RESULTS,
          briefStatus: briefStatus,
          schools: [],
          familyProfile: conversationFamilyProfile,
          conversationContext: context
        });
      }
      
      schools = searchResult.data.schools || [];
      if (!Array.isArray(schools)) {
        console.error('[ERROR] searchSchools schools is not an array:', typeof schools);
        schools = [];
      }
    } catch (e) {
      console.error('[ERROR] searchSchools failed:', e.message);
      return Response.json({
        message: "I'm having trouble searching for schools right now. Could you tell me a bit more about your preferences?",
        state: STATES.RESULTS,
        briefStatus: briefStatus,
        schools: [],
        familyProfile: conversationFamilyProfile,
        conversationContext: context
      });
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
    const rawToolCalls = [];
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

        const autoRefreshEntitiesStr = Object.keys(extractedEntities || {}).filter(k =>
          !['intentSignal', 'briefDelta', 'remove_priorities', 'remove_interests', 'remove_dealbreakers', 'gender'].includes(k)
        ).join(', ');

        const schoolCount = matchingSchools.length;
        const isFirstResults = !autoRefresh && conversationHistory?.filter(m => m.role === 'assistant' && m.content?.includes('school')).length === 0;
        const isThinResults = schoolCount < 5 && schoolCount > 0;

        // T-RES-007: Consultant Narration
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

        // E32-002b: School ID context block so LLM can reference valid IDs in actions
        const schoolIdContext = `\nSCHOOL IDs (use these exact IDs in execute_ui_action):\n` +
          matchingSchools.map(s => `[ID:${s.id}] ${s.name}`).join('\n');

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

${consultantName === 'Jackie' ? 'YOU ARE JACKIE - Warm, empathetic, experienced.' : 'YOU ARE LIAM - Direct, strategic, no-BS.'}
${schoolIdContext}`;

        const resultsUserPrompt = `Recent chat:\n${conversationSummary}\n${schoolContext}\n\nParent: "${message}"\n\nRespond as ${consultantName}. ONE question max.`;

        let messageWithLinks = 'Here are the schools I found:';
        // E32-002b: InvokeLLM primary, callOpenRouter fallback (tools wiring deferred)
        try {
          const fastResponse = await base44.integrations.Core.InvokeLLM({
            prompt: resultsSystemPrompt + '\n\n' + resultsUserPrompt,
            model: 'gpt_5_mini'
          });
          messageWithLinks = fastResponse?.response || fastResponse || 'Here are the schools I found:';
          console.log('[RESULTS] Response via InvokeLLM (primary)');
        } catch (invokeLLMError) {
          console.log('[RESULTS] InvokeLLM failed, falling back to callOpenRouter');
          try {
            messageWithLinks = await callOpenRouter({
              systemPrompt: resultsSystemPrompt,
              userPrompt: resultsUserPrompt,
              maxTokens: 800,
              temperature: 0.7
            }) || 'Here are the schools I found:';
            console.log('[RESULTS] Response via callOpenRouter (fallback)');
          } catch (openrouterError) {
            console.error('[RESULTS] Both response methods failed:', openrouterError.message);
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

    return Response.json({
      message: aiMessage,
      state: STATES.RESULTS,
      briefStatus: 'confirmed',
      schools: matchingSchools,
      familyProfile: conversationFamilyProfile,
      conversationContext: context,
      rawToolCalls: rawToolCalls || []
    });

  } catch (error) {
    console.error('[handleResults] FATAL:', error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});