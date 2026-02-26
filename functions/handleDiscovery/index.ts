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
    const { message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, flags } = await req.json();

    const STATES = {
      WELCOME: 'WELCOME',
      DISCOVERY: 'DISCOVERY',
      BRIEF: 'BRIEF',
      RESULTS: 'RESULTS',
      DEEP_DIVE: 'DEEP_DIVE'
    };

    let discoveryMessage;
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

    const personaInstructions = consultantName === 'Jackie'
      ? `[STATE: DISCOVERY] You are gathering family info. Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.

CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Keep gathering information.${briefOfferInstruction}

YOU ARE JACKIE - Senior education consultant, 10+ years placing families in private schools. You're warm but efficient.`
      : `[STATE: DISCOVERY] You are gathering family info. Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.

CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Keep gathering information.${briefOfferInstruction}

YOU ARE LIAM - Senior education strategist, 10+ years in private school placement. You're direct and data-driven.`;

    const discoverySystemPrompt = personaInstructions;
    const discoveryUserPrompt = `Recent chat:
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
      console.log('[OPENROUTER FALLBACK] DISCOVERY falling back to InvokeLLM');
      try {
        const responsePrompt = `${personaInstructions}\n\nRecent chat:\n${conversationSummary}\n\nParent: "${message}"\n\nRespond as ${consultantName}. ONE question max.`;
        const fallbackResponse = await base44.integrations.Core.InvokeLLM({
          prompt: responsePrompt
        });
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
          if (regex.test(sentence)) {
            return false;
          }
        }
        return true;
      });
      discoveryMessageRaw = filteredSentences.join(' ').trim();
    }
    
    discoveryMessage = discoveryMessageRaw;

    return Response.json({
      message: discoveryMessage,
      state: STATES.DISCOVERY,
      briefStatus: null,
      familyProfile: conversationFamilyProfile,
      conversationContext: context,
      schools: []
    });
  } catch (error) {
    console.error('[ERROR] DISCOVERY handler failed:', error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});
