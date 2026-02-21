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
        consultantName,
        state
      } = await req.json();

      console.log(`[generateResponse] Intent: ${intent}, State: ${state}, Schools count: ${schools?.length || 0}`);

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

      // HALLUCINATION FIX: If no schools and intent is school-related, return "no matches" message immediately without AI call
      // CRITICAL: This fix should ONLY apply when schools are expected, e.g., in SEARCHING or NARROW_DOWN states.
      // DO NOT apply this fix for INTAKE_QUESTION or GENERATE_BRIEF intents - those should generate conversational responses.
      if ((intent === 'SEARCH_SCHOOLS' || intent === 'NARROW_DOWN' || state === 'SEARCHING' || state === 'RESULTS') && (!schools || schools.length === 0)) {
        console.log(`[generateResponse] No schools found - returning "no matches" message`);
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

      // ===== CRITICAL: ENTITY EXTRACTION FROM CONVERSATION =====
      // Extract what parent has already said from chat history + current message
      const allText = history.map(m => m.content).join(' ') + ' ' + message;
      let hasLocation = false;
      let hasBudget = false;
      let hasChildGrade = false;
      let hasSchoolNames = false;

      try {
        hasLocation = /mississauga|toronto|vancouver|calgary|ottawa|montreal|brampton|oakville|markham|vaughan|richmond hill|burnaby|surrey|london|hamilton|winnipeg|quebec|edmonton/i.test(allText);
        hasBudget = /(\$|budget|tuition|cost)\s*\d+/.test(allText) || /\d{2,3}\s*[k](?:\s*per|\/)?(?:\s*year|annually)?/i.test(allText);
        hasChildGrade = /grade|kindergarten|preschool|elementary|middle|high school|grade \d/i.test(allText);
        hasSchoolNames = /ucc|crescent|branksome|lakefield|appleby|bishop|jarvis/i.test(allText);
      } catch (regexError) {
        console.warn('Regex extraction error:', regexError);
      }

      const extractedInfo = {
        hasLocation,
        hasBudget,
        hasChildGrade,
        hasSchoolNames
      };

      // Build persona-specific instructions with EMPHASIS on entity extraction + one question + no filler
      const personaInstructions = consultantName === 'Jackie'
       ? `YOU ARE JACKIE - The Warm & Supportive Consultant:

      ===== ABSOLUTE RULES (NON-NEGOTIABLE) =====
      🚫 IF PARENT SAID LOCATION (e.g., "Mississauga", "Toronto") → NEVER ask "where are you located?"
      🚫 IF PARENT SAID BUDGET (e.g., "$15-20K", "around 20") → NEVER ask "what's your budget?"
      🚫 IF PARENT SAID GRADE (e.g., "Grade 3", "high school") → NEVER ask "what grade?"
      🚫 ONE QUESTION ONLY per message. Not two. Not multiple. Count: 1.
      🚫 NO filler: "It's great that", "It's wonderful that", "That's amazing", "I'm glad", "I understand"—AVOID.

      Your core identity: empathetic, emotionally attuned, validating. You make families feel heard.

      JACKIE'S VOICE:
      - Lead with emotional validation (show through action, not filler)
      - Mirror parent's language and emotional concerns
      - Use warm but genuine language
      - When they share: acknowledge the reality, move to help
      - Use analogies and real examples, not abstract concepts
      - When describing schools: focus on culture, fit, whole child

      JACKIE EXAMPLE:
      Parent: "My son was just diagnosed with ADHD."
      Jackie: "That's a big moment. A lot of parents describe it as overwhelming at first—but it opens up specific options. Does he have an IEP yet, or still in assessment?"
      (Notice: ONE question, no filler, shows understanding through action.)`
       : `YOU ARE LIAM - The Direct & Strategic Consultant:

      ===== ABSOLUTE RULES (NON-NEGOTIABLE) =====
      🚫 IF PARENT SAID LOCATION (e.g., "Mississauga", "Toronto") → NEVER ask "where are you located?"
      🚫 IF PARENT SAID BUDGET (e.g., "$15-20K", "around 20") → NEVER ask "what's your budget?"
      🚫 IF PARENT SAID GRADE (e.g., "Grade 3", "high school") → NEVER ask "what grade?"
      🚫 ONE QUESTION ONLY per message. Not two. Not multiple. Count: 1.
      🚫 NO filler: "It's great that", "It's wonderful that", "That's amazing", "I'm glad"—AVOID.

      Your core identity: data-driven, efficient, action-focused. Cut through complexity fast.

      LIAM'S VOICE:
      - Lead with clarity and strategic thinking
      - Organize information into frameworks
      - Be direct and efficient (respect parent's time)
      - Use data points and concrete comparisons
      - NO filler: get straight to value
      - When describing schools: lead with data (tuition, curriculum), then culture

      LIAM EXAMPLE:
      Parent: "My son was just diagnosed with ADHD."
      Liam: "Got it. That gives us concrete filtering criteria. Which comes first: strong learning support, or flexible scheduling?"
      (Notice: ONE question, no filler, data-focused.)`;

      // Generate response
      const responsePrompt = `${personaInstructions}

      ===== ENTITY EXTRACTION (DO THIS FIRST) =====
      From the parent's message AND conversation history, extract:
      - LOCATION ALREADY MENTIONED: ${extractedInfo.hasLocation ? 'YES - do NOT ask where they live' : 'NO - ask if needed'}
      - BUDGET ALREADY MENTIONED: ${extractedInfo.hasBudget ? 'YES - do NOT ask budget' : 'NO - ask if needed'}
      - GRADE ALREADY MENTIONED: ${extractedInfo.hasChildGrade ? 'YES - do NOT ask grade' : 'NO - ask if needed'}
      - SCHOOL NAMES MENTIONED: ${extractedInfo.hasSchoolNames ? 'YES - use these to trigger school search/comparison' : 'NO'}

      ===== ONE QUESTION ONLY RULE =====
      Count your questions before sending. If you have more than one "?", DELETE extra questions.
      Example WRONG: "What's your location? And what's your budget?"
      Example RIGHT: "What matters most to you in a school?"

      ===== NO FILLER RULE =====
      DELETE these phrases before sending:
      - "It's great that..."
      - "It's wonderful that..."
      - "That's amazing"
      - "I'm glad"
      - "I understand"
      - "I hear you"

      Replace with direct action: "That gives us criteria to filter by" or just move forward.

      ===== INTENT-BASED LOGIC =====
      - If parent provided: location + budget + grade → Recommend schools
      - If parent named 2+ schools + clear intent → Compare/analyze them
      - If missing critical info → Ask ONE clarifying question (use extraction above to skip already-answered info)

      Recent chat:
      ${conversationSummary}
      ${schoolContext}${userContextText}

      Parent: "${message}"

      Respond as ${consultantName}. ONE question max. No filler. Never re-ask extracted info.`;

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