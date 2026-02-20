import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const TIMEOUT_MS = 25000;
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  );

  const processRequest = async () => {
    const base44 = createClientFromRequest(req);
    const { message, conversationHistory, conversationContext, region, userId, currentSchools, userNotes, shortlistedSchools, userLocation } = await req.json();

    const context = conversationContext || {};
    const history = conversationHistory || [];
    
    // Get last 10 messages for context
    const recentMessages = history.slice(-10);
    const conversationSummary = recentMessages
      .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
      .join('\n');

    // SIMPLIFIED INTENT DETECTION - No LLM call
    const msgLower = message.toLowerCase();
    
    // Extract intent via keyword matching
    let intent = 'SHOW_SCHOOLS'; // default
    let shouldShowSchools = true;
    let filterCriteria = {};
    
    // Compare intent - FIX #4: Trigger comparison table view
    if (msgLower.includes('compare') || msgLower.includes(' vs ') || msgLower.includes('versus') || 
        msgLower.includes('side by side') || msgLower.includes('side-by-side')) {
      intent = 'COMPARE_SCHOOLS';
      shouldShowSchools = false;
    }
    // Narrow down intent
    else if (currentSchools?.length > 0 && (msgLower.includes('narrow') || msgLower.includes('filter') || msgLower.includes('only show'))) {
      intent = 'NARROW_DOWN';
      shouldShowSchools = false;
    }
    // Pure greetings
    else if (/^(hi|hello|hey|greetings|good morning|good afternoon)[\s!.]*$/i.test(msgLower.trim())) {
      intent = 'NO_ACTION';
      shouldShowSchools = false;
    }
    
    // Extract filter criteria using regex/string matching
    // City extraction
    const cityMatch = message.match(/\b(?:in|near|at|around)\s+([A-Z][a-zA-Z\s]+?)(?:\s*,|\s+(?:ontario|bc|quebec|california|new york)|$)/i) ||
                     message.match(/\b(Toronto|Vancouver|Montreal|Calgary|Edmonton|Ottawa|Victoria|Winnipeg|Hamilton|Quebec City|London|Kitchener|Halifax|Oakville|Burlington|Richmond Hill|Markham|Mississauga)\b/i);
    if (cityMatch) filterCriteria.city = cityMatch[1].trim();
    
    // Province/State extraction
    const provinceMatch = message.match(/\b(Ontario|British Columbia|BC|Quebec|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland|PEI|California|New York|Texas|Florida)\b/i);
    if (provinceMatch) filterCriteria.provinceState = provinceMatch[1];
    
    // Region extraction
    const regionMatch = message.match(/\b(Canada|US|USA|United States|Europe|GTA|Greater Toronto|Lower Mainland|Greater Vancouver)\b/i);
    if (regionMatch) filterCriteria.region = regionMatch[1];
    
    // Curriculum extraction
    const curriculumMatch = message.match(/\b(Montessori|IB|International Baccalaureate|Waldorf|AP|Advanced Placement|Traditional)\b/i);
    if (curriculumMatch) {
      let curr = curriculumMatch[1];
      if (curr.toLowerCase().includes('international')) curr = 'IB';
      if (curr.toLowerCase().includes('advanced')) curr = 'AP';
      filterCriteria.curriculumType = curr;
    }
    
    // Grade extraction
    const gradeMatch = message.match(/\bgrade\s*(\d+)\b/i) || message.match(/\b(\d+)(?:th|st|nd|rd)\s*grade\b/i);
    if (gradeMatch) filterCriteria.grade = parseInt(gradeMatch[1]);
    
    // Specializations
    if (msgLower.includes('stem')) filterCriteria.specializations = ['STEM'];
    else if (msgLower.includes('arts')) filterCriteria.specializations = ['Arts'];
    else if (msgLower.includes('sports')) filterCriteria.specializations = ['Sports'];
    
    const intentResponse = { intent, shouldShowSchools, filterCriteria };

    const isCompareIntent = intent === 'COMPARE_SCHOOLS';

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
    } else if (intentResponse.shouldShowSchools) {
      // Call searchSchools function with extracted criteria
      const searchParams = {
        limit: 50
      };
      
      if (intentResponse.filterCriteria?.city) searchParams.city = intentResponse.filterCriteria.city;
      if (intentResponse.filterCriteria?.provinceState) searchParams.provinceState = intentResponse.filterCriteria.provinceState;
      if (intentResponse.filterCriteria?.region) searchParams.region = intentResponse.filterCriteria.region;
      if (intentResponse.filterCriteria?.grade) {
        searchParams.minGrade = intentResponse.filterCriteria.grade;
        searchParams.maxGrade = intentResponse.filterCriteria.grade;
      }
      if (intentResponse.filterCriteria?.minTuition) searchParams.minTuition = intentResponse.filterCriteria.minTuition;
      if (intentResponse.filterCriteria?.maxTuition) searchParams.maxTuition = intentResponse.filterCriteria.maxTuition;
      if (intentResponse.filterCriteria?.curriculumType) searchParams.curriculumType = intentResponse.filterCriteria.curriculumType;

      if (intentResponse.filterCriteria?.specializations?.length > 0) {
        searchParams.specializations = intentResponse.filterCriteria.specializations;
      }
      
      // Check if user is asking for schools "near me" or similar
      const isNearMe = message.toLowerCase().includes('near me') || 
                       message.toLowerCase().includes('near my location') ||
                       message.toLowerCase().includes('closest') ||
                       message.toLowerCase().includes('find schools near me');
      
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

      console.log('searchParams:', JSON.stringify(searchParams));
      
      const searchResult = await base44.functions.invoke('searchSchools', searchParams);
      let schools = searchResult.data.schools || [];
      
      console.log('schools found:', schools.length);
      
      matchingSchools = schools.slice(0, 20); // Show up to 20 results
    }

    // Build school context for AI - ULTRA CONDENSED
    const schoolsToDescribe = isCompareIntent ? matchingSchools :
                              (intentResponse.intent === 'NARROW_DOWN' && currentSchools?.length > 0) 
                                ? currentSchools 
                                : matchingSchools;
    
    const schoolContext = schoolsToDescribe.length > 0 
      ? `\n\nSCHOOLS (${schoolsToDescribe.length}):\n` + 
        schoolsToDescribe.map(s => 
          `${s.name}|${s.city}|Gr${s.lowestGrade}-${s.highestGrade}|${s.curriculumType||'Trad'}|${s.tuition||'N/A'}`
        ).join('\n')
      : '\n\n[NONE]';

    // Add user context - MINIMAL
    let userContextText = '';
    if (shortlistedSchools?.length > 0) {
      userContextText += `\nShortlist: ${shortlistedSchools.join(', ')}`;
    }

    // Generate response - ENHANCED PROMPT WITH UX FIXES
    const responsePrompt = `You are a warm, empathetic education consultant helping parents find private schools for their children.

CRITICAL RULES:
1. NEVER recommend special needs schools unless the parent explicitly mentions their child has special needs or learning differences
2. ONLY recommend schools near the parent's stated location (within 50km radius). If there aren't enough local results, tell the parent rather than suggesting distant schools
3. NEVER auto-shortlist schools. Only shortlist when the parent explicitly asks to save/shortlist a school
4. When parents express feeling overwhelmed, acknowledge their emotions and provide structured, step-by-step guidance (e.g., "Here are 3 steps to get started...")
5. Keep responses warm, reassuring, and concise (2-3 sentences when showing schools)

Recent chat:
${conversationSummary}
${schoolContext}${userContextText}

Parent: "${message}"

Reply naturally and empathetically. Describe schools, answer questions, or suggest next steps.`;
    
    console.log('prompt length:', responsePrompt.length);

    let aiResponse;
    try {
      aiResponse = await base44.integrations.Core.InvokeLLM({
        prompt: responsePrompt
      });
      console.log('LLM response received successfully');
    } catch (error) {
      console.error('InvokeLLM error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      throw error;
    }

    // Update user memory with insights from this message (non-blocking)
    try {
      await base44.functions.invoke('updateUserMemory', { userId, userMessage: message });
    } catch (e) {
      console.error('updateUserMemory failed:', e);
    }

    // Replace school names with markdown links (school:slug format)
    let messageWithLinks = aiResponse;
    if (matchingSchools.length > 0) {
      matchingSchools.forEach(school => {
        // Replace full school name with markdown link, case-insensitive
        const regex = new RegExp(`\\b${school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        messageWithLinks = messageWithLinks.replace(regex, `[${school.name}](school:${school.slug})`);
      });
    }

    return Response.json({
      message: messageWithLinks,
      intent: intentResponse.intent,
      shouldShowSchools: matchingSchools.length > 0,
      schools: matchingSchools,
      filterCriteria: intentResponse.filterCriteria || {}
    });
  };

  try {
    return await Promise.race([processRequest(), timeoutPromise]);
  } catch (error) {
    if (error.message === 'TIMEOUT') {
      return Response.json({ 
        error: 'Request took too long. Try being more specific or search fewer schools.',
        message: "I apologize - that search is taking too long. Could you narrow down your criteria? Try specifying a city or curriculum type."
      }, { status: 200 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});