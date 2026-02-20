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
        shortlistedSchools,
        familyProfileData,
        consultantName
      } = await req.json();

      // Handle GENERATE_BRIEF intent
      if (intent === 'GENERATE_BRIEF' && familyProfileData) {
        const { childName, childGrade, locationArea, budgetRange, maxTuition, interests, priorities, dealbreakers, currentSituation, academicStrengths } = familyProfileData;
        
        // Format arrays for the prompt - use them as-is without modification
        const interestsStr = interests?.length > 0 ? interests.join(', ') : '';
        const prioritiesStr = priorities?.length > 0 ? priorities.join(', ') : '';
        const strengthsStr = academicStrengths?.length > 0 ? academicStrengths.join(', ') : '';
        const dealbreakersStr = dealbreakers?.length > 0 ? dealbreakers.join(', ') : '';
        
        const briefPrompt = `You are a warm, empathetic education consultant. Generate "The Brief" - a reflection message that mirrors back EXACTLY what was shared.

====== FAMILY DATA (USE THESE VALUES EXACTLY AS PROVIDED) ======
CHILD'S NAME: ${childName || '(not shared)'}
GRADE: ${childGrade ? `Grade ${childGrade}` : '(not specified)'}
LOCATION: ${locationArea || '(not specified)'}
CURRENT SITUATION: ${currentSituation || '(not shared)'}
ACADEMIC STRENGTHS: ${strengthsStr || '(not specified)'}
INTERESTS: ${interestsStr || '(not specified)'}
FAMILY PRIORITIES: ${prioritiesStr || '(not specified)'}
BUDGET: ${budgetRange || '(not specified)'}${maxTuition ? ` / $${maxTuition}/year` : ''}
DEALBREAKERS: ${dealbreakersStr || '(none mentioned)'}

====== CRITICAL INSTRUCTIONS ======
You MUST use ONLY these exact values in your reflection. Do NOT substitute, expand, interpret, or hallucinate.

FORBIDDEN SUBSTITUTIONS - IF YOU SEE THESE, DO NOT DO THEM:
- If INTERESTS says "art and drama" - DO NOT say "STEM", "science", "math", or anything else
- If LOCATION says "Leaside" - DO NOT say "downtown Toronto", "Toronto", or expand to other areas
- If BUDGET says "$28K" - DO NOT say "$20-25K", "$25,000", or round it differently
- If INTERESTS is "(not specified)" - DO NOT invent interests like "STEM" or "science"
- Do NOT add curriculum types (like "IB") that weren't mentioned

====== GENERATE THE BRIEF ======
1. Open: "Here's what I'm taking away from what you've shared..."
2. Mirror their exact details using their own words. Use the family data field values exactly as shown above.
3. Acknowledge constraints realistically.
4. Close: "Does that capture what you're looking for? Anything I'm missing or needs adjustment?"

Keep to 2-3 paragraphs. Sound warm and empathetic. NO school names.`;

        try {
          const briefResult = await base44.integrations.Core.InvokeLLM({
            prompt: briefPrompt,
            add_context_from_internet: false
          });
          
          return Response.json({
            message: briefResult
          });
        } catch (error) {
          console.error('Brief generation error:', error);
          return Response.json({
            message: `Here's what I'm taking away: ${childName ? `${childName} is in Grade ${childGrade}` : `Your child is in Grade ${childGrade}`}${currentSituation ? ` and ${currentSituation}` : ''}. Your family is looking in the ${locationArea} area${budgetRange || maxTuition ? ` with a budget of ${maxTuition ? `$${maxTuition}/year` : budgetRange}` : ''}${interestsStr ? `, and ${childName || 'they'} is interested in ${interestsStr}` : ''}. Does that capture it? Anything I should adjust?`
          });
        }
      }

      // HALLUCINATION FIX: If no schools, return "no matches" message immediately without AI call
      if (!schools || schools.length === 0) {
        return Response.json({
          message: "I don't have any schools in our database that match your criteria yet. Our database is growing - please try a nearby city or broader search criteria."
        });
      }

      const context = conversationContext || {};
      const history = conversationHistory || [];

      // Format grade helper
      function formatGrade(grade) {
        if (grade === null || grade === undefined) return '';
        const num = Number(grade);
        if (num <= -2) return 'PK';
        if (num === -1) return 'JK';
        if (num === 0) return 'K';
        return String(num);
      }

      function formatGradeRange(gradeFrom, gradeTo) {
        const from = formatGrade(gradeFrom);
        const to = formatGrade(gradeTo);
        if (!from && !to) return '';
        if (!from) return to;
        if (!to) return from;
        return `${from}-${to}`;
      }
      
      // Get last 10 messages for context
      const recentMessages = history.slice(-10);
      const conversationSummary = recentMessages
        .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
        .join('\n');

      // Build school context with full details including tuition and school type
      const schoolContext = schools.length > 0 
        ? `\n\nSCHOOLS (${schools.length}):\n` + 
          schools.map(s => {
            const tuitionStr = s.tuition ? `$${s.tuition} ${s.currency || 'CAD'}` : 'N/A';
            return `${s.name}|${s.city}|Gr${formatGradeRange(s.lowestGrade, s.highestGrade)}|${s.curriculumType||'Trad'}|Tuition: ${tuitionStr}|Type: ${s.schoolType||'General'}`;
          }).join('\n')
        : '';
      
      // User notes/shortlist context
      const userContextText = userNotes?.length > 0 || shortlistedSchools?.length > 0
        ? `\n\nUser notes: ${userNotes?.length || 0} notes, Shortlist: ${shortlistedSchools?.length || 0} schools`
        : '';

      // Generate response - ENHANCED PROMPT WITH ALL BUG FIXES
      const responsePrompt = `You are a warm, empathetic education consultant helping parents find PRIVATE SCHOOLS for their children across Canada, the US, and Europe.

CRITICAL RULES - DO NOT BREAK THESE:
1. ONLY RECOMMEND PRIVATE/INDEPENDENT SCHOOLS. NEVER recommend public schools under any circumstances.
2. **CRITICAL: You must ONLY recommend schools from the provided schools array below.** NEVER invent, fabricate, or make up school names, locations, or tuition amounts. Do not suggest schools you're not 100% certain are in the database. Only mention schools that appear in the SCHOOLS section.
3. RESPECT GENDER PREFERENCES - If a parent asks for co-ed, all-boys, or all-girls schools, only recommend schools that match that type. Pay attention to school descriptions and specializations.
4. NEVER recommend special needs schools unless the parent explicitly mentions their child has special needs or learning differences
5. ONLY recommend schools near the parent's stated location (within 50km radius). If there aren't enough local results, tell the parent rather than suggesting distant schools
6. NEVER auto-shortlist schools. Only mention the shortlist if the parent explicitly asks about it or wants to save a school. DO NOT add schools to shortlist automatically.
7. ALWAYS INCLUDE TUITION INFORMATION when describing schools. Include the dollar amount and currency (e.g., "$30,000 CAD per year")
8. When parents express feeling overwhelmed, acknowledge their emotions and provide structured, step-by-step guidance (e.g., "Here are 3 steps to get started...")
9. Keep responses warm, reassuring, and concise (2-3 sentences when showing schools)
10. When parent asks to COMPARE schools, simply acknowledge their request briefly (e.g., "Sure, I've pulled up a comparison table for you.") The system will automatically show them a comparison table.
11. SCHOOL LINK FORMAT - When mentioning school names, write them as plain text ONLY (e.g., "Branksome Hall" not "[Branksome Hall](url)"). NEVER use http/https URLs or external links for schools. The system will automatically convert school names to clickable links.
12. PROFESSIONAL TONE - NEVER use overly casual or cringe words like "lovely", "wonderful", "amazing", "fantastic", "awesome", "fabulous". Use professional, warm but neutral language instead. Say "Here are some private schools" not "Here are some lovely private schools".

Recent chat:
${conversationSummary}
${schoolContext}${userContextText}

Parent: "${message}"

Reply naturally and empathetically. Describe schools, answer questions, or suggest next steps. Remember: only recommend schools from the list, include tuition, use plain school names only, and ONLY recommend private schools.`;

      const aiResponse = await base44.integrations.Core.InvokeLLM({
        prompt: responsePrompt
      });
      
      let messageWithLinks = aiResponse;
      
      // Replace school names with school:slug links
      if (schools.length > 0) {
        // First: Convert any existing markdown links [SchoolName](url) to school:slug format
        // This handles cases where AI might generate [SchoolName](https://...) despite instructions
        schools.forEach(school => {
          const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const markdownLinkRegex = new RegExp(`\\[${escapedName}\\]\\([^)]+\\)`, 'gi');
          messageWithLinks = messageWithLinks.replace(
            markdownLinkRegex,
            `[${school.name}](school:${school.slug})`
          );
        });
        
        // Second: Convert plain school names to school:slug links (if not already a link)
        schools.forEach(school => {
          const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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