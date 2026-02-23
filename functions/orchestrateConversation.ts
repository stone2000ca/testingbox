import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
// deploy-trigger-v5

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
    
    // AGGRESSIVE STATE RESET - must be FIRST thing after context is set
    const histLen = conversationHistory?.length || 0;
    if (histLen <= 1) {
      console.log('[HARD RESET] histLen=' + histLen + ', clearing stale state');
      context.state = 'WELCOME';
      context.briefStatus = null;
      context.briefEditCount = 0;
    }
    
    // STATE MACHINE: 5 states (strictly deterministic)
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
- budgetMin: number or null (minimum budget)
- budgetMax: number or null (maximum budget)
- maxTuition: "unlimited" OR number OR null (for backward compatibility)
- interests: array of strings or null
- priorities: array of strings or null (FIX 4: When user says "arts", "music", "theater", "drama" → priorities: ["Arts"]. When "STEM", "science", "math" → priorities: ["STEM"]. When "sports" → priorities: ["Sports"]. When "languages", "French", "Spanish" → priorities: ["Languages"])
- concerns: array or null
- dealbreakers: array or null
- learning_needs: array or null (e.g., "ADHD", "ASD", "dyslexia", "ESL", "gifted", "learning disability")
- curriculumPreference: array or null (e.g., "French immersion", "IB", "AP", "Montessori", "progressive", "traditional")
- programPreferences: array or null (e.g., "outdoor education", "French immersion", "arts focus", "STEM", "athletics", "music program")
- religiousPreference: string or null
- boardingPreference: string or null
- genderPreference: "Co-Ed" OR "All Boys" OR "All Girls" OR null
- classSize: string or null (e.g., "small", "standard", "15 students", "intimate")
- requestedSchools: array of school names or null
- financialAidInterest: boolean or null (triggered by "financial aid", "scholarship", "afford", "budget tight")
- specialNeeds: array or null (e.g., "ADHD", "ASD", "dyslexia", "ESL support")

EXAMPLES:
- "She has ADHD" → learning_needs: ["ADHD"], specialNeeds: ["ADHD"]
- "Looking for French immersion" → curriculumPreference: ["French immersion"], programPreferences: ["French immersion"]
- "Need financial aid" → financialAidInterest: true
- "Small class sizes important" → classSize: "small"
- "We want arts and small classes" → priorities: ["Arts"], classSize: "small"
- "Music and theater are important" → priorities: ["Arts"]
- "Strong in STEM" → priorities: ["STEM"], programPreferences: ["STEM"]
- "Co-ed school preferred" → genderPreference: "Co-Ed"
- "Budget $20k-$35k" → budgetMin: 20000, budgetMax: 35000
- "Outdoor education important" → programPreferences: ["outdoor education"]

Return ONLY valid JSON. Do NOT explain.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: extractionPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            childName: { type: ["string", "null"] },
            childGrade: { type: ["number", "null"] },
            locationArea: { type: ["string", "null"] },
            budgetMin: { type: ["number", "null"] },
            budgetMax: { type: ["number", "null"] },
            maxTuition: { type: ["number", "string", "null"] },
            interests: { type: ["array", "null"], items: { type: "string" } },
            priorities: { type: ["array", "null"], items: { type: "string" } },
            concerns: { type: ["array", "null"], items: { type: "string" } },
            dealbreakers: { type: ["array", "null"], items: { type: "string" } },
            learning_needs: { type: ["array", "null"], items: { type: "string" } },
            curriculumPreference: { type: ["array", "null"], items: { type: "string" } },
            programPreferences: { type: ["array", "null"], items: { type: "string" } },
            religiousPreference: { type: ["string", "null"] },
            boardingPreference: { type: ["string", "null"] },
            genderPreference: { type: ["string", "null"] },
            classSize: { type: ["string", "null"] },
            requestedSchools: { type: ["array", "null"], items: { type: "string" } },
            financialAidInterest: { type: ["boolean", "null"] },
            specialNeeds: { type: ["array", "null"], items: { type: "string" } }
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
    
    // FIX A: Merge extracted entities into context for accumulation
    if (!context.extractedEntities) {
      context.extractedEntities = {};
    }
    for (const [key, value] of Object.entries(extractedData)) {
      if (value !== null && value !== undefined) {
              // Merge arrays instead of replacing
            if (Array.isArray(value) && Array.isArray(context.extractedEntities[key]) && context.extractedEntities[key].length > 0) {
              context.extractedEntities[key] = [...new Set([...context.extractedEntities[key], ...value])];
            } else {
              context.extractedEntities[key] = value;
            }
      }
    }
    
    // Persist extracted data to FamilyProfile immediately
    if (conversationFamilyProfile && Object.keys(extractedData).length > 0) {
      for (const [key, value] of Object.entries(extractedData)) {
        if (value !== null && value !== undefined) {
          const existing = conversationFamilyProfile[key];
          
          // Array fields: merge and deduplicate
          if (Array.isArray(value)) {
            if (Array.isArray(existing) && existing.length > 0) {
              conversationFamilyProfile[key] = [...new Set([...existing, ...value])];
            } else {
              conversationFamilyProfile[key] = value;
            }
          } 
          // Scalar fields: overwrite if new value is non-empty
          else if (value !== '') {
            conversationFamilyProfile[key] = value;
          }
          // If value is empty string, keep existing value (no update)
        }
      }
      if (conversationFamilyProfile?.id) {
        try {
          // CRITICAL FIX: Pass the fully merged conversationFamilyProfile object to preserve all existing data
          conversationFamilyProfile = await base44.entities.FamilyProfile.update(conversationFamilyProfile.id, conversationFamilyProfile);
        } catch (e) {
          console.error('FamilyProfile update failed:', e);
        }
      }
    }
    
    // STEP 2: DETERMINISTIC STATE TRANSITIONS
    let currentState = context.state || STATES.WELCOME;
    let briefStatus = context.briefStatus || null;

    // Rule 1: WELCOME -> DISCOVERY on first message
    if (currentState === STATES.WELCOME && message) {
      currentState = STATES.DISCOVERY;
    }

    // FIX B: Question detection function
    function isDirectQuestion(text) {
      const t = text.trim();
      if (t.endsWith('?')) return true;
      const l = t.toLowerCase();
      return ['what ','how ','why ','do ','does ','can ','could ','are ','is ','should ','would '].some(p => l.startsWith(p));
    }
    
    // Rule 2: DISCOVERY -> BRIEF when Tier 1 data is met AND minimum turn count reached
    // FIX A: Check accumulated entities in context.extractedEntities
    if (currentState === STATES.DISCOVERY) {
      const hasLocation = !!(context.extractedEntities?.locationArea || context.extractedEntities?.city || region);
      const hasGradeOrType = !!(context.extractedEntities?.childGrade || context.extractedEntities?.curriculumPreference || context.extractedEntities?.schoolType);
      const userMessageCount = conversationHistory?.filter(m => m.role === 'user').length || 0;
      
      // KI-11: Detect readiness signals - user explicitly wants to move forward
      const readinessSignals = /\b(show me the summary|move forward|that covers everything|I think that's it|ready to see|let's see the schools|let's move on|that's all|that should be enough)\b/i.test(msgLower);
      
      console.log('[TIER1 CHECK]', {hasLocation, hasGradeOrType, userMessageCount, readinessSignals, entities: context.extractedEntities});
      
      const isQuestion = isDirectQuestion(message);
      
      // Transition to BRIEF if: (Tier 1 data + 3 turns AND not question) OR (Tier 1 data + readiness signal)
      // FIX: Readiness signals OVERRIDE the isQuestion check
      if (hasLocation && hasGradeOrType && ((userMessageCount >= 3 && !isQuestion) || readinessSignals)) {
        currentState = STATES.BRIEF;
        briefStatus = BRIEF_STATUS.GENERATING;
        if (readinessSignals) {
          console.log('[READINESS SIGNAL] User explicitly ready, transitioning to BRIEF');
        }
      } else if (isQuestion) {
        console.log('[QUESTION-FIRST GUARD] Question detected, staying in DISCOVERY');
      } else if (hasLocation && hasGradeOrType && userMessageCount < 3 && !readinessSignals) {
        console.log('[TURN COUNT GUARD] Tier 1 data met but only', userMessageCount, 'user messages, staying in DISCOVERY');
      }
    }

    // Rule 3: BRIEF state handling
    if (currentState === STATES.BRIEF) {
      console.log('[BRIEF STATE]', {briefStatus, msgLower});
      
      const isConfirming = /(looks right|show me schools|yes|yeah|yep|correct|perfect|great|sounds good|looks good|go ahead|that's right|that's perfect)/i.test(msgLower);
      const isAdjusting = /\b(change|adjust|edit|actually|wait|hold on|no|not right|different|let me|redo)\b/i.test(msgLower);
      
      if (briefStatus === BRIEF_STATUS.PENDING_REVIEW || briefStatus === BRIEF_STATUS.EDITING) {
        if (isConfirming) {
          console.log('[BRIEF->RESULTS] Confirmation detected, transitioning to RESULTS');
          currentState = STATES.RESULTS;
          briefStatus = BRIEF_STATUS.CONFIRMED;
        } else if (isAdjusting) {
          // Don't increment here - only increment when actual changes are provided
          if (briefEditCount >= MAX_BRIEF_EDITS) {
            currentState = STATES.RESULTS;
            briefStatus = BRIEF_STATUS.CONFIRMED;
          } else {
            briefStatus = BRIEF_STATUS.EDITING;
          }
                } else if (briefStatus === BRIEF_STATUS.EDITING) {
          // User provided specific adjustments - increment count and regenerate brief
          console.log('[BRIEF ADJUST] User provided specific changes, regenerating brief with merged entities');
          briefEditCount++;
          if (briefEditCount >= MAX_BRIEF_EDITS) {
            currentState = STATES.RESULTS;
            briefStatus = BRIEF_STATUS.CONFIRMED;
          } else {
            briefStatus = BRIEF_STATUS.GENERATING;
          }
        }
      } else if (briefStatus === BRIEF_STATUS.GENERATING) {
        briefStatus = BRIEF_STATUS.PENDING_REVIEW;
        console.log('[BRIEF] Set briefStatus to pending_review');
      }
    }

    // Rule 4: RESULTS -> DEEP_DIVE when school selected or back to BRIEF to revise
    if (currentState === STATES.RESULTS) {
      const wantsRevise = /\b(change|revise|update|different criteria|start over|redo brief)\b/i.test(msgLower);
      if (wantsRevise) {
        currentState = STATES.BRIEF;
        briefStatus = BRIEF_STATUS.EDITING;
      }
    }

    // Rule 5: DEEP_DIVE -> RESULTS when going back
    if (currentState === STATES.DEEP_DIVE) {
      const wantsBack = /\b(back|other schools|show me others|more options|different school)\b/i.test(msgLower);
      if (wantsBack) {
        currentState = STATES.RESULTS;
      }
    }

    context.state = currentState;
    context.briefStatus = briefStatus;
    context.briefEditCount = briefEditCount;
    console.log(`[STATE] ${context.state} | briefStatus: ${briefStatus} (edits: ${briefEditCount})`);

    // STEP 3: STATE-SPECIFIC RESPONSE GENERATION
    if (currentState === STATES.WELCOME) {
      return Response.json({
        message: "I'm your NextSchool education consultant. I help families find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you?",
        state: STATES.WELCOME,
        briefStatus: null,
        conversationContext: context,
        schools: []
      });
    }
    
    if (currentState === STATES.DISCOVERY) {
       let discoveryMessage;
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
          ? `[STATE: DISCOVERY] You are gathering family info. Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.

         CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Keep gathering information.

         YOU ARE JACKIE - Warm, empathetic, validating.
    🚫 IF THEY SAID LOCATION → NEVER ask where they live
    🚫 IF THEY SAID BUDGET → NEVER ask budget
    🚫 IF THEY SAID GRADE → NEVER ask grade
    🚫 ONE QUESTION ONLY. NO filler.

    TONE & LANGUAGE RULES (FIX 15):
    - Never call any budget "generous", "modest", "tight", or "comfortable". Use neutral factual language only.
    - If parent expresses budget worry, respond with empathy first, then explain options without judgment.
    - If parent mentions ADHD, ASD, ESL, or learning differences, name them explicitly. Do NOT euphemize as "unique learning style".
    - If the parent appears to have limited English (simple grammar, mentions ESL/newcomer), use shorter sentences and simpler vocabulary.
    
    MULTI-CHILD ACKNOWLEDGMENT (FIX 16):
    - If the parent mentions multiple children with different grades, explicitly acknowledge each child by name and grade.
    - Do NOT collapse multiple children into a single anonymous "student".

    CRITICAL INSTRUCTIONS:
    - Do NOT mention any specific school names
    - Do NOT suggest or recommend schools
    - Your only job in this phase is to understand the family's needs
    - If the user asks about a specific school, respond: "I'd love to tell you about that school - let me first understand what you're looking for so I can give you the best perspective."`
           : `[STATE: DISCOVERY] You are gathering family info. Ask ONE focused question at a time. Always answer their question first, then ask yours. Do NOT recommend schools or mention school names. Max 150 words.
    
    CRITICAL: Do NOT generate a brief, summary, or any bullet-point summary of the family's needs. You are ONLY asking questions right now. Keep gathering information.
    
    YOU ARE LIAM - Direct, strategic, efficient.
    🚫 IF THEY SAID LOCATION → NEVER ask where they live
    🚫 IF THEY SAID BUDGET → NEVER ask budget
    🚫 IF THEY SAID GRADE → NEVER ask grade
    🚫 ONE QUESTION ONLY. NO filler.

    TONE & LANGUAGE RULES (FIX 15):
    - Never call any budget "generous", "modest", "tight", or "comfortable". Use neutral factual language only.
    - If parent expresses budget worry, respond with empathy first, then explain options without judgment.
    - If parent mentions ADHD, ASD, ESL, or learning differences, name them explicitly. Do NOT euphemize as "unique learning style".
    - If the parent appears to have limited English (simple grammar, mentions ESL/newcomer), use shorter sentences and simpler vocabulary.
    
    MULTI-CHILD ACKNOWLEDGMENT (FIX 16):
    - If the parent mentions multiple children with different grades, explicitly acknowledge each child by name and grade.
    - Do NOT collapse multiple children into a single anonymous "student".

    CRITICAL INSTRUCTIONS:
    - Do NOT mention any specific school names
    - Do NOT suggest or recommend schools
    - Your only job in this phase is to understand the family's needs
    - If the user asks about a specific school, respond: "I'd love to tell you about that school - let me first understand what you're looking for so I can give you the best perspective."`;

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

         let discoveryMessageRaw = aiResponse?.response || aiResponse || 'Tell me more about your child.';
         
         // FIX 13: RESPONSE VALIDATOR - Remove sentences containing school names during DISCOVERY
         if (currentSchools && currentSchools.length > 0) {
           const sentences = discoveryMessageRaw.split(/(?<=[.!?])\s+/);
           const filteredSentences = sentences.filter(sentence => {
             for (const school of currentSchools) {
               const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
               const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
               if (regex.test(sentence)) {
                 console.warn('[VALIDATOR] Removed sentence containing school name:', school.name);
                 return false;
               }
             }
             return true;
           });
           discoveryMessageRaw = filteredSentences.join(' ').trim();
         }
         
         discoveryMessage = discoveryMessageRaw;
       } catch (e) {
         console.error('[ERROR] DISCOVERY response failed:', e.message);
         discoveryMessage = 'Tell me about your child — what grade are they in and what matters most to you?';
       }

       return Response.json({
         message: discoveryMessage,
         state: STATES.DISCOVERY,
         briefStatus: null,
         familyProfile: conversationFamilyProfile,
         conversationContext: context,
         schools: []
       });
    }
    
    if (currentState === STATES.BRIEF) {
       let briefMessage;
       
       // BUG FIX: Handle adjust flow properly
       const isInitialAdjustRequest = /\b(change|adjust|edit|actually|wait|hold on|no|not right|different|let me|redo)\b/i.test(msgLower) && 
                                       !/budget|grade|location|school|curriculum|priority/i.test(msgLower);
       
       if (briefStatus === BRIEF_STATUS.EDITING && isInitialAdjustRequest) {
         // First adjustment request - ask what to change
         const adjustPrompt = consultantName === 'Jackie'
           ? `The parent wants to adjust something in their brief. Ask them a warm, open-ended question about what they'd like to change. Max 50 words. Be encouraging.`
           : `The parent wants to adjust their brief. Ask them directly what needs to change. Max 50 words.`;
         
         try {
           const adjustResponse = await base44.integrations.Core.InvokeLLM({
             prompt: adjustPrompt
           });
           briefMessage = adjustResponse?.response || adjustResponse || "What would you like to adjust?";
         } catch (e) {
           briefMessage = "What would you like to adjust?";
         }
         
         return Response.json({
           message: briefMessage,
           state: STATES.BRIEF,
           briefStatus: BRIEF_STATUS.EDITING,
           familyProfile: conversationFamilyProfile,
           conversationContext: context,
           schools: []
         });
       } else if (briefStatus === BRIEF_STATUS.EDITING && !isInitialAdjustRequest) {
         // User provided specific changes - update entities and regenerate brief
         // Entity extraction already ran at STEP 1, so conversationFamilyProfile is already updated
         // Now regenerate the brief - set to GENERATING so it becomes PENDING_REVIEW after generation
         briefStatus = BRIEF_STATUS.GENERATING;
         context.briefStatus = briefStatus;
       }
       
       // CRITICAL FIX: Sync conversationFamilyProfile with context.extractedEntities before generating brief
       // This ensures ALL accumulated data across ALL messages is present, not just the latest extraction
       if (context.extractedEntities) {
         for (const [key, value] of Object.entries(context.extractedEntities)) {
           if (value !== null && value !== undefined) {
             // Only update if conversationFamilyProfile doesn't have this data yet
             if (conversationFamilyProfile[key] === null || conversationFamilyProfile[key] === undefined || 
                 (Array.isArray(conversationFamilyProfile[key]) && conversationFamilyProfile[key].length === 0)) {
               conversationFamilyProfile[key] = value;
             }
           }
         }
       }
       
       // Only generate brief if not in editing mode
       try {
         const { childName, childGrade, locationArea, budgetRange, budgetMin, budgetMax, maxTuition, interests, priorities, dealbreakers, currentSituation, academicStrengths, genderPreference, classSize, programPreferences } = conversationFamilyProfile;
         const interestsStr = interests?.length > 0 ? interests.join(', ') : '';
         const prioritiesStr = priorities?.length > 0 ? priorities.join(', ') : '';
         const strengthsStr = academicStrengths?.length > 0 ? academicStrengths.join(', ') : '';
         const dealbreakersStr = dealbreakers?.length > 0 ? dealbreakers.join(', ') : '';
         const programPreferencesStr = programPreferences?.length > 0 ? programPreferences.join(', ') : '';

         let budgetDisplay = budgetRange || '(not specified)';
         if (maxTuition === 'unlimited') {
           budgetDisplay = 'Budget is flexible';
         } else if (budgetMin && budgetMax) {
           budgetDisplay = `$${budgetMin.toLocaleString()}-$${budgetMax.toLocaleString()}/year`;
         } else if (budgetMax) {
           budgetDisplay = `Up to $${budgetMax.toLocaleString()}/year`;
         } else if (maxTuition) {
           budgetDisplay = `$${maxTuition}/year`;
         }

         // Smart child name display: use actual name if available, otherwise "your child"
         const childDisplayName = childName ? childName : 'your child';

         // KI-10: MULTI-CHILD DETECTION at code level
         const conversationText = conversationHistory?.map(m => m.content).join(' ') || '';
         const multiChildPatterns = /\b(two kids|two children|both kids|both children|my son and daughter|my daughter and son|older one and younger|younger one and older|first child|second child|one child.*another child|siblings|each child|each of them)\b/i;
         const isMultiChild = multiChildPatterns.test(conversationText);
         console.log('[KI-10 MULTI-CHILD CHECK]', {isMultiChild, conversationSnippet: conversationText.substring(0, 200)});

         // FIX #6: UNIFIED BRIEF FORMAT + FIX #2: STOP FABRICATING PERSONALITY
         const learningNeeds = conversationFamilyProfile.learning_needs || conversationFamilyProfile.specialNeeds || [];
         const learningNeedsStr = learningNeeds.length > 0 ? learningNeeds.join(', ') : '';
         const curriculumStr = conversationFamilyProfile.curriculumPreference?.length > 0 ? conversationFamilyProfile.curriculumPreference.join(', ') : '';

         // KI-10: Replace FAMILY DATA section if multi-child detected
         const familyDataSection = isMultiChild 
           ? `MULTI-CHILD DETECTED: The parent has mentioned MULTIPLE children in the conversation. Do NOT use any single-child data fields. Instead, read the conversation carefully and create SEPARATE profile sections for EACH child mentioned. Each child must have their own: name/description, Grade, Location, Budget, Gender preference, Class size, Top priorities, Learning needs, Program preferences, Interests, and Extracurriculars. Label them as Child 1 and Child 2.`
           : `FAMILY DATA:
         - CHILD: ${childDisplayName}
         - GRADE: ${childGrade ? 'Grade ' + childGrade : '(not specified)'}
         - LOCATION: ${locationArea || '(not specified)'}
         - BUDGET: ${budgetDisplay}
         - GENDER PREFERENCE: ${genderPreference || '(not specified)'}
         - CLASS SIZE: ${classSize || '(not specified)'}
         - CURRICULUM: ${curriculumStr || '(not specified)'}
         - PROGRAM PREFERENCES: ${programPreferencesStr || '(not specified)'}
         - LEARNING NEEDS: ${learningNeedsStr || '(not specified)'}
         - INTERESTS: ${interestsStr || '(not specified)'}
         - PRIORITIES: ${prioritiesStr || '(not specified)'}
         - DEALBREAKERS: ${dealbreakersStr || '(not specified)'}

         MULTI-CHILD CHECK: Review the conversation history. If the parent mentioned MORE THAN ONE child, you MUST create separate sections. Do NOT use the FAMILY DATA fields below (they only contain one child). Instead, extract each child's details directly from the conversation and present them as:

         Child 1: [name or description], [grade]
         - Location: [from conversation]
         - Budget: [from conversation]
         ... (all applicable fields)

         Child 2: [name or description], [grade]
         - Location: [from conversation]
         - Budget: [from conversation]
         ... (all applicable fields)

         ONLY use the FAMILY DATA fields below if there is exactly ONE child mentioned in the conversation.`;

         const briefPrompt = consultantName === 'Jackie'
          ? `[STATE: BRIEF] Generate a factual brief summary using the structured format below. Use ONLY what was explicitly stated by the parent.

         CRITICAL RULES - DO NOT VIOLATE (FIX 11):
         - Do NOT invent personality traits, motivations, or character descriptions that were not explicitly stated by the parent.
         - If the parent said the child is struggling or has ADHD/learning differences, acknowledge that plainly and respectfully. Do NOT romanticize it.
         - If no personality was described, skip that section entirely.
         - Never use phrases like "bright and curious", "eager to explore the world", "joyful inquisitiveness" unless the parent used those exact words.
         - Never call any budget "generous", "modest", "tight", or "comfortable". Use neutral factual language. (FIX 15)
         - If parent mentions ADHD, ASD, ESL, or learning differences, name them explicitly in the Brief. Do NOT euphemize as "unique learning style".

         MULTI-CHILD SUPPORT (KI-10 P0):
         - If parent mentioned MULTIPLE children with different grades/needs, you MUST present SEPARATE profiles for each child.
         - Example: "Child 1: Emma, Grade 9 - STEM focus, robotics, AP courses" followed by "Child 2: Noah, Grade 3 - dyslexia support, small classes, Montessori"
         - Do NOT merge multiple children into one profile. Each child gets their own bullet section with their specific grade, needs, and priorities.
         - If only one child was mentioned, use the standard single-child format.

         ${familyDataSection}

         UNIFIED FORMAT (FIX 14) - Use this exact structure:
    [REQUIRED warm, conversational intro - Jackie tone. Sound like you're reflecting back what you heard, NOT generating a report. Examples: "If I'm understanding correctly...", "Let me make sure I've got this right...", "Based on everything you've shared...". Be genuine and empathetic.]

    **IF MULTIPLE CHILDREN DETECTED IN CONVERSATION: Repeat the bullet list below for EACH child with their own header (e.g., "Child 1:" and "Child 2:") and their specific details.**

    • Student: ${childDisplayName}, Grade ${childGrade || '(not specified)'}
    • Location: ${locationArea || '(not specified)'}
    • Budget: ${budgetDisplay}
    ${genderPreference ? '• Gender preference: ' + genderPreference + '\n' : ''}${classSize ? '• Class size: ' + classSize + '\n' : ''}${prioritiesStr ? '• Top priorities: ' + prioritiesStr + '\n' : ''}${learningNeedsStr ? '• Learning needs: ' + learningNeedsStr + '\n' : ''}${programPreferencesStr ? '• Program preferences: ' + programPreferencesStr + '\n' : ''}${dealbreakersStr ? '• Dealbreakers: ' + dealbreakersStr + '\n' : ''}${curriculumStr ? '• Curriculum: ' + curriculumStr + '\n' : ''}${interestsStr ? '• Interests: ' + interestsStr + '\n' : ''}
    Does that capture it? Anything to adjust?

    YOU ARE JACKIE - Warm intro, structured data.`
           : `[STATE: BRIEF] Generate a factual brief summary using the structured format below. Use ONLY what was explicitly stated by the parent.

    CRITICAL RULES - DO NOT VIOLATE (FIX 11):
    - Do NOT invent personality traits, motivations, or character descriptions that were not explicitly stated by the parent.
    - If the parent said the child is struggling or has ADHD/learning differences, acknowledge that plainly and respectfully. Do NOT romanticize it.
    - If no personality was described, skip that section entirely.
    - Never use phrases like "bright and curious", "eager to explore the world", "joyful inquisitiveness" unless the parent used those exact words.
    - Never call any budget "generous", "modest", "tight", or "comfortable". Use neutral factual language. (FIX 15)
    - If parent mentions ADHD, ASD, ESL, or learning differences, name them explicitly in the Brief. Do NOT euphemize as "unique learning style".
    
    MULTI-CHILD SUPPORT (KI-10 P0):
    - If parent mentioned MULTIPLE children with different grades/needs, you MUST present SEPARATE profiles for each child.
    - Example: "Child 1: Emma, Grade 9 - STEM focus, robotics, AP courses" followed by "Child 2: Noah, Grade 3 - dyslexia support, small classes, Montessori"
    - Do NOT merge multiple children into one profile. Each child gets their own bullet section with their specific grade, needs, and priorities.
    - If only one child was mentioned, use the standard single-child format.

    ${familyDataSection}

    UNIFIED FORMAT (FIX 14) - Use this exact structure:
    [REQUIRED direct, conversational intro - Liam tone. Sound like you're confirming what you heard, NOT generating a report. Examples: "Let me make sure I've got this right...", "Based on what you've told me...", "Here's what I'm hearing...". Be natural and straightforward.]
    
    **IF MULTIPLE CHILDREN DETECTED IN CONVERSATION: Repeat the bullet list below for EACH child with their own header (e.g., "Child 1:" and "Child 2:") and their specific details.**
    
    • Student: ${childDisplayName}, Grade ${childGrade || '(not specified)'}
    • Location: ${locationArea || '(not specified)'}
    • Budget: ${budgetDisplay}
    ${genderPreference ? '• Gender preference: ' + genderPreference + '\n' : ''}${classSize ? '• Class size: ' + classSize + '\n' : ''}${prioritiesStr ? '• Top priorities: ' + prioritiesStr + '\n' : ''}${learningNeedsStr ? '• Learning needs: ' + learningNeedsStr + '\n' : ''}${programPreferencesStr ? '• Program preferences: ' + programPreferencesStr + '\n' : ''}${dealbreakersStr ? '• Dealbreakers: ' + dealbreakersStr + '\n' : ''}${curriculumStr ? '• Curriculum: ' + curriculumStr + '\n' : ''}${interestsStr ? '• Interests: ' + interestsStr + '\n' : ''}
    Sound right?

    YOU ARE LIAM - Direct intro, structured data.`;

         const briefResult = await base44.integrations.Core.InvokeLLM({
           prompt: briefPrompt,
           add_context_from_internet: false
         });

         let briefMessageText = briefResult?.response || briefResult || 'Let me summarize what you\'ve shared.';

         // Post-processing safety net: replace any remaining [Child] or [child] placeholders
         briefMessageText = briefMessageText.replace(/\[Child\]/gi, childDisplayName);
         briefMessageText = briefMessageText.replace(/\[child's name\]/gi, childDisplayName);
         briefMessageText = briefMessageText.replace(/\[child\]/gi, childDisplayName);
         briefMessage = briefMessageText;
         } catch (e) {
         console.error('[ERROR] BRIEF response failed:', e.message);
         briefMessage = 'Let me summarize what you\'ve shared. Does that sound right?';
         }

         // Response validator: strip school names during DISCOVERY
         if (currentState === STATES.DISCOVERY && currentSchools?.length > 0) {
         currentSchools.forEach(school => {
          const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(?<!\\[)\\b${escapedName}\\b(?!\\])`, 'gi');
          briefMessage = briefMessage.replace(regex, '');
         });
         }

         // Set briefStatus to pending_review after generating
         if (briefStatus === BRIEF_STATUS.GENERATING) {
           briefStatus = BRIEF_STATUS.PENDING_REVIEW;
           context.briefStatus = briefStatus;
           console.log('[BRIEF GENERATED] Set briefStatus to pending_review');
         }

         return Response.json({
         message: briefMessage,
         state: STATES.BRIEF,
         briefStatus: briefStatus,
         familyProfile: conversationFamilyProfile,
         conversationContext: context,
         schools: []
         });
         }
    
    // STEP 4: School search only in RESULTS/DEEP_DIVE states (auto-transition from BRIEF)
    if (currentState === STATES.BRIEF && briefStatus === BRIEF_STATUS.CONFIRMED) {
      // Auto-transition to RESULTS when brief is confirmed
      currentState = STATES.RESULTS;
      context.state = currentState;
    }

    if (currentState === STATES.RESULTS && currentSchools?.length === 0) {
      const searchParams = {
        limit: 50,
        familyProfile: conversationFamilyProfile
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
      
      // Set region filter to ensure we don't show cross-region results
      if (region) {
        searchParams.region = region;
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
      
      console.log('[KI-12 LOCATION FILTER]', {
        locationArea: conversationFamilyProfile?.locationArea,
        city: searchParams.city,
        provinceState: searchParams.provinceState,
        region: searchParams.region
      });

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
         briefStatus: BRIEF_STATUS.CONFIRMED,
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
         briefStatus: briefStatus,
         schools: currentSchools || [],
         familyProfile: conversationFamilyProfile,
         conversationContext: context
       });
      }

      // Fallback
      return Response.json({
       message: 'I encountered an unexpected state. Please try again.',
       state: currentState,
       briefStatus: briefStatus,
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