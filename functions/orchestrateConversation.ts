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

    // STEP 1: Detect intent (fast string parsing)
    const intentResult = await base44.functions.invoke('detectIntent', {
      message,
      conversationHistory: conversationHistory || []
    });
    const intentResponse = intentResult.data;

    // FIX #1: Check if intent is SCHOOL_SEARCH - if yes, skip onboarding entirely
    const isSchoolSearchIntent = intentResponse.intent === 'SEARCH_SCHOOLS';
    
    // STEP 2: Check for onboarding and brief delivery - only run if NOT doing school search
    let familyProfile = null;
    if (userId) {
      try {
        const familyProfiles = await base44.entities.FamilyProfile.filter({ userId });
        familyProfile = familyProfiles.length > 0 ? familyProfiles[0] : null;

        // If in confirm_brief phase (user is confirming The Brief), handle confirmation/adjustment
        if (familyProfile && familyProfile.onboardingPhase === 'confirm_brief') {
          console.log('🔍 BRIEF CONFIRMATION DETECTED');
          console.log('📊 Current phase:', familyProfile.onboardingPhase);
          console.log('💬 User message:', message);
          
          const msgLower = message.toLowerCase().trim();
          
          // Robust confirmation detection - check word boundaries
          const isConfirming = /\b(exactly right|sounds good|yes|proceed|start search|that's right|thats right|correct|perfect|great|looks good|go ahead|let's go|let's search|sounds perfect)\b/i.test(msgLower);
          const isAdjusting = /\b(adjust|change|edit|not right|add context|add more|wait|hold on|actually|let me|different)\b/i.test(msgLower);

          console.log('✅ Is confirming:', isConfirming);
          console.log('❌ Is adjusting:', isAdjusting);

          if (isConfirming) {
            console.log('🎯 BRIEF CONFIRMED - Triggering school search');
            // Brief confirmed - proceed to school search
            const updatedProfile = await base44.entities.FamilyProfile.update(familyProfile.id, { onboardingPhase: 'BRIEF_CONFIRMED' });

            // Build search params from family profile
            const searchParams = {
              region: familyProfile.region || 'Canada',
              city: familyProfile.locationArea,
              minGrade: familyProfile.childGrade,
              maxGrade: familyProfile.childGrade,
              maxTuition: familyProfile.maxTuition,
              curriculumType: familyProfile.curriculumPreference?.[0],
              specializations: familyProfile.interests,
              userLat: familyProfile.locationLat,
              userLng: familyProfile.locationLng,
              limit: 20
            };

            console.log('🔎 Search params:', JSON.stringify(searchParams));
            const searchResult = await base44.functions.invoke('searchSchools', searchParams);
            const schools = searchResult.data?.schools || [];
            console.log('📚 Schools found:', schools.length);

            // Generate response acknowledging the brief confirmation
            const responseResult = await base44.functions.invoke('generateResponse', {
              message: 'Excellent, let me show you the schools that match.',
              intent: 'SCHOOL_SEARCH_CONFIRMED',
              schools: schools,
              conversationHistory: conversationHistory || [],
              conversationContext: context,
              userNotes: userNotes || [],
              shortlistedSchools: shortlistedSchools || []
            });

            return Response.json({
              message: responseResult.data.message,
              shouldShowSchools: true,
              schools: schools,
              onboardingPhase: 'BRIEF_CONFIRMED',
              familyProfile: updatedProfile,
              onboardingComplete: true
            });
          } else if (isAdjusting) {
            console.log('🔄 User wants to adjust The Brief');
            // User wants to adjust - ask what needs adjusting
            return Response.json({
              message: 'No problem! What would you like to adjust or add?',
              shouldShowSchools: false,
              schools: [],
              onboardingPhase: 'confirm_brief',
              familyProfile: familyProfile,
              onboardingComplete: false
            });
          } else {
            console.log('❓ Unclear response to The Brief - re-presenting');
            // Unclear response - re-present the brief with actual data
            const briefResult = await base44.functions.invoke('generateResponse', {
              message: 're-present brief',
              intent: 'GENERATE_BRIEF',
              familyProfileData: familyProfile,
              conversationHistory: conversationHistory || []
            });

            return Response.json({
              message: briefResult.data.message,
              shouldShowSchools: false,
              schools: [],
              onboardingPhase: 'confirm_brief',
              familyProfile: familyProfile,
              onboardingComplete: false
            });
          }
        }

        // If onboarding is not complete, delegate to onboardUser
        if (!familyProfile || (!familyProfile.onboardingComplete && familyProfile.onboardingPhase !== 'BRIEF_DELIVERY')) {
          const onboardResult = await base44.functions.invoke('onboardUser', {
            message,
            userId,
            conversationHistory: conversationHistory || [],
            familyProfileData: familyProfile
          });
          // CRITICAL FIX: Update local familyProfile with fresh data from onboardUser
          familyProfile = onboardResult.data.familyProfile;
          // Map aiMessage to message for frontend consistency
          return Response.json({
            message: onboardResult.data.aiMessage,
            shouldShowSchools: onboardResult.data.shouldShowSchools,
            schools: onboardResult.data.schools,
            onboardingPhase: onboardResult.data.onboardingPhase,
            familyProfile: onboardResult.data.familyProfile,
            onboardingComplete: onboardResult.data.onboardingComplete
          });
        }
        
        // If onboarding is complete, enhance searchSchools with FamilyProfile defaults
        // This will be used later in the intent-based search flow
      } catch (error) {
        console.error('Onboarding check error:', error);
        // Continue with normal flow if error
      }
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
    } else if (intentResponse.shouldShowSchools) {
      // Call searchSchools function with extracted criteria
      // First, get FamilyProfile for defaults if onboarding is complete
      let familyProfileDefaults = {};
      if (userId) {
        try {
          const familyProfiles = await base44.entities.FamilyProfile.filter({ userId });
          if (familyProfiles.length > 0 && familyProfiles[0].onboardingComplete) {
            const fp = familyProfiles[0];
            familyProfileDefaults = {
              childGrade: fp.childGrade,
              locationArea: fp.locationArea,
              budgetRange: fp.budgetRange,
              maxTuition: fp.maxTuition,
              priorities: fp.priorities,
              curriculumPreference: fp.curriculumPreference
            };
          }
        } catch (e) {
          console.error('Failed to fetch FamilyProfile for defaults:', e);
        }
      }

      const searchParams = {
        limit: 50
      };
      
      if (intentResponse.filterCriteria?.city) searchParams.city = intentResponse.filterCriteria.city;
      else if (familyProfileDefaults.locationArea) searchParams.city = familyProfileDefaults.locationArea;
      
      if (intentResponse.filterCriteria?.provinceState) searchParams.provinceState = intentResponse.filterCriteria.provinceState;
      if (intentResponse.filterCriteria?.region) searchParams.region = intentResponse.filterCriteria.region;
      if (intentResponse.filterCriteria?.grade) {
        searchParams.minGrade = intentResponse.filterCriteria.grade;
        searchParams.maxGrade = intentResponse.filterCriteria.grade;
      } else if (familyProfileDefaults.childGrade) {
        searchParams.minGrade = familyProfileDefaults.childGrade;
        searchParams.maxGrade = familyProfileDefaults.childGrade;
      }
      
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

    // STEP 3: Generate AI response (can timeout)
    let aiMessage = '';
    let responseTimedOut = false;
    
    // Handle greetings with friendly response (skip search logic)
    if (intentResponse.intent === 'GREETING') {
      aiMessage = "Hi! I'm your NextSchool education consultant. I help families across Canada, the US, and Europe find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you in a school?";
    } else {
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
          // FIX #4: If schools exist, use the AI message even if timed out
          aiMessage = generateResult.data.message || 'Here are the schools I found:';
        } else {
          aiMessage = generateResult.data.message;
        }
      } catch (error) {
        console.error('generateResponse error:', error);
        responseTimedOut = true;
        // FIX #4: Don't contradict the display - if schools exist, acknowledge them
        aiMessage = matchingSchools.length > 0 ? 'Here are the schools I found:' : 'I don\'t have any schools matching that criteria.';
      }

      // FIX #4: Ensure AI message matches the schools array
      // If no schools found, AI should say so. If schools exist, AI should acknowledge them.
      if (matchingSchools.length === 0 && !aiMessage.includes('don\'t have') && !aiMessage.includes('no ')) {
        aiMessage = 'I don\'t have any schools matching that criteria yet. Our database is growing - try a nearby city or broader criteria.';
      }
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

    // FORCE shouldShowSchools=true for SEARCH_SCHOOLS intent
    const finalShouldShowSchools = intentResponse.intent === 'SEARCH_SCHOOLS' 
      ? true 
      : matchingSchools.length > 0;

    return Response.json({
      message: aiMessage,
      intent: intentResponse.intent,
      shouldShowSchools: finalShouldShowSchools,
      schools: matchingSchools,
      filterCriteria: intentResponse.filterCriteria || {},
      conversationContext: context  // Return updated context with latest information
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