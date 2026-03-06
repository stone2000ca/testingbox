import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const { conversationId } = await req.json();

    // Get conversation
    const conversation = await base44.asServiceRole.entities.ChatHistory.filter({ id: conversationId });
    if (!conversation || conversation.length === 0) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conversation[0]?.userId !== user.id) return Response.json({ error: 'Access denied' }, { status: 403 });

    const messages = conversation[0].messages || [];
    
    // Only summarize if more than 5 messages
    if (messages.length <= 5) {
      return Response.json({ summary: null, message: 'Not enough messages to summarize' });
    }

    // Keep the last 5 messages, summarize the rest
    const recentMessages = messages.slice(-5);
    const oldMessages = messages.slice(0, -5);

    // Check if summary already exists
    const existingSummary = await base44.asServiceRole.entities.ConversationSummary.filter({
      conversationId
    });

    // Create summary of old messages
    const messagesToSummarize = oldMessages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const summaryPrompt = `Summarize this conversation concisely (max 100 words). Focus on key details: child's grade, location preferences, school criteria, and schools discussed.

Conversation:
${messagesToSummarize}

Return a concise summary.`;

    const summary = await base44.integrations.Core.InvokeLLM({
      prompt: summaryPrompt
    });

    // Save or update summary
    if (existingSummary && existingSummary.length > 0) {
      await base44.asServiceRole.entities.ConversationSummary.update(existingSummary[0].id, {
        summary: summary.trim(),
        messageCount: oldMessages.length,
        lastSummarizedAt: new Date().toISOString()
      });
    } else {
      await base44.asServiceRole.entities.ConversationSummary.create({
        userId: conversation[0].userId,
        conversationId,
        summary: summary.trim(),
        messageCount: oldMessages.length,
        lastSummarizedAt: new Date().toISOString()
      });
    }

    // Update conversation to only keep recent messages + reference to summary
    await base44.asServiceRole.entities.ChatHistory.update(conversationId, {
      messages: recentMessages,
      longTermSummary: summary.trim()
    });

    return Response.json({ 
      success: true,
      summary: summary.trim(),
      messagesKept: recentMessages.length,
      messagesSummarized: oldMessages.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});