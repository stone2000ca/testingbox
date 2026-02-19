import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { message, conversationHistory, conversationContext, region, userId } = await req.json();

    const context = conversationContext || {};
    const history = conversationHistory || [];
    
    // Get last 10 messages for context
    const recentMessages = history.slice(-10);
    const conversationSummary = recentMessages
      .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
      .join('\n');

    // Build AI prompt with Socratic coaching persona
    const systemPrompt = `You are an experienced education consultant helping parents find the right private school for their child across Canada, the US, and Europe.

PERSONA: You are warm but professional, like a trusted advisor. You use Socratic questioning to help parents discover what truly matters for their child. You never sell schools - you guide discovery. You gently challenge assumptions ("Many parents prioritize X, but have you considered Y?"). You keep responses to 2-4 sentences, always ending with a probing question or clear next step.

CONVERSATION CONTEXT:
${conversationSummary || 'This is the start of a new conversation.'}

CURRENT STATE:
- Child grade: ${context.childGrade || 'unknown'}
- Location interest: ${context.location || 'not specified'}
- Region preference: ${context.region || region || 'not specified'}
- Stated priorities: ${context.priorities?.join(', ') || 'none identified yet'}
- Schools viewed: ${context.viewedSchools?.length || 0}
- Shortlisted: ${context.shortlist?.length || 0}

TASK: Analyze the parent's message and:
1. Classify the intent
2. Generate a consultant-style response (2-4 sentences ending with a question)
3. Determine what action to take (if any)

INTENT OPTIONS:
- SHOW_SCHOOLS: They want to see matching schools
- NARROW_DOWN: They need to refine criteria (ask clarifying questions)
- COMPARE_SCHOOLS: They want to compare specific schools
- VIEW_DETAIL: They want details on a specific school
- UPDATE_PREFERENCES: They're stating new preferences
- ASK_QUESTION: General question about schools/process
- MANAGE_SHORTLIST: Add/remove from shortlist
- NO_ACTION: Just chatting/greeting

RESPONSE FORMAT (JSON):
{
  "message": "Your 2-4 sentence consultant response ending with a question or next step",
  "intent": "SHOW_SCHOOLS|NARROW_DOWN|etc",
  "command": {
    "action": "search_schools|compare|view_detail|null",
    "params": {filters or school IDs},
    "reasoning": "Brief explanation of why this action"
  },
  "shouldShowSchools": true/false,
  "filterCriteria": {optional filters if SHOW_SCHOOLS}
}

Parent's message: "${message}"

Respond with JSON only.`;

    // Call AI for intent classification and response generation
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: systemPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          message: { type: "string" },
          intent: { type: "string" },
          command: {
            type: "object",
            properties: {
              action: { type: "string" },
              params: { type: "object" },
              reasoning: { type: "string" }
            }
          },
          shouldShowSchools: { type: "boolean" },
          filterCriteria: { type: "object" }
        },
        required: ["message", "intent"]
      }
    });

    // If intent is SHOW_SCHOOLS, call searchSchools to get actual results
    let schoolIds = [];
    if (aiResponse.shouldShowSchools && aiResponse.filterCriteria) {
      try {
        const searchResult = await base44.functions.invoke('searchSchools', {
          ...aiResponse.filterCriteria,
          region: aiResponse.filterCriteria.region || region
        });
        
        if (searchResult.data?.schools) {
          schoolIds = searchResult.data.schools.map(s => s.id);
        }
      } catch (error) {
        console.error('Search failed:', error);
      }
    }

    return Response.json({
      message: aiResponse.message,
      intent: aiResponse.intent,
      command: aiResponse.command,
      schoolIds,
      shouldShowSchools: aiResponse.shouldShowSchools || false,
      filterCriteria: aiResponse.filterCriteria || null
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});