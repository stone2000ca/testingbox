// Function: handleDeepDive
// Purpose: Handle deep-dive school analysis with visit prep generation and debrief mode routing
// Entities: School, SchoolAnalysis, GeneratedArtifact, SchoolEvent, User
// Last Modified: 2026-03-09
// Dependencies: OpenRouter API, Base44 InvokeLLM fallback, handleVisitDebrief function
// WC-2: LLM model upgrade — MiniMax M2.5 as primary model in callOpenRouter waterfall
// S115-WC2: E10b structured output parse fix
// S115-WC3: E30 Sprint 2 cache read — early return from GeneratedArtifact cache

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
        // NOTE: handleDeepDive preserves original v1.0 behaviour — return raw content for caller recovery
        console.error('[OPENROUTER] JSON parse failed, returning raw content for caller recovery');
        return content;
      }
    }

    // E32-001: returnRaw returns { content, toolCalls } for callers that need tool_calls
    if (returnRaw) return { content: content || '', toolCalls };

    return content;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[TIMEOUT] callOpenRouter timed out after ${TIMEOUT_MS}ms in handleDeepDive.ts`);
      throw new Error(`LLM request timed out after ${TIMEOUT_MS/1000}s`);
    }
    console.error(`[callOpenRouter] Model call failed in handleDeepDive.ts:`, err.message);
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
// HELPER: extractConciseSummary — E30-009
// =============================================================================
function extractConciseSummary(fullProse) {
  const sentences = fullProse.split(/(?<=[.!?])\s+/);
  const meaningful = sentences.filter(s => s.trim().length > 0);
  if (meaningful.length < 2) return fullProse;
  const concise = meaningful.slice(0, 3).join(' ');
  return concise + " I've saved the full breakdown to your shortlist -- tap the bookmark icon to see everything.";
}

// =============================================================================
// E32-002b: ACTION_TOOL_SCHEMA — inlined copy (cannot import from orchestrateConversation.ts)
// =============================================================================
const ACTION_TOOL_SCHEMA = [{ type: 'function', function: { name: 'execute_ui_action', description: 'Execute UI actions alongside your text response when the user wants to add schools to shortlist, open panels, or expand school details', parameters: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['ADD_TO_SHORTLIST', 'OPEN_PANEL', 'EXPAND_SCHOOL'] }, schoolId: { type: 'string', description: 'School entity ID' }, panel: { type: 'string', enum: ['shortlist', 'comparison', 'brief'] } }, required: ['type'] } } }, required: ['actions'] } } }];

// =============================================================================
// MAIN: Deno.serve — handleDeepDive
// =============================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { selectedSchoolId, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, userId, returningUserContextBlock, flags, conversationId } = await req.json();

    // E24-S3-WC1: Resolve user tier for premium content gating
    let isPremiumUser = false;
    if (userId) {
      try {
        const userRecords = await base44.asServiceRole.entities.User.filter({ id: userId });
        const userTier = userRecords?.[0]?.tier || 'free';
        isPremiumUser = userTier === 'premium';
        console.log('[E24-S3-WC1] userId:', userId, 'tier:', userTier, 'isPremium:', isPremiumUser);
      } catch (tierErr) {
        console.warn('[E24-S3-WC1] Failed to fetch user tier (defaulting to free):', tierErr.message);
      }
    }

    const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };

    // E30-S1: Check if user is trying to switch schools (back-to-results intent)
    const backToResultsPattern = /\b(what about another|show me other|different school|go back|other options|other schools|what else|see other|back to results)\b/i;
    if (backToResultsPattern.test(message)) {
      console.log('[DEEPDIVE] Back-to-results intent detected, routing user to RESULTS');
      return Response.json({
        message: "I'd be happy to look at another school! You can click on any school card from your results to explore it, or ask me about a specific school by name.",
        state: STATES.RESULTS,
        briefStatus: briefStatus,
        schools: currentSchools || [],
        familyProfile: conversationFamilyProfile,
        conversationContext: context
      });
    }

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
      return Response.json({
        message: "I couldn't load that school's details. Please try selecting it again.",
        state: currentState,
        briefStatus: briefStatus,
        schools: currentSchools || [],
        familyProfile: conversationFamilyProfile,
        conversationContext: context
      });
    }

    // S115-WC3: E30 cache read — return early if all 3 artifacts exist with E30_V1
    if (userId && selectedSchoolId) {
      try {
        const [cachedRec, cachedPrep, cachedPlan] = await Promise.all([
          base44.entities.GeneratedArtifact.filter({ userId, schoolId: selectedSchoolId, artifactType: 'deep_dive_recommendation' }),
          base44.entities.GeneratedArtifact.filter({ userId, schoolId: selectedSchoolId, artifactType: 'visit_prep_kit' }),
          base44.entities.GeneratedArtifact.filter({ userId, schoolId: selectedSchoolId, artifactType: 'action_plan' })
        ]);
        const rec = cachedRec?.[0];
        const prep = cachedPrep?.[0];
        const plan = cachedPlan?.[0];
        const allCached = rec?.metadata?.version === 'E30_V1' && prep?.metadata?.version === 'E30_V1' && plan?.metadata?.version === 'E30_V1';
        if (allCached) {
          console.log('[E30] Cache hit — returning from GeneratedArtifact cache for school:', selectedSchoolId);
          let cachedVisitPrepKit = null;
          try {
            const fullKit = typeof prep.content === 'string' ? JSON.parse(prep.content) : prep.content;
            cachedVisitPrepKit = isPremiumUser ? fullKit : { schoolName: fullKit.schoolName, intro: fullKit.intro, visitQuestions: (fullKit.visitQuestions || []).slice(0, 2), observations: null, redFlags: null, isLocked: true };
          } catch (e) { console.warn('[E30] Cache: visit_prep_kit parse failed:', e.message); }
          let cachedActionPlan = null;
          try {
            cachedActionPlan = isPremiumUser ? (typeof plan.content === 'string' ? JSON.parse(plan.content) : plan.content) : null;
          } catch (e) { console.warn('[E30] Cache: action_plan parse failed:', e.message); }
          let cachedDeepDiveAnalysis = null;
          try {
            const analyses = await base44.entities.SchoolAnalysis.filter({ userId, schoolId: selectedSchoolId });
            if (analyses?.[0]) cachedDeepDiveAnalysis = analyses[0];
          } catch (e) { console.warn('[E30] Cache: SchoolAnalysis fetch failed:', e.message); }
          const deepDiveFollowUpKey = `deepDiveFollowUpShown_${selectedSchoolId}`;
          const isPremiumSchool = selectedSchool.schoolTier === 'growth' || selectedSchool.schoolTier === 'pro';
          return Response.json({
            message: extractConciseSummary(rec.content),
            state: currentState,
            briefStatus,
            schools: currentSchools || [],
            familyProfile: conversationFamilyProfile,
            conversationContext: { ...(context || {}), [deepDiveFollowUpKey]: true },
            deepDiveAnalysis: cachedDeepDiveAnalysis,
            visitPrepKit: cachedVisitPrepKit,
            actionPlan: cachedActionPlan,
            tourRequestOffered: isPremiumSchool,
            fromCache: true
          });
        } else {
          console.log('[E30] Cache miss — falling through to fresh generation');
        }
      } catch (cacheErr) {
        console.warn('[E30] Cache read failed (non-blocking):', cacheErr.message);
      }
    }

    // Load upcoming SchoolEvents for this school (non-blocking, best-effort)
    let upcomingEvents = [];
    try {
      const allEvents = await base44.entities.SchoolEvent.filter({ schoolId: selectedSchoolId, isActive: true });
      const now = new Date();
      upcomingEvents = allEvents
        .filter(e => e.date && new Date(e.date).getTime() >= now.getTime())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 5);
      console.log('[DEEPDIVE] Loaded upcoming events:', upcomingEvents.length);
    } catch (evErr) {
      console.warn('[DEEPDIVE] SchoolEvent fetch failed (non-blocking):', evErr.message);
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
      genderPolicy: selectedSchool.genderPolicy || 'Co-ed',
      // E26-S1: Enriched fields for deeper LLM analysis
      curriculumType: selectedSchool.curriculumType || null,
      specializations: selectedSchool.specializations || [],
      avgClassSize: selectedSchool.avgClassSize || null,
      studentTeacherRatio: selectedSchool.studentTeacherRatio || null,
      sportsPrograms: selectedSchool.sportsPrograms?.slice(0, 5) || [],
      artsPrograms: selectedSchool.artsPrograms?.slice(0, 5) || [],
      boardingAvailable: !!(selectedSchool.boardingTuition || selectedSchool.boardingAvailable),
      financialAidAvailable: selectedSchool.financialAidAvailable || false,
      religiousAffiliation: selectedSchool.religiousAffiliation || null,
      enrollment: selectedSchool.enrollment || null,
      description: selectedSchool.description?.substring(0, 300) || null
    };

    // Build event context string for LLM injection
    const subscriptionTier = selectedSchool.subscriptionTier || 'free';
    const schoolContactEmail = selectedSchool.email || null;

    let eventContext = '';
    if (upcomingEvents.length > 0) {
      const eventLines = upcomingEvents.map(e => {
        const confidenceTag = (e.isConfirmed === true) ? '[confirmed]' : '[estimated — verify with school]';
        const dateStr = new Date(e.date).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        const typeLabel = (e.eventType || '').replace(/_/g, ' ');
        const regUrl = e.registrationUrl ? ` | Register: ${e.registrationUrl}` : '';
        return `- ${e.title || typeLabel} (${typeLabel}) — ${dateStr} ${confidenceTag}${regUrl}`;
      });
      eventContext = `UPCOMING EVENTS (${upcomingEvents.length} found):\n${eventLines.join('\n')}`;
    } else {
      eventContext = `UPCOMING EVENTS: None found in our system.`;
    }

    // E32-002b: School ID context block — must be defined before area4Instructions
    const schoolIdContext = currentSchools?.length > 0
      ? `\nSCHOOL IDs (use these exact IDs in execute_ui_action):\n` + currentSchools.map(s => `[ID:${s.id}] ${s.name}`).join('\n')
      : '';

    const area4Instructions = `
AREA 4 — EVENT-AWARE NEXT STEP (include naturally at the end of your response, woven into conversational prose):
${upcomingEvents.length > 0
  ? `There are upcoming events at this school. Mention the nearest one naturally in conversation. Use the confidence tag to set expectations: events tagged [confirmed] can be stated as fact; events tagged [estimated — verify with school] should be presented as "I believe they have..." or "there may be a..." and always suggest verifying directly with the school.${subscriptionTier === 'premium' ? ` This school is a premium partner — you may also offer to send a tour request on the parent's behalf, explaining their priorities will be shared in advance.` : ''}`
  : `No upcoming events are in our system for this school. Use the Honesty Pattern: clearly say you don't have event dates on file, and suggest the parent contact admissions directly.${schoolContactEmail ? ` Their admissions contact is: ${schoolContactEmail}.` : ' Direct them to the school website for contact info.'}`
}
${schoolIdContext}`;

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

Write naturally in conversational prose about why this school fits the family. Cover the student-school alignment (including how the school programs match the child interests, how the learning environment suits their personality and learning style, and whether the school can support any academic struggles or learning differences), any trade-offs or concerns, and the cost reality. Speak like a consultant would—no headers, labels, or formatting markers. Just natural, helpful conversation. End your response with a brief, clear sentence summarizing whether this school is a strong fit for this family and the primary reason why or why not, based on what they shared in their brief.
${area4Instructions}

ACTION INSTRUCTIONS: You have access to the execute_ui_action tool. When the user explicitly asks to shortlist, save, or keep a school, emit ADD_TO_SHORTLIST with the schoolId from the AVAILABLE SCHOOLS list above. When the user asks to see their shortlist, emit OPEN_PANEL with panel='shortlist'. EXPAND_SCHOOL can pair with ADD_TO_SHORTLIST. Do NOT emit REMOVE_FROM_SHORTLIST. Always include a natural text response alongside any actions. If user intent is unclear, respond with text only - no actions. ADD_TO_SHORTLIST timing is 'immediate'. OPEN_PANEL and EXPAND_SCHOOL timing is 'after_message'.`;

    const deepDiveUserPrompt = `FAMILY BRIEF:
- Child: ${childDisplayName}
- Budget: ${resolvedMaxTuition ? '$' + resolvedMaxTuition : 'Not specified'}
- Priorities: ${resolvedPriorities?.join(', ') || 'Not specified'}
- Interests: ${conversationFamilyProfile?.interests?.join(', ') || 'Not specified'}
- Academic Strengths: ${conversationFamilyProfile?.academicStrengths?.join(', ') || 'Not specified'}
- Academic Struggles: ${conversationFamilyProfile?.academicStruggles?.join(', ') || 'Not specified'}
- Learning Style: ${conversationFamilyProfile?.learningStyle || 'Not specified'}
- Personality Traits: ${conversationFamilyProfile?.personalityTraits?.join(', ') || 'Not specified'}
- Learning Differences: ${conversationFamilyProfile?.learningDifferences?.join(', ') || 'None noted'}

SCHOOL DATA:
${JSON.stringify(compressedSchoolData, null, 2)}

SCHOOL SUBSCRIPTION TIER: ${subscriptionTier}

${eventContext}

Generate the DEEPDIVE card for this family-school match.`;

    console.log('[DEEPDIVE] Attempting AI-generated card');

    let deepDiveAnalysis = null;
    const rawToolCalls = [];
    // E32-002b: tools wiring deferred — plain callOpenRouter, no tools param
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

    // E10b: Generate structured analysis in parallel
    let rawAnalysisResponse = null;
    try {
      rawAnalysisResponse = await callOpenRouter({
        systemPrompt: `You are a school analysis engine. Given a consultant's analysis of a school for a specific family, extract structured data. Return ONLY valid JSON matching the schema.`,
        userPrompt: `Consultant's analysis: ${aiMessage}\n\nSchool data: ${JSON.stringify(compressedSchoolData)}\n\nFamily profile: child=${childDisplayName}, budget=${resolvedMaxTuition}, priorities=${resolvedPriorities?.join(', ') || 'None'}, interests=${conversationFamilyProfile?.interests?.join(', ') || 'None'}, academicStrengths=${conversationFamilyProfile?.academicStrengths?.join(', ') || 'None'}, learningStyle=${conversationFamilyProfile?.learningStyle || 'None'}, personalityTraits=${conversationFamilyProfile?.personalityTraits?.join(', ') || 'None'}\n\nIMPORTANT: Every school has trade-offs. You MUST return at least 3 items in tradeOffs[]. For each trade-off, include the dimension name, and either a strength (what this school does well for this family) or a concern (what might not fit), or both. Consider dimensions like: learning support, class size, arts/athletics programs, commute distance, budget fit, academic approach, campus facilities, community culture. If school data is missing for a dimension the family cares about, that itself is a trade-off with concern noting the data gap. Each dimension should appear only once in tradeOffs[]. Do not repeat dimensions. If a dimension has both a strength and a concern, include both in the same trade-off object.\n\nExtract: fitLabel (strong_match/good_match/worth_exploring), fitScore (0-100), tradeOffs (array with dimension, strength, concern, dataSource), dataGaps (array of field names with missing data relevant to this family), visitQuestions (array of 3-5 personalized questions for school visit), financialSummary (tuition, aidAvailable boolean, estimatedNetCost, budgetFit).`,
        maxTokens: 1500,
        temperature: 0.3,
        responseSchema: {
          name: 'school_analysis',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              fitLabel: { type: 'string', enum: ['strong_match', 'good_match', 'worth_exploring'] },
              fitScore: { type: 'number' },
              tradeOffs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['dimension', 'strength', 'concern', 'dataSource'], properties: { dimension: { type: 'string' }, strength: { type: 'string' }, concern: { type: 'string' }, dataSource: { type: 'string' } } } },
              dataGaps: { type: 'array', items: { type: 'string' } },
              visitQuestions: { type: 'array', items: { type: 'string' } },
              financialSummary: { type: 'object', additionalProperties: false, required: ['tuition', 'aidAvailable', 'estimatedNetCost', 'budgetFit'], properties: { tuition: { type: 'number' }, aidAvailable: { type: 'boolean' }, estimatedNetCost: { type: 'number' }, budgetFit: { type: 'string' } } }
            },
            required: ['fitLabel', 'fitScore', 'tradeOffs', 'dataGaps', 'visitQuestions', 'financialSummary']
          }
        }
      });
      deepDiveAnalysis = typeof rawAnalysisResponse === 'object' ? rawAnalysisResponse : JSON.parse(rawAnalysisResponse);
      console.log('[E10b] Structured analysis extracted successfully');

      // Save to SchoolAnalysis entity (non-blocking, fire-and-forget)
      if (userId && selectedSchoolId && deepDiveAnalysis) {
        (async () => {
          try {
            const existing = await base44.entities.SchoolAnalysis.filter({ userId, schoolId: selectedSchoolId });
            if (existing && existing.length > 0) {
              await base44.entities.SchoolAnalysis.update(existing[0].id, { ...deepDiveAnalysis, lastAnalyzedAt: new Date().toISOString() });
              console.log('[E10b] SchoolAnalysis updated:', existing[0].id);
              const prevVisitQuestions = existing[0].visitQuestions;
              if (!prevVisitQuestions || prevVisitQuestions.length === 0) {
                const childName = conversationFamilyProfile?.childName || null;
                const schoolName = selectedSchool.name;
                if (consultantName === 'Jackie') {
                  aiMessage += `\n\nBy the way — I can put together a personalized Visit Prep Kit for ${schoolName}, with specific questions to ask during your tour, things to watch for, and red flags based on everything you've told me about ${childName || 'your child'}. Want me to prepare that?`;
                } else {
                  aiMessage += `\n\nI can prepare a Visit Prep Kit for ${schoolName} — targeted questions, observation checklist, and red flags specific to your priorities. Want me to put that together?`;
                }
              }
            } else {
              const created = await base44.entities.SchoolAnalysis.create({ userId, schoolId: selectedSchoolId, ...deepDiveAnalysis, lastAnalyzedAt: new Date().toISOString() });
              console.log('[E10b] SchoolAnalysis created:', created.id);
              const childName = conversationFamilyProfile?.childName || null;
              const schoolName = selectedSchool.name;
              if (consultantName === 'Jackie') {
                aiMessage += `\n\nBy the way — I can put together a personalized Visit Prep Kit for ${schoolName}, with specific questions to ask during your tour, things to watch for, and red flags based on everything you've told me about ${childName || 'your child'}. Want me to prepare that?`;
              } else {
                aiMessage += `\n\nI can prepare a Visit Prep Kit for ${schoolName} — targeted questions, observation checklist, and red flags specific to your priorities. Want me to put that together?`;
              }
            }
          } catch (persistError) {
            console.warn('[DEEPDIVE] SchoolAnalysis persist failed:', persistError.message);
          }
        })();
      }
    } catch (analysisError) {
      console.error('[E10b] deepDiveAnalysis generation failed:', analysisError.message, 'Raw response:', rawAnalysisResponse);
      if (rawAnalysisResponse && typeof rawAnalysisResponse === 'string') {
        try {
          const stripped = rawAnalysisResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          deepDiveAnalysis = JSON.parse(stripped);
          console.log('[E10b] Fallback JSON.parse succeeded');
        } catch (parseError) {
          console.error('[E10b] Fallback JSON.parse also failed:', parseError.message);
          deepDiveAnalysis = { fitLabel: 'worth_exploring', fitScore: 50, tradeOffs: [], dataGaps: [], visitQuestions: [], financialSummary: null };
        }
      } else {
        deepDiveAnalysis = { fitLabel: 'worth_exploring', fitScore: 50, tradeOffs: [], dataGaps: [], visitQuestions: [], financialSummary: null };
      }
    }

    const aiMessageRaw = aiMessage; // E30-001: snapshot before sanitization
    const sanitizedMessage = aiMessage
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return !/^(DEEPDIVE Card:|Fit Label|Why This School|What to Know|Cost Reality|Dealbreaker Check|Tone Bridge)/.test(trimmed);
      })
      .join('\n')
      .trim();

    // Generate visitPrepKit from deepDiveAnalysis for immediate card rendering
    let generatedVisitPrepKit = null;
    let fullVisitPrepKit = null; // E30-002: hoisted for batch persist
    if (deepDiveAnalysis && selectedSchool) {
      const schoolName = selectedSchool.name;
      const derivedObservations = (deepDiveAnalysis.dataGaps || []).map(gap => `Observe how the school addresses: ${gap}`);
      const derivedRedFlags = (deepDiveAnalysis.tradeOffs || [])
        .filter(t => t.concern)
        .map(t => `Watch for concerns around ${t.dimension}.`);

      fullVisitPrepKit = {
        schoolName,
        visitQuestions: (deepDiveAnalysis.visitQuestions || []).map(q => ({ question: q, priorityTag: 'medium' })),
        observations: derivedObservations,
        redFlags: derivedRedFlags,
        intro: `Here's your personalized Visit Prep Kit for ${schoolName}.`,
        isLocked: false
      };

      // E24-S3-WC1: Gate premium content for non-premium users
      if (!isPremiumUser) {
        generatedVisitPrepKit = {
          schoolName: fullVisitPrepKit.schoolName,
          intro: fullVisitPrepKit.intro,
          visitQuestions: fullVisitPrepKit.visitQuestions.slice(0, 2),
          observations: null,
          redFlags: null,
          isLocked: true
        };
        console.log('[E24-S3-WC1] visitPrepKit gated for non-premium user');
      } else {
        generatedVisitPrepKit = fullVisitPrepKit;
      }

      console.log('[DEEPDIVE] Generated visitPrepKit with', generatedVisitPrepKit.visitQuestions.length, 'questions, isLocked:', generatedVisitPrepKit.isLocked);
    }
    console.log('[DEEPDIVE] deepDiveAnalysis populated:', !!deepDiveAnalysis, 'visitPrepKit populated:', !!generatedVisitPrepKit);

    // E28-S3: Generate action plan artifact (deterministic)
    let generatedActionPlan = null;
    if (deepDiveAnalysis && selectedSchool && userId) {
      const visitWindow = upcomingEvents && upcomingEvents.length > 0
        ? { recommendedAction: `Attend ${upcomingEvents[0].title} on ${new Date(upcomingEvents[0].date).toLocaleDateString('en-CA')}`,
            events: upcomingEvents.map(e => ({ title: e.title, date: e.date, type: e.eventType })) }
        : { recommendedAction: 'Contact admissions to schedule a campus tour', events: [] };

      const docChecklist = [
        { item: 'Report cards (last 2 years)', status: 'pending' },
        { item: 'Teacher reference letter', status: 'pending' },
        { item: 'Standardized test scores (if available)', status: 'pending' }
      ];
      if (selectedSchool.financialAidAvailable) {
        docChecklist.push({ item: 'Financial aid application', status: 'pending' });
      }

      generatedActionPlan = {
        visitTimeline: visitWindow,
        applicationDeadlines: {
          deadline: selectedSchool.applicationDeadline || null,
          financialAidDeadline: selectedSchool.financialAidDeadline || null,
          isEstimated: !selectedSchool.applicationDeadline
        },
        documentChecklist: docChecklist,
        followUpQuestions: deepDiveAnalysis.visitQuestions || [],
        fitSummary: deepDiveAnalysis.fitLabel
      };

      // E30: Batch persist all 3 GeneratedArtifact types with metadata (fire-and-forget)
      (async () => {
        const generatedAt = new Date().toISOString();

        const upsert = async (artifactType, fields) => {
          const existing = await base44.entities.GeneratedArtifact.filter({ userId, schoolId: selectedSchoolId, artifactType });
          if (existing && existing.length > 0) {
            await base44.entities.GeneratedArtifact.update(existing[0].id, { ...fields, generatedAt });
            console.log(`[E30] ${artifactType} updated:`, existing[0].id);
          } else {
            const created = await base44.entities.GeneratedArtifact.create({
              userId, schoolId: selectedSchoolId,
              conversationId: conversationId || '',
              artifactType,
              schoolName: selectedSchool.name,
              generatedAt,
              status: 'active',
              ...fields
            });
            console.log(`[E30] ${artifactType} created:`, created.id);
          }
        };

        const writes = [
          upsert('action_plan', { content: JSON.stringify(generatedActionPlan), isLocked: !isPremiumUser, metadata: { version: 'E30_V1' } }),
          ...(aiMessageRaw ? [upsert('deep_dive_recommendation', { content: sanitizedMessage, metadata: { rawAnalysis: aiMessageRaw, version: 'E30_V1' } })] : []),
          ...(fullVisitPrepKit ? [upsert('visit_prep_kit', { content: JSON.stringify(fullVisitPrepKit), isLocked: false, metadata: { version: 'E30_V1' } })] : [])
        ];

        const results = await Promise.allSettled(writes);
        results.forEach((r, i) => {
          if (r.status === 'rejected') console.warn(`[E30] Write ${i} failed:`, r.reason?.message);
        });
      })();
    }

    // Deterministic follow-up prompt (fit-label based, appended after AI prose)
    let followUpPrompt = '';
    const fitLabel = deepDiveAnalysis?.fitLabel || 'worth_exploring';
    const childName = conversationFamilyProfile?.childName || 'your child';
    const schoolName = selectedSchool?.name || 'this school';
    const deepDiveFollowUpKey = `deepDiveFollowUpShown_${selectedSchoolId}`;
    const alreadyShownFollowUp = context?.[deepDiveFollowUpKey] === true;

    if (deepDiveAnalysis && selectedSchool && !alreadyShownFollowUp) {
      if (!context) context = {};
      context[deepDiveFollowUpKey] = true;

      if (fitLabel === 'strong_match') {
        followUpPrompt = consultantName === 'Jackie'
          ? `\n\n---\n\nBased on everything we've discussed, ${schoolName} looks like a really strong fit for ${childName}. Have you thought about scheduling a visit? I can help you prepare questions to ask during your tour.`
          : `\n\n---\n\n**Bottom line:** ${schoolName} is a strong fit for ${childName}. If you haven't visited yet, that's the next step. I can put together a Visit Prep Kit. Want me to do that?`;
      } else if (fitLabel === 'good_match') {
        followUpPrompt = consultantName === 'Jackie'
          ? `\n\n---\n\n${schoolName} has a lot going for it. Would you like to **compare it side-by-side** with another school? Or if you're leaning toward it, I can help you **prepare for a visit**.`
          : `\n\n---\n\n**Next move:** ${schoolName} is solid but not a slam dunk. **Compare it** against another school, or **prep for a visit**. Your call.`;
      } else if (fitLabel === 'worth_exploring') {
        followUpPrompt = consultantName === 'Jackie'
          ? `\n\n---\n\n${schoolName} has some interesting strengths for ${childName}, though there are a few things worth weighing. Would you like to **compare it side-by-side** with another school on your list?`
          : `\n\n---\n\nThere are some trade-offs here. Want to **compare ${schoolName} against another option**? That usually makes the decision clearer.`;
      } else {
        followUpPrompt = consultantName === 'Jackie'
          ? `\n\n---\n\nBased on what we've discussed, ${schoolName} might not be the strongest match for ${childName}'s needs. Want me to suggest some other schools that might align better with your priorities?`
          : `\n\n---\n\n**Honest take:** ${schoolName} isn't the strongest match. I'd recommend looking at other options. Want me to pull up alternatives?`;
      }
    }

    const conciseMessage = extractConciseSummary(sanitizedMessage);
    const finalMessage = conciseMessage + followUpPrompt;

    // E16a-015: Calculate tourRequestOffered
    const isPremium = selectedSchool.schoolTier === 'growth' || selectedSchool.schoolTier === 'pro';
    const tourRequestOffered = isPremium && upcomingEvents.length > 0;

    console.log('[DEEPDIVE] Returning aiMessage length:', finalMessage?.length);
    return Response.json({
      message: finalMessage,
      state: currentState,
      briefStatus: briefStatus,
      schools: currentSchools || [],
      familyProfile: conversationFamilyProfile,
      conversationContext: { ...context, [deepDiveFollowUpKey]: true },
      deepDiveAnalysis: deepDiveAnalysis,
      visitPrepKit: generatedVisitPrepKit,
      actionPlan: generatedActionPlan,
      tourRequestOffered: tourRequestOffered,
      rawToolCalls: rawToolCalls || []
    });
  } catch (error) {
    console.error('[DEEPDIVE] Fatal error:', error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});