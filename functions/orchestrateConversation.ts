import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { callOpenRouter } from './callOpenRouter.ts';
import { handleDeepDive } from './handleDeepDive.ts';
import { handleResults } from './handleResults.ts';
import { handleBrief } from './handleBrief.ts';
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
      return handleBrief({ base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId });
    }
    
    // STEP 4: School search only in RESULTS/DEEP_DIVE states (auto-transition from BRIEF)
    if (currentState === STATES.BRIEF && briefStatus === BRIEF_STATUS.CONFIRMED) {
      // Auto-transition to RESULTS when brief is confirmed
      currentState = STATES.RESULTS;
      context.state = currentState;
    }

    if (currentState === STATES.RESULTS) {
      return handleResults({ base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, selectedSchoolId, userLocation, region, conversationId, userId });
    }

    if (currentState === STATES.RESULTS && false) {
      // OLD CODE - DO NOT RUN
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