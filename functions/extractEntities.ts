import { callOpenRouter } from './callOpenRouter.ts';

export async function extractEntities(params) {
  const { base44, message, conversationFamilyProfile, context, conversationHistory } = params;

  let extractedData = {};
  let intentSignal = 'continue';

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

    RESPONSE SCHEMA:
    { 
      entities: { childName, childGrade, locationArea, ... all extraction fields },
      intentSignal: 'continue' | 'request-brief' | 'request-results' | 'edit-criteria' | 'ask-about-school' | 'back-to-results' | 'restart' | 'off-topic',
      briefDelta: { 
        additions: [{ field, value, confidence }],
        updates: [{ field, old, new, confidence }],
        removals: []
      }
    }
    Confidence values: 'explicit' (directly stated) | 'inferred' (clear from context) | 'contextual' (weak signal).

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
          name: 'entity_extraction_with_intent',
          schema: {
            type: 'object',
            properties: {
              childName: { type: ['string', 'null'] },
              childAge: { type: ['number', 'null'] },
              childGrade: { type: ['number', 'null'] },
              childGender: { type: ['string', 'null'] },
              locationArea: { type: ['string', 'null'] },
              budgetMin: { type: ['number', 'null'] },
              budgetMax: { type: ['number', 'null'] },
              budgetSingle: { type: ['number', 'null'] },
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
              intentSignal: { type: 'string', enum: ['continue', 'request-brief', 'request-results', 'edit-criteria', 'ask-about-school', 'back-to-results', 'restart', 'off-topic'] },
              briefDelta: {
                type: 'object',
                properties: {
                  additions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string' },
                        value: {},
                        confidence: { type: 'string', enum: ['explicit', 'inferred', 'contextual'] }
                      },
                      required: ['field', 'value', 'confidence']
                    }
                  },
                  updates: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string' },
                        old: {},
                        new: {},
                        confidence: { type: 'string', enum: ['explicit', 'inferred', 'contextual'] }
                      },
                      required: ['field', 'old', 'new', 'confidence']
                    }
                  },
                  removals: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            required: ['intentSignal', 'briefDelta'],
            additionalProperties: false
          }
        },
        maxTokens: 500,
        temperature: 0.1
      });
      intentSignal = result.intentSignal;
      console.log('[INTENT SIGNAL]', intentSignal);
      console.log('[EXTRACT] OpenRouter returned intentSignal:', intentSignal);
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
            specialNeeds: { type: ["array", "null"], items: { type: "string" } },
            intentSignal: { type: ["string"] },
            briefDelta: {
              type: ["object", "null"],
              properties: {
                additions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      value: {},
                      confidence: { type: "string" }
                    }
                  }
                },
                updates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      old: {},
                      new: {},
                      confidence: { type: "string" }
                    }
                  }
                },
                removals: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      });
      if (result?.intentSignal) {
        intentSignal = result.intentSignal;
      }
      console.log('[EXTRACT] InvokeLLM returned intentSignal:', intentSignal);
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
  const updatedContext = { ...context };
  if (!updatedContext.extractedEntities) {
    updatedContext.extractedEntities = {};
  }
  for (const [key, value] of Object.entries(extractedData)) {
    if (value !== null && value !== undefined) {
      // Merge arrays instead of replacing
      if (Array.isArray(value) && Array.isArray(updatedContext.extractedEntities[key]) && updatedContext.extractedEntities[key].length > 0) {
        updatedContext.extractedEntities[key] = [...new Set([...updatedContext.extractedEntities[key], ...value])];
      } else {
        updatedContext.extractedEntities[key] = value;
      }
    }
  }
  
  // KI-10: Store childrenJson in context (not persisted to FamilyProfile entity)
  if (extractedData.childrenJson) {
    updatedContext.extractedEntities.childrenJson = extractedData.childrenJson;
  }
  
  // Prepare updated FamilyProfile
  const updatedFamilyProfile = { ...conversationFamilyProfile };
  if (Object.keys(extractedData).length > 0) {
    for (const [key, value] of Object.entries(extractedData)) {
      if (value !== null && value !== undefined) {
        const existing = updatedFamilyProfile[key];
        
        // Array fields: merge and deduplicate
        if (Array.isArray(value)) {
          if (Array.isArray(existing) && existing.length > 0) {
            updatedFamilyProfile[key] = [...new Set([...existing, ...value])];
          } else {
            updatedFamilyProfile[key] = value;
          }
        } 
        // Scalar fields: overwrite if new value is non-empty
        else if (value !== '') {
          updatedFamilyProfile[key] = value;
        }
        // If value is empty string, keep existing value (no update)
      }
    }
    if (updatedFamilyProfile?.id) {
      try {
        // CRITICAL FIX: Pass the fully merged updatedFamilyProfile object to preserve all existing data
        const persistedProfile = await base44.entities.FamilyProfile.update(updatedFamilyProfile.id, updatedFamilyProfile);
        Object.assign(updatedFamilyProfile, persistedProfile);
      } catch (e) {
        console.error('FamilyProfile update failed:', e);
      }
    }
  }
  
  // Extract briefDelta from result (will be used in Sprint B)
  const briefDelta = result?.briefDelta || { additions: [], updates: [], removals: [] };
  
  // Safety fallback for intentSignal
  intentSignal = intentSignal || 'continue';
  
  return {
    extractedEntities: extractedData,
    updatedFamilyProfile,
    updatedContext,
    intentSignal,
    briefDelta
  };
}