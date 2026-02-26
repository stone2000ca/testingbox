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
        ? `You are Jackie, a warm and encouraging education consultant. The parent wants to adjust something in their brief. Ask them a warm, open-ended question about what they'd like to change. Max 50 words.`
        : `You are Liam, a direct and strategic education consultant. The parent wants to adjust their brief. Ask them directly what needs to change. Max 50 words.`;

      const adjustUserPrompt = `The parent message was: "${message}"\n\nAsk what needs adjustment in their brief.`;

      let adjustMessage = "What would you like to adjust?";
      try {
        const adjustResponse = await callOpenRouter({
          systemPrompt: adjustSystemPrompt,
          userPrompt: adjustUserPrompt,
          maxTokens: 300,
          temperature: 0.5
        });
        adjustMessage = adjustResponse || "What would you like to adjust?";
      } catch (openrouterError) {
        try {
          const fallbackResponse = await base44.integrations.Core.InvokeLLM({
            prompt: adjustSystemPrompt
          });
          adjustMessage = fallbackResponse?.response || fallbackResponse || "What would you like to adjust?";
        } catch (fallbackError) {
          console.error('[FALLBACK ERROR] BRIEF adjustment failed:', fallbackError.message);
        }
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

• Student: ${briefChildDisplayName}
• Location: ${locationArea || '(not specified)'}
• Budget: ${budgetDisplay}
${prioritiesStr ? '• Top priorities: ' + prioritiesStr + '\n' : ''}${interestsStr ? '• Interests: ' + interestsStr + '\n' : ''}${dealbreakersStr ? '• Dealbreakers: ' + dealbreakersStr + '\n' : ''}
Does that capture it? Anything to adjust?

YOU ARE JACKIE.`
        : `[STATE: BRIEF] Generate a factual brief summary. Use ONLY what was explicitly stated by the parent.

FAMILY DATA:
- CHILD: ${briefChildDisplayName}
- GRADE: ${childGrade || '(not specified)'}
- LOCATION: ${locationArea || '(not specified)'}
- BUDGET: ${budgetDisplay}

Format as structured bullet list. Be direct.

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
          const briefResult = await base44.integrations.Core.InvokeLLM({
            prompt: briefPrompt
          });
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

    return Response.json({
      message: briefMessage,
      state: STATES.BRIEF,
      briefStatus: updatedBriefStatus,
      familyProfile: conversationFamilyProfile,
      conversationContext: context,
      schools: []
    });
  } catch (error) {
    console.error('[ERROR] BRIEF handler failed:', error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});
