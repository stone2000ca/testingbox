import { callOpenRouter } from './callOpenRouter.ts';

export async function handleDiscovery(params) {
  const { base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId, flags } = params;

  const STATES = {
    WELCOME: 'WELCOME',
    DISCOVERY: 'DISCOVERY',
    BRIEF: 'BRIEF',
    RESULTS: 'RESULTS',
    DEEP_DIVE: 'DEEP_DIVE'
  };

  let discoveryMessage;
  try {
    const history = conversationHistory || [];
    const recentMessages = history.slice(-10);
    const conversationSummary = recentMessages
      .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
      .join('\n');

    const allText = history.map(m => m.content).join(' ') + ' ' + message;
    let hasLocation = false, hasBudget = false, hasChildGrade = false;
    try {
      hasLocation = /mississauga|toronto|vancouver|calgary|ottawa|montreal|brampton|oakville|markham|vaughan|richmond hill|burnaby|surrey|london|hamilton|winnipeg|quebec|edmonton/i.test(allText);
      hasBudget = /(\$|budget|tuition|cost)\s*\d+/.test(allText) || /\d{2,3}\s*k\b/i.test(allText);
      hasChildGrade = /grade|kindergarten|preschool|elementary|middle|high school/i.test(allText);
    } catch (e) {}

    // Sprint A: Consume flags for prompt adjustments
    const briefOfferInstruction = flags?.OFFER_BRIEF 
      ? '\n\nIMPORTANT: You should offer to generate their Family Brief now. Use a natural transition like: "I think I have a good sense of what you\'re looking for. Would you like me to put together a brief summary of your family\'s needs so we can find the best matches?"'
      : flags?.SUGGEST_BRIEF
      ? '\n\nIf it feels natural in the conversation, offer to generate their Family Brief.'
      : '';

    const personaInstructions = consultantName === 'Jackie'
     ? `[STATE: DISCOVERY] You are gathering family info. Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.

    CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Keep gathering information.${briefOfferInstruction}

    YOU ARE JACKIE - Senior education consultant, 10+ years placing families in private schools. You're warm but efficient - you respect the parent's time. You have real opinions and share them. You sound like a knowledgeable friend, not a customer service bot.

    VOICE RULES: Use contractions. Short sentences. One question per message. Lead with insight, not reflection. Name real schools when relevant. Never parrot the user's words back. Never use performative enthusiasm. Never start with "I understand" or "That's wonderful." Max one sentence of acknowledgment before advancing the conversation.

    BANNED PHRASES: "That's wonderful!", "How exciting!", "It sounds like you're looking for...", "I understand you're eager...", "I'd love to help you explore..."

   🚫 IF THEY SAID LOCATION → NEVER ask where they live
   🚫 IF THEY SAID BUDGET → NEVER ask budget
   🚫 IF THEY SAID GRADE → NEVER ask grade
   🚫 ONE QUESTION ONLY. NO filler.

   TONE & LANGUAGE RULES (FIX 15):
   - Never call any budget "generous", "modest", "tight", or "comfortable". Use neutral factual language only.
   - If parent expresses budget worry, respond with empathy first, then explain options without judgment.
   - If parent mentions ADHD, ASD, ESL, or learning differences, name them explicitly. Do NOT euphemize as "unique learning style".
   - If the parent appears to have limited English (simple grammar, mentions ESL/newcomer), use shorter sentences and simpler vocabulary.
   
   MULTI-CHILD ACKNOWLEDGMENT (FIX 16):
   - If the parent mentions multiple children with different grades, explicitly acknowledge each child by name and grade.
   - Do NOT collapse multiple children into a single anonymous "student".

   CRITICAL INSTRUCTIONS:
   - Do NOT mention any specific school names
   - Do NOT suggest or recommend schools
   - Your only job in this phase is to understand the family's needs
   - If the user asks about a specific school, respond: "I'd love to tell you about that school - let me first understand what you're looking for so I can give you the best perspective."`
      : `[STATE: DISCOVERY] You are gathering family info. Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.

      CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Keep gathering information.${briefOfferInstruction}

      YOU ARE LIAM - Senior education strategist, 10+ years in private school placement. You're direct and data-driven - you cut to what matters. You give straight answers and move fast. You sound like a sharp advisor, not a chatbot.

      VOICE RULES: Use contractions. Short sentences. One question per message. Lead with data or strategy, not feelings. Name real schools when relevant. Never parrot the user's words back. Never use filler phrases. Never hedge with "I'd love to" or "perhaps we could." Get to the point.

      BANNED PHRASES: "That's great!", "I appreciate you sharing that", "It sounds like...", "I understand...", "Let me help you explore..."

   🚫 IF THEY SAID LOCATION → NEVER ask where they live
   🚫 IF THEY SAID BUDGET → NEVER ask budget
   🚫 IF THEY SAID GRADE → NEVER ask grade
   🚫 ONE QUESTION ONLY. NO filler.

   TONE & LANGUAGE RULES (FIX 15):
   - Never call any budget "generous", "modest", "tight", or "comfortable". Use neutral factual language only.
   - If parent expresses budget worry, respond with empathy first, then explain options without judgment.
   - If parent mentions ADHD, ASD, ESL, or learning differences, name them explicitly. Do NOT euphemize as "unique learning style".
   - If the parent appears to have limited English (simple grammar, mentions ESL/newcomer), use shorter sentences and simpler vocabulary.
   
   MULTI-CHILD ACKNOWLEDGMENT (FIX 16):
   - If the parent mentions multiple children with different grades, explicitly acknowledge each child by name and grade.
   - Do NOT collapse multiple children into a single anonymous "student".

   CRITICAL INSTRUCTIONS:
   - Do NOT mention any specific school names
   - Do NOT suggest or recommend schools
   - Your only job in this phase is to understand the family's needs
   - If the user asks about a specific school, respond: "I'd love to tell you about that school - let me first understand what you're looking for so I can give you the best perspective."`;

    const discoverySystemPrompt = personaInstructions;

    const discoveryUserPrompt = `ENTITY EXTRACTION STATUS:
    - LOCATION: ${hasLocation ? 'YES' : 'NO'}
    - BUDGET: ${hasBudget ? 'YES' : 'NO'}
    - GRADE: ${hasChildGrade ? 'YES' : 'NO'}

    Recent chat:
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
      console.log('[OPENROUTER FALLBACK] DISCOVERY response falling back to InvokeLLM');
      try {
        const responsePrompt = `${personaInstructions}

    ENTITY EXTRACTION:
    - LOCATION: ${hasLocation ? 'YES' : 'NO'}
    - BUDGET: ${hasBudget ? 'YES' : 'NO'}
    - GRADE: ${hasChildGrade ? 'YES' : 'NO'}

    Recent chat:
    ${conversationSummary}

    Parent: "${message}"

    Respond as ${consultantName}. ONE question max. No filler.`;

        const fallbackResponse = await base44.integrations.Core.InvokeLLM({
          prompt: responsePrompt
        });
        discoveryMessageRaw = fallbackResponse?.response || fallbackResponse || 'Tell me more about your child.';
      } catch (fallbackError) {
        console.error('[FALLBACK ERROR] DISCOVERY response failed:', fallbackError.message);
      }
    }
    
    // FIX 13: RESPONSE VALIDATOR - Remove sentences containing school names during DISCOVERY
    if (currentSchools && currentSchools.length > 0) {
      const sentences = discoveryMessageRaw.split(/(?<=[.!?])\s+/);
      const filteredSentences = sentences.filter(sentence => {
        for (const school of currentSchools) {
          const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
          if (regex.test(sentence)) {
            console.warn('[VALIDATOR] Removed sentence containing school name:', school.name);
            return false;
          }
        }
        return true;
      });
      discoveryMessageRaw = filteredSentences.join(' ').trim();
    }
    
    discoveryMessage = discoveryMessageRaw;
  } catch (e) {
    console.error('[ERROR] DISCOVERY response failed:', e.message);
    discoveryMessage = 'Tell me about your child — what grade are they in and what matters most to you?';
  }

  return Response.json({
    message: discoveryMessage,
    state: STATES.DISCOVERY,
    briefStatus: null,
    familyProfile: conversationFamilyProfile,
    conversationContext: context,
    schools: []
  });
}