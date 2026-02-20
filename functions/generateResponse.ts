import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TIMEOUT_MS = 25000;

Deno.serve(async (req) => {
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  );

  const processRequest = async () => {
    try {
      const base44 = createClientFromRequest(req);
      const { 
        message, 
        intent, 
        schools, 
        conversationHistory, 
        conversationContext,
        userNotes,
        shortlistedSchools
      } = await req.json();

      const context = conversationContext || {};
      const history = conversationHistory || [];
      
      // Get last 10 messages for context
      const recentMessages = history.slice(-10);
      const conversationSummary = recentMessages
        .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
        .join('\n');

      // Build school context - ULTRA CONDENSED
      const schoolContext = schools.length > 0 
        ? `\n\nSCHOOLS (${schools.length}):\n` + 
          schools.map(s => 
            `${s.name}|${s.city}|Gr${s.lowestGrade}-${s.highestGrade}|${s.curriculumType||'Trad'}|${s.tuition||'N/A'}`
          ).join('\n')
        : '';
      
      // User notes/shortlist context
      const userContextText = userNotes?.length > 0 || shortlistedSchools?.length > 0
        ? `\n\nUser notes: ${userNotes?.length || 0} notes, Shortlist: ${shortlistedSchools?.length || 0} schools`
        : '';

      // Generate response - ENHANCED PROMPT WITH UX FIXES
      const responsePrompt = `You are a warm, empathetic education consultant helping parents find private schools for their children.

CRITICAL RULES:
1. NEVER recommend special needs schools unless the parent explicitly mentions their child has special needs or learning differences
2. ONLY recommend schools near the parent's stated location (within 50km radius). If there aren't enough local results, tell the parent rather than suggesting distant schools
3. NEVER auto-shortlist schools. Only mention the shortlist if the parent explicitly asks about it or wants to save a school. DO NOT add schools to shortlist automatically.
4. When parents express feeling overwhelmed, acknowledge their emotions and provide structured, step-by-step guidance (e.g., "Here are 3 steps to get started...")
5. Keep responses warm, reassuring, and concise (2-3 sentences when showing schools)
6. When parent asks to COMPARE schools, simply acknowledge their request briefly (e.g., "Sure, I've pulled up a comparison table for you.") The system will automatically show them a comparison table.
7. ABSOLUTELY CRITICAL: When mentioning school names, write them as plain text ONLY - just "Branksome Hall" not "[Branksome Hall](url)". DO NOT use markdown links, URLs, or any link syntax. The system automatically makes school names clickable.

Recent chat:
${conversationSummary}
${schoolContext}${userContextText}

Parent: "${message}"

Reply naturally and empathetically. Describe schools, answer questions, or suggest next steps. Remember: use plain school names only, no links.`;

      const aiResponse = await base44.integrations.Core.InvokeLLM({
        prompt: responsePrompt
      });
      
      let messageWithLinks = aiResponse;
      
      // Replace school names with school:slug links (but avoid double-wrapping existing markdown links)
      if (schools.length > 0) {
        schools.forEach(school => {
          // Escape special regex characters in school name
          const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Match school name ONLY if it's not already inside markdown link syntax
          // Negative lookbehind: not preceded by [
          // Negative lookahead: not followed by ](
          const schoolNameRegex = new RegExp(`(?<!\\[)\\b${escapedName}\\b(?!\\]\\()`, 'gi');
          
          messageWithLinks = messageWithLinks.replace(
            schoolNameRegex,
            `[${school.name}](school:${school.slug})`
          );
        });
      }

      return Response.json({
        message: messageWithLinks
      });
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  };

  try {
    return await Promise.race([processRequest(), timeoutPromise]);
  } catch (error) {
    if (error.message === 'TIMEOUT') {
      return Response.json({ 
        message: 'Here are the schools I found:',
        timeout: true 
      });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});