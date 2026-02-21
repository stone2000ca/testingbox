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
    
    // STATE MACHINE: 7 states (strictly deterministic)
    const STATES = {
      GREETING: 'GREETING',
      INTAKE: 'INTAKE',
      BRIEF: 'BRIEF',
      BRIEF_EDIT: 'BRIEF_EDIT',
      SEARCHING: 'SEARCHING',
      RESULTS: 'RESULTS',
      DEEP_DIVE: 'DEEP_DIVE'
    };
    
    let briefEditCount = context.briefEditCount || 0;
    const MAX_BRIEF_EDITS = 3;
    
    // STEP 0: Initialize/retrieve FamilyProfile
    let conversationFamilyProfile = null;
    const conversationId = context.conversationId;
    
    if (userId && conversationId) {
      try {
        const profiles = await base44.entities.FamilyProfile.filter({
          userId,
          conversationId: conversationId
        });
        conversationFamilyProfile = profiles.length > 0 ? profiles[0] : null;
        
        if (!conversationFamilyProfile) {
          conversationFamilyProfile = await base44.entities.FamilyProfile.create({
            userId,
            conversationId: conversationId
          });
          console.log('Created new FamilyProfile:', conversationFamilyProfile.id);
        }
      } catch (e) {
        console.error('FamilyProfile error:', e);
      }
    } else {
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
    
    // STEP 1: ENTITY EXTRACTION (runs on EVERY message)
    let extractedData = {};
    try {
      const t1 = Date.now();
      
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

      const gradeMatch = message.match(/\b(?:grade|gr\.?)\s*([0-9]+|\b(?:pk|jk|k|junior|senior)\b)/i);
      let extractedGrade = null;
      if (gradeMatch) {
        const gradeStr = gradeMatch[1].toLowerCase();
        const gradeMap = { 'pk': -2, 'jk': -1, 'k': 0, 'junior': 11, 'senior': 12 };
        extractedGrade = gradeMap[gradeStr] !== undefined ? gradeMap[gradeStr] : parseInt(gradeStr);
      }

      const extractionPrompt = `Extract ONLY factual data explicitly stated. Return JSON with NULL for anything not mentioned.

CURRENT KNOWN DATA:
${JSON.stringify(knownData, null, 2)}

PARENT'S MESSAGE:
"${message}"

Extract ONLY:
- childName: string or null
- childGrade: number or null (e.g., 3 for Grade 3)
- locationArea: string (city name)
- maxTuition: "unlimited" OR number OR null
- interests: array of strings or null
- priorities: array of strings or null
- concerns: array or null
- dealbreakers: array or null
- learning_needs: array or null
- curriculumPreference: array or null
- religiousPreference: string or null
- boardingPreference: string or null
- genderPreference: "All Boys" OR "All Girls" OR "Co-Ed" OR null
- requestedSchools: array of school names or null

Return ONLY valid JSON. Do NOT explain.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: extractionPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            childName: { type: ["string", "null"] },
            childGrade: { type: ["number", "null"] },
            locationArea: { type: ["string", "null"] },
            maxTuition: { type: ["number", "string", "null"] },
            interests: { type: ["array", "null"], items: { type: "string" } },
            priorities: { type: ["array", "null"], items: { type: "string" } },
            concerns: { type: ["array", "null"], items: { type: "string" } },
            dealbreakers: { type: ["array", "null"], items: { type: "string" } },
            learning_needs: { type: ["array", "null"], items: { type: "string" } },
            curriculumPreference: { type: ["array", "null"], items: { type: "string" } },
            religiousPreference: { type: ["string", "null"] },
            boardingPreference: { type: ["string", "null"] },
            genderPreference: { type: ["string", "null"] },
            requestedSchools: { type: ["array", "null"], items: { type: "string" } }
          }
        }
      });

      let finalResult = result;
      if (extractedGrade !== null && !result.childGrade) {
       finalResult = { ...result, childGrade: extractedGrade };
      }

      const cleaned = {};
      for (const [key, value] of Object.entries(finalResult)) {
       if (value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)) {
         cleaned[key] = value;
       }
      }
      
      extractedData = cleaned;
      console.log('[EXTRACT] took', Date.now() - t1, 'ms');
    } catch (e) {
      console.error('[ERROR] Extraction failed:', e.message);
    }
    
    // Persist extracted data to FamilyProfile immediately
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
      if (conversationFamilyProfile?.id) {
        try {
          conversationFamilyProfile = await base44.entities.FamilyProfile.update(conversationFamilyProfile.id, extractedData);
        } catch (e) {
          console.error('FamilyProfile update failed:', e);
        }
      }
    }
    
    // STEP 2: DETERMINISTIC STATE TRANSITIONS (Backend only)
    let currentState = context.state || STATES.GREETING;
    
    // Rule 1: GREETING → INTAKE on first message
    if (currentState === STATES.GREETING && message) {
      currentState = STATES.INTAKE;
    }
    
    // Rule 2: INTAKE → BRIEF when minimum data present
    if (currentState === STATES.INTAKE) {
      const hasMinimumData = conversationFamilyProfile && 
        conversationFamilyProfile?.childGrade !== null &&
        conversationFamilyProfile?.locationArea &&
        (conversationFamilyProfile?.interests?.length > 0 || 
         conversationFamilyProfile?.priorities?.length > 0 || 
         conversationFamilyProfile?.maxTuition);
      
      const parentMessageCount = conversationHistory?.filter(m => m.role === 'user').length || 0;
      const forcedBriefAfterMessages = parentMessageCount >= 4;
      
      if (hasMinimumData || forcedBriefAfterMessages) {
        currentState = STATES.BRIEF;
        briefEditCount = 0;
      }
    }
    
    // Rule 3: BRIEF → SEARCHING or BRIEF_EDIT
    if (currentState === STATES.BRIEF) {
      const msgLowerTrim = msgLower.trim();
      const isConfirming = /\b(yes|yeah|yep|confirmed?|correct|perfect|great|sounds good|looks good|go ahead|that's right|that's perfect|proceed|search)\b/i.test(msgLowerTrim);
      const isAdjusting = /\b(change|adjust|edit|actually|wait|hold on|no|not right|different|let me|redo)\b/i.test(msgLowerTrim);
      
      if (isConfirming) {
        currentState = STATES.SEARCHING;
      } else if (isAdjusting) {
        briefEditCount++;
        if (briefEditCount >= MAX_BRIEF_EDITS) {
          currentState = STATES.SEARCHING;
          console.log('[STATE] Max brief edits reached, forcing search');
        } else {
          currentState = STATES.BRIEF_EDIT;
        }
      } else {
        currentState = STATES.BRIEF;
      }
    }
    
    // Rule 4: BRIEF_EDIT → BRIEF
    if (currentState === STATES.BRIEF_EDIT) {
      currentState = STATES.BRIEF;
    }
    
    // Rule 6: RESULTS → DEEP_DIVE or BRIEF_EDIT
    if (currentState === STATES.RESULTS) {
      const isAskingAboutSchool = /\b(tell me|about|compare|vs|versus|difference|which|why)\b/i.test(msgLower);
      const isEditingBrief = /\b(change|adjust|different|new search|try again)\b/i.test(msgLower);
      
      if (isAskingAboutSchool) {
        currentState = STATES.DEEP_DIVE;
      } else if (isEditingBrief) {
        currentState = STATES.BRIEF_EDIT;
      } else {
        currentState = STATES.RESULTS;
      }
    }
    
    // Rule 7: DEEP_DIVE → RESULTS or BRIEF_EDIT
    if (currentState === STATES.DEEP_DIVE) {
      const isBackToResults = /\b(back|show me|see more|other schools|list|all)\b/i.test(msgLower);
      const isEditingBrief = /\b(change|adjust|different|new search)\b/i.test(msgLower);
      
      if (isBackToResults) {
        currentState = STATES.RESULTS;
      } else if (isEditingBrief) {
        currentState = STATES.BRIEF_EDIT;
      } else {
        currentState = STATES.DEEP_DIVE;
      }
    }
    
    context.state = currentState;
    context.briefEditCount = briefEditCount;
    console.log(`[STATE] ${context.state} (edits: ${briefEditCount})`);

    // STEP 3: STATE-SPECIFIC RESPONSE GENERATION
    if (currentState === STATES.GREETING) {
      return Response.json({
        message: "I'm your NextSchool education consultant. I help families find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you?",
        state: STATES.GREETING,
        conversationContext: context,
        schools: []
      });
    }
    
    if (currentState === STATES.INTAKE) {
      let intakeMessage;
      try {
        const history = conversationHistory || [];
        const recentMessages = history.slice(-10);
        const conversationSummary = recentMessages
          .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
          .join('\n');
        
        const allText = history.map(m => m.content).join(' ') + ' ' + message;
        let hasLocation = false, hasBudget = false, hasChildGrade = false;
        try {
          hasLocation = /mississauga|toronto|vancouver|calgary|ottawa|montreal|brampton|oakville|markham|vaughan|richmond hill|burnaby|surrey|london|hamilton|winnipeg|quebec|edmonton/i.test(allText);
          hasBudget = /(\$|budget|tuition|cost)\s*\d+/.test(allText) || /\d{2,3}\s*k\b/i.test(allText);
          hasChildGrade = /grade|kindergarten|preschool|elementary|middle|high school/i.test(allText);
        } catch (e) {}
        
        const personaInstructions = consultantName === 'Jackie'
          ? `[STATE: INTAKE] You are gathering family info. Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.
YOU ARE JACKIE - Warm, empathetic, validating.
🚫 IF THEY SAID LOCATION → NEVER ask where they live
🚫 IF THEY SAID BUDGET → NEVER ask budget
🚫 IF THEY SAID GRADE → NEVER ask grade
🚫 ONE QUESTION ONLY. NO filler.`
          : `[STATE: INTAKE] You are gathering family info. Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.
YOU ARE LIAM - Direct, strategic, efficient.
🚫 IF THEY SAID LOCATION → NEVER ask where they live
🚫 IF THEY SAID BUDGET → NEVER ask budget
🚫 IF THEY SAID GRADE → NEVER ask grade
🚫 ONE QUESTION ONLY. NO filler.`;
        
        const responsePrompt = `${personaInstructions}

ENTITY EXTRACTION:
- LOCATION: ${hasLocation ? 'YES' : 'NO'}
- BUDGET: ${hasBudget ? 'YES' : 'NO'}
- GRADE: ${hasChildGrade ? 'YES' : 'NO'}

Recent chat:
${conversationSummary}

Parent: "${message}"

Respond as ${consultantName}. ONE question max. No filler.`;
        
        const aiResponse = await base44.integrations.Core.InvokeLLM({
          prompt: responsePrompt
        });
        
        intakeMessage = aiResponse?.response || aiResponse || 'Tell me more about your child.';
      } catch (e) {
        console.error('[ERROR] INTAKE response failed:', e.message);
        intakeMessage = 'Tell me about your child — what grade are they in and what matters most to you?';
      }
      
      return Response.json({
        message: intakeMessage,
        state: STATES.INTAKE,
        familyProfile: conversationFamilyProfile,
        conversationContext: context,
        schools: []
      });
    }
    
    if (currentState === STATES.BRIEF || currentState === STATES.BRIEF_EDIT) {
      let briefMessage;
      try {
        const { childName, childGrade, locationArea, budgetRange, maxTuition, interests, priorities, dealbreakers, currentSituation, academicStrengths } = conversationFamilyProfile;
        const interestsStr = interests?.length > 0 ? interests.join(', ') : '';
        const prioritiesStr = priorities?.length > 0 ? priorities.join(', ') : '';
        const strengthsStr = academicStrengths?.length > 0 ? academicStrengths.join(', ') : '';
        const dealbreakersStr = dealbreakers?.length > 0 ? dealbreakers.join(', ') : '';
        
        let budgetDisplay = budgetRange || '(not specified)';
        if (maxTuition === 'unlimited') {
          budgetDisplay = 'Budget is flexible';
        } else if (maxTuition) {
          budgetDisplay = `$${maxTuition}/year`;
        }
        
        const briefPrompt = consultantName === 'Jackie'
          ? `[STATE: BRIEF] Generate a warm, narrative brief. Include child name, grade, location, interests, priorities, budget. Use these values EXACTLY. No school names. End: "Does that capture it? Anything to adjust?"
Max 150 words.

FAMILY DATA:
- CHILD: ${childName || '(not shared)'}
- GRADE: ${childGrade ? \`Grade \${childGrade}\` : '(not specified)'}
- LOCATION: ${locationArea || '(not specified)'}
- INTERESTS: ${interestsStr || '(not specified)'}
- PRIORITIES: ${prioritiesStr || '(not specified)'}
- BUDGET: ${budgetDisplay}

YOU ARE JACKIE - Warm, narrative style.`
          : `[STATE: BRIEF] Generate a direct, executive-style brief with bullets. Include child name, grade, location, interests, priorities, budget. Use these values EXACTLY. No school names. End: "Sound right?"
Max 150 words.

FAMILY DATA:
- CHILD: ${childName || '(not shared)'}
- GRADE: ${childGrade ? \`Grade \${childGrade}\` : '(not specified)'}
- LOCATION: ${locationArea || '(not specified)'}
- INTERESTS: ${interestsStr || '(not specified)'}
- PRIORITIES: ${prioritiesStr || '(not specified)'}
- BUDGET: ${budgetDisplay}

YOU ARE LIAM - Direct, strategic style.`;
        
        const briefResult = await base44.integrations.Core.InvokeLLM({
          prompt: briefPrompt,
          add_context_from_internet: false
        });

        briefMessage = briefResult?.response || briefResult || 'Let me summarize what you\'ve shared.';
      } catch (e) {
        console.error('[ERROR] BRIEF response failed:', e.message);
        briefMessage = 'Let me summarize what you\'ve shared. Does that sound right?';
      }
      
      return Response.json({
        message: briefMessage,
        state: STATES.BRIEF,
        familyProfile: conversationFamilyProfile,
        conversationContext: context,
        schools: []
      });
    }
    
    // STEP 4: School search only in SEARCHING/RESULTS/DEEP_DIVE states
    if (currentState === STATES.SEARCHING) {
      const searchParams = {
        limit: 50,
        familyProfile: conversationFamilyProfile
      };

      if (conversationFamilyProfile?.locationArea) {
        searchParams.city = conversationFamilyProfile.locationArea;
      }
      if (conversationFamilyProfile?.provinceState) {
        searchParams.provinceState = conversationFamilyProfile.provinceState;
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
        const priorityToSpec = { 'Arts': 'Arts', 'STEM': 'STEM', 'Sports': 'Sports', 'Languages': 'Languages', 'Leadership': 'Leadership', 'Environmental': 'Environmental' };
        const mappedSpecs = conversationFamilyProfile.priorities.map(p => priorityToSpec[p]).filter(Boolean);
        if (mappedSpecs.length > 0) {
          searchParams.specializations = mappedSpecs;
        }
      }
      
      if (userLocation?.lat && userLocation?.lng) {
        searchParams.userLat = userLocation.lat;
        searchParams.userLng = userLocation.lng;
      }

      let schools = [];
      try {
        const searchResult = await base44.asServiceRole.functions.invoke('searchSchools', {
          ...searchParams,
          conversationId: conversationId,
          userId: userId,
          searchQuery: message
        });
        schools = searchResult.data.schools || [];
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
      currentState = STATES.RESULTS;
      context.state = currentState;
      
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
          
          const responsePrompt = `[STATE: RESULTS] Explain these school matches. Focus on fit. Do NOT ask intake questions. Max 150 words.

${consultantName === 'Jackie' ? 'YOU ARE JACKIE - Warm, empathetic.' : 'YOU ARE LIAM - Direct, strategic.'}

Recent chat:
${conversationSummary}
${schoolContext}

Parent: "${message}"

Respond as ${consultantName}. ONE question max.`;
          
          const aiResponse = await base44.integrations.Core.InvokeLLM({
            prompt: responsePrompt
          });

          let messageWithLinks = aiResponse?.response || aiResponse || 'Here are the schools I found:';
          
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
        state: currentState,
        schools: matchingSchools,
        familyProfile: conversationFamilyProfile,
        conversationContext: context
      });
    }

    if (currentState === STATES.RESULTS || currentState === STATES.DEEP_DIVE) {
      let aiMessage = '';
      try {
        const history = conversationHistory || [];
        const recentMessages = history.slice(-10);
        const conversationSummary = recentMessages
          .map(msg => `${msg.role === 'user' ? 'Parent' : 'Consultant'}: ${msg.content}`)
          .join('\n');
        
        const schoolContext = currentSchools && currentSchools.length > 0
          ? `\n\nSCHOOLS:\n` + currentSchools.map(s => {
              const tuitionStr = s.tuition ? `$${s.tuition}` : 'N/A';
              return `${s.name} | ${s.city} | Grade ${s.lowestGrade}-${s.highestGrade} | Tuition: ${tuitionStr}`;
            }).join('\n')
          : '';
        
        const stateLabel = currentState === STATES.RESULTS ? '[STATE: RESULTS]' : '[STATE: DEEP_DIVE]';
        const responsePrompt = `${stateLabel} Discuss schools. Do NOT ask intake questions. Max 150 words.

${consultantName === 'Jackie' ? 'YOU ARE JACKIE - Warm, empathetic.' : 'YOU ARE LIAM - Direct, strategic.'}

Recent chat:
${conversationSummary}
${schoolContext}

Parent: "${message}"

Respond as ${consultantName}. ONE question max.`;
        
        const aiResponse = await base44.integrations.Core.InvokeLLM({
          prompt: responsePrompt
        });

        let messageWithLinks = aiResponse?.response || aiResponse || 'Tell me more about what you\'re looking for.';
        
        if (currentSchools && currentSchools.length > 0) {
          currentSchools.forEach(school => {
            const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const schoolNameRegex = new RegExp(`(?<!\\[)\\b${escapedName}\\b(?!\\]\\()`, 'gi');
            messageWithLinks = messageWithLinks.replace(
              schoolNameRegex,
              `[${school.name}](school:${school.slug})`
            );
          });
        }
        
        aiMessage = messageWithLinks;
      } catch (e) {
        console.error('[ERROR] RESULTS/DEEP_DIVE response failed:', e.message);
        aiMessage = 'Tell me more about what you\'re looking for.';
      }
      
      return Response.json({
        message: aiMessage,
        state: currentState,
        schools: currentSchools || [],
        familyProfile: conversationFamilyProfile,
        conversationContext: context
      });
    }

    // Fallback
    return Response.json({
      message: 'I encountered an unexpected state. Please try again.',
      state: currentState,
      schools: [],
      familyProfile: conversationFamilyProfile,
      conversationContext: context
    });

    } catch (error) {
      console.error('orchestrateConversation FATAL:', error);
      return Response.json({ error: error.message || String(error) }, { status: 500 });
    }
  };

  try {
    return await Promise.race([processRequest(), timeoutPromise]);
  } catch (error) {
    if (error.message === 'TIMEOUT') {
      return Response.json({ 
        error: 'Request timeout',
        status: 408 
      }, { status: 408 });
    }
    return Response.json({ 
      error: 'Something went wrong. Please try again.',
      status: 500 
    }, { status: 500 });
  }
});