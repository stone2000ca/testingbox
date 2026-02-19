import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { message, conversationHistory, conversationContext, region, userId, currentSchools, userNotes, shortlistedSchools, userLocation } = await req.json();

    const context = conversationContext || {};
    const history = conversationHistory || [];
    
    // Get last 10 messages for context
    const recentMessages = history.slice(-10);
    const conversationSummary = recentMessages
      .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
      .join('\n');

    // Check if user is asking to narrow/filter from currently displayed schools
    const isNarrowingFromCurrent = currentSchools && currentSchools.length > 0 && 
      (message.toLowerCase().includes('narrow') || 
       message.toLowerCase().includes('which of these') ||
       message.toLowerCase().includes('recommend') ||
       message.toLowerCase().includes('best of these'));

    // First pass: Determine intent and extract filter criteria
    const intentPrompt = `You are analyzing a parent's message to determine their intent and extract school search criteria.

CONVERSATION CONTEXT:
${conversationSummary || 'First message in conversation.'}

CURRENT STATE:
- Child grade: ${context.childGrade || 'unknown'}
- Location: ${context.location || 'not specified'}
- Region: ${context.region || region || 'not specified'}
${currentSchools && currentSchools.length > 0 ? `- Currently viewing ${currentSchools.length} schools on screen` : ''}

DECISION LOGIC:
- If message contains grade AND (city/province/region) → shouldShowSchools: true
- If message contains "show", "find", "see schools", "list" → shouldShowSchools: true  
- If asking "narrow down" or "which of these" → intent: NARROW_DOWN, shouldShowSchools: false (filter from current)
- If asking about specific school details → intent: VIEW_DETAIL, shouldShowSchools: false
- If asking to compare schools → intent: COMPARE_SCHOOLS
- If only greeting with no info → shouldShowSchools: false

LOCATION EXTRACTION:
- Extract province/state (BC, British Columbia, Ontario, California, etc.) to filterCriteria.provinceState
- Extract city (Toronto, Vancouver, etc.) to filterCriteria.city
- Extract broad region (Canada, US, Europe) to filterCriteria.region
- IMPORTANT: Recognize city names WITH OR WITHOUT prepositions:
  * "show me toronto schools" → city: Toronto
  * "show me schools in toronto" → city: Toronto
  * "show me schools in toronto, ontario" → city: Toronto, provinceState: Ontario
  * "schools near vancouver" → city: Vancouver
  * "schools in BC" → provinceState: BC

INTENT OPTIONS:
- SHOW_SCHOOLS: Show matching schools (new search/filter request)
- NARROW_DOWN: Refine from currently displayed schools
- COMPARE_SCHOOLS: Compare specific schools
- VIEW_DETAIL: Details on one school
- ASK_QUESTION: General question about shown schools
- NO_ACTION: Just greeting

Parent's message: "${message}"

Return JSON with intent, shouldShowSchools (boolean), and filterCriteria (if applicable).`;

    const intentResponse = await base44.integrations.Core.InvokeLLM({
      prompt: intentPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          intent: { type: "string" },
          shouldShowSchools: { type: "boolean" },
          filterCriteria: {
            type: "object",
            properties: {
              city: { type: "string" },
              provinceState: { type: "string" },
              region: { type: "string" },
              grade: { type: "number" },
              minTuition: { type: "number" },
              maxTuition: { type: "number" },
              specializations: { type: "array", items: { type: "string" } }
            }
          },
          schoolIds: { type: "array", items: { type: "string" } }
        },
        required: ["intent", "shouldShowSchools"]
      }
    });

    // Simple string-based comparison detection
    const msgLower = message.toLowerCase();
    const isCompareIntent = msgLower.includes('compare') || 
                           msgLower.includes(' vs ') || 
                           msgLower.includes('versus') ||
                           msgLower.includes('side by side') ||
                           msgLower.includes('difference between');

    // Fetch matching schools if needed
    let matchingSchools = [];
    
    // COMPARE SCHOOLS - Extract school names and find them
    if (isCompareIntent) {
      // Helper function to normalize text by stripping periods and apostrophes
      const normalize = (text) => text.replace(/[.']/g, '').toLowerCase();
      
      // Extract potential school names from the message
      let extractedNames = [];
      
      // Split on comparison keywords: with, and, vs, versus, to
      let remainingText = message.toLowerCase();
      
      // Remove "compare" prefix if present
      remainingText = remainingText.replace(/^compare\s+/i, '');
      
      // Split on any of the comparison keywords
      const splitRegex = /\s+(with|and|vs|versus|to)\s+/i;
      const parts = remainingText.split(splitRegex);
      
      // Extract non-keyword parts as school names
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        // Skip if it's a keyword or empty
        if (part && !['with', 'and', 'vs', 'versus', 'to'].includes(part)) {
          extractedNames.push(part);
        }
      }
      
      // Try fuzzy matching against currentSchools first with punctuation normalization
      if (currentSchools && currentSchools.length > 0 && extractedNames.length > 0) {
        for (const searchTerm of extractedNames) {
          const normalizedSearch = normalize(searchTerm);
          const found = currentSchools.find(s => {
            const normalizedSchoolName = normalize(s.name);
            return normalizedSchoolName.includes(normalizedSearch);
          });
          if (found && !matchingSchools.some(ms => ms.id === found.id)) {
            matchingSchools.push(found);
          }
        }
      }
      
      // Fallback: search all schools if not found in currentSchools
      if (matchingSchools.length < 2 && extractedNames.length > 0) {
        const allSchools = await base44.asServiceRole.entities.School.filter({});
        for (const searchTerm of extractedNames) {
          const normalizedSearch = normalize(searchTerm);
          const found = allSchools.find(s => {
            const normalizedSchoolName = normalize(s.name);
            return normalizedSchoolName.includes(normalizedSearch);
          });
          if (found && !matchingSchools.some(ms => ms.id === found.id)) {
            matchingSchools.push(found);
          }
        }
      }
    }
    // If narrowing from current schools, filter those instead of searching database
    else if (intentResponse.intent === 'NARROW_DOWN' && currentSchools && currentSchools.length > 0) {
      // Filter from currently displayed schools
      let filtered = currentSchools;
      
      if (intentResponse.filterCriteria?.specializations?.length > 0) {
        filtered = filtered.filter(s =>
          s.specializations && 
          intentResponse.filterCriteria.specializations.some(spec => s.specializations.includes(spec))
        );
      }
      
      // Check curriculum type (IB, Montessori, etc.)
      const criteriaText = message.toLowerCase();
      if (criteriaText.includes('ib')) {
        filtered = filtered.filter(s => s.curriculumType === 'IB' || s.specializations?.includes('IB'));
      }
      if (criteriaText.includes('montessori')) {
        filtered = filtered.filter(s => s.curriculumType === 'Montessori');
      }
      if (criteriaText.includes('waldorf')) {
        filtered = filtered.filter(s => s.curriculumType === 'Waldorf');
      }
      
      // Apply tuition filter if mentioned
      if (intentResponse.filterCriteria?.minTuition || intentResponse.filterCriteria?.maxTuition) {
        filtered = filtered.filter(s => {
          if (!s.tuition) return false;
          if (intentResponse.filterCriteria.minTuition && s.tuition < intentResponse.filterCriteria.minTuition) return false;
          if (intentResponse.filterCriteria.maxTuition && s.tuition > intentResponse.filterCriteria.maxTuition) return false;
          return true;
        });
      }
      
      matchingSchools = filtered;
    } else if (intentResponse.shouldShowSchools && intentResponse.filterCriteria) {
      // Call searchSchools function with extracted criteria
      const searchParams = {
        limit: 20
      };
      
      if (intentResponse.filterCriteria.city) searchParams.city = intentResponse.filterCriteria.city;
      if (intentResponse.filterCriteria.provinceState) searchParams.provinceState = intentResponse.filterCriteria.provinceState;
      if (intentResponse.filterCriteria.region) searchParams.region = intentResponse.filterCriteria.region;
      if (intentResponse.filterCriteria.grade) {
        searchParams.minGrade = intentResponse.filterCriteria.grade;
        searchParams.maxGrade = intentResponse.filterCriteria.grade;
      }
      if (intentResponse.filterCriteria.minTuition) searchParams.minTuition = intentResponse.filterCriteria.minTuition;
      if (intentResponse.filterCriteria.maxTuition) searchParams.maxTuition = intentResponse.filterCriteria.maxTuition;
      if (intentResponse.filterCriteria.specializations?.length > 0) {
        searchParams.specializations = intentResponse.filterCriteria.specializations;
      }
      if (userLocation?.lat && userLocation?.lng) {
        searchParams.userLat = userLocation.lat;
        searchParams.userLng = userLocation.lng;
      }

      const searchResult = await base44.functions.invoke('searchSchools', searchParams);
      let schools = searchResult.data.schools || [];
      
      matchingSchools = schools.slice(0, 10); // Limit to 10 results
    }

    // Build school context for AI
    const schoolsToDescribe = isCompareIntent ? matchingSchools :
                              (intentResponse.intent === 'NARROW_DOWN' && currentSchools?.length > 0) 
                                ? currentSchools 
                                : matchingSchools;
    
    const schoolContext = schoolsToDescribe.length > 0 
      ? `\n\nSCHOOLS AVAILABLE (${schoolsToDescribe.length} total):\n` + 
        schoolsToDescribe.map(s => 
          `- ${s.name} (${s.city}, ${s.region}) | Grades ${s.lowestGrade}-${s.highestGrade} | ${s.tuition ? s.currency + ' ' + s.tuition.toLocaleString() : 'N/A'} | Curriculum: ${s.curriculumType || 'N/A'} | Specializations: ${s.specializations?.join(', ') || 'N/A'}`
        ).join('\n')
      : '\n\n[NO SCHOOLS AVAILABLE TO SHOW]';

    // Add user context
    let userContextText = '';
    if (userNotes && userNotes.length > 0) {
      userContextText += `\n\nUSER'S PERSONAL NOTES:\n${userNotes.map(note => `- ${note}`).join('\n')}`;
    }
    if (shortlistedSchools && shortlistedSchools.length > 0) {
      userContextText += `\n\nUSER'S SHORTLISTED SCHOOLS:\n${shortlistedSchools.map(school => `- ${school}`).join('\n')}`;
    }
    if (userLocation?.address) {
      userContextText += `\n\nUSER'S LOCATION: ${userLocation.address}`;
    }

    // Second pass: Generate response with school context
    const responsePrompt = `You are an experienced education consultant helping parents find the right private school.

CRITICAL RULES - NEVER BREAK THESE:
1. YOU MAY ONLY MENTION SCHOOLS FROM THE "SCHOOLS AVAILABLE" LIST ABOVE. Never invent or fabricate school names, locations, or details.
2. The number you state (e.g., "I found X schools") MUST EXACTLY match the number shown in "SCHOOLS AVAILABLE (X total)".
3. If narrowing down from currently shown schools, say "Of the schools shown, here are X that match..."
4. BE CONCISE: Maximum 2-3 sentences. Lead with value (school names from list only, specific recommendations).
5. INCLUDE ACCURATE DETAILS: When mentioning a school, use its exact name, city, and details from the list above.
6. VARY YOUR OPENINGS: Don't start every response with "It's great to hear..."
7. CONSIDER USER CONTEXT: Reference the user's notes and shortlisted schools when relevant to provide personalized advice.

CONVERSATION CONTEXT:
${conversationSummary || 'First message in conversation.'}
${userContextText}

INTENT DETECTED: ${isCompareIntent ? 'COMPARE_SCHOOLS' : intentResponse.intent}
${schoolContext}

Parent's message: "${message}"

${isCompareIntent ? 'Generate a brief response (1-2 sentences) confirming which schools are being compared.' : 'Generate a natural, helpful response (2-3 sentences max). State the CORRECT number of schools from the list above.'}`;

    const finalResponse = await base44.integrations.Core.InvokeLLM({
      prompt: responsePrompt
    });

    // Determine final intent and action
    const finalIntent = isCompareIntent ? 'COMPARE_SCHOOLS' : intentResponse.intent;
    
    return Response.json({
      message: finalResponse,
      intent: finalIntent,
      action: finalIntent === 'COMPARE_SCHOOLS' ? 'COMPARE' : 
              finalIntent === 'VIEW_DETAIL' ? 'view_detail' : 
              intentResponse.shouldShowSchools ? 'search_schools' : null,
      schools: isCompareIntent && matchingSchools.length >= 2 
        ? matchingSchools.slice(0, 2)  // Return full school objects
        : matchingSchools,
      shouldShowSchools: intentResponse.shouldShowSchools || intentResponse.intent === 'NARROW_DOWN',
      filterCriteria: intentResponse.filterCriteria || null,
      matchingSchools: matchingSchools.map(s => s.id)
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});