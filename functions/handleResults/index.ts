import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// --- INLINED callOpenRouter (Base44 Deno functions cannot import across files) ---
async function callOpenRouter(options) {
  const { systemPrompt, userPrompt, responseSchema, maxTokens = 1000, temperature = 0.7 } = options;
  
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) {
    console.warn('[OPENROUTER] OPENROUTER_API_KEY not set - will fall back to InvokeLLM');
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
// --- END INLINED callOpenRouter ---

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, selectedSchoolId, userLocation, region, conversationId, userId } = await req.json();

    const STATES = {
      WELCOME: 'WELCOME',
      DISCOVERY: 'DISCOVERY',
      BRIEF: 'BRIEF',
      RESULTS: 'RESULTS',
      DEEP_DIVE: 'DEEP_DIVE'
    };

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

    const searchParams = {
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
            return `${s.name} | ${s.city} | Grade ${s.lowestGrade}-${s.highestGrade} | Tuition: ${tuitionStr}`;
          }).join('\n');
        
        const resultsSystemPrompt = `[STATE: RESULTS] Explain these school matches. Focus on fit. Do NOT ask intake questions. Max 150 words.

${consultantName === 'Jackie' ? 'YOU ARE JACKIE - Warm, empathetic.' : 'YOU ARE LIAM - Direct, strategic.'}`;

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
      state: updatedCurrentState,
      briefStatus: 'confirmed',
      schools: matchingSchools,
      familyProfile: conversationFamilyProfile,
      conversationContext: context
    });
  } catch (error) {
    console.error('[ERROR] RESULTS handler failed:', error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});
