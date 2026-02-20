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
    const msgLower = message.toLowerCase();

    // STEP 1: Detect intent (fast string parsing)
    const intentResult = await base44.functions.invoke('detectIntent', {
      message,
      conversationHistory: conversationHistory || []
    });
    const intentResponse = intentResult.data;

    const isCompareIntent = intentResponse.intent === 'COMPARE_SCHOOLS';

    // STEP 2: Fetch matching schools based on intent
    let matchingSchools = [];
    
    // COMPARE SCHOOLS - Word-based scoring system
    if (isCompareIntent) {
      // Remove comparison keywords and extract words
      let cleanedMessage = message.toLowerCase()
        .replace(/^compare\s+/i, '')
        .replace(/\s+(with|and|vs|versus|to|side\s*by\s*side)\s+/gi, ' ')
        .trim();
      
      const messageWords = cleanedMessage.split(/\s+/).filter(w => w.length > 2);
      
      // Score each school in currentSchools
      if (currentSchools && currentSchools.length > 0) {
        const scored = currentSchools.map(school => {
          const schoolWords = school.name.toLowerCase().split(/\s+/);
          let matchCount = 0;
          
          for (const msgWord of messageWords) {
            for (const schoolWord of schoolWords) {
              if (schoolWord.includes(msgWord) || msgWord.includes(schoolWord)) {
                matchCount++;
                break;
              }
            }
          }
          
          const score = matchCount / schoolWords.length;
          return { school, score };
        });
        
        // Take top 2 with score > 0.5
        const topMatches = scored
          .filter(s => s.score > 0.5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 2);
        
        matchingSchools = topMatches.map(m => m.school);
      }
      
      // Fallback: targeted DB search if < 2 found
      if (matchingSchools.length < 2) {
        // Split message into potential school name fragments
        const fragments = cleanedMessage.split(/\s+and\s+|\s+vs\s+|\s+versus\s+/);
        
        for (const fragment of fragments) {
          if (fragment.trim().length > 3 && matchingSchools.length < 2) {
            try {
              const results = await base44.asServiceRole.entities.School.filter({
                name: { $regex: fragment.trim(), $options: 'i' }
              });
              
              // Add first match that's not already in matchingSchools
              for (const school of results.slice(0, 3)) {
                if (!matchingSchools.some(ms => ms.id === school.id)) {
                  matchingSchools.push(school);
                  if (matchingSchools.length >= 2) break;
                }
              }
            } catch (e) {
              console.error('DB search fragment error:', e);
            }
          }
        }
      }
    }
    // If narrowing from current schools, filter those instead of searching database
    else if (intentResponse.intent === 'NARROW_DOWN' && currentSchools && currentSchools.length > 0) {
      // Filter from currently displayed schools
      let filtered = currentSchools;
      
      // RULE: Exclude special needs schools unless explicitly mentioned
      if (!msgLower.includes('special needs') && !msgLower.includes('learning disabilities') && 
          !msgLower.includes('adhd') && !msgLower.includes('autism')) {
        filtered = filtered.filter(s => s.schoolType !== 'Special Needs');
      }
      
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
       if (intentResponse.filterCriteria?.schoolType) searchParams.schoolType = intentResponse.filterCriteria.schoolType;


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
      
      // RULE: Exclude special needs schools unless explicitly mentioned
      if (!msgLower.includes('special needs') && !msgLower.includes('learning disabilities') && 
          !msgLower.includes('adhd') && !msgLower.includes('autism')) {
        schools = schools.filter(s => s.schoolType !== 'Special Needs');
      }
      
      // BUG FIX #2: Exclude public schools - only private/independent schools
      schools = schools.filter(s => s.schoolType !== 'Public');
      
      console.log('schools found:', schools.length);
      
      // Deduplicate by school name (keep first occurrence)
      const seen = new Set();
      const deduplicated = [];
      for (const school of schools) {
        if (!seen.has(school.name)) {
          seen.add(school.name);
          deduplicated.push(school);
        }
      }
      
      matchingSchools = deduplicated.slice(0, 20); // Show up to 20 results
    }

    // STEP 3: Generate AI response (can timeout)
    let aiMessage = '';
    let responseTimedOut = false;
    
    try {
      const generateResult = await base44.functions.invoke('generateResponse', {
        message,
        intent: intentResponse.intent,
        schools: matchingSchools,
        conversationHistory: conversationHistory || [],
        conversationContext: context,
        userNotes: userNotes || [],
        shortlistedSchools: shortlistedSchools || []
      });
      
      if (generateResult.data.timeout) {
        responseTimedOut = true;
        aiMessage = 'Here are the schools I found:';
      } else {
        aiMessage = generateResult.data.message;
      }
    } catch (error) {
      console.error('generateResponse error:', error);
      responseTimedOut = true;
      aiMessage = 'Here are the schools I found:';
    }

    // Update user memory with insights from this message (non-blocking)
    try {
      await base44.functions.invoke('updateUserMemory', { userId, userMessage: message });
    } catch (e) {
      console.error('updateUserMemory failed:', e);
    }

    // DEBUG: Log critical values before returning
    console.log('RETURN DEBUG:', {
      intent: intentResponse.intent,
      schoolsLength: matchingSchools.length,
      shouldShowSchools: matchingSchools.length > 0
    });

    // FORCE shouldShowSchools=true for SEARCH_SCHOOLS intent
    const finalShouldShowSchools = intentResponse.intent === 'SEARCH_SCHOOLS' 
      ? true 
      : matchingSchools.length > 0;

    return Response.json({
      message: aiMessage,
      intent: intentResponse.intent,
      shouldShowSchools: finalShouldShowSchools,
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
        status: 408 
      }, { status: 408 });
    }
    return Response.json({ 
      error: 'Sorry, something went wrong. Please try again.',
      status: 500 
    }, { status: 500 });
  }
});