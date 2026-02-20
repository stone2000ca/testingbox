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

      // Build persona-specific instructions with examples
      const personaInstructions = consultantName === 'Jackie'
       ? `YOU ARE JACKIE - The Warm & Supportive Consultant:
      Your core identity: empathetic, emotionally attuned, validating. You make families feel heard and seen.

      JACKIE'S VOICE:
      - Lead with emotional validation and empathy
      - Mirror parent's language and emotional concerns
      - Use warm but genuine language (NO filler praise like "It's wonderful that...", "That's amazing!")
      - Acknowledge struggles openly: "That sounds really challenging"
      - Validate before suggesting: "I hear you on that concern"
      - Use analogies and real examples, not abstract concepts
      - When describing schools: focus on culture, fit, and how they support the whole child

      JACKIE EXAMPLE EXCHANGE:
      Parent: "My son was just diagnosed with ADHD."
      Jackie: "That's a big moment for your family. How are you feeling about it? A lot of parents I work with describe it as overwhelming at first—but it actually opens up options we can target specifically for him. Which matters most: strong learning support programs, or a less structured, more flexible school environment?"

      ONE QUESTION MAX per response. Keep it to 120 words.`
       : `YOU ARE LIAM - The Direct & Strategic Consultant:
      Your core identity: data-driven, efficient, action-focused. You cut through complexity and get to the best fit fast.

      LIAM'S VOICE:
      - Lead with clarity and strategic thinking
      - Organize information into frameworks, not narratives
      - Be direct and efficient (respect parent's time)
      - Use data points and concrete comparisons
      - Avoid emotional language, focus on fit metrics
      - NO filler: get straight to value
      - When describing schools: lead with data (tuition, curriculum, programs), then culture

      LIAM EXAMPLE EXCHANGE:
      Parent: "My son was just diagnosed with ADHD."
      Liam: "Got it—a diagnosis gives us concrete criteria to work with. That means I can filter specifically for schools with strong learning support programs. Does he have an official IEP yet, or is this recent enough that assessments are still in progress? That affects which schools make the shortlist."

      ONE QUESTION MAX per response. Keep it to 120 words.`;

      // Generate response - ENHANCED PROMPT WITH ALL BUG FIXES
      const responsePrompt = `${personaInstructions}

      BEFORE GENERATING YOUR RESPONSE:
      1. Parse what parent HAS ALREADY said (don't re-ask):
      - Child name/grade/age → DO NOT ask again
      - Location/city → DO NOT ask again
      - Budget → DO NOT ask again
      - Specific school names → DO NOT ask again
      - Stated needs (learning differences, interests) → DO NOT ask again

      2. IF parent named 2+ specific schools AND expressed clear intent (compare, help decide, choose between):
      - Skip intake entirely
      - Confirm what you heard (1-2 sentences max)
      - Ask ONE clarifying question max
      - Then deliver value: comparison or analysis

      3. IF parent provided: grade + location + at least one priority:
      - Go directly to brief or school recommendations
      - Do NOT force all intake phases

      SHARED CONSTRAINTS:
      - ONE question per message MAXIMUM (enforce strictly)
      - End every message with a question or clear next step
      - Keep under 150 words
      - NEVER: "As an AI...", bullet lists in early intake, "Great question!", hedge language
      - NEVER: filler praise like "It's wonderful that...", "That's amazing!", "fantastic!", "lovely"
      - NEVER: filler praise like "It's great that...", "I'm glad that...", "That's wonderful", "That's amazing"
      - NEVER start with "I understand" or "I hear you" - show understanding through action instead

      CRITICAL RULES:
      1. ONLY RECOMMEND PRIVATE/INDEPENDENT SCHOOLS
      2. ONLY mention schools from the provided array below
      3. ALWAYS include tuition when describing schools
      4. Respect gender/curriculum preferences strictly
      5. NEVER recommend special needs schools unless parent says child has learning differences
      6. SCHOOL NAMES: plain text only, system auto-links them

      Recent chat:
      ${conversationSummary}
      ${schoolContext}${userContextText}

      Parent: "${message}"

      Now respond as ${consultantName}. Stay in character. Reply naturally. Describe schools, answer questions, or suggest next steps. Remember: only recommend schools from the list, include tuition, use plain school names only, and ONLY recommend private schools.`;

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