import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { callOpenRouter } from './callOpenRouter.ts';
import { handleDeepDive } from './handleDeepDive.ts';
// BUG-DD-002 fix: selectedSchoolId destructured
// deploy-trigger-v5

Deno.serve(async (req) => {
  const TIMEOUT_MS = 25000;
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  );

  const processRequest = async () => {
    var classificationResult;
    var currentState;
    var briefStatus;
    
    try {
      const base44 = createClientFromRequest(req);
      const { message, conversationHistory, conversationContext, region, userId, consultantName, currentSchools, userNotes, shortlistedSchools, userLocation, selectedSchoolId } = await req.json();

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
    
    let briefEditCount = context.briefEditCount || 0;
    const MAX_BRIEF_EDITS = 3;
    
    const conversationId = context.conversationId;
    
    // STEP 0: Initialize/retrieve FamilyProfile
    let conversationFamilyProfile = null;
    
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

      const systemPrompt = `Extract ONLY factual data explicitly stated. Return JSON with NULL for anything not mentioned.

      EXTRACTION FIELDS:
      - childName: string or null
      - childAge: number or null (KI-14: extract if user mentions age in years, e.g., "14 years old" → 14)
      - childGrade: number or null (e.g., 3 for Grade 3, -1 for JK, 0 for SK)
      - childGender: "male" OR "female" OR null (KI-16: "son", "boy", "he/him" → "male"; "daughter", "girl", "she/her" → "female")
      - locationArea: string (city name)
      - budgetMin: number or null (minimum budget in dollars)
      - budgetMax: number or null (maximum budget in dollars)
      - budgetSingle: number or null (KI-15: Set if user states a budget amount, INCLUDING approximate or hedged amounts like "around", "about", "roughly", "up to", "no more than", "hoping to stay under". Extract the numeric value. Convert shorthand: $25K=25000, $30K=30000, 30k=30000. If user gives a range, use budgetMin/budgetMax instead.)
      - maxTuition: "unlimited" OR number OR null (for backward compatibility)
      - interests: array of strings or null
      - priorities: array of strings or null (FIX 4: When user says "arts", "music", "theater", "drama" → priorities: ["Arts"]. When "STEM", "science", "math" → priorities: ["STEM"]. When "sports" → priorities: ["Sports"]. When "languages", "French", "Spanish" → priorities: ["Languages"])
      - dealbreakers: array or null
      - learning_needs: array or null (e.g., "ADHD", "ASD", "dyslexia", "ESL", "gifted", "learning disability")
      - wellbeing_needs: array or null (KI-13: "anxiety", "behavioral issues", "acting out", "feeling unsafe", "divorce impact", "depression", "social struggles", "confidence issues")
      - childrenJson: string or null (KI-10: If the parent mentions MORE THAN ONE child, return a JSON array string of child objects. Example: '[{"name":"Emma","grade":9,"gender":"female","interests":["STEM","robotics"],"priorities":["AP courses"],"learningNeeds":[]},{"name":"Noah","grade":3,"gender":"male","interests":[],"priorities":["small classes"],"learningNeeds":["dyslexia"]}]'. If only ONE child mentioned, return null.)
      - curriculumPreference: array or null (e.g., "French immersion", "IB", "AP", "Montessori", "progressive", "traditional")
      - programPreferences: array or null (e.g., "outdoor education", "French immersion", "arts focus", "STEM", "athletics", "music program")
      - religiousPreference: string or null
      - boardingPreference: boolean or null
      - genderPreference: "Co-Ed" OR "All Boys" OR "All Girls" OR null
      - classSize: string or null (e.g., "small", "standard", "15 students", "intimate")
      - requestedSchools: array of school names or null
      - financialAidInterest: boolean or null
      - specialNeeds: array or null (e.g., "ADHD", "ASD", "dyslexia", "ESL support")

      INTENT CLASSIFICATION:
      Also classify the user's intent with intentSignal. Possible values:
      - 'continue': User is providing info, asking questions during discovery
      - 'request-brief': User asks to generate brief or summary
      - 'request-results': User asks to see school matches/results
      - 'edit-criteria': User wants to change/adjust brief details
      - 'ask-about-school': User asks about a specific school
      - 'back-to-results': User wants to go back to results list
      - 'restart': User wants to start over
      - 'off-topic': Message is off-topic or unclear`;

      const userPrompt = `CURRENT KNOWN DATA:
      ${JSON.stringify(knownData, null, 2)}

      CONVERSATION HISTORY (last 10 messages):
      ${conversationSummary}

      PARENT'S MESSAGE:
      "${message}"

      Extract all factual data from the parent's message. Return ONLY valid JSON. Do NOT explain.`;

      let result;
      try {
        result = await callOpenRouter({
          systemPrompt,
          userPrompt,
          responseSchema: {
            name: 'entity_extraction',
            schema: {
              type: 'object',
              properties: {
                childName: { type: ['string', 'null'] },
                childGrade: { type: ['number', 'null'] },
                locationArea: { type: ['string', 'null'] },
                maxTuition: { type: ['number', 'null'] },
                priorities: { type: 'array', items: { type: 'string' } },
                interests: { type: 'array', items: { type: 'string' } },
                dealbreakers: { type: 'array', items: { type: 'string' } },
                learning_needs: { type: 'array', items: { type: 'string' } },
                wellbeing_needs: { type: 'array', items: { type: 'string' } },
                curriculumPreference: { type: 'array', items: { type: 'string' } },
                programPreferences: { type: 'array', items: { type: 'string' } },
                genderPreference: { type: ['string', 'null'] },
                boardingPreference: { type: ['boolean', 'null'] },
                religiousPreference: { type: ['string', 'null'] },
                intentSignal: { type: 'string', enum: ['continue', 'request-brief', 'request-results', 'edit-criteria', 'ask-about-school', 'back-to-results', 'restart', 'off-topic'] }
              },
              required: ['intentSignal'],
              additionalProperties: false
            }
          },
          maxTokens: 500,
          temperature: 0.1
        });
        console.log('[INTENT SIGNAL]', result.intentSignal);
      } catch (openrouterError) {
        console.log('[OPENROUTER FALLBACK] Entity extraction falling back to InvokeLLM');
        const extractionPrompt = `Extract ONLY factual data explicitly stated. Return JSON with NULL for anything not mentioned.

      CURRENT KNOWN DATA:
      ${JSON.stringify(knownData, null, 2)}

      PARENT'S MESSAGE:
      "${message}"

      Extract ONLY:
      - childName: string or null
      - childAge: number or null (KI-14: extract if user mentions age in years, e.g., "14 years old" → 14)
      - childGrade: number or null (e.g., 3 for Grade 3, -1 for JK, 0 for SK)
      - childGender: "male" OR "female" OR null (KI-16: "son", "boy", "he/him" → "male"; "daughter", "girl", "she/her" → "female")
      - locationArea: string (city name)
      - budgetMin: number or null (minimum budget in dollars)
      - budgetMax: number or null (maximum budget in dollars)
      - budgetSingle: number or null (KI-15: Set if user states a budget amount, INCLUDING approximate or hedged amounts like "around", "about", "roughly", "up to", "no more than", "hoping to stay under". Extract the numeric value. Convert shorthand: $25K=25000, $30K=30000, 30k=30000. If user gives a range, use budgetMin/budgetMax instead.)
      - maxTuition: "unlimited" OR number OR null (for backward compatibility)
      - interests: array of strings or null
      - priorities: array of strings or null (FIX 4: When user says "arts", "music", "theater", "drama" → priorities: ["Arts"]. When "STEM", "science", "math" → priorities: ["STEM"]. When "sports" → priorities: ["Sports"]. When "languages", "French", "Spanish" → priorities: ["Languages"])
      - concerns: array or null
      - dealbreakers: array or null
      - learning_needs: array or null (e.g., "ADHD", "ASD", "dyslexia", "ESL", "gifted", "learning disability")
      - wellbeing_needs: array or null (KI-13: "anxiety", "behavioral issues", "acting out", "feeling unsafe", "divorce impact", "depression", "social struggles", "confidence issues")
      - childrenJson: string or null (KI-10: If the parent mentions MORE THAN ONE child, return a JSON array string of child objects. Each object should have: name (string or null), age (number or null), grade (number or null), gender ("male"/"female"/null), interests (array of strings), priorities (array of strings), learningNeeds (array of strings). Example: '[{"name":"Emma","grade":9,"gender":"female","interests":["STEM","robotics"],"priorities":["AP courses"],"learningNeeds":[]},{"name":"Noah","grade":3,"gender":"male","interests":[],"priorities":["small classes"],"learningNeeds":["dyslexia"]}]'. If only ONE child mentioned, return null.)
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
      - "My 14-year-old son" → childAge: 14, childGender: "male"
      - "She's 7" → childAge: 7, childGender: "female"
      - "My daughter is in Grade 5" → childGrade: 5, childGender: "female"
      - "He has anxiety and ADHD" → childGender: "male", learning_needs: ["ADHD"], wellbeing_needs: ["anxiety"]
      - "Budget around $20K" → budgetSingle: 20000
      - "Budget is around $30K" → budgetSingle: 30000
      - "About $25K" → budgetSingle: 25000
      - "Hoping to stay under $40K" → budgetSingle: 40000
      - "$25K" → budgetSingle: 25000
      - "35k budget" → budgetSingle: 35000
      - "Between $15,000 and $25,000" → budgetMin: 15000, budgetMax: 25000
      - "She has ADHD" → learning_needs: ["ADHD"], specialNeeds: ["ADHD"], childGender: "female"
      - "Looking for French immersion" → curriculumPreference: ["French immersion"], programPreferences: ["French immersion"]
      - "She's been acting out after the divorce" → wellbeing_needs: ["behavioral issues", "divorce impact"], childGender: "female"
      - "He feels unsafe at his current school" → wellbeing_needs: ["feeling unsafe"], childGender: "male"
      - "Small class sizes important" → classSize: "small"
      - "Music and theater are important" → priorities: ["Arts"]
      - "Co-ed school preferred" → genderPreference: "Co-Ed"

      Return ONLY valid JSON. Do NOT explain.`;

        result = await base44.integrations.Core.InvokeLLM({
          prompt: extractionPrompt,
          response_json_schema: {
            type: "object",
            properties: {
              childName: { type: ["string", "null"] },
              childAge: { type: ["number", "null"] },
              childGrade: { type: ["number", "null"] },
              childGender: { type: ["string", "null"] },
              locationArea: { type: ["string", "null"] },
              budgetMin: { type: ["number", "null"] },
              budgetMax: { type: ["number", "null"] },
              budgetSingle: { type: ["number", "null"] },
              maxTuition: { type: ["number", "string", "null"] },
              interests: { type: ["array", "null"], items: { type: "string" } },
              priorities: { type: ["array", "null"], items: { type: "string" } },
              concerns: { type: ["array", "null"], items: { type: "string" } },
              dealbreakers: { type: ["array", "null"], items: { type: "string" } },
              learning_needs: { type: ["array", "null"], items: { type: "string" } },
              wellbeing_needs: { type: ["array", "null"], items: { type: "string" } },
              childrenJson: { type: ["string", "null"] },
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
        console.log('[OPENROUTER FALLBACK] Entity extraction failed, using InvokeLLM result');
      }

      let finalResult = result;
      if (extractedGrade !== null && !result.childGrade) {
       finalResult = { ...result, childGrade: extractedGrade };
      }
      
      // KI-14: Age-to-grade conversion
      if (finalResult.childAge && !finalResult.childGrade) {
        const ageToGradeMap = {
          4: -1, 5: 0, 6: 1, 7: 2, 8: 3, 9: 4, 10: 5, 11: 6, 12: 7, 13: 8, 14: 9, 15: 10, 16: 11, 17: 12, 18: 12
        };
        const convertedGrade = ageToGradeMap[finalResult.childAge];
        if (convertedGrade !== undefined) {
          finalResult = { ...finalResult, childGrade: convertedGrade };
          console.log('[KI-14] Converted age', finalResult.childAge, 'to grade', convertedGrade);
        }
      }
      
      // KI-15: Budget single-value handling
      if (finalResult.budgetSingle && !finalResult.budgetMin && !finalResult.budgetMax) {
        finalResult = { ...finalResult, maxTuition: finalResult.budgetSingle };
        console.log('[KI-15] Set budgetSingle', finalResult.budgetSingle, 'as maxTuition');
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
    
    // KI-10: Store childrenJson in context (not persisted to FamilyProfile entity)
    if (extractedData.childrenJson) {
      context.extractedEntities.childrenJson = extractedData.childrenJson;
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
    
    // STEP 2: CALL CLASSIFYSTATE FOR STATE DETERMINATION
    try {
      const classifyResponse = await base44.functions.invoke('classifyState', {
        message,
        conversationHistory,
        conversationContext: context,
        selectedSchoolId,
        currentSchools
      });
      classificationResult = classifyResponse.data;
      console.log('[CLASSIFY RESULT]', classificationResult);
    } catch (e) {
      console.error('[CLASSIFY ERROR]', e);
      // Fallback to current state if classifyState fails
      classificationResult = {
        state: context.state || STATES.WELCOME,
        briefStatus: context.briefStatus || null,
        dataSufficiency: 'thin',
        transitionReason: 'natural'
      };
    }
    
    currentState = classificationResult.state;
    briefStatus = classificationResult.briefStatus;
    
    // Update context with classified state
    context.state = currentState;
    context.briefStatus = briefStatus;
    
    // Store classification metadata in context
    context.dataSufficiency = classificationResult.dataSufficiency;
    context.transitionReason = classificationResult.transitionReason;

    console.log(`[STATE] ${currentState} | briefStatus: ${briefStatus} | dataSufficiency: ${context.dataSufficiency} | transitionReason: ${context.transitionReason}`);

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

         const discoverySystemPrompt = personaInstructions;

         const discoveryUserPrompt = `ENTITY EXTRACTION STATUS:
         - LOCATION: ${hasLocation ? 'YES' : 'NO'}
         - BUDGET: ${hasBudget ? 'YES' : 'NO'}
         - GRADE: ${hasChildGrade ? 'YES' : 'NO'}

         Recent chat:
         ${conversationSummary}

         Parent: "${message}"

         Respond as ${consultantName}. ONE question max. No filler.`;

         let discoveryMessageRaw = 'Tell me more about your child.';
         try {
           const aiResponse = await callOpenRouter({
             systemPrompt: discoverySystemPrompt,
             userPrompt: discoveryUserPrompt,
             maxTokens: 500,
             temperature: 0.7
           });
           discoveryMessageRaw = aiResponse || 'Tell me more about your child.';
           console.log('[OPENROUTER] DISCOVERY response');
         } catch (openrouterError) {
           console.log('[OPENROUTER FALLBACK] DISCOVERY response falling back to InvokeLLM');
           try {
             const responsePrompt = `${personaInstructions}

         ENTITY EXTRACTION:
         - LOCATION: ${hasLocation ? 'YES' : 'NO'}
         - BUDGET: ${hasBudget ? 'YES' : 'NO'}
         - GRADE: ${hasChildGrade ? 'YES' : 'NO'}

         Recent chat:
         ${conversationSummary}

         Parent: "${message}"

         Respond as ${consultantName}. ONE question max. No filler.`;

             const fallbackResponse = await base44.integrations.Core.InvokeLLM({
               prompt: responsePrompt
             });
             discoveryMessageRaw = fallbackResponse?.response || fallbackResponse || 'Tell me more about your child.';
           } catch (fallbackError) {
             console.error('[FALLBACK ERROR] DISCOVERY response failed:', fallbackError.message);
           }
         }
         
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
         const adjustSystemPrompt = consultantName === 'Jackie'
           ? `You are Jackie, a warm and encouraging education consultant. The parent wants to adjust something in their brief. Ask them a warm, open-ended question about what they'd like to change. Max 50 words. Be encouraging.`
           : `You are Liam, a direct and strategic education consultant. The parent wants to adjust their brief. Ask them directly what needs to change. Max 50 words.`;

         const adjustUserPrompt = `The parent message was: "${message}"

       Ask what needs adjustment in their brief.`;

         let briefMessage = "What would you like to adjust?";
         try {
           const adjustResponse = await callOpenRouter({
             systemPrompt: adjustSystemPrompt,
             userPrompt: adjustUserPrompt,
             maxTokens: 300,
             temperature: 0.5
           });
           briefMessage = adjustResponse || "What would you like to adjust?";
           console.log('[OPENROUTER] BRIEF adjustment');
         } catch (openrouterError) {
           console.log('[OPENROUTER FALLBACK] BRIEF adjustment falling back to InvokeLLM');
           try {
             const adjustPrompt = consultantName === 'Jackie'
               ? `The parent wants to adjust something in their brief. Ask them a warm, open-ended question about what they'd like to change. Max 50 words. Be encouraging.`
               : `The parent wants to adjust their brief. Ask them directly what needs to change. Max 50 words.`;

             const fallbackResponse = await base44.integrations.Core.InvokeLLM({
               prompt: adjustPrompt
             });
             briefMessage = fallbackResponse?.response || fallbackResponse || "What would you like to adjust?";
           } catch (fallbackError) {
             console.error('[FALLBACK ERROR] BRIEF adjustment failed:', fallbackError.message);
           }
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
         const { childName, childGrade, childGender, locationArea, budgetRange, budgetMin, budgetMax, maxTuition, interests, priorities, dealbreakers, currentSituation, academicStrengths, genderPreference, classSize, programPreferences, wellbeing_needs } = conversationFamilyProfile;
         const interestsStr = interests?.length > 0 ? interests.join(', ') : '';
         const prioritiesStr = priorities?.length > 0 ? priorities.join(', ') : '';
         const strengthsStr = academicStrengths?.length > 0 ? academicStrengths.join(', ') : '';
         const dealbreakersStr = dealbreakers?.length > 0 ? dealbreakers.join(', ') : '';
         const programPreferencesStr = programPreferences?.length > 0 ? programPreferences.join(', ') : '';
         const wellbeingNeedsStr = wellbeing_needs?.length > 0 ? wellbeing_needs.join(', ') : '';

         // KI-15: Fix budget display - single value OR range
         let budgetDisplay = budgetRange || '(not specified)';
         if (maxTuition === 'unlimited') {
           budgetDisplay = 'Budget is flexible';
         } else if (budgetMin && budgetMax && budgetMin !== budgetMax) {
           budgetDisplay = `$${budgetMin.toLocaleString()}-$${budgetMax.toLocaleString()}/year`;
         } else if (budgetMin && budgetMax && budgetMin === budgetMax) {
           // KI-15: Don't show duplicate range like "$25,000-$25,000"
           budgetDisplay = `$${budgetMin.toLocaleString()}/year`;
         } else if (budgetMax) {
           budgetDisplay = `Up to $${budgetMax.toLocaleString()}/year`;
         } else if (maxTuition && typeof maxTuition === 'number') {
           budgetDisplay = `$${maxTuition.toLocaleString()}/year`;
         }

         // KI-16: Smart child name display with gender (used in BRIEF state)
         let briefChildDisplayName = childName ? childName : 'your child';
         if (!childName && childGender === 'male') {
           briefChildDisplayName = 'your son';
         } else if (!childName && childGender === 'female') {
           briefChildDisplayName = 'your daughter';
         }

         // KI-10: MULTI-CHILD DETECTION at code level
         const conversationText = conversationHistory?.map(m => m.content).join(' ') || '';
         const multiChildPatterns = /\b(two kids|two children|both kids|both children|my son and daughter|my daughter and son|older one and younger|younger one and older|first child|second child|one child.*another child|siblings|each child|each of them)\b/i;
         const isMultiChild = multiChildPatterns.test(conversationText);
         console.log('[KI-10 MULTI-CHILD CHECK]', {isMultiChild, conversationSnippet: conversationText.substring(0, 200)});

         // FIX #6: UNIFIED BRIEF FORMAT + FIX #2: STOP FABRICATING PERSONALITY
         const learningNeeds = conversationFamilyProfile.learning_needs || conversationFamilyProfile.specialNeeds || [];
         const learningNeedsStr = learningNeeds.length > 0 ? learningNeeds.join(', ') : '';
         const curriculumStr = conversationFamilyProfile.curriculumPreference?.length > 0 ? conversationFamilyProfile.curriculumPreference.join(', ') : '';

         // KI-10: Build FAMILY DATA section - use structured childrenJson if available
         let familyDataSection;
         if (isMultiChild) {
           let parsedChildren = null;
           try {
             if (context.extractedEntities?.childrenJson) {
               parsedChildren = JSON.parse(context.extractedEntities.childrenJson);
             }
           } catch (e) {
             console.error('[KI-10] Failed to parse childrenJson:', e);
           }

           if (parsedChildren && Array.isArray(parsedChildren) && parsedChildren.length >= 2) {
             // Structured multi-child data available
             let childSections = '';
             parsedChildren.forEach((child, idx) => {
               const childNum = idx + 1;
               const childName = child.name || `Child ${childNum}`;
               const gradeDisplay = child.grade !== null && child.grade !== undefined 
                 ? (child.grade === -1 ? 'JK' : child.grade === 0 ? 'SK' : `Grade ${child.grade}`) 
                 : '(not specified)';
               const genderDisplay = child.gender || '(not specified)';
               const interestsDisplay = child.interests?.length > 0 ? child.interests.join(', ') : '(not specified)';
               const prioritiesDisplay = child.priorities?.length > 0 ? child.priorities.join(', ') : '(not specified)';
               const learningNeedsDisplay = child.learningNeeds?.length > 0 ? child.learningNeeds.join(', ') : '(not specified)';

               childSections += `\nCHILD ${childNum}: ${childName}
         - GRADE: ${gradeDisplay}
         - GENDER: ${genderDisplay}
         - INTERESTS: ${interestsDisplay}
         - PRIORITIES: ${prioritiesDisplay}
         - LEARNING NEEDS: ${learningNeedsDisplay}\n`;
             });

             familyDataSection = `MULTI-CHILD FAMILY DATA:${childSections}
         SHARED FAMILY FIELDS:
         - LOCATION: ${locationArea || '(not specified)'}
         - BUDGET: ${budgetDisplay}
         - CURRICULUM: ${curriculumStr || '(not specified)'}
         - DEALBREAKERS: ${dealbreakersStr || '(not specified)'}`;
           } else {
             // Fallback: tell AI to parse conversation
             familyDataSection = `MULTI-CHILD DETECTED: The parent has mentioned MULTIPLE children in the conversation. Do NOT use any single-child data fields. Instead, read the conversation carefully and create SEPARATE profile sections for EACH child mentioned. Each child must have their own: name/description, Grade, Location, Budget, Gender preference, Class size, Top priorities, Learning needs, Wellbeing needs, Program preferences, Interests, and Extracurriculars. Label them as Child 1 and Child 2.`;
           }
         } else {
           familyDataSection = `FAMILY DATA:
         - CHILD: ${childDisplayName}
         - GRADE: ${childGrade !== null && childGrade !== undefined ? (childGrade === -1 ? 'JK' : childGrade === 0 ? 'SK' : 'Grade ' + childGrade) : '(not specified)'}
         - LOCATION: ${locationArea || '(not specified)'}
         - BUDGET: ${budgetDisplay}
         - GENDER PREFERENCE: ${genderPreference || '(not specified)'}
         - CLASS SIZE: ${classSize || '(not specified)'}
         - CURRICULUM: ${curriculumStr || '(not specified)'}
         - PROGRAM PREFERENCES: ${programPreferencesStr || '(not specified)'}
         - LEARNING NEEDS: ${learningNeedsStr || '(not specified)'}
         - WELLBEING NEEDS: ${wellbeingNeedsStr || '(not specified)'}
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
         }

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

    • Student: ${briefChildDisplayName}, ${childGrade !== null && childGrade !== undefined ? (childGrade === -1 ? 'JK' : childGrade === 0 ? 'SK' : 'Grade ' + childGrade) : '(not specified)'}
    • Location: ${locationArea || '(not specified)'}
    • Budget: ${budgetDisplay}
    ${genderPreference ? '• Gender preference: ' + genderPreference + '\n' : ''}${classSize ? '• Class size: ' + classSize + '\n' : ''}${prioritiesStr ? '• Top priorities: ' + prioritiesStr + '\n' : ''}${learningNeedsStr ? '• Learning needs: ' + learningNeedsStr + '\n' : ''}${wellbeingNeedsStr ? '• Wellbeing needs: ' + wellbeingNeedsStr + '\n' : ''}${programPreferencesStr ? '• Program preferences: ' + programPreferencesStr + '\n' : ''}${dealbreakersStr ? '• Dealbreakers: ' + dealbreakersStr + '\n' : ''}${curriculumStr ? '• Curriculum: ' + curriculumStr + '\n' : ''}${interestsStr ? '• Interests: ' + interestsStr + '\n' : ''}
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
    
    • Student: ${briefChildDisplayName}, Grade ${childGrade || '(not specified)'}
    • Location: ${locationArea || '(not specified)'}
    • Budget: ${budgetDisplay}
    ${genderPreference ? '• Gender preference: ' + genderPreference + '\n' : ''}${classSize ? '• Class size: ' + classSize + '\n' : ''}${prioritiesStr ? '• Top priorities: ' + prioritiesStr + '\n' : ''}${learningNeedsStr ? '• Learning needs: ' + learningNeedsStr + '\n' : ''}${programPreferencesStr ? '• Program preferences: ' + programPreferencesStr + '\n' : ''}${dealbreakersStr ? '• Dealbreakers: ' + dealbreakersStr + '\n' : ''}${curriculumStr ? '• Curriculum: ' + curriculumStr + '\n' : ''}${interestsStr ? '• Interests: ' + interestsStr + '\n' : ''}
    Sound right?

    YOU ARE LIAM - Direct intro, structured data.`;

         let briefMessageText = 'Let me summarize what you\'ve shared.';
         try {
           const briefResult = await callOpenRouter({
             systemPrompt: briefPrompt.split('\n\n')[0],
             userPrompt: briefPrompt.split('\n\n').slice(1).join('\n\n'),
             maxTokens: 800,
             temperature: 0.5
           });
           briefMessageText = briefResult || 'Let me summarize what you\'ve shared.';
           console.log('[OPENROUTER] BRIEF generation');
         } catch (openrouterError) {
           console.log('[OPENROUTER FALLBACK] BRIEF generation falling back to InvokeLLM');
           try {
             const briefResult = await base44.integrations.Core.InvokeLLM({
               prompt: briefPrompt,
               add_context_from_internet: false
             });
             briefMessageText = briefResult?.response || briefResult || 'Let me summarize what you\'ve shared.';
           } catch (fallbackError) {
             console.error('[FALLBACK ERROR] BRIEF generation failed:', fallbackError.message);
           }
         }

         // Post-processing safety net: replace any remaining [Child] or [child] placeholders
         briefMessageText = briefMessageText.replace(/\[Child\]/gi, briefChildDisplayName);
         briefMessageText = briefMessageText.replace(/\[child's name\]/gi, briefChildDisplayName);
         briefMessageText = briefMessageText.replace(/\[child\]/gi, briefChildDisplayName);
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

    if (currentState === STATES.RESULTS) {
      // GUARD: Force DEEP_DIVE if selectedSchoolId present
      if (selectedSchoolId) {
        console.log('[RESULTS GUARD] selectedSchoolId present, forcing DEEP_DIVE state');
        currentState = STATES.DEEP_DIVE;
        context.state = STATES.DEEP_DIVE;
      }
      
      // BLOCKER 2 FIX: If selectedSchoolId present, skip RESULTS handler and fall through to DEEP_DIVE
      if (selectedSchoolId) {
        console.log('[RESULTS SKIP] selectedSchoolId present, falling through to DEEP_DIVE handler');
        // Don't process RESULTS - let execution continue to DEEP_DIVE handler below
      } else {
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
         state: currentState,
         briefStatus: BRIEF_STATUS.CONFIRMED,
         schools: matchingSchools,
         familyProfile: conversationFamilyProfile,
         conversationContext: context
       });
      }
      }


    
    if (currentState === STATES.DEEP_DIVE) {
      return handleDeepDive({ base44, selectedSchoolId, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId });
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