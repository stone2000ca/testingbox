import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { message, conversationHistory, conversationContext, region, userId, currentSchools } = await req.json();

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
- If message contains grade AND (city/region) → shouldShowSchools: true
- If message contains "show", "find", "see schools", "list" → shouldShowSchools: true  
- If asking "narrow down" or "which of these" → intent: NARROW_DOWN, shouldShowSchools: false (filter from current)
- If asking about specific school details → intent: VIEW_DETAIL, shouldShowSchools: false
- If asking to compare schools → intent: COMPARE_SCHOOLS
- If only greeting with no info → shouldShowSchools: false

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

    // Fetch matching schools if needed
    let matchingSchools = [];
    
    // If narrowing from current schools, filter those instead of searching database
    if (intentResponse.intent === 'NARROW_DOWN' && currentSchools && currentSchools.length > 0) {
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
    } else if (intentResponse.intent === 'COMPARE_SCHOOLS') {
      // Extract school names from the message
      const schoolNamesPattern = /compare\s+(.+?)\s+and\s+(.+?)(?:\.|$)/i;
      const match = message.match(schoolNamesPattern);
      
      if (match) {
        const school1Name = match[1].trim();
        const school2Name = match[2].trim();
        
        // Search for these schools in database
        const allSchools = await base44.asServiceRole.entities.School.filter({});
        matchingSchools = allSchools.filter(s => 
          s.name.toLowerCase().includes(school1Name.toLowerCase()) ||
          s.name.toLowerCase().includes(school2Name.toLowerCase())
        );
      }
    } else if (intentResponse.shouldShowSchools && intentResponse.filterCriteria) {
      const filters = {};
      if (intentResponse.filterCriteria.city) filters.city = intentResponse.filterCriteria.city;
      if (intentResponse.filterCriteria.region) filters.region = intentResponse.filterCriteria.region;
      
      let schools = await base44.asServiceRole.entities.School.filter(filters);
      
      // Apply grade filter
      if (intentResponse.filterCriteria.grade) {
        schools = schools.filter(s => 
          s.lowestGrade <= intentResponse.filterCriteria.grade && 
          s.highestGrade >= intentResponse.filterCriteria.grade
        );
      }
      
      // Apply tuition filter
      if (intentResponse.filterCriteria.minTuition || intentResponse.filterCriteria.maxTuition) {
        schools = schools.filter(s => {
          if (!s.tuition) return false;
          if (intentResponse.filterCriteria.minTuition && s.tuition < intentResponse.filterCriteria.minTuition) return false;
          if (intentResponse.filterCriteria.maxTuition && s.tuition > intentResponse.filterCriteria.maxTuition) return false;
          return true;
        });
      }
      
      // Apply specializations filter
      if (intentResponse.filterCriteria.specializations?.length > 0) {
        schools = schools.filter(s =>
          s.specializations && 
          intentResponse.filterCriteria.specializations.some(spec => s.specializations.includes(spec))
        );
      }
      
      // Fallback: if no results, show all in region
      if (schools.length === 0 && intentResponse.filterCriteria.region) {
        schools = await base44.asServiceRole.entities.School.filter({ 
          region: intentResponse.filterCriteria.region 
        });
      }
      
      matchingSchools = schools.slice(0, 10); // Limit to 10 results
    }

    // Build school context for AI - use currentSchools for NARROW_DOWN, matchingSchools otherwise
    const schoolsToDescribe = (intentResponse.intent === 'NARROW_DOWN' && currentSchools?.length > 0) 
      ? currentSchools 
      : matchingSchools;
    
    const schoolContext = schoolsToDescribe.length > 0 
      ? `\n\nSCHOOLS AVAILABLE (${schoolsToDescribe.length} total):\n` + 
        schoolsToDescribe.map(s => 
          `- ${s.name} (${s.city}, ${s.region}) | Grades ${s.lowestGrade}-${s.highestGrade} | ${s.tuition ? s.currency + ' ' + s.tuition.toLocaleString() : 'N/A'} | Curriculum: ${s.curriculumType || 'N/A'} | Specializations: ${s.specializations?.join(', ') || 'N/A'}`
        ).join('\n')
      : '\n\n[NO SCHOOLS AVAILABLE TO SHOW]';

    // Second pass: Generate response with school context
    const responsePrompt = `You are an experienced education consultant helping parents find the right private school.

CRITICAL RULES - NEVER BREAK THESE:
1. YOU MAY ONLY MENTION SCHOOLS FROM THE "SCHOOLS AVAILABLE" LIST ABOVE. Never invent or fabricate school names, locations, or details.
2. The number you state (e.g., "I found X schools") MUST EXACTLY match the number shown in "SCHOOLS AVAILABLE (X total)".
3. If narrowing down from currently shown schools, say "Of the schools shown, here are X that match..."
4. BE CONCISE: Maximum 2-3 sentences. Lead with value (school names from list only, specific recommendations).
5. INCLUDE ACCURATE DETAILS: When mentioning a school, use its exact name, city, and details from the list above.
6. VARY YOUR OPENINGS: Don't start every response with "It's great to hear..."

CONVERSATION CONTEXT:
${conversationSummary || 'First message in conversation.'}

INTENT DETECTED: ${intentResponse.intent}
${schoolContext}

Parent's message: "${message}"

Generate a natural, helpful response (2-3 sentences max). State the CORRECT number of schools from the list above.`;

    const finalResponse = await base44.integrations.Core.InvokeLLM({
      prompt: responsePrompt
    });

    // For COMPARE intent, extract school IDs for comparison
    let comparisonSchoolIds = [];
    if (intentResponse.intent === 'COMPARE_SCHOOLS' && matchingSchools.length >= 2) {
      comparisonSchoolIds = matchingSchools.slice(0, 2).map(s => s.id);
    }

    return Response.json({
      message: finalResponse,
      intent: intentResponse.intent,
      command: {
        action: intentResponse.intent === 'COMPARE_SCHOOLS' ? 'compare' : 
                intentResponse.intent === 'VIEW_DETAIL' ? 'view_detail' : 
                intentResponse.shouldShowSchools ? 'search_schools' : null,
        params: intentResponse.intent === 'COMPARE_SCHOOLS' 
          ? { schoolIds: comparisonSchoolIds }
          : (intentResponse.filterCriteria || {}),
        reasoning: `Intent: ${intentResponse.intent}`
      },
      shouldShowSchools: intentResponse.shouldShowSchools || intentResponse.intent === 'NARROW_DOWN',
      filterCriteria: intentResponse.filterCriteria || null,
      matchingSchools: matchingSchools.map(s => s.id)
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});