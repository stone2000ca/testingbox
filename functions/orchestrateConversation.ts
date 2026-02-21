import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const TIMEOUT_MS = 25000;
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  );

  const processRequest = async () => {
    try {
      const base44 = createClientFromRequest(req);
      const { message, conversationHistory, conversationContext, region, userId, consultantName, currentSchools, userNotes, shortlistedSchools, userLocation } = await req.json();

    console.log('ORCH START', { 
      messageLength: message?.length, 
      hasConversationHistory: !!conversationHistory,
      conversationHistoryLength: conversationHistory?.length,
      hasConversationContext: !!conversationContext, 
      consultant: consultantName,
      userId: userId,
      hasUserLocation: !!userLocation
    });

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
    } else {
      // For unauthenticated users, create a local empty object
      conversationFamilyProfile = {
        childName: null,
        childGrade: null,
        locationArea: null,
        maxTuition: null,
        interests: [],
        priorities: [],
        dealbreakers: [],
        academicStrengths: []
      };
    }
    
    // STEP 1: ENTITY EXTRACTION - Run BEFORE state machine (INLINED)
    let extractedData = {};
    try {
      const t1 = Date.now();
      
      // Build context for extraction
      const knownData = conversationFamilyProfile ? {
        childName: conversationFamilyProfile.childName,
        childGrade: conversationFamilyProfile.childGrade,
        locationArea: conversationFamilyProfile.locationArea,
        maxTuition: conversationFamilyProfile.maxTuition,
        interests: conversationFamilyProfile.interests,
        priorities: conversationFamilyProfile.priorities,
        dealbreakers: conversationFamilyProfile.dealbreakers,
        curriculumPreference: conversationFamilyProfile.curriculumPreference,
        religiousPreference: conversationFamilyProfile.religiousPreference,
        boardingPreference: conversationFamilyProfile.boardingPreference
      } : {};

      const conversationSummary = conversationHistory?.slice(-5)
        .map(m => `${m.role === 'user' ? 'Parent' : 'AI'}: ${m.content}`)
        .join('\n') || '';

      // First pass: Extract grade using regex (for speed & reliability)
      const gradeMatch = message.match(/\b(?:grade|gr\.?)\s*([0-9]+|\b(?:pk|jk|k|junior|senior)\b)/i);
      let extractedGrade = null;
      if (gradeMatch) {
        const gradeStr = gradeMatch[1].toLowerCase();
        const gradeMap = { 'pk': -2, 'jk': -1, 'k': 0, 'junior': 11, 'senior': 12 };
        extractedGrade = gradeMap[gradeStr] !== undefined ? gradeMap[gradeStr] : parseInt(gradeStr);
      }

      const extractionPrompt = `Extract ONLY factual data that the parent explicitly stated. Do NOT infer.
Return a JSON object with NULL for anything not mentioned.

CURRENT KNOWN DATA:
${JSON.stringify(knownData, null, 2)}

CONVERSATION CONTEXT:
${conversationSummary}

PARENT'S MESSAGE:
"${message}"

Extract and return ONLY these fields (null if not mentioned):
- childName: string (parent used child's name)
- childGrade: number (grade level, e.g., 3 for Grade 3. If you see "grade 1" or "Grade 3" or similar, extract the number. CRITICAL: Return as a number, not a string.)
- locationArea: string (city or area name)
- maxTuition: number (annual tuition budget mentioned)
- interests: array of strings (child's interests: sports, arts, STEM, etc.)
- priorities: array of strings (what matters most, what they want, what's important - e.g. "academics and arts are most important" -> ["academics", "arts"])
- concerns: array of strings (any mention of problems, worries, fears)
- dealbreakers: array of strings (any "no", "not", "don't want" statements)
- learning_needs: array of strings (any diagnoses, challenges, special needs mentioned)
- curriculumPreference: array of strings (curriculum types mentioned: IB, Montessori, etc.)
- religiousPreference: string (secular, or specific religion if mentioned)
- boardingPreference: string (day only, open to boarding, boarding preferred)

Return ONLY valid JSON. Do NOT explain.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: extractionPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            childName: { type: ["string", "null"] },
            childGrade: { type: ["number", "null"] },
            locationArea: { type: ["string", "null"] },
            maxTuition: { type: ["number", "null"] },
            interests: { type: ["array", "null"], items: { type: "string" } },
            priorities: { type: ["array", "null"], items: { type: "string" } },
            concerns: { type: ["array", "null"], items: { type: "string" } },
            dealbreakers: { type: ["array", "null"], items: { type: "string" } },
            learning_needs: { type: ["array", "null"], items: { type: "string" } },
            curriculumPreference: { type: ["array", "null"], items: { type: "string" } },
            religiousPreference: { type: ["string", "null"] },
            boardingPreference: { type: ["string", "null"] }
          }
        }
      });

      // Regex extraction overrides LLM result if grade was found
      let finalResult = result;
      if (extractedGrade !== null && !result.childGrade) {
       finalResult = { ...result, childGrade: extractedGrade };
      }

      // Clean up nulls and empty arrays
      const cleaned = {};
      for (const [key, value] of Object.entries(finalResult)) {
       if (value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)) {
         cleaned[key] = value;
       }
      }
      
      extractedData = cleaned;
      console.log('[DIAGNOSTIC] [extractEntityData-INLINED] took', Date.now() - t1, 'ms');
    } catch (e) {
      console.error('[ERROR] extractEntityData-INLINED failed:', e.message);
      // Continue without extraction - don't crash
    }
    
    // Merge extracted data into conversation-scoped profile (overwrite empty arrays and null/undefined values)
    if (conversationFamilyProfile && Object.keys(extractedData).length > 0) {
      for (const [key, value] of Object.entries(extractedData)) {
        if (value !== null && value !== undefined) {
          const existing = conversationFamilyProfile[key];
          if (existing === null || existing === undefined || 
              (Array.isArray(existing) && existing.length === 0) ||
              (Array.isArray(value) && value.length > 0)) {
            conversationFamilyProfile[key] = value;
          }
        }
      }
      // Update profile in DB (only if it has an ID, i.e., authenticated user)
      if (conversationFamilyProfile?.id) {
        try {
          conversationFamilyProfile = await base44.entities.FamilyProfile.update(conversationFamilyProfile.id, extractedData);
        } catch (e) {
          console.error('Failed to update FamilyProfile with extracted data:', e);
        }
      }
    }
    
    // STEP 2: DETERMINE CURRENT STATE
    let currentState = context.state || STATES.GREETING;
    
    // First user message → move to INTAKE (conversationHistory can be empty on first message)
    if (currentState === STATES.GREETING && message) {
      currentState = STATES.INTAKE;
    }
    
    // Check if we have minimum intake data (grade + location + at least one of: priority/interest/budget)
    const hasMinimumData = conversationFamilyProfile && 
      conversationFamilyProfile?.childGrade !== null &&
      conversationFamilyProfile?.locationArea &&
      (conversationFamilyProfile?.interests?.length > 0 || conversationFamilyProfile?.priorities?.length > 0 || conversationFamilyProfile?.maxTuition);
    
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
    
    console.log(`[orchestrateConversation] STATE MACHINE: ${context.state || 'INIT'} → ${currentState}, extracted: ${Object.keys(extractedData).join(',')}`);
    
    // Update context with new state
    context.state = currentState;

    // STEP 3: Detect intent (INLINED)
    let intentResponse;
    try {
      const t2 = Date.now();
      
      // Extract intent via keyword matching
      let intent = 'SHOW_SCHOOLS'; // default
      let shouldShowSchools = true;
      let filterCriteria = {};
      let comparisonSchoolNames = [];
      
      // Compare intent
      if (msgLower.includes('compare') || msgLower.includes(' vs ') || msgLower.includes('versus') || 
          msgLower.includes('side by side') || msgLower.includes('side-by-side')) {
        intent = 'COMPARE_SCHOOLS';
        shouldShowSchools = false;
        
        // Extract school names for comparison
        let cleanedMessage = message
          .replace(/^compare\s+/i, '')
          .replace(/\s+(with|and|vs|versus|to|side\s*by\s*side)\s+/gi, '|')
          .trim();
        comparisonSchoolNames = cleanedMessage.split('|').map(n => n.trim()).filter(n => n.length > 3);
      }
      // Narrow down intent
      else if (msgLower.includes('narrow') || msgLower.includes('filter') || msgLower.includes('only show')) {
        intent = 'NARROW_DOWN';
        shouldShowSchools = false;
      }
      // Pure greetings
      else if (/^(hi|hello|hey|greetings|good morning|good afternoon|howdy|welcome)[\s!.]*$/i.test(msgLower.trim())) {
        intent = 'GREETING';
        shouldShowSchools = false;
      }
      // SEARCH_SCHOOLS intent - when user is actively looking for schools
      else if (msgLower.includes('show') || msgLower.includes('find') || msgLower.includes('search') ||
               msgLower.includes('schools in') || msgLower.includes('schools near') ||
               msgLower.includes('private school') || msgLower.includes('looking for')) {
        intent = 'SEARCH_SCHOOLS';
        shouldShowSchools = true;
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
      
      // ESL/Language support filter
      if (msgLower.includes('esl') || msgLower.includes('english as a second language') || msgLower.includes('language support')) {
        filterCriteria.specializations = filterCriteria.specializations || [];
        if (!filterCriteria.specializations.includes('Languages')) {
          filterCriteria.specializations.push('Languages');
        }
        intent = 'NARROW_DOWN';
        shouldShowSchools = false;
      }
      
      // Gender filtering
      let genderPreference = null;
      if (msgLower.includes(' son') || msgLower.includes('boy') || msgLower.includes('boys')) {
        genderPreference = 'boy';
      } else if (msgLower.includes(' daughter') || msgLower.includes('girl') || msgLower.includes('girls')) {
        genderPreference = 'girl';
      }
      if (genderPreference) {
        filterCriteria.genderPreference = genderPreference;
      }
      
      intentResponse = {
        intent,
        shouldShowSchools,
        filterCriteria,
        comparisonSchoolNames
      };
      
      console.log('[DIAGNOSTIC] [detectIntent-INLINED] took', Date.now() - t2, 'ms');
    } catch (e) {
      console.error('[ERROR] detectIntent-INLINED failed:', e.message);
      intentResponse = { intent: 'INTAKE_QUESTION', shouldShowSchools: false };
    }
    
    // STEP 4: Handle state-specific response generation BEFORE school search
    if (currentState === STATES.GREETING) {
      return Response.json({
        message: "I'm your NextSchool education consultant. I help families across Canada, the US, and Europe find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you in a school?",
        state: STATES.GREETING,
        conversationContext: context,
        schools: []
      });
    }
    
    if (currentState === STATES.INTAKE) {
      // INTAKE: Generate response (INLINED)
      console.log(`[orchestrateConversation] INTAKE state: Generating response inline`);
      let intakeMessage;
      try {
        const t3 = Date.now();
        
        // Build conversation context
        const history = conversationHistory || [];
        const recentMessages = history.slice(-10);
        const conversationSummary = recentMessages
          .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
          .join('\n');
        
        // Entity extraction from conversation
        const allText = history.map(m => m.content).join(' ') + ' ' + message;
        let hasLocation = false;
        let hasBudget = false;
        let hasChildGrade = false;

        try {
          hasLocation = /mississauga|toronto|vancouver|calgary|ottawa|montreal|brampton|oakville|markham|vaughan|richmond hill|burnaby|surrey|london|hamilton|winnipeg|quebec|edmonton/i.test(allText);
          hasBudget = /(\$|budget|tuition|cost)\s*\d+/.test(allText) || /\d{2,3}\s*[k](?:\s*per|\/)?(?:\s*year|annually)?/i.test(allText);
          hasChildGrade = /grade|kindergarten|preschool|elementary|middle|high school|grade \d/i.test(allText);
        } catch (regexError) {
          console.warn('Regex extraction error:', regexError);
        }

        const extractedInfo = { hasLocation, hasBudget, hasChildGrade };

        // Build persona-specific instructions
        const personaInstructions = consultantName === 'Jackie'
         ? `YOU ARE JACKIE - The Warm & Supportive Consultant:

===== RESPONSE FORMAT RULES (APPLY TO EVERY MESSAGE) =====
Maximum 150 words per response. No exceptions. Maximum 3 paragraphs. One question maximum per response. Use contractions. Write like you're talking, not writing.

===== ABSOLUTE RULES (NON-NEGOTIABLE) =====
🚫 IF PARENT SAID LOCATION (e.g., "Mississauga", "Toronto") → NEVER ask "where are you located?"
🚫 IF PARENT SAID BUDGET (e.g., "$15-20K", "around 20") → NEVER ask "what's your budget?"
🚫 IF PARENT SAID GRADE (e.g., "Grade 3", "high school") → NEVER ask "what grade?"
🚫 ONE QUESTION ONLY per message. Not two. Not multiple. Count: 1.
🚫 NO filler: "It's great that", "It's wonderful that", "That's amazing", "I'm glad", "I understand"—AVOID.

Your core identity: empathetic, emotionally attuned, validating. You make families feel heard.`
         : `YOU ARE LIAM - The Direct & Strategic Consultant:

===== RESPONSE FORMAT RULES (APPLY TO EVERY MESSAGE) =====
Maximum 150 words per response. No exceptions. Maximum 3 paragraphs. One question maximum per response. Use contractions. Write like you're talking, not writing.

===== ABSOLUTE RULES (NON-NEGOTIABLE) =====
🚫 IF PARENT SAID LOCATION (e.g., "Mississauga", "Toronto") → NEVER ask "where are you located?"
🚫 IF PARENT SAID BUDGET (e.g., "$15-20K", "around 20") → NEVER ask "what's your budget?"
🚫 IF PARENT SAID GRADE (e.g., "Grade 3", "high school") → NEVER ask "what grade?"
🚫 ONE QUESTION ONLY per message. Not two. Not multiple. Count: 1.
🚫 NO filler: "It's great that", "It's wonderful that", "That's amazing", "I'm glad"—AVOID.

Your core identity: data-driven, efficient, action-focused. Cut through complexity fast.`;

        // Generate response
        const responsePrompt = `${personaInstructions}

===== ENTITY EXTRACTION (DO THIS FIRST) =====
From the parent's message AND conversation history, extract:
- LOCATION ALREADY MENTIONED: ${extractedInfo.hasLocation ? 'YES - do NOT ask where they live' : 'NO - ask if needed'}
- BUDGET ALREADY MENTIONED: ${extractedInfo.hasBudget ? 'YES - do NOT ask budget' : 'NO - ask if needed'}
- GRADE ALREADY MENTIONED: ${extractedInfo.hasChildGrade ? 'YES - do NOT ask grade' : 'NO - ask if needed'}

===== ONE QUESTION ONLY RULE =====
Count your questions before sending. If you have more than one "?", DELETE extra questions.

Recent chat:
${conversationSummary}

Parent: "${message}"

Respond as ${consultantName}. ONE question max. No filler. Never re-ask extracted info.`;

        const aiResponse = await base44.integrations.Core.InvokeLLM({
          prompt: responsePrompt
        });
        
        intakeMessage = aiResponse;
        console.log('[DIAGNOSTIC] [generateResponse-INTAKE-INLINED] took', Date.now() - t3, 'ms');
      } catch (e) {
        console.error('[ERROR] generateResponse-INTAKE-INLINED failed:', e.message);
        intakeMessage = 'Tell me about your child - what grade are they in and what matters most to you in a school?';
      }
      
      return Response.json({
        message: intakeMessage,
        state: STATES.INTAKE,
        familyProfile: conversationFamilyProfile,
        conversationContext: context,
        schools: []
      });
    }
    
    if (currentState === STATES.BRIEF) {
      // BRIEF: Generate The Brief from profile (INLINED)
      let briefMessage;
      try {
        const t4 = Date.now();
        const { childName, childGrade, locationArea, budgetRange, maxTuition, interests, priorities, dealbreakers, currentSituation, academicStrengths } = conversationFamilyProfile;
        
        // Format arrays for the prompt
        const interestsStr = interests?.length > 0 ? interests.join(', ') : '';
        const prioritiesStr = priorities?.length > 0 ? priorities.join(', ') : '';
        const strengthsStr = academicStrengths?.length > 0 ? academicStrengths.join(', ') : '';
        const dealbreakersStr = dealbreakers?.length > 0 ? dealbreakers.join(', ') : '';
        
        const briefPrompt = `You are a warm, empathetic education consultant. Generate "The Brief" - a reflection message that mirrors back EXACTLY what was shared.

====== CRITICAL BRIEF GENERATION RULE ======
Never say "you haven't specified" or "you didn't mention" about any field that appears in the extracted profile below. If a field is present in the extracted data, reflect it back. Only note gaps for fields that are genuinely empty.

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

====== GENERATE THE BRIEF ======
1. Open: "Here's what I'm taking away from what you've shared..."
2. Mirror their exact details using their own words. Use the family data field values exactly as shown above.
3. Acknowledge constraints realistically.
4. Close: "Does that capture what you're looking for? Anything I'm missing or needs adjustment?"

Keep to 2-3 paragraphs. Sound warm and empathetic. NO school names.`;

        const briefResult = await base44.integrations.Core.InvokeLLM({
          prompt: briefPrompt,
          add_context_from_internet: false
        });
        
        briefMessage = briefResult;
        console.log('[DIAGNOSTIC] [generateResponse-BRIEF-INLINED] took', Date.now() - t4, 'ms');
      } catch (e) {
        console.error('[ERROR] generateResponse-BRIEF-INLINED failed:', e.message);
        briefMessage = 'Let me summarize what you\'ve shared so far. Does that sound right?';
      }
      
      return Response.json({
        message: briefMessage,
        state: STATES.BRIEF,
        familyProfile: conversationFamilyProfile,
        conversationContext: context,
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
        schools: []
      });
    }
    
    // STEP 4B: School search ONLY in SEARCHING state
    // Do NOT fall through for other states
    if (currentState !== STATES.SEARCHING) {
      // State machine is the sole gate—if we're not in SEARCHING, return error fallback
      console.log(`STATE MACHINE BLOCK: currentState=${currentState}, no search performed`);
      return Response.json({
        message: 'I encountered an unexpected state. Please try again.',
        state: currentState,
        intent: intentResponse.intent,
        schools: [],
        familyProfile: conversationFamilyProfile,
        filterCriteria: intentResponse.filterCriteria || {},
        conversationContext: context
      });
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
    } else if (currentState === STATES.SEARCHING) {
     // SEARCHING state: perform school search using conversation profile
     const searchParams = {
       limit: 50,
       familyProfile: conversationFamilyProfile
     };

     // Use extracted data from conversation profile
     if (conversationFamilyProfile?.locationArea) {
       searchParams.city = conversationFamilyProfile.locationArea;
     }

     if (conversationFamilyProfile?.childGrade) {
       searchParams.minGrade = conversationFamilyProfile.childGrade;
       searchParams.maxGrade = conversationFamilyProfile.childGrade;
     }

     if (conversationFamilyProfile?.maxTuition) {
       searchParams.maxTuition = conversationFamilyProfile.maxTuition;
     }

     if (conversationFamilyProfile?.curriculumPreference?.length > 0) {
       searchParams.curriculumType = conversationFamilyProfile.curriculumPreference[0];
     }

     if (conversationFamilyProfile?.priorities?.length > 0) {
       // Map family priorities to specializations
       const priorityToSpec = {
         'Arts': 'Arts',
         'STEM': 'STEM',
         'Sports': 'Sports',
         'Languages': 'Languages',
         'Leadership': 'Leadership',
         'Environmental': 'Environmental'
       };
       const mappedSpecs = conversationFamilyProfile.priorities
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

      console.log('[DIAGNOSTIC] [searchSchools] Time:', new Date().toISOString());
      console.log('[DIAGNOSTIC] [searchSchools] Params:', JSON.stringify(searchParams));
      
      let schools = [];
      try {
        const searchResult = await base44.asServiceRole.functions.invoke('searchSchools', searchParams);
        schools = searchResult.data.schools || [];
      } catch (e) {
        console.error('[ERROR] searchSchools failed:', e.message, 'Status:', e.response?.status);
        console.error('ACTUAL ERROR:', e.message, e.response?.data, e.stack);
        // Continue with empty schools array
      }
      
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
      if (conversationFamilyProfile && conversationFamilyProfile.onboardingComplete && matchingSchools.length > 0) {
        try {
          const explanationsResult = await base44.asServiceRole.functions.invoke('generateMatchExplanations', {
            familyProfile: conversationFamilyProfile,
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
          console.error('[ERROR] generateMatchExplanations failed:', e.message);
          // Continue without explanations
        }
      }
    }

    // STEP 5: For SEARCHING/RESULTS states, generate school response (INLINED)
    let aiMessage = '';
    let responseTimedOut = false;
    
    if (currentState === STATES.SEARCHING || currentState === STATES.RESULTS) {
      try {
        const t5 = Date.now();
        
        // Check if no schools - return early
        if (!matchingSchools || matchingSchools.length === 0) {
          aiMessage = "I don't have any schools in our database that match your criteria yet. Our database is growing - please try a nearby city or broader search criteria.";
        } else {
          // Build conversation context
          const history = conversationHistory || [];
          const recentMessages = history.slice(-10);
          const conversationSummary = recentMessages
            .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
            .join('\n');
          
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
          
          // Build school context
          const schoolContext = `\n\nSCHOOLS (${matchingSchools.length}):\n` + 
            matchingSchools.map(s => {
              const tuitionStr = s.tuition ? `$${s.tuition} ${s.currency || 'CAD'}` : 'N/A';
              return `${s.name}|${s.city}|Gr${formatGradeRange(s.lowestGrade, s.highestGrade)}|${s.curriculumType||'Trad'}|Tuition: ${tuitionStr}|Type: ${s.schoolType||'General'}`;
            }).join('\n');
          
          // Entity extraction from conversation
          const allText = history.map(m => m.content).join(' ') + ' ' + message;
          let hasLocation = false;
          let hasBudget = false;
          let hasChildGrade = false;

          try {
            hasLocation = /mississauga|toronto|vancouver|calgary|ottawa|montreal|brampton|oakville|markham|vaughan|richmond hill|burnaby|surrey|london|hamilton|winnipeg|quebec|edmonton/i.test(allText);
            hasBudget = /(\$|budget|tuition|cost)\s*\d+/.test(allText) || /\d{2,3}\s*[k](?:\s*per|\/)?(?:\s*year|annually)?/i.test(allText);
            hasChildGrade = /grade|kindergarten|preschool|elementary|middle|high school|grade \d/i.test(allText);
          } catch (regexError) {
            console.warn('Regex extraction error:', regexError);
          }

          const extractedInfo = { hasLocation, hasBudget, hasChildGrade };

          // Build persona-specific instructions
          const personaInstructions = consultantName === 'Jackie'
           ? `YOU ARE JACKIE - The Warm & Supportive Consultant:

===== RESPONSE FORMAT RULES =====
Maximum 150 words per response. No exceptions. Maximum 3 paragraphs. One question maximum per response.

Your core identity: empathetic, emotionally attuned, validating.`
           : `YOU ARE LIAM - The Direct & Strategic Consultant:

===== RESPONSE FORMAT RULES =====
Maximum 150 words per response. No exceptions. Maximum 3 paragraphs. One question maximum per response.

Your core identity: data-driven, efficient, action-focused.`;

          // Generate response
          const responsePrompt = `${personaInstructions}

Recent chat:
${conversationSummary}
${schoolContext}

Parent: "${message}"

Respond as ${consultantName}. ONE question max. No filler.`;

          const aiResponse = await base44.integrations.Core.InvokeLLM({
            prompt: responsePrompt
          });
          
          let messageWithLinks = aiResponse;
          
          // Replace school names with school:slug links
          matchingSchools.forEach(school => {
            const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const markdownLinkRegex = new RegExp(`\\[${escapedName}\\]\\([^)]+\\)`, 'gi');
            messageWithLinks = messageWithLinks.replace(
              markdownLinkRegex,
              `[${school.name}](school:${school.slug})`
            );
            
            const schoolNameRegex = new RegExp(`(?<!\\[)\\b${escapedName}\\b(?!\\]\\()`, 'gi');
            messageWithLinks = messageWithLinks.replace(
              schoolNameRegex,
              `[${school.name}](school:${school.slug})`
            );
          });
          
          aiMessage = messageWithLinks;
        }
        
        console.log('[DIAGNOSTIC] [generateResponse-SEARCHING/RESULTS-INLINED] took', Date.now() - t5, 'ms');
      } catch (error) {
        console.error('[ERROR] generateResponse-SEARCHING/RESULTS-INLINED failed:', error.message);
        responseTimedOut = true;
        aiMessage = matchingSchools.length > 0 ? 'Here are the schools I found:' : 'I don\'t have any schools matching that criteria.';
      }

      if (matchingSchools.length === 0 && !aiMessage.includes('don\'t have') && !aiMessage.includes('no ')) {
        aiMessage = 'I don\'t have any schools matching that criteria yet. Our database is growing - try a nearby city or broader criteria.';
      }
      
      currentState = STATES.RESULTS;
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
      await base44.asServiceRole.functions.invoke('updateUserMemory', { 
        userId, 
        userMessage: message,
        deduplicate: true
      });
    } catch (e) {
      console.error('[ERROR] updateUserMemory failed:', e.message);
    }

    return Response.json({
      message: aiMessage,
      state: currentState,
      intent: intentResponse.intent,
      schools: matchingSchools,
      familyProfile: conversationFamilyProfile,
      filterCriteria: intentResponse.filterCriteria || {},
      conversationContext: context
    });
    } catch (error) {
      console.error('orchestrateConversation FATAL:', error);
      return Response.json({ error: error.message || String(error), stack: error.stack }, { status: 500 });
    }
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