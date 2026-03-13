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
  const TIMEOUT_MS = 8000;
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
const ACTION_TOOL_SCHEMA = [{ type: 'function', function: { name: 'execute_ui_action', description: 'Execute UI actions alongside your text response when the user wants to add schools to shortlist, open panels, or expand school details', parameters: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['ADD_TO_SHORTLIST', 'OPEN_PANEL', 'EXPAND_SCHOOL', 'INITIATE_TOUR'] }, schoolId: { type: 'string', description: 'School entity ID' }, panel: { type: 'string', enum: ['shortlist', 'comparison', 'brief'] } }, required: ['type'] } } }, required: ['actions'] } } }];

const ACTIONS_RESPONSE_SCHEMA = { type: 'object', properties: { message: { type: 'string', description: 'The consultant response text to show the user' }, actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['ADD_TO_SHORTLIST', 'OPEN_PANEL', 'EXPAND_SCHOOL', 'INITIATE_TOUR'] }, schoolId: { type: 'string' }, panel: { type: 'string', enum: ['shortlist', 'comparison', 'brief'] } }, required: ['type'] }, description: 'UI actions to execute. Empty array if no actions needed.' } }, required: ['message', 'actions'] };

// =============================================================================
// Tour Request Detection
// =============================================================================
function detectJourneySubAction(message: string): { type: string; schoolName?: string } | null {
  const TOUR_INTENT_RE = /\b(book|schedule|arrange|request|set\s*up|sign\s*up\s*for|register\s*for|plan)\b.{0,30}\b(tour|visit|open\s*house|campus\s*visit|school\s*tour|info\s*session)\b/i;
  const WANT_VISIT_RE = /\b(want\s+to|like\s+to|ready\s+to|interested\s+in)\s+(visit|tour|see|check\s*out)\b/i;
  const QUESTION_TOUR_RE = /\b(can\s+(?:we|i)|how\s+(?:do\s+i|can\s+i|to))\s+(?:book|schedule|arrange|visit|tour)\b/i;
  const isTourIntent = TOUR_INTENT_RE.test(message) || WANT_VISIT_RE.test(message) || QUESTION_TOUR_RE.test(message);
  if (!isTourIntent) return null;
  const TOUR_COMMAND_WORDS = /\b(book|schedule|arrange|request|set\s*up|sign\s*up\s*for|register\s*for|plan|want\s*to|like\s*to|ready\s*to|interested\s*in|can\s*we|can\s*i|how\s*do\s*i|how\s*to|a|an|the|at|for|tour|visit|open\s*house|campus\s*visit|school\s*tour|info\s*session|please|i|we|me|my)\b/gi;
  const stripped = message.replace(/[^a-zA-Z0-9\s'-]/g, '').replace(TOUR_COMMAND_WORDS, ' ').replace(/\s+/g, ' ').trim();
  const schoolName = stripped.length >= 2 ? stripped : undefined;
  return { type: 'INITIATE_TOUR', schoolName };
}

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
      returningUserContextBlock,
      previousSchools
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
      (async () => {
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
          const fastResponse = await Promise.race([
            base44.integrations.Core.InvokeLLM({ 
              prompt: 'You are a skilled education consultant writing warm, personalized school profile narratives. Keep it 2-3 sentences max.\n\n' + narrativePrompt,
              model: 'gpt_5_mini'
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('InvokeLLM timed out after 12s')), 12000))
          ]);
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
      })();
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
        conversationContext: { ...context, state: 'DEEP_DIVE' },
        rawToolCalls: []
      });
    }

    // =========================================================================
    // FAST PATH: shortlist-action — no search, no LLM, just fuzzy match + tool call
    // NOTE: extractedEntities is a fire-and-forget stub (always {}), so we detect
    // shortlist intent directly from the message via regex as the primary signal.
    // =========================================================================
    const shortlistFastPathRegex = /\b(add|save|shortlist|bookmark|keep)\b.{0,40}\b(school|academy|college|it|that|this|one)\b|\b(shortlist|save|add)\s+(it|that|this)\b|\badd\b.{0,30}\bto\b.{0,20}\b(shortlist|list|saved)\b/i;
    const isShortlistAction = extractedEntities?.intentSignal === 'shortlist-action' || shortlistFastPathRegex.test(message);
    if (isShortlistAction) {
      const shortlistPool = previousSchools || [];
      const matchPool = context.lastMatchedSchools || [];
      const seenIds = new Set();
      const schoolPool = [...shortlistPool, ...matchPool].filter(s => {
        if (seenIds.has(s.id)) return false;
        seenIds.add(s.id);
        return true;
      });

      // Extract the school name fragment from the message for scoring
      // Strip common command words to isolate the school name portion
      const msgNorm = message.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const strippedMsg = msgNorm
        .replace(/\b(add|save|shortlist|bookmark|keep|put|please|can you|i want to|to my|my|to the|the|shortlist|list|saved)\b/g, ' ')
        .replace(/\s+/g, ' ').trim();
      const msgWords = strippedMsg.split(' ').filter(w => w.length > 2);
      console.log(`[SHORTLIST-FAST-PATH] Pool size: ${schoolPool.length}, msgWords=${JSON.stringify(msgWords)}`);

      // Score each school — require ALL significant words (length >= 4) to match to avoid
      // false positives like 'howlett academy' matching 'Hanson International Academy' via 'academy'
      const significantMsgWords = msgWords.filter(w => w.length >= 4);
      const requiredScore = significantMsgWords.length > 0 ? significantMsgWords.length : 1;
      let bestMatch = null;
      let bestScore = 0;
      for (const s of schoolPool) {
        const nameNorm = s.name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        const nameWords = nameNorm.split(' ').filter(w => w.length > 2);
        const overlapCount = significantMsgWords.length > 0
          ? significantMsgWords.filter(w => nameWords.includes(w)).length
          : msgWords.filter(w => nameWords.includes(w)).length;
        console.log(`[SHORTLIST-FAST-PATH] "${s.name}" score=${overlapCount}/${requiredScore} (nameWords=[${nameWords.join(',')}])`);
        if (overlapCount > bestScore) {
          bestScore = overlapCount;
          bestMatch = s;
        }
      }

      let matched = bestScore >= requiredScore ? bestMatch : null;

      if (matched) {
        console.log(`[SHORTLIST-FAST-PATH] Best match: "${matched.name}" (${matched.id}) score=${bestScore} — skipping search & LLM`);
        return Response.json({
          message: `Done — ${matched.name} has been added to your shortlist.`,
          state: STATES.RESULTS,
          briefStatus: briefStatus,
          schools: schoolPool,
          familyProfile: conversationFamilyProfile,
          conversationContext: context,
          actions: [{ type: 'ADD_TO_SHORTLIST', payload: { schoolId: matched.id }, timing: 'immediate' }]
        });
      }
      // If no fuzzy match found, fall through to normal search so we can still try
      console.log('[SHORTLIST-FAST-PATH] No school match found in pool — falling through to search');
    }

    const journeySubAction = detectJourneySubAction(message);
    if (journeySubAction) {
      const jShortlistPool = previousSchools || [];
      const jMatchPool = context.lastMatchedSchools || [];
      const jSeenIds = new Set();
      const jSchoolPool = [...jShortlistPool, ...jMatchPool].filter(s => { if (jSeenIds.has(s.id)) return false; jSeenIds.add(s.id); return true; });
      let jMatched = null;
      if (journeySubAction.schoolName) {
        const jMsgNorm = journeySubAction.schoolName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        const jMsgWords = jMsgNorm.split(' ').filter(w => w.length > 2);
        const jSignificantWords = jMsgWords.filter(w => w.length >= 4);
        const jRequiredScore = jSignificantWords.length > 0 ? jSignificantWords.length : 1;
        let jBestMatch = null; let jBestScore = 0;
        for (const s of jSchoolPool) {
          const nameNorm = s.name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
          const nameWords = nameNorm.split(' ').filter(w => w.length > 2);
          const overlapCount = jSignificantWords.length > 0 ? jSignificantWords.filter(w => nameWords.includes(w)).length : jMsgWords.filter(w => nameWords.includes(w)).length;
          if (overlapCount > jBestScore) { jBestScore = overlapCount; jBestMatch = s; }
        }
        jMatched = jBestScore >= jRequiredScore ? jBestMatch : null;
      }
      if (jMatched) {
        console.log(`[TOUR-FAST-PATH] Matched "${jMatched.name}" (${jMatched.id})`);
        // E29-005-AC7: Create TourRequest entity immediately for tour booking intent
        (async () => {
          try {
            if (!userId || !conversationId) return;
            const me = await base44.auth.me();
            if (!me?.id) return;
            
            await base44.asServiceRole.entities.TourRequest.create({
              parentUserId: userId,
              schoolId: jMatched.id,
              requestedAt: new Date().toISOString(),
              status: 'pending',
              parentName: me.full_name || '',
              parentEmail: me.email || '',
              tourType: 'in_person', // Default to in_person, user can change in modal
              message: `Tour request initiated from RESULTS state for ${jMatched.name}`,
              conversationId: conversationId,
              childGrade: conversationFamilyProfile?.childGrade || undefined,
            });
            console.log('[E29-005-AC7] TourRequest created for school:', jMatched.id);
          } catch (err) {
            console.error('[E29-005-AC7] TourRequest creation failed:', err?.message);
          }
        })();
        
        return Response.json({ message: `Great choice! Let me pull up the tour request form for ${jMatched.name}.`, state: STATES.RESULTS, briefStatus: briefStatus, schools: jSchoolPool, familyProfile: conversationFamilyProfile, conversationContext: context, actions: [{ type: 'INITIATE_TOUR', payload: { schoolId: jMatched.id }, timing: 'immediate' }] });
      }
      console.log('[TOUR-FAST-PATH] No school match — falling through to LLM');
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
        conversationContext: context,
        rawToolCalls: []
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
        conversationContext: context,
        rawToolCalls: []
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
      const cleanedLocation = conversationFamilyProfile.locationArea;
      const locationAreaLower = cleanedLocation.toLowerCase().trim();
      const regionAliases = ['gta', 'greater toronto area', 'lower mainland', 'metro vancouver', 'greater vancouver', 'toronto'];
      const metroRegions = ['toronto', 'vancouver', 'montreal', 'calgary', 'ottawa', 'edmonton', 'winnipeg', 'hamilton'];
      
      if (metroRegions.includes(locationAreaLower)) {
        searchParams.region = cleanedLocation || conversationFamilyProfile.locationArea;
      } else if (regionAliases.includes(locationAreaLower)) {
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
      searchParams.maxDistanceKm = conversationFamilyProfile?.commuteToleranceMinutes 
        ? Math.ceil(conversationFamilyProfile.commuteToleranceMinutes / 2) 
        : 75;
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
          conversationContext: context,
          rawToolCalls: []
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
        conversationContext: context,
        rawToolCalls: []
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
    
    if (!matchingSchools || matchingSchools.length === 0) {
      aiMessage = "I don't have any schools matching your criteria yet. Try a nearby city or broader criteria.";
    } else {
      try {
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

        // T-RES-007: Consultant Narration — PRESENTATION CONTEXTS that layer on top of the intent router in STEP 3
        let narrateInstruction = '';
        if (autoRefresh && autoRefreshEntitiesStr) {
          narrateInstruction = `PRESENTATION CONTEXT — AUTO-REFRESH: New information was just extracted (${autoRefreshEntitiesStr}). The matches have ALREADY been silently updated. Regardless of the intent classified in STEP 1, ALSO open with ONE natural sentence acknowledging the update. E.g. "I've refreshed your matches based on the STEM interest — here's what changed." Do NOT ask "Does that look right?". Max 150 words total.`;
        } else if (isThinResults) {
          narrateInstruction = `PRESENTATION CONTEXT — THIN RESULTS: Only ${schoolCount} school${schoolCount === 1 ? '' : 's'} matched. Regardless of the intent classified in STEP 1, ALSO open with: "I found ${schoolCount} school${schoolCount === 1 ? '' : 's'} that fit your criteria — want me to widen the search?" Then respond per your intent classification. Max 100 words total.`;
        } else if (isFirstResults) {
          narrateInstruction = `PRESENTATION CONTEXT — INITIAL RESULTS: This is the first time showing results. Regardless of the intent classified in STEP 1, ALSO open with a warm lead-in like: "Here are your strongest matches based on everything you've told me." (Jackie: warm & encouraging, Liam: direct & confident — use your voice) Briefly highlight 1-2 notable schools. End with: "Take your time browsing. When a school catches your eye, save it to your shortlist." Max 160 words total.`;
        } else {
          narrateInstruction = `PRESENTATION CONTEXT — STANDARD: Use the intent classification in STEP 1 above to determine your full response. Do not default to a generic preference acknowledgment — only use edit-criteria behavior if the parent is genuinely expressing a preference change.`;
        }

        const comparingSchoolsNote = context.comparingSchools?.length >= 2
          ? `\n\nCOMPARISON CONTEXT: The parent is currently viewing a side-by-side comparison of: ${context.comparingSchools.join(', ')}. If they ask questions about these schools, answer with that comparison context in mind.`
          : '';

        // E32-002b: School ID context block so LLM can reference valid IDs in actions
        const schoolIdContext = `\nSCHOOL IDs (use these exact IDs in execute_ui_action):\n` +
          matchingSchools.map(s => `[ID:${s.id}] ${s.name}`).join('\n');

        const resultsSystemPrompt = `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}[STATE: RESULTS] You are currently showing school results to the parent.

${consultantName === 'Jackie' ? 'YOU ARE JACKIE — Warm, empathetic, experienced.' : 'YOU ARE LIAM — Direct, strategic, no-BS.'}

═══════════════════════════════════════════
STEP 1 — CLASSIFY INTENT
═══════════════════════════════════════════
Before responding, mentally classify the parent's message into ONE of these 8 intents. If the parent's message does not explicitly name or ask about a specific school, it is NOT ask-about-school.

1. ask-about-school     — Parent asks about a specific school by name
2. compare-schools      — Parent asks to compare 2+ schools
3. edit-criteria        — Parent changes a preference (budget, location, grade, boarding, etc.)
4. shortlist-action     — Parent wants to add or remove a school from their shortlist
5. filter-refine        — Parent wants to narrow or adjust results (closer schools, only boarding, etc.)
6. journey-action       — Parent mentions tours, visits, applications, or open houses
7. next-step            — Parent asks what to do next or seems unsure how to proceed
8. off-topic            — General education question not about their specific matches

⚠️ COMMON MISCLASSIFICATION — DO NOT default to ask-about-school just because school data is visible. ask-about-school requires the parent to NAME or ASK ABOUT a specific school. Examples:
- "Add to shortlist" = shortlist-action
- "What should I do next?" = next-step
- "Budget changed to 25K" = edit-criteria
- "What about Montessori in general?" = off-topic

═══════════════════════════════════════════
STEP 2 — RESPOND BY INTENT
═══════════════════════════════════════════

INTENT: ask-about-school
→ Provide 2-3 sentences of insight about that school using the school data in your context.
→ Highlight what makes it relevant for THIS family specifically.
→ Suggest a deep dive: "Want me to pull up a full analysis on [School]?"
→ Fire execute_ui_action with EXPAND_SCHOOL and the school's ID.

INTENT: compare-schools
→ Provide a concise comparison on key dimensions: tuition, class size, programs, fit for this child.
→ Only compare if both schools have sufficient data. If not, flag what's missing.
→ End with a clear recommendation or question to help them decide.
→ This is the ONE exception to the 4-sentence max — a short comparison list is allowed.

INTENT: edit-criteria
→ Acknowledge the change in ONE sentence only. Example: "Got it — I've noted the budget change."
→ Add ONE sentence on how it affects their matches. Example: "This may open up a few more options."
→ STOP. Do not recap their full profile. Do not ask for confirmation.

INTENT: shortlist-action
→ Fire execute_ui_action with ADD_TO_SHORTLIST and the school's ID.
→ Confirm warmly in one sentence. Example: "Added — you can compare it anytime from your shortlist."
→ Do not explain what the shortlist is.
→ IMPORTANT: You MUST provide BOTH a text response in your message content AND fire the execute_ui_action tool. Never leave your text response empty when calling a tool.

INTENT: filter-refine
→ Acknowledge the filter in ONE sentence.
→ Add ONE sentence explaining what it means for their current results.
→ Do not re-list all schools.

INTENT: journey-action
→ Acknowledge their interest in ONE sentence.
→ Guide the next concrete step (booking a tour, noting an open house, starting an application checklist).
→ Keep it specific to the school mentioned if one was named.

INTENT: next-step
→ Evaluate their current state: schools shown, shortlist status, journey phase.
→ Suggest the SINGLE best next action in one sentence. No menus or lists.

INTENT: off-topic
→ Answer the general question briefly (1-2 sentences).
→ Redirect: "Let's get back to finding the right fit for [child's name]."

═══════════════════════════════════════════
UNIVERSAL TONE RULES (apply to ALL intents)
═══════════════════════════════════════════
- 2-4 sentences max, UNLESS the intent is compare-schools.
- Every response must contain: (1) what was done/understood, (2) why it matters for THIS family, (3) what to do next.
- Always close with a forward-looking prompt or suggestion.
- Never repeat school card content already visible in the left panel.
- NEVER mention a "Refresh Matches" button — it does not exist.
- Do NOT produce a numbered list of their preferences (Student, Location, Budget, etc.).
- Do NOT ask "Does that look right?" or any confirmation question.

═══════════════════════════════════════════
STEP 3 — APPLY PRESENTATION CONTEXT
═══════════════════════════════════════════
${narrateInstruction}${comparingSchoolsNote}

SCHOOL DATA (use exact IDs in execute_ui_action):
${schoolIdContext}`;

        const resultsUserPrompt = `Parent's latest message: "${message}"\n\n--- REFERENCE DATA (do not classify this) ---\nRecent chat:\n${conversationSummary}\n${schoolContext}\n\nRespond as ${consultantName}. ONE question max.`;

        const llmResult = await callOpenRouter({
          systemPrompt: resultsSystemPrompt,
          userPrompt: resultsUserPrompt,
          maxTokens: 300,
          temperature: 0.7,
          tools: ACTION_TOOL_SCHEMA,
          toolChoice: 'auto',
          returnRaw: true,
          _logContext: { base44, conversation_id: conversationId, phase: 'RESULTS', is_test: false }
        });
        let rawContent = llmResult.content || '';
        try { const parsed = JSON.parse(rawContent); aiMessage = parsed.message || rawContent || "Here are your matches."; } catch { aiMessage = rawContent || "Here are your matches."; }
        if (llmResult.toolCalls?.length > 0) rawToolCalls.push(...llmResult.toolCalls);
        // Fix A: Tool-call-aware fallback — LLM often returns empty content when firing a tool call
        if (!aiMessage) {
          if ((!aiMessage || aiMessage === "Here are your matches.") && rawToolCalls.length > 0) {
            const actionTypes = rawToolCalls.map(tc => { try { return JSON.parse(tc.function?.arguments || '{}').action; } catch { return ''; } });
            if (actionTypes.includes('ADD_TO_SHORTLIST')) {
              aiMessage = "Done — I've added that to your shortlist. You can compare your saved schools anytime.";
            } else if (actionTypes.includes('OPEN_PANEL')) {
              aiMessage = "Here you go — I've opened that for you.";
            } else if (actionTypes.includes('EXPAND_SCHOOL')) {
              aiMessage = "Let me pull up the details on that school.";
            }
          }
        }

        // Fix B: Deterministic shortlist fallback — if LLM didn't fire the tool at all for a shortlist-action intent
        if (isShortlistAction && rawToolCalls.length === 0) {
          // Fuzzy-match school name from message against matchingSchools
          const msgNorm = message.toLowerCase().replace(/[^a-z0-9\s]/g, '');
          const matched = matchingSchools.find(s => {
            const nameNorm = s.name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
            // Check if any word of the school name appears in the message or vice versa
            const nameWords = nameNorm.split(' ').filter(w => w.length > 3);
            return nameWords.some(w => msgNorm.includes(w)) || msgNorm.includes(nameNorm);
          });
          if (matched) {
            rawToolCalls.push({
              id: `synthetic-shortlist-${matched.id}`,
              type: 'function',
              function: {
                name: 'execute_ui_action',
                arguments: JSON.stringify({ action: 'ADD_TO_SHORTLIST', schoolId: matched.id })
              }
            });
            if (!aiMessage || aiMessage === "Here are your matches.") {
              aiMessage = `Done — ${matched.name} has been added to your shortlist.`;
            }
            console.log(`[SHORTLIST-FALLBACK] Programmatically constructed ADD_TO_SHORTLIST for "${matched.name}" (${matched.id})`);
          }
        }
      } catch (e) {
        console.error('[ERROR] RESULTS response failed:', e.message);
        if (autoRefresh && Object.keys(extractedEntities || {}).filter(k =>
          !['intentSignal', 'briefDelta', 'remove_priorities', 'remove_interests', 'remove_dealbreakers', 'gender'].includes(k)
        ).length > 0) {
          aiMessage = "I've refreshed your matches based on the new info — here's what changed.";
        } else if (matchingSchools.length < 5 && matchingSchools.length > 0) {
          aiMessage = `I found ${matchingSchools.length} school${matchingSchools.length === 1 ? '' : 's'} that fit your criteria. Want me to adjust the search to find more options?`;
        } else if (!conversationHistory?.some(m => m.role === 'assistant' && m.content?.includes('your matches'))) {
          aiMessage = consultantName === 'Jackie' ? "Based on everything you've shared, I've put together an initial list of schools for you to explore. Let me know what catches your eye!" : "Based on your criteria, here's your initial shortlist. Take a look and tell me which ones stand out.";
        } else {
          aiMessage = consultantName === 'Jackie' ? "Got it — I've refreshed your matches with that in mind." : "Noted. I've updated your matches accordingly.";
        }
      }
    }

    // Persist last matched schools into context so shortlist-action fast path can use them next call
    const existingPool = context.lastMatchedSchools || [];
    const newIds = new Set(matchingSchools.map(s => s.id));
    const preserved = existingPool.filter(s => !newIds.has(s.id));
    context.lastMatchedSchools = [...matchingSchools, ...preserved].slice(0, 50);

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