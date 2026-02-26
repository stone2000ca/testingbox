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
    const { selectedSchoolId, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId } = await req.json();

    const STATES = {
      WELCOME: 'WELCOME',
      DISCOVERY: 'DISCOVERY',
      BRIEF: 'BRIEF',
      RESULTS: 'RESULTS',
      DEEP_DIVE: 'DEEP_DIVE'
    };

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
    
    const systemPrompt = `You are ${consultantName}, an education consultant helping families find the right private school.

${consultantName === 'Jackie' 
  ? "JACKIE PERSONA: Warm, empathetic, supportive." 
  : "LIAM PERSONA: Direct, strategic, no-BS."}

OUTPUT FORMAT - DEEPDIVE Card with 6 areas:
1. Fit Label
2. Why This School
3. What to Know
4. Cost Reality
5. Dealbreaker Check
6. Tone Bridge`;

    const userPrompt = `FAMILY BRIEF:
- Child: ${childDisplayName}
- Budget: ${resolvedMaxTuition ? '$' + resolvedMaxTuition : 'Not specified'}
- Priorities: ${resolvedPriorities?.join(', ') || 'Not specified'}

SCHOOL DATA:
${JSON.stringify(compressedSchoolData, null, 2)}

Generate the DEEPDIVE card for this family-school match.`;

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
        console.log('[DEEPDIVE] AI card generated successfully');
        aiMessage = aiGeneratedCard;
      }
    } catch (llmError) {
      console.error('[DEEPDIVE] OpenRouter failed:', llmError.message);
      aiMessage = `**Great Fit for ${childDisplayName}**\n\n**Why ${selectedSchool.name} for ${childDisplayName}**\n${selectedSchool.description?.substring(0, 150) || 'School details available upon request.'}\n\n**Cost Reality**\nTuition: ${compressedSchoolData.tuitionFee}/year\n\nWhat would you like to know more about?`;
    }

    console.log('[DEEPDIVE] Returning aiMessage length:', aiMessage?.length);
    return Response.json({
      message: aiMessage,
      state: currentState,
      briefStatus: briefStatus,
      schools: selectedSchool ? [selectedSchool] : [],
      familyProfile: conversationFamilyProfile,
      conversationContext: context
    });
  } catch (error) {
    console.error('[ERROR] DEEPDIVE handler failed:', error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});
