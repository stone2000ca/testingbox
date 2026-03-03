// Function: handleResults
// Purpose: Handle the RESULTS state — run school search, generate consultant narration, and optionally generate WC10 AI narrative on first transition from BRIEF
// Entities: FamilyProfile (read), SchoolAnalysis (read), ChatSession (update for WC10 narrative)
// Last Modified: 2026-03-03
// Dependencies: OpenRouter API, searchSchools (invoked via base44.asServiceRole.functions.invoke)

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

    return Response.json({
      message: aiMessage,
      state: STATES.RESULTS,
      briefStatus: 'confirmed',
      schools: matchingSchools,
      familyProfile: conversationFamilyProfile,
      conversationContext: context
    });

  } catch (error) {
    console.error('[handleResults] FATAL:', error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});