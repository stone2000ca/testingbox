// Function: generateProfileNarrative
// Purpose: Generate AI narrative for ChatSession profile after edits
// Entities: ChatSession
// Last Modified: 2026-03-01
// Dependencies: OpenRouter API

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function callOpenRouter(options) {
  const { systemPrompt, userPrompt, maxTokens = 1000, temperature = 0.7 } = options;
  
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set');
  }
  
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });
  
  const body = {
    models: ['google/gemini-2.5-flash', 'openai/gpt-4.1-mini'],
    messages,
    max_tokens: maxTokens,
    temperature
  };
  
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
    throw new Error(`OpenRouter error: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenRouter');
  
  return content;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { sessionId, familyProfile } = await req.json();

    if (!sessionId || !familyProfile) {
      return Response.json({ error: 'Missing sessionId or familyProfile' }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate narrative
    const { childName, childGrade, locationArea, maxTuition, priorities, learningDifferences, commuteToleranceMinutes } = familyProfile;
    
    const budgetDisplay = maxTuition ? `$${(maxTuition / 1000).toFixed(0)}K/year` : 'not specified';
    const prioritiesDisplay = priorities?.length > 0 ? priorities.join(', ') : 'none specified';
    const specialNeedsDisplay = learningDifferences?.length > 0 ? learningDifferences.join(', ') : 'none';
    const commuteDisplay = commuteToleranceMinutes ? `${commuteToleranceMinutes} minutes` : 'flexible';
    
    const narrativePrompt = `Write a 2-3 sentence narrative about this child for their School Search Profile. Be warm, professional, and personal. Reference the specific data provided.

Child: ${childName || 'Not named yet'}
Grade: ${childGrade !== null && childGrade !== undefined ? 'Grade ' + childGrade : 'not specified'}
Location: ${locationArea || 'not specified'}
Budget: ${budgetDisplay}
Priorities: ${prioritiesDisplay}
Special needs: ${specialNeedsDisplay}
Commute preference: ${commuteDisplay}`;

    let aiNarrative = await callOpenRouter({
      systemPrompt: 'You are a skilled education consultant writing warm, personalized school profile narratives. Keep it 2-3 sentences max.',
      userPrompt: narrativePrompt,
      maxTokens: 300,
      temperature: 0.7
    });

    // Update ChatSession with new narrative
    await base44.entities.ChatSession.update(sessionId, { aiNarrative });

    console.log('[generateProfileNarrative] Updated ChatSession narrative');

    return Response.json({ success: true, narrative: aiNarrative });
  } catch (error) {
    console.error('[generateProfileNarrative] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});