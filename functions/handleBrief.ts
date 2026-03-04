// Function: handleBrief
// Purpose: Handle the BRIEF state — generate family brief summary for Jackie (LLM) and Liam (deterministic), including brief editing flow
// Entities: FamilyProfile (read via passed payload, no direct DB writes)
// Last Modified: 2026-03-03
// Dependencies: OpenRouter API (callOpenRouter), base44.integrations.Core.InvokeLLM (fallback)

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
// MAIN: Deno.serve — handleBrief
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
      flags,
      returningUserContextBlock
    } = await req.json();

    let conversationFamilyProfile = rawProfile || {};
    let context = rawContext || {};

    const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };
    const BRIEF_STATUS = { GENERATING: 'generating', PENDING_REVIEW: 'pending_review', EDITING: 'editing', CONFIRMED: 'confirmed' };

    let msgLower = (message || '').toLowerCase();
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
    }

    if (context.extractedEntities) {
       for (const [key, value] of Object.entries(context.extractedEntities)) {
         if (value !== null && value !== undefined) {
           const existing = conversationFamilyProfile[key];
           // Merge/append for arrays; replace only if current is empty
           if (Array.isArray(value)) {
             const currentArray = Array.isArray(existing) ? existing : [];
             // Merge arrays, removing duplicates
             const merged = [...new Set([...currentArray, ...value])];
             conversationFamilyProfile[key] = merged;
           } else if (existing === null || existing === undefined || (Array.isArray(existing) && existing.length === 0)) {
             // Only replace scalar values if current is empty
             conversationFamilyProfile[key] = value;
           }
         }
       }
     }

    try {
      const { childName, childGrade, locationArea, interests, priorities, dealbreakers } = conversationFamilyProfile;
      // BUG-ENT-005 FIX: Check context.extractedEntities for maxTuition if not in FamilyProfile
      let maxTuition = conversationFamilyProfile.maxTuition;
      if ((!maxTuition || maxTuition === null || maxTuition === undefined) && context.extractedEntities?.maxTuition) {
        maxTuition = context.extractedEntities.maxTuition;
        console.log('[BRIEF] Using extracted maxTuition:', maxTuition);
      }
      const interestsStr = Array.isArray(interests) && interests.length > 0 ? interests.join(', ') : '';
      const prioritiesStr = priorities?.length > 0 ? priorities.join(', ') : '';
      const dealbreakersStr = dealbreakers?.length > 0 ? dealbreakers.join(', ') : '';

      let budgetDisplay = '(not specified)';
      if (maxTuition === 'unlimited') {
        budgetDisplay = 'Budget is flexible';
      } else if (maxTuition && typeof maxTuition === 'number') {
        budgetDisplay = `$${maxTuition.toLocaleString()}/year`;
      }

      const briefChildGenderLabel = conversationFamilyProfile?.gender === 'male'
        ? 'Your son'
        : conversationFamilyProfile?.gender === 'female'
        ? 'Your daughter'
        : 'Your child';
      let briefChildDisplayName = childName ? childName : briefChildGenderLabel;

      const jackieBriefSystemPrompt = `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}[STATE: BRIEF] You are Jackie, a warm and experienced education consultant. Generate a brief summary of what the family has shared. Use ONLY what was explicitly stated by the parent.

    CRITICAL RULES:
    - Start with a warm, natural conversational sentence (1-2 sentences) acknowledging the family's situation before the numbered summary.
    - Do NOT invent personality traits, motivations, or character descriptions that were not explicitly stated by the parent.
    - If no personality was described, skip that section entirely.
    - End with: "Does that capture it? Anything to adjust?"

    YOU ARE JACKIE — warm, empathetic, experienced.`;

      const jackieBriefUserPrompt = `Generate the family brief summary.

FAMILY DATA:
- CHILD: ${briefChildDisplayName}
- GRADE: ${childGrade !== null && childGrade !== undefined ? 'Grade ' + childGrade : '(not specified)'}
- LOCATION: ${locationArea || '(not specified)'}
- BUDGET: ${budgetDisplay}
- PRIORITIES: ${prioritiesStr || '(not specified)'}
- INTERESTS: ${interestsStr || '(not specified)'}
- DEALBREAKERS: ${dealbreakersStr || '(not specified)'}

Format:
- Open with a warm 1-2 sentence intro
- Then a numbered list:
  1. ${briefChildDisplayName}: ${childGrade !== null && childGrade !== undefined ? 'Grade ' + childGrade : '(not specified)'}
  2. Location: ${locationArea || '(not specified)'}
  3. Budget: ${budgetDisplay}
  ${prioritiesStr ? '4. Top priorities: ' + prioritiesStr : ''}
  ${interestsStr ? '5. Interests: ' + interestsStr : ''}
  ${dealbreakersStr ? '6. Dealbreakers: ' + dealbreakersStr : ''}
- End with: "Does that capture it? Anything to adjust?"`;

      const liamBriefSystemPrompt = `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}[STATE: BRIEF] You are Liam, a direct and strategic education consultant. Generate a brief summary of what the family has shared. Use ONLY what was explicitly stated by the parent.

FORMATTING RULES — CRITICAL:
- Start with one short direct sentence (e.g. "Here's what I've got so far:")
- Then format each field as a markdown bullet list using "- " prefix, one field per line
- Use **bold** for field labels. Example: "- **Child:** Emma, Grade 7"
- End with: "Does that look right? Anything to change?"

YOU ARE LIAM — direct, strategic, no fluff.`;

      const liamBriefUserPrompt = `Generate the family brief summary.

FAMILY DATA:
- CHILD: ${briefChildDisplayName}
- GRADE: ${childGrade !== null && childGrade !== undefined ? 'Grade ' + childGrade : '(not specified)'}
- LOCATION: ${locationArea || '(not specified)'}
- BUDGET: ${budgetDisplay}
- PRIORITIES: ${prioritiesStr || '(not specified)'}
- INTERESTS: ${interestsStr || '(not specified)'}
- DEALBREAKERS: ${dealbreakersStr || '(not specified)'}

Format as a markdown bullet list with one field per line. Start the child field with "${briefChildDisplayName}:".`;

      let briefMessageText = "Let me summarize what you've shared.";

      if (consultantName === 'Liam') {
        // DETERMINISTIC brief for Liam — LLM ignores markdown formatting, so build it ourselves
        const briefLines = ["Here's what I've put together so far:\n"];
        const childLabel = conversationFamilyProfile?.gender === 'male'
          ? 'Your son'
          : conversationFamilyProfile?.gender === 'female'
          ? 'Your daughter'
          : 'Your child';
        const childDisplay = childName ? childName : childLabel;
        if (childName || childGrade !== null && childGrade !== undefined) {
          briefLines.push(`- **Child:** ${childDisplay}${childGrade !== null && childGrade !== undefined ? ', Grade ' + childGrade : ''}`);
        }
        if (locationArea) briefLines.push(`- **Location:** ${locationArea}`);
        if (maxTuition) {
          const budgetStr = maxTuition === 'unlimited' ? 'Flexible' : `Up to $${Number(maxTuition).toLocaleString()}`;
          briefLines.push(`- **Budget:** ${budgetStr}`);
        }
        if ((priorities || []).length > 0) briefLines.push(`- **Priorities:** ${(priorities || []).join(', ')}`);
        if ((interests || []).length > 0) briefLines.push(`- **Interests:** ${(interests || []).join(', ')}`);
        if ((dealbreakers || []).length > 0) briefLines.push(`- **Dealbreakers:** ${(dealbreakers || []).join(', ')}`);
        briefLines.push("\nDoes that look right? Anything to change?");
        briefMessageText = briefLines.join('\n');
        console.log('[BRIEF] Liam brief built deterministically');
      } else {
        // Jackie: LLM-generated with programmatic fallback
        const childLabel = conversationFamilyProfile?.gender === 'male'
          ? 'Your son'
          : conversationFamilyProfile?.gender === 'female'
          ? 'Your daughter'
          : 'Your child';
        const childDisplay = childName ? childName : childLabel;
        const programmaticFallback = [
          "Here's what I'm hearing from you so far:\n",
          childName || childGrade !== null && childGrade !== undefined ? `- **Child:** ${childDisplay}${childGrade !== null && childGrade !== undefined ? ', Grade ' + childGrade : ''}` : null,
          locationArea ? `- **Location:** ${locationArea}` : null,
          maxTuition ? `- **Budget:** ${maxTuition === 'unlimited' ? 'Flexible' : `Up to $${Number(maxTuition).toLocaleString()}`}` : null,
          (priorities || []).length > 0 ? `- **Priorities:** ${(priorities || []).join(', ')}` : null,
          (interests || []).length > 0 ? `- **Interests:** ${(interests || []).join(', ')}` : null,
          (dealbreakers || []).length > 0 ? `- **Dealbreakers:** ${(dealbreakers || []).join(', ')}` : null,
          "\nDoes that capture it? Anything to adjust?"
        ].filter(line => line !== null).join('\n');
        
        try {
          const briefResult = await callOpenRouter({
            systemPrompt: jackieBriefSystemPrompt,
            userPrompt: jackieBriefUserPrompt,
            maxTokens: 800,
            temperature: 0.5
          });
          briefMessageText = briefResult || programmaticFallback;
        } catch (openrouterError) {
          console.log('[BRIEF] OpenRouter failed for Jackie, using programmatic fallback');
          briefMessageText = programmaticFallback;
        }
      }
      briefMessage = briefMessageText;
    } catch (e) {
      console.error('[ERROR] All BRIEF generation failed:', e.message);
      briefMessage = "Let me summarize what you've shared.";
    }

    if (updatedBriefStatus === BRIEF_STATUS.GENERATING) {
      updatedBriefStatus = BRIEF_STATUS.PENDING_REVIEW;
      console.log('[BRIEF GENERATED] Set briefStatus to pending_review');
    }

    const updatedCtx = { ...context, briefStatus: updatedBriefStatus };

    return Response.json({
      message: briefMessage,
      state: STATES.BRIEF,
      briefStatus: updatedBriefStatus,
      familyProfile: conversationFamilyProfile,
      conversationContext: updatedCtx,
      schools: []
    });

  } catch (error) {
    console.error('[handleBrief] FATAL:', error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});