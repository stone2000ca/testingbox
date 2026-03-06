import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const { conversationId } = await req.json();

    // Get conversation
    const conversations = await base44.entities.ChatHistory.filter({ id: conversationId });
    if (!conversations || conversations.length === 0) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conversations[0]?.userId !== user.id) return Response.json({ error: 'Access denied' }, { status: 403 });

    const conversation = conversations[0];
    const messages = conversation.messages || [];

    // Build conversation text
    const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    // Generate summary with AI
    const summaryPrompt = `Analyze this school search conversation and extract:

1. Long-term summary: Key facts about their search (child details, must-haves, deal-breakers, budget, location)
2. Short-term context: Last 8 key points from recent messages (what they just discussed/decided)
3. Preferences: Extract specific criteria
4. Behavioral patterns: What they click on, hesitate about, prioritize

Conversation:
${conversationText}

Return JSON with:
{
  "longTermSummary": "concise summary of overall search",
  "shortTermContext": ["point 1", "point 2", ...up to 8],
  "extractedPreferences": {
    "childGrade": number or null,
    "location": "string or null",
    "priorities": ["array"],
    "region": "Canada|US|Europe or null"
  }
}`;

    const summary = await base44.integrations.Core.InvokeLLM({
      prompt: summaryPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          longTermSummary: { type: "string" },
          shortTermContext: {
            type: "array",
            items: { type: "string" }
          },
          extractedPreferences: {
            type: "object",
            properties: {
              childGrade: { type: ["number", "null"] },
              location: { type: ["string", "null"] },
              priorities: {
                type: "array",
                items: { type: "string" }
              },
              region: { type: ["string", "null"] }
            }
          }
        }
      }
    });

    // Update conversation
    await base44.asServiceRole.entities.ChatHistory.update(conversationId, {
      longTermSummary: summary.longTermSummary,
      shortTermContext: summary.shortTermContext,
      conversationContext: {
        ...conversation.conversationContext,
        ...summary.extractedPreferences
      }
    });

    return Response.json(summary);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});