import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const TIMEOUT_MS = 25000;
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  );

  const processRequest = async () => {
    const base44 = createClientFromRequest(req);
    const { message, conversationHistory, conversationContext, region, userId, consultantName, currentSchools, userNotes, shortlistedSchools, userLocation } = await req.json();

    const context = conversationContext || {};
    const msgLower = message.toLowerCase();
    
    // STATE MACHINE STATES
    const STATES = {
      GREETING: 'GREETING',
      INTAKE: 'INTAKE',
      BRIEF: 'BRIEF',
      BRIEF_EDIT: 'BRIEF_EDIT',
      SEARCHING: 'SEARCHING',
      RESULTS: 'RESULTS',
      COMPARING: 'COMPARING'
    };
    
    // STEP 0: Initialize/retrieve conversation-scoped FamilyProfile
    let conversationFamilyProfile = null;
    const conversationId = context.conversationId;
    
    if (userId && conversationId) {
      try {
        // Try to get conversation-scoped FamilyProfile
        const profiles = await base44.entities.FamilyProfile.filter({
          userId,
          conversationId: conversationId
        });
        conversationFamilyProfile = profiles.length > 0 ? profiles[0] : null;
        
        // If no profile exists, CREATE ONE (first message in conversation)
        if (!conversationFamilyProfile) {
          conversationFamilyProfile = await base44.entities.FamilyProfile.create({
            userId,
            conversationId: conversationId
          });
          console.log('Created new conversation-scoped FamilyProfile:', conversationFamilyProfile.id);
        }
      } catch (e) {
        console.error('Failed to fetch/create conversation-scoped FamilyProfile:', e);
      }
    }
    
    // STEP 1: ENTITY EXTRACTION - Run BEFORE state machine
    let extractedData = {};
    try {
      const extractionResult = await base44.functions.invoke('extractEntityData', {
        userMessage: message,
        conversationHistory: conversationHistory || [],
        currentProfile: conversationFamilyProfile
      });
      extractedData = extractionResult.data?.extracted || {};
    } catch (e) {
      console.warn('Entity extraction failed, continuing:', e);
    }
    
    // Merge extracted data into conversation-scoped profile (without overwriting existing non-null values)
    if (conversationFamilyProfile && Object.keys(extractedData).length > 0) {
      for (const [key, value] of Object.entries(extractedData)) {
        if (value !== null && value !== undefined && !conversationFamilyProfile[key]) {
          conversationFamilyProfile[key] = value;
        }
      }
      // Update profile in DB
      try {
        conversationFamilyProfile = await base44.entities.FamilyProfile.update(conversationFamilyProfile.id, extractedData);
      } catch (e) {
        console.error('Failed to update FamilyProfile with extracted data:', e);
      }
    }
    
    // STEP 2: DETERMINE CURRENT STATE
    let currentState = context.state || STATES.GREETING;
    
    // First message after greeting → move to INTAKE
    if (currentState === STATES.GREETING && conversationHistory && conversationHistory.length > 0) {
      currentState = STATES.INTAKE;
    }
    
    // Check if we have minimum intake data (grade + location + at least one of: priority/interest/budget)
    const hasMinimumData = conversationFamilyProfile && 
      conversationFamilyProfile.childGrade !== null &&
      conversationFamilyProfile.locationArea &&
      (conversationFamilyProfile.interests?.length > 0 || conversationFamilyProfile.priorities?.length > 0 || conversationFamilyProfile.maxTuition);
    
    // Safety valve: 4+ parent messages in intake without enough data → force BRIEF
    const parentMessageCount = conversationHistory?.filter(m => m.role === 'user').length || 0;
    const shouldForceBrief = currentState === STATES.INTAKE && parentMessageCount >= 4 && conversationFamilyProfile;
    
    // INTAKE → BRIEF transition
    if ((currentState === STATES.INTAKE && hasMinimumData) || shouldForceBrief) {
      currentState = STATES.BRIEF;
    }
    
    // BRIEF → SEARCHING/EDIT transition (parent MUST confirm or adjust - never skip Brief)
    if (currentState === STATES.BRIEF) {
      const msgLowerTrim = msgLower.trim();
      const isConfirming = /\b(exactly right|sounds good|yes|proceed|start search|that's right|thats right|correct|perfect|great|looks good|go ahead|let's go|let's search|sounds perfect)\b/i.test(msgLowerTrim);
      const isAdjusting = /\b(adjust|change|edit|not right|add context|add more|wait|hold on|actually|let me|different)\b/i.test(msgLowerTrim);
      
      if (isConfirming) {
        currentState = STATES.SEARCHING;
      } else if (isAdjusting) {
        currentState = STATES.BRIEF_EDIT;
      } else {
        // Parent hasn't confirmed or adjusted - stay in BRIEF and re-show it
        currentState = STATES.BRIEF;
      }
    }
    
    console.log(`STATE MACHINE: ${context.state || 'INIT'} → ${currentState}, extracted: ${Object.keys(extractedData).join(',')}`);
    
    // Update context with new state
    context.state = currentState;

    // STEP 3: Detect intent
    const intentResult = await base44.functions.invoke('detectIntent', {
      message,
      conversationHistory: conversationHistory || []
    });
    const intentResponse = intentResult.data;
    
    // STEP 4: Handle state-specific response generation BEFORE school search
    if (currentState === STATES.GREETING) {
      return Response.json({
        message: "Hi! I'm your NextSchool education consultant. I help families across Canada, the US, and Europe find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you in a school?",
        state: STATES.GREETING,
        conversationContext: context,
        shouldShowSchools: false,
        schools: []
      });
    }
    
    if (currentState === STATES.INTAKE) {
      // INTAKE: Ask ONE question about missing field
      const generateResult = await base44.functions.invoke('generateResponse', {
        message,
        intent: 'INTAKE_QUESTION',
        state: STATES.INTAKE,
        familyProfile: conversationFamilyProfile,
        knownFields: conversationFamilyProfile ? {
          childName: conversationFamilyProfile.childName,
          childGrade: conversationFamilyProfile.childGrade,
          locationArea: conversationFamilyProfile.locationArea,
          maxTuition: conversationFamilyProfile.maxTuition,
          interests: conversationFamilyProfile.interests,
          priorities: conversationFamilyProfile.priorities,
          dealbreakers: conversationFamilyProfile.dealbreakers
        } : {},
        conversationHistory: conversationHistory || [],
        conversationContext: context,
        consultantName: consultantName,
        userNotes: userNotes || [],
        shortlistedSchools: shortlistedSchools || []
      });
      
      return Response.json({
        message: generateResult.data.message,
        state: STATES.INTAKE,
        familyProfile: conversationFamilyProfile,
        conversationContext: context,
        shouldShowSchools: false,
        schools: []
      });
    }
    
    if (currentState === STATES.BRIEF) {
      // BRIEF: Generate The Brief from profile
      const generateResult = await base44.functions.invoke('generateResponse', {
        message: 'generate_brief',
        intent: 'GENERATE_BRIEF',
        state: STATES.BRIEF,
        familyProfile: conversationFamilyProfile,
        conversationHistory: conversationHistory || [],
        conversationContext: context,
        consultantName: consultantName
      });
      
      return Response.json({
        message: generateResult.data.message,
        state: STATES.BRIEF,
        familyProfile: conversationFamilyProfile,
        conversationContext: context,
        shouldShowSchools: false,
        schools: []
      });
    }
    
    if (currentState === STATES.BRIEF_EDIT) {
      // BRIEF_EDIT: Ask what to adjust
      return Response.json({
        message: 'No problem! What would you like to adjust or add?',
        state: STATES.BRIEF_EDIT,
        familyProfile: conversationFamilyProfile,
        conversationContext: context,
        shouldShowSchools: false,
        schools: []
      });
    }
    
    if (currentState === STATES.SEARCHING) {
      // SEARCHING → perform school search
      // (falls through to school search logic below)
    }

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
      console.log('FIX #5: NARROW_DOWN intent - filtering existing schools. Input count:', currentSchools.length);
      // Filter from currently displayed schools
      let filtered = currentSchools;
      
      // RULE: Exclude special needs schools unless explicitly mentioned
      if (!msgLower.includes('special needs') && !msgLower.includes('learning disabilities') && 
          !msgLower.includes('adhd') && !msgLower.includes('autism')) {
        filtered = filtered.filter(s => s.schoolType !== 'Special Needs');
      }
      
      // FIX #5: ESL/Language support filter - now using filterCriteria from detectIntent
      if (intentResponse.filterCriteria?.specializations?.includes('Languages')) {
        console.log('FIX #5: Applying Languages specialization filter for ESL/language support');
        filtered = filtered.filter(s => 
          s.languages?.length > 0 || s.specializations?.includes('Languages')
        );
        console.log('FIX #5: Schools after Languages filter:', filtered.length);
      }
      
      // Apply other specialization filters from detectIntent
      if (intentResponse.filterCriteria?.specializations?.length > 0) {
        const nonLanguageSpecs = intentResponse.filterCriteria.specializations.filter(s => s !== 'Languages');
        if (nonLanguageSpecs.length > 0) {
          filtered = filtered.filter(s =>
            s.specializations && 
            nonLanguageSpecs.some(spec => s.specializations.includes(spec))
          );
        }
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
      console.log('FIX #5: NARROW_DOWN complete. Output count:', matchingSchools.length);
    } else if (intentResponse.shouldShowSchools || currentState === STATES.SEARCHING) {
     // Call searchSchools function with extracted criteria
     const searchParams = {
       limit: 50,
       familyProfile: conversationFamilyProfile // ALWAYS use conversation profile
     };

     // PRIORITY: Use extracted data from conversation profile FIRST, then intent criteria
     if (conversationFamilyProfile?.locationArea) {
       searchParams.city = conversationFamilyProfile.locationArea;
     } else if (intentResponse.filterCriteria?.city) {
       searchParams.city = intentResponse.filterCriteria.city;
     }

     if (conversationFamilyProfile?.childGrade) {
       searchParams.minGrade = conversationFamilyProfile.childGrade;
       searchParams.maxGrade = conversationFamilyProfile.childGrade;
     } else if (intentResponse.filterCriteria?.grade) {
       searchParams.minGrade = intentResponse.filterCriteria.grade;
       searchParams.maxGrade = intentResponse.filterCriteria.grade;
     }

     if (intentResponse.filterCriteria?.provinceState) searchParams.provinceState = intentResponse.filterCriteria.provinceState;
     if (intentResponse.filterCriteria?.region) searchParams.region = intentResponse.filterCriteria.region;
      
      if (intentResponse.filterCriteria?.minTuition) searchParams.minTuition = intentResponse.filterCriteria.minTuition;
      if (intentResponse.filterCriteria?.maxTuition) searchParams.maxTuition = intentResponse.filterCriteria.maxTuition;
      else if (familyProfileDefaults.maxTuition) searchParams.maxTuition = familyProfileDefaults.maxTuition;
      
      if (intentResponse.filterCriteria?.curriculumType) searchParams.curriculumType = intentResponse.filterCriteria.curriculumType;
       if (intentResponse.filterCriteria?.schoolType) searchParams.schoolType = intentResponse.filterCriteria.schoolType;


      // FIX #2: GENDER FILTERING - filter by schoolType
      const genderPref = intentResponse.filterCriteria?.genderPreference;
      if (genderPref === 'boy') {
        searchParams.schoolType = 'All-Boys';
      } else if (genderPref === 'girl') {
        searchParams.schoolType = 'All-Girls';
      }

      if (intentResponse.filterCriteria?.specializations?.length > 0) {
        searchParams.specializations = intentResponse.filterCriteria.specializations;
      } else if (familyProfileDefaults.priorities?.length > 0) {
        // Map family priorities to specializations
        const priorityToSpec = {
          'Arts': 'Arts',
          'STEM': 'STEM',
          'Sports': 'Sports',
          'Languages': 'Languages',
          'Leadership': 'Leadership',
          'Environmental': 'Environmental'
        };
        const mappedSpecs = familyProfileDefaults.priorities
          .map(p => priorityToSpec[p])
          .filter(Boolean);
        if (mappedSpecs.length > 0) {
          searchParams.specializations = mappedSpecs;
        }
      }
      
      // FIX #3: DISTANCE CALCULATION - Use user's actual location
      // Check if user is asking for schools "near me" or similar
      const isNearMe = message.toLowerCase().includes('near me') || 
                       message.toLowerCase().includes('near my location') ||
                       message.toLowerCase().includes('closest') ||
                       message.toLowerCase().includes('find schools near me');
      
      // Always pass user's location for proper distance calculation
      if (userLocation?.lat && userLocation?.lng) {
        searchParams.userLat = userLocation.lat;
        searchParams.userLng = userLocation.lng;
        if (isNearMe) {
          searchParams.maxDistanceKm = 100; // Default 100km radius for "near me"
        }
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

      // STEP 2.5: Generate match explanations if FamilyProfile exists
      if (familyProfile && familyProfile.onboardingComplete && matchingSchools.length > 0) {
        try {
          const explanationsResult = await base44.functions.invoke('generateMatchExplanations', {
            familyProfile: familyProfile,
            schools: matchingSchools
          });
          
          if (explanationsResult.data?.explanations) {
            // Augment schools with match explanations
            matchingSchools = matchingSchools.map(school => {
              const explanation = explanationsResult.data.explanations.find(e => e.schoolId === school.id);
              return {
                ...school,
                matchExplanations: explanation?.matches || []
              };
            });
          }
        } catch (e) {
          console.error('Failed to generate match explanations:', e);
          // Continue without explanations
        }
      }
    }

    // STEP 5: For SEARCHING/RESULTS states, generate school response
    let aiMessage = '';
    let responseTimedOut = false;
    
    if (currentState === STATES.SEARCHING || currentState === STATES.RESULTS) {
      try {
        const generateResult = await base44.functions.invoke('generateResponse', {
          message,
          intent: intentResponse.intent,
          state: currentState,
          schools: matchingSchools,
          familyProfile: conversationFamilyProfile,
          conversationHistory: conversationHistory || [],
          conversationContext: context,
          consultantName: consultantName,
          userNotes: userNotes || [],
          shortlistedSchools: shortlistedSchools || []
        });
        
        if (generateResult.data.timeout) {
          responseTimedOut = true;
          aiMessage = generateResult.data.message || 'Here are the schools I found:';
        } else {
          aiMessage = generateResult.data.message;
        }
      } catch (error) {
        console.error('generateResponse error:', error);
        responseTimedOut = true;
        aiMessage = matchingSchools.length > 0 ? 'Here are the schools I found:' : 'I don\'t have any schools matching that criteria.';
      }

      if (matchingSchools.length === 0 && !aiMessage.includes('don\'t have') && !aiMessage.includes('no ')) {
        aiMessage = 'I don\'t have any schools matching that criteria yet. Our database is growing - try a nearby city or broader criteria.';
      }
      
      currentState = STATES.RESULTS;
    } else {
      // Fallback for unknown state
      aiMessage = 'I encountered an unexpected state. Please try again.';
    }

    // LATEST INFORMATION WINS: Update conversationContext with new filter criteria (overwrite old values)
    if (intentResponse.filterCriteria) {
      Object.assign(context, intentResponse.filterCriteria);
    }
    
    // LATEST INFORMATION WINS: Update user location if provided
    if (userLocation) {
      context.location = userLocation;
    }

    // Update user memory with insights from this message (non-blocking)
    // Pass deduplicate:true to ensure new memories replace old conflicting ones
    try {
      await base44.functions.invoke('updateUserMemory', { 
        userId, 
        userMessage: message,
        deduplicate: true
      });
    } catch (e) {
      console.error('updateUserMemory failed:', e);
    }

    // DEBUG: Log critical values before returning
    console.log('RETURN DEBUG:', {
      intent: intentResponse.intent,
      schoolsLength: matchingSchools.length,
      shouldShowSchools: matchingSchools.length > 0
    });

    const finalShouldShowSchools = currentState === STATES.RESULTS && matchingSchools.length > 0;

    return Response.json({
      message: aiMessage,
      state: currentState,
      intent: intentResponse.intent,
      shouldShowSchools: finalShouldShowSchools,
      schools: matchingSchools,
      familyProfile: conversationFamilyProfile,
      filterCriteria: intentResponse.filterCriteria || {},
      conversationContext: context
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