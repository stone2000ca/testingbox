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
- If user is asking to SEE, FIND, BROWSE, or LIST schools IN ANY WAY → shouldShowSchools: true
  (This includes: "show", "find", "see schools", "list", "looking for", "interested in", "what about", "any", "are there", "give me", "tell me about")
- If message mentions a curriculum type (Montessori, IB, Waldorf, AP, Traditional) → shouldShowSchools: true (search all schools or filtered area)
- If message contains grade AND (city/province/region) → shouldShowSchools: true
- If asking "narrow down" or "which of these" → intent: NARROW_DOWN, shouldShowSchools: false (filter from current)
- If asking about specific school details → intent: VIEW_DETAIL, shouldShowSchools: false
- If asking to compare schools → intent: COMPARE_SCHOOLS
- If only greeting with no info → shouldShowSchools: false

LOCATION EXTRACTION:
- Extract province/state (BC, British Columbia, Ontario, California, etc.) to filterCriteria.provinceState
- Extract city (Toronto, Vancouver, etc.) to filterCriteria.city
- Extract broad region (Canada, US, Europe) OR region aliases to filterCriteria.region
- IMPORTANT: Recognize city names WITH OR WITHOUT prepositions:
   * "show me toronto schools" → city: Toronto
   * "show me schools in toronto" → city: Toronto
   * "show me schools in toronto, ontario" → city: Toronto, provinceState: Ontario
   * "schools near vancouver" → city: Vancouver
   * "schools in BC" → provinceState: BC
- IMPORTANT: Recognize region aliases (GTA, Lower Mainland, Greater Vancouver, Montreal, Golden Horseshoe, New England, Pacific Northwest):
   * "show me schools near GTA" → region: GTA
   * "schools in lower mainland" → region: Lower Mainland
   * "greater vancouver schools" → region: Greater Vancouver
   * "new england schools" → region: New England
   * "pacific northwest" → region: Pacific Northwest
- IMPORTANT: Recognize country-level searches:
   * "all schools in Canada" → region: Canada
   * "schools in the US" → region: US
   * "european schools" → region: Europe

CURRICULUM TYPE EXTRACTION:
- Extract curriculum types mentioned: Traditional, Montessori, IB, Waldorf, AP, Other
- Put matching curriculum type in filterCriteria.curriculumType
- If user mentions curriculum WITHOUT location, still set shouldShowSchools: true

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
              curriculumType: { type: "string" },
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
      
      // Check if user is asking for schools "near me" or similar
      const isNearMe = message.toLowerCase().includes('near me') || 
                       message.toLowerCase().includes('near my location') ||
                       message.toLowerCase().includes('closest');
      
      // For "near me" requests, pass coordinates to search by distance
      if (isNearMe && userLocation?.lat && userLocation?.lng) {
        searchParams.userLat = userLocation.lat;
        searchParams.userLng = userLocation.lng;
        searchParams.maxDistanceKm = 100; // Default 100km radius for "near me"
      } else if (userLocation?.lat && userLocation?.lng) {
        // Still include coordinates if location exists (for reference/context)
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

CONTEXT:
- You are responding to the parent's message
- This is message in a longer conversation with the user
- Your goal is to be helpful, conversational, and guide them toward finding the right school(s)

CURRENT CONVERSATION SUMMARY:
${conversationSummary}

${schoolContext}
${userContextText}

RESPONSE GUIDELINES:
- If showing schools: Briefly describe each school, highlight relevant matches to their criteria
- If no schools found: Suggest alternative searches or ask clarifying questions
- If asked about specific school: Provide relevant details
- If comparing: Highlight key differences between schools
- Keep responses concise but informative (2-4 sentences if showing schools, up to 1 paragraph for other responses)
- Be conversational and friendly
- If they asked a question about shown schools, answer it directly

Parent's message: "${message}"

Generate a natural, helpful response.`;

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: responsePrompt
    });

    // Replace school names with markdown links (school:slug format)
    let messageWithLinks = aiResponse;
    schoolsToDescribe.forEach(school => {
      // Replace full school name with markdown link, case-insensitive
      const regex = new RegExp(`\\b${school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      messageWithLinks = messageWithLinks.replace(regex, `[${school.name}](school:${school.slug})`);
    });

    return Response.json({
      message: messageWithLinks,
      intent: intentResponse.intent,
      shouldShowSchools: matchingSchools.length > 0,
      schools: matchingSchools,
      filterCriteria: intentResponse.filterCriteria || {}
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});