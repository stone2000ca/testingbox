import { callOpenRouter } from './callOpenRouter.ts';

// KI-12 FIX PART B: City coordinates lookup table
const CITY_COORDS = {
  'vancouver': { lat: 49.2827, lng: -123.1207 },
  'toronto': { lat: 43.6532, lng: -79.3832 },
  'montreal': { lat: 45.5017, lng: -73.5673 },
  'ottawa': { lat: 45.4215, lng: -75.6972 },
  'calgary': { lat: 51.0447, lng: -114.0719 },
  'edmonton': { lat: 53.5461, lng: -113.4938 },
  'victoria': { lat: 48.4284, lng: -123.3656 },
  'winnipeg': { lat: 49.8951, lng: -97.1384 },
  'halifax': { lat: 44.6488, lng: -63.5752 },
  'new york': { lat: 40.7128, lng: -74.0060 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'boston': { lat: 42.3601, lng: -71.0589 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'london': { lat: 51.5074, lng: -0.1278 },
  'mississauga': { lat: 43.5890, lng: -79.6441 },
  'hamilton': { lat: 43.2557, lng: -79.8711 },
  'kingston': { lat: 44.2312, lng: -76.4860 },
  'kelowna': { lat: 49.8880, lng: -119.4960 },
  'surrey': { lat: 49.1913, lng: -122.8490 },
  'burnaby': { lat: 49.2488, lng: -122.9805 },
  'oakville': { lat: 43.4675, lng: -79.6877 },
  'richmond hill': { lat: 43.8828, lng: -79.4403 },
  'markham': { lat: 43.8561, lng: -79.3370 },
  'north vancouver': { lat: 49.3200, lng: -123.0724 },
  'west vancouver': { lat: 49.3272, lng: -123.1601 }
};

export async function handleResults(params) {
  const { base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, selectedSchoolId, userLocation, region, conversationId, userId } = params;

  const STATES = {
    WELCOME: 'WELCOME',
    DISCOVERY: 'DISCOVERY',
    BRIEF: 'BRIEF',
    RESULTS: 'RESULTS',
    DEEP_DIVE: 'DEEP_DIVE'
  };

  const BRIEF_STATUS = {
    GENERATING: 'generating',
    PENDING_REVIEW: 'pending_review',
    EDITING: 'editing',
    CONFIRMED: 'confirmed'
  };

  // GUARD: Force DEEP_DIVE if selectedSchoolId present
  if (selectedSchoolId) {
    console.log('[RESULTS GUARD] selectedSchoolId present, this should not happen — resolveTransition R2 should route to DEEP_DIVE');
    // Return a redirect response instead of null to avoid orchestrator fallthrough
    return Response.json({
      message: "Let me pull up that school's details for you.",
      state: 'DEEP_DIVE',
      briefStatus: briefStatus,
      schools: [],
      familyProfile: conversationFamilyProfile,
      conversationContext: { ...context, state: 'DEEP_DIVE' }
    });
  }

  // ALWAYS run fresh search when entering RESULTS state, regardless of currentSchools
  console.log('[SEARCH] Running fresh school search in RESULTS state');
  console.log('[KI-12 DIAG] LocationArea BEFORE fallbacks:', conversationFamilyProfile?.locationArea);
  
  // KI-12 FALLBACK 1: Recover from context.extractedEntities
  if (!conversationFamilyProfile?.locationArea && context.extractedEntities?.locationArea) {
    conversationFamilyProfile.locationArea = context.extractedEntities.locationArea;
    console.log('[KI-12 FALLBACK 1] Recovered from extractedEntities:', context.extractedEntities.locationArea);
  }
  if (!conversationFamilyProfile?.locationArea && context.extractedEntities?.city) {
    conversationFamilyProfile.locationArea = context.extractedEntities.city;
    console.log('[KI-12 FALLBACK 1] Recovered from city:', context.extractedEntities.city);
  }
  
  // KI-12 FALLBACK 2: Fresh DB read
  if (!conversationFamilyProfile?.locationArea && conversationFamilyProfile?.id) {
    console.log('[KI-12 FALLBACK 2] Attempting fresh DB read...');
    try {
      const freshProfiles = await base44.entities.FamilyProfile.filter({userId, conversationId});
      if (freshProfiles.length > 0 && freshProfiles[0].locationArea) {
        conversationFamilyProfile.locationArea = freshProfiles[0].locationArea;
        console.log('[KI-12 FALLBACK 2] Recovered from fresh DB:', conversationFamilyProfile.locationArea);
      }
    } catch (e) {
      console.error('[KI-12 FALLBACK 2] DB read failed:', e);
    }
  }
  
  // KI-12 FALLBACK 3: Parse Brief text from conversation history
  if (!conversationFamilyProfile?.locationArea && conversationHistory) {
    console.log('[KI-12 FALLBACK 3] Parsing Brief text from history...');
    const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Location:/i.test(m.content));
    if (briefMsg) {
      const locMatch = briefMsg.content.match(/•\s*Location:\s*([^\n•]+)/i);
      if (locMatch && locMatch[1]) {
        const extractedLoc = locMatch[1].trim();
        if (!/not specified/i.test(extractedLoc)) {
          conversationFamilyProfile.locationArea = extractedLoc;
          console.log('[KI-12 FALLBACK 3] Recovered from Brief text:', conversationFamilyProfile.locationArea);
        }
      }
    }
  }
  
  // AGGRESSIVE FALLBACK: Extract grade from multiple sources
  let parsedGrade = null;
  
  // Fallback 1: conversationFamilyProfile.childGrade
  const rawGrade = conversationFamilyProfile?.childGrade;
  if (rawGrade !== null && rawGrade !== undefined) {
    if (typeof rawGrade === 'number') { parsedGrade = rawGrade; }
    else if (typeof rawGrade === 'string') {
      const cleaned = rawGrade.toString().toLowerCase().trim();
      if (cleaned === 'jk' || cleaned === 'junior kindergarten') { parsedGrade = -1; }
      else if (cleaned === 'k' || cleaned === 'kindergarten') { parsedGrade = 0; }
      else if (cleaned === 'sk' || cleaned === 'senior kindergarten') { parsedGrade = 0; }
      else if (cleaned.startsWith('grade ')) { parsedGrade = parseInt(cleaned.replace('grade ', '')); }
      else if (cleaned.startsWith('gr')) { parsedGrade = parseInt(cleaned.replace(/^gr\.?\s*/, '')); }
      else { parsedGrade = parseInt(cleaned); }
      if (isNaN(parsedGrade)) { parsedGrade = null; }
    }
  }
  console.log('[GRADE FALLBACK 1] conversationFamilyProfile.childGrade:', rawGrade, '→ parsedGrade:', parsedGrade);
  
  // Fallback 2: context.extractedEntities?.childGrade
  if (parsedGrade === null && context.extractedEntities?.childGrade !== null && context.extractedEntities?.childGrade !== undefined) {
    const extracted = context.extractedEntities.childGrade;
    parsedGrade = typeof extracted === 'number' ? extracted : parseInt(extracted);
    if (isNaN(parsedGrade)) { parsedGrade = null; }
    console.log('[GRADE FALLBACK 2] context.extractedEntities.childGrade:', extracted, '→ parsedGrade:', parsedGrade);
  }
  
  // Fallback 3: Parse Brief text from conversation history
  if (parsedGrade === null && conversationHistory) {
    const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Student:/i.test(m.content));
    if (briefMsg) {
      const gradeMatch = briefMsg.content.match(/•\s*Student:.*?\b(?:Grade\s+(\d+)|JK|SK|Kindergarten|K)\b/i);
      if (gradeMatch) {
        if (/JK/i.test(gradeMatch[0])) { parsedGrade = -1; }
        else if (/SK|Kindergarten|(?<!\d)K(?!\w)/i.test(gradeMatch[0])) { parsedGrade = 0; }
        else if (gradeMatch[1]) { parsedGrade = parseInt(gradeMatch[1]); }
        console.log('[GRADE FALLBACK 3] Parsed from Brief text:', gradeMatch[0], '→ parsedGrade:', parsedGrade);
      }
    }
  }
  
  // Fallback 4: context.conversationContext?.familyProfile?.childGrade
  if (parsedGrade === null && context.conversationContext?.familyProfile?.childGrade !== null && context.conversationContext?.familyProfile?.childGrade !== undefined) {
    parsedGrade = parseInt(context.conversationContext.familyProfile.childGrade);
    if (isNaN(parsedGrade)) { parsedGrade = null; }
    console.log('[GRADE FALLBACK 4] context.conversationContext.familyProfile.childGrade:', context.conversationContext.familyProfile.childGrade, '→ parsedGrade:', parsedGrade);
  }
  
  console.log('[GRADE FINAL] parsedGrade:', parsedGrade);
  
  // AGGRESSIVE FALLBACK: Extract budget from multiple sources
  let parsedTuition = null;
  
  // Fallback 1: conversationFamilyProfile.maxTuition
  if (conversationFamilyProfile?.maxTuition) {
    parsedTuition = typeof conversationFamilyProfile.maxTuition === 'number' ? conversationFamilyProfile.maxTuition : parseInt(conversationFamilyProfile.maxTuition);
    if (isNaN(parsedTuition)) { parsedTuition = null; }
    console.log('[BUDGET FALLBACK 1] conversationFamilyProfile.maxTuition:', conversationFamilyProfile.maxTuition, '→ parsedTuition:', parsedTuition);
  }
  
  // Fallback 2: context.extractedEntities?.budgetSingle
  if (parsedTuition === null && context.extractedEntities?.budgetSingle) {
    parsedTuition = parseInt(context.extractedEntities.budgetSingle);
    if (isNaN(parsedTuition)) { parsedTuition = null; }
    console.log('[BUDGET FALLBACK 2] context.extractedEntities.budgetSingle:', context.extractedEntities.budgetSingle, '→ parsedTuition:', parsedTuition);
  }
  
  // Fallback 3: context.extractedEntities?.budgetMax
  if (parsedTuition === null && context.extractedEntities?.budgetMax) {
    parsedTuition = parseInt(context.extractedEntities.budgetMax);
    if (isNaN(parsedTuition)) { parsedTuition = null; }
    console.log('[BUDGET FALLBACK 3] context.extractedEntities.budgetMax:', context.extractedEntities.budgetMax, '→ parsedTuition:', parsedTuition);
  }
  
  // Fallback 4: Parse Brief text for budget
  if (parsedTuition === null && conversationHistory) {
    const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Budget:/i.test(m.content));
    if (briefMsg) {
      // Match patterns like "$25,000", "$30K", "25000", "30k"
      const budgetMatch = briefMsg.content.match(/•\s*Budget:.*?\$?([\d,]+)(?:,000|K)?/i);
      if (budgetMatch) {
        let extracted = budgetMatch[1].replace(/,/g, '');
        if (/K$/i.test(budgetMatch[0])) {
          extracted = parseInt(extracted) * 1000;
        } else if (!/,000/.test(budgetMatch[0]) && extracted.length <= 2) {
          extracted = parseInt(extracted) * 1000;
        } else {
          extracted = parseInt(extracted);
        }
        parsedTuition = extracted;
        console.log('[BUDGET FALLBACK 4] Parsed from Brief text:', budgetMatch[0], '→ parsedTuition:', parsedTuition);
      }
    }
  }
  
  console.log('[BUDGET FINAL] parsedTuition:', parsedTuition);
  
  // AGGRESSIVE FALLBACK: Extract dealbreakers from multiple sources (KI-17 pattern)
  let parsedDealbreakers = null;
  
  // Fallback 1: conversationFamilyProfile.dealbreakers
  if (conversationFamilyProfile?.dealbreakers && Array.isArray(conversationFamilyProfile.dealbreakers) && conversationFamilyProfile.dealbreakers.length > 0) {
    parsedDealbreakers = conversationFamilyProfile.dealbreakers;
    console.log('[DEALBREAKER FALLBACK 1] conversationFamilyProfile.dealbreakers:', parsedDealbreakers);
  }
  
  // Fallback 2: context.extractedEntities.dealbreakers
  if ((!parsedDealbreakers || parsedDealbreakers.length === 0) && context.extractedEntities?.dealbreakers && Array.isArray(context.extractedEntities.dealbreakers) && context.extractedEntities.dealbreakers.length > 0) {
    parsedDealbreakers = context.extractedEntities.dealbreakers;
    console.log('[DEALBREAKER FALLBACK 2] context.extractedEntities.dealbreakers:', parsedDealbreakers);
  }
  
  // Fallback 3: Parse Brief text from conversation history
  if ((!parsedDealbreakers || parsedDealbreakers.length === 0) && conversationHistory) {
    const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Dealbreakers:/i.test(m.content));
    if (briefMsg) {
      const dbMatch = briefMsg.content.match(/•\s*Dealbreakers:\s*([^\n•]+)/i);
      if (dbMatch && dbMatch[1]) {
        const extractedDb = dbMatch[1].trim();
        if (!/not specified|none/i.test(extractedDb)) {
          parsedDealbreakers = extractedDb.split(',').map(s => s.trim()).filter(Boolean);
          console.log('[DEALBREAKER FALLBACK 3] Parsed from Brief text:', parsedDealbreakers);
        }
      }
    }
  }
  
  // Fallback 4: context.conversationContext?.familyProfile?.dealbreakers
  if ((!parsedDealbreakers || parsedDealbreakers.length === 0) && context.conversationContext?.familyProfile?.dealbreakers && Array.isArray(context.conversationContext.familyProfile.dealbreakers) && context.conversationContext.familyProfile.dealbreakers.length > 0) {
    parsedDealbreakers = context.conversationContext.familyProfile.dealbreakers;
    console.log('[DEALBREAKER FALLBACK 4] context.conversationContext.familyProfile.dealbreakers:', parsedDealbreakers);
  }
  
  console.log('[DEALBREAKER FINAL] parsedDealbreakers:', parsedDealbreakers);
  
  const searchParams = {
    limit: 50,
    familyProfile: conversationFamilyProfile,
    dealbreakers: parsedDealbreakers
  };

  // KI-12: CRITICAL - Proper location filtering
  // Extract location from FamilyProfile - locationArea can be "City, Province" or just "City"
  if (conversationFamilyProfile?.locationArea) {
    const locationParts = conversationFamilyProfile.locationArea.split(',').map(s => s.trim());
    if (locationParts.length >= 2) {
      // Has both city and province/state
      searchParams.city = locationParts[0];
      searchParams.provinceState = locationParts[1];
    } else if (locationParts.length === 1) {
      // Only city specified
      searchParams.city = locationParts[0];
    }
  }
  
  // Override with explicit provinceState if available
  if (conversationFamilyProfile?.provinceState) {
    searchParams.provinceState = conversationFamilyProfile.provinceState;
  }
  
  // KI-12 FIX: Only use auto-detected region as FALLBACK when no explicit location stated
  // If user explicitly mentioned a city/location in conversation, DO NOT override with browser location
  if (region && !conversationFamilyProfile?.locationArea) {
    searchParams.region = region;
    console.log('[KI-12] Using auto-detected region as fallback:', region);
  } else if (conversationFamilyProfile?.locationArea) {
    console.log('[KI-12] Prioritizing explicit location:', conversationFamilyProfile.locationArea, 'over auto-detected region:', region);
  }
  
  // GRADE FILTER: Use parsedGrade
  if (parsedGrade !== null) {
    searchParams.minGrade = parsedGrade;
    searchParams.maxGrade = parsedGrade;
    console.log('[GRADE FILTER] Passing minGrade/maxGrade:', parsedGrade);
  }
  
  // BUDGET FILTER FIX: Use parsedTuition
  if (parsedTuition && parsedTuition !== 'unlimited') {
    searchParams.maxTuition = parsedTuition;
    console.log('[BUDGET FILTER] Passing maxTuition:', parsedTuition);
  }
  if (conversationFamilyProfile?.curriculumPreference?.length > 0) {
    searchParams.curriculumType = conversationFamilyProfile.curriculumPreference[0];
  }
  if (conversationFamilyProfile?.priorities?.length > 0) {
    const priorityToSpec = { 'Arts': 'Arts', 'STEM': 'STEM', 'Sports': 'Sports', 'Languages': 'Languages', 'Leadership': 'Leadership', 'Environmental': 'Environmental' };
    const mappedSpecs = conversationFamilyProfile.priorities.map(p => priorityToSpec[p]).filter(Boolean);
    if (mappedSpecs.length > 0) {
      searchParams.specializations = mappedSpecs;
    }
  }
  
  // KI-12 DIAGNOSTIC: Log final locationArea value
  console.log('[KI-12 DIAG] LocationArea AFTER fallbacks:', conversationFamilyProfile?.locationArea);
  
  // KI-12 FIX PART B: Override browser coords with stated location coords
  const statedLocation = conversationFamilyProfile?.locationArea?.toLowerCase()?.trim();
  console.log('[KI-12 DIAG] StatedLocation for CITY_COORDS lookup:', statedLocation);
  console.log('[KI-12 DIAG] CITY_COORDS lookup result:', statedLocation ? CITY_COORDS[statedLocation] : 'N/A');
  
  if (statedLocation && CITY_COORDS[statedLocation]) {
    searchParams.userLat = CITY_COORDS[statedLocation].lat;
    searchParams.userLng = CITY_COORDS[statedLocation].lng;
    console.log('[KI-12 GEOCODE] Using geocoded coords for stated location:', statedLocation);
  }
  
  if (!searchParams.userLat && !searchParams.userLng && userLocation?.lat && userLocation?.lng) {
    searchParams.userLat = userLocation.lat;
    searchParams.userLng = userLocation.lng;
    console.log('[KI-12 GEOCODE] Using browser coords as fallback');
  }
  
  console.log('[KI-12 DIAG] Final searchParams.userLat:', searchParams.userLat);
  console.log('[KI-12 DIAG] Final searchParams.userLng:', searchParams.userLng);
  console.log('[KI-12 LOCATION FILTER]', {
    locationArea: conversationFamilyProfile?.locationArea,
    city: searchParams.city,
    provinceState: searchParams.provinceState,
    region: searchParams.region
  });

  console.log('[SEARCH] Final searchParams:', { minGrade: searchParams.minGrade, maxGrade: searchParams.maxGrade, maxTuition: searchParams.maxTuition, city: searchParams.city, dealbreakers: searchParams.dealbreakers });
  
  // P0 DIAGNOSTIC: Call to searchSchools
  console.log('=== ORCHESTRATE -> SEARCHSCHOOLS CALL ===', JSON.stringify({
    dealbreakersBeingPassed: searchParams?.dealbreakers,
    familyProfileDealbreakers: searchParams?.familyProfile?.dealbreakers,
    familyProfileKeys: Object.keys(searchParams?.familyProfile || {})
  }));
  
  let schools = [];
  try {
    const searchResult = await base44.asServiceRole.functions.invoke('searchSchools', {
      ...searchParams,
      conversationId: conversationId,
      userId: userId,
      searchQuery: message
    });
    schools = searchResult.data.schools || [];
    console.log('[SEARCH] Returned', schools.length, 'schools. First 3:', schools.slice(0, 3).map(s => `${s.name} (${s.lowestGrade}-${s.highestGrade})`));
  } catch (e) {
    console.error('[ERROR] searchSchools failed:', e.message);
  }
  
  // Filter out special needs/public schools
  schools = schools.filter(s => s.schoolType !== 'Special Needs' && s.schoolType !== 'Public');
  
  // Deduplicate
  const seen = new Set();
  const deduplicated = [];
  for (const school of schools) {
    if (!seen.has(school.name)) {
      seen.add(school.name);
      deduplicated.push(school);
    }
  }
  
  const matchingSchools = deduplicated.slice(0, 20);
  
  // Auto-transition to RESULTS
  let updatedCurrentState = STATES.RESULTS;
  context.state = updatedCurrentState;
  
  // Generate response for RESULTS
  let aiMessage = '';
  try {
    if (!matchingSchools || matchingSchools.length === 0) {
      aiMessage = "I don't have any schools matching your criteria yet. Try a nearby city or broader criteria.";
    } else {
      const history = conversationHistory || [];
      const recentMessages = history.slice(-10);
      const conversationSummary = recentMessages
        .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
        .join('\n');
      
      const schoolContext = `\n\nSCHOOLS (${matchingSchools.length}):\n` + 
        matchingSchools.map(s => {
          const tuitionStr = s.tuition ? `$${s.tuition}` : 'N/A';
          return `${s.name} | ${s.city} | Grade ${s.lowestGrade}-${s.highestGrade} | ${s.curriculumType||'Trad'} | Tuition: ${tuitionStr}`;
        }).join('\n');
      
      const resultsSystemPrompt = `[STATE: RESULTS] Explain these school matches. Focus on fit. Do NOT ask intake questions. Max 150 words.

      ${consultantName === 'Jackie' ? 'YOU ARE JACKIE - Warm, empathetic.' : 'YOU ARE LIAM - Direct, strategic.'}`;

      const resultsUserPrompt = `Recent chat:
      ${conversationSummary}
      ${schoolContext}

      Parent: "${message}"

      Respond as ${consultantName}. ONE question max.`;

      let messageWithLinks = 'Here are the schools I found:';
      try {
        const aiResponse = await callOpenRouter({
          systemPrompt: resultsSystemPrompt,
          userPrompt: resultsUserPrompt,
          maxTokens: 800,
          temperature: 0.7
        });
        messageWithLinks = aiResponse || 'Here are the schools I found:';
        console.log('[OPENROUTER] RESULTS response');
      } catch (openrouterError) {
        console.log('[OPENROUTER FALLBACK] RESULTS response falling back to InvokeLLM');
        try {
          const responsePrompt = `[STATE: RESULTS] Explain these school matches. Focus on fit. Do NOT ask intake questions. Max 150 words.

      ${consultantName === 'Jackie' ? 'YOU ARE JACKIE - Warm, empathetic.' : 'YOU ARE LIAM - Direct, strategic.'}

      Recent chat:
      ${conversationSummary}
      ${schoolContext}

      Parent: "${message}"

      Respond as ${consultantName}. ONE question max.`;

          const fallbackResponse = await base44.integrations.Core.InvokeLLM({
            prompt: responsePrompt
          });
          messageWithLinks = fallbackResponse?.response || fallbackResponse || 'Here are the schools I found:';
        } catch (fallbackError) {
          console.error('[FALLBACK ERROR] RESULTS response failed:', fallbackError.message);
        }
      }
      
      // Replace school names with links
      matchingSchools.forEach(school => {
        const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const schoolNameRegex = new RegExp(`(?<!\\[)\\b${escapedName}\\b(?!\\]\\()`, 'gi');
        messageWithLinks = messageWithLinks.replace(
          schoolNameRegex,
          `[${school.name}](school:${school.slug})`
        );
      });
      
      aiMessage = messageWithLinks;
    }
  } catch (e) {
    console.error('[ERROR] RESULTS response failed:', e.message);
    aiMessage = matchingSchools.length > 0 ? 'Here are the schools I found:' : "I don't have matching schools.";
  }
  
  return Response.json({
    message: aiMessage,
    state: updatedCurrentState,
    briefStatus: BRIEF_STATUS.CONFIRMED,
    schools: matchingSchools,
    familyProfile: conversationFamilyProfile,
    conversationContext: context
  });
}