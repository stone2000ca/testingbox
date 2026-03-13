// Function: extractEntities
// Purpose: Extract and persist family profile data from parent messages with intent classification
// Entities: FamilyProfile
// Last Modified: 2026-03-09
// Dependencies: Base44 InvokeLLM
// WC-1: F11 FIX — strip non-schema keys before DB write to prevent Firestore rejection
// WC-2: LLM model upgrade — MiniMax M2.5 as primary model in callOpenRouter waterfall
// WC-3: S122 extraction bug fixes — location false positive, interests list, gender keywords

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// =============================================================================
// INLINED: extractEntitiesLogic
// =============================================================================
async function extractEntitiesLogic(base44, message, conversationFamilyProfile, context, conversationHistory) {
  let result = {};
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
      .filter(m => m?.content)
      .map(m => `${m.role === 'user' ? 'Parent' : 'AI'}: ${m.content}`)
      .join('\n') || '';

    const gradeMatch = message.match(/\b(?:grade|gr\.?)\s*([0-9]+|\b(?:pk|jk|k|junior|senior)\b)/i);
    let extractedGrade = null;
    if (gradeMatch) {
      const gradeStr = gradeMatch[1].toLowerCase();
      const gradeMap = { 'pk': -2, 'jk': -1, 'k': 0, 'junior': 11, 'senior': 12 };
      extractedGrade = gradeMap[gradeStr] !== undefined ? gradeMap[gradeStr] : parseInt(gradeStr);
    } else {
      // Age-to-grade conversion if no explicit grade mentioned
      const ageMatch = message.match(/\b(?:name\s+)?is\s+(\d{1,2})(?:\s+years?\s+old)?\b/i);
      if (ageMatch) {
        const age = parseInt(ageMatch[1]);
        if (age >= 2 && age <= 18) {
          if (age === 3) extractedGrade = -2; // PK
          else if (age === 4) extractedGrade = -1; // JK
          else if (age === 5) extractedGrade = 0; // K
          else if (age >= 6) extractedGrade = age - 5; // Grade 1 for age 6, Grade 2 for age 7, etc.
          console.log('[EXTRACT] Age detection: converted age', age, 'to grade', extractedGrade);
        }
      }
    }

    let extractedGender = null;
    if (/\b(son|boy|he|him|his)\b/i.test(message)) extractedGender = 'male';
    else if (/\b(daughter|girl|she|her|hers)\b/i.test(message)) extractedGender = 'female';

    let extractedChildName: string | null = null;
    const namePatterns = [
      /\bmy\s+(?:son|daughter|boy|girl|child|kid)\s+([A-Z][a-z]{1,20})\b/i,
      /\b(?:son|daughter|boy|girl|child|kid)\s+(?:is\s+)?named\s+([A-Z][a-z]{1,20})\b/i,
      /\b(?:name\s+is|named|called)\s+([A-Z][a-z]{1,20})\b/i,
      /\b([A-Z][a-z]{1,20})\s+is\s+(?:my\s+)?(?:son|daughter|boy|girl|child|kid)\b/i,
    ];
    const PRONOUN_BLOCKLIST = new Set(['my', 'his', 'her', 'he', 'she', 'him', 'the', 'a', 'an', 'i', 'we', 'our', 'they', 'it', 'this', 'that']);
    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match && match[1] && !PRONOUN_BLOCKLIST.has(match[1].toLowerCase())) {
        extractedChildName = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        break;
      }
    }

    let extractedInterests = [];
    const interestsMatch = message.match(/(?:loves?|enjoys?|into|interested in|passionate about|likes?)\s+(.+?)(?:[.!?]|$)/i);
    if (interestsMatch) {
      extractedInterests = interestsMatch[1]
        .split(/,\s*|\s+and\s+/)
        .map(s => s.trim().replace(/\.$/, ''))
        .filter(s => s.length > 0 && s.length < 40);
    }

    // Regex detection for explicit school gender preference / exclusions
    let extractedSchoolGenderPref = null;
    let extractedSchoolGenderExclusions = [];
    if (/\b(all[\s-]girls?|girls?[\s-]only|single[\s-]gender.*girl|only girls?)\b/i.test(message)) extractedSchoolGenderPref = 'all-girls';
    else if (/\b(all[\s-]boys?|boys?[\s-]only|single[\s-]gender.*boy|only boys?)\b/i.test(message)) extractedSchoolGenderPref = 'all-boys';
    else if (/\b(co[\s-]?ed|coeducational|mixed gender)\b/i.test(message)) extractedSchoolGenderPref = 'co-ed';
    if (/\bno (all[\s-]?boys?|boys?[\s-]?only)\b/i.test(message)) extractedSchoolGenderExclusions.push('all-boys');
    if (/\bno (all[\s-]?girls?|girls?[\s-]?only)\b/i.test(message)) extractedSchoolGenderExclusions.push('all-girls');

    // FIX-LOC-004: Helper function to clean non-geographic words from location strings
    const cleanLocation = (loc) => {
      if (!loc) return null;
      const nonGeographicKeywords = /\b(budget|tuition|price|cost|afford|pay|spend|priority|priorities|interest|looking|need|want|IB|AP|STEM|IGCSE|Montessori|Waldorf|Reggio|Programs?)\b/gi;
      let cleaned = loc.replace(nonGeographicKeywords, '').replace(/\s,/, ',').trim();
      cleaned = cleaned.replace(/,+$/, '').replace(/\s\s+/g, ' ').trim();
      return cleaned === '' ? null : cleaned;
    };

    let extractedLocation = null;
    const NON_LOCATION_TERMS = /^(IB|AP|STEM|IGCSE|Montessori|Waldorf|Reggio|French|Programs?|Immersion|Curriculum|English|Math|Science|Art|Music|Drama|History|Swimming|Robotics|Coding|Hockey|Soccer|Basketball|Tennis|Debate)$/i;
    const locationMatch = message.match(/(?<!interested\s)(?<!enrolled\s)(?<!participate\s)(?<!believe\s)\b(?:in|near|around|from)\s+([a-zA-Z]+(?:[\s-][a-zA-Z]+)?(?:,\s*[A-Za-z]{2,})?)/);
    if (locationMatch && locationMatch[1]) {
      const hasCapitalizedWord = /\b[A-Z]/.test(locationMatch[1]);
      if (!hasCapitalizedWord) {
        console.log('[BUG-LOCATION-S46] Rejected: no capitalized word in location match:', locationMatch[1]);
      } else if (!NON_LOCATION_TERMS.test(locationMatch[1].trim())) {
        extractedLocation = cleanLocation(locationMatch[1].trim());
      }
    }

    // BUG-ENT-004: Budget extraction with ALWAYS-RUN regex fallback
    let extractedBudget = null;
    const budgetMatch = message.match(/(?:budget|tuition|cost|price|afford|pay|spend)?[\s:]*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\s*(?:k|K|thousand)?(?:\b|$)/i);
    if (budgetMatch) {
      const raw = budgetMatch[0];
      const numStr = budgetMatch[1].replace(/,/g, '');
      const num = parseInt(numStr);
      if (!isNaN(num)) {
        const isThousands = /[kK]/.test(raw) || /thousand/i.test(raw);
        const amount = isThousands ? num * 1000 : num;
        if (amount >= 5000 && amount <= 500000) {
          extractedBudget = amount;
        }
      }
    }

    const systemPrompt = `Extract factual data from the parent's message. Return JSON with NULL for anything not mentioned.

GENDER INFERENCE (BUG-ENT-004): Infer the child's gender from relational terms even if not stated directly:
- "my son", "my boy", "he", "him", "his" → gender = "male"
- "my daughter", "my girl", "she", "her" → gender = "female"
- If gender is ambiguous or not mentioned, return null for gender.

BUDGET EXTRACTION (BUG-ENT-004): Extract budget/tuition even in conversational formats:
- "$25K", "25k", "25 thousand", "around $25,000", "about 25K", "up to 30k" → extract the number (e.g. 25000, 30000)
- Store as maxTuition (integer number of dollars, or the string "unlimited" if they say no limit/flexible)
- Do NOT infer budget if user has not explicitly stated it.

CRITICAL: If the user explicitly negates or removes a previously stated preference (e.g. "actually, not interested in sports", "remove arts from my priorities", "I changed my mind about boarding"), populate the corresponding remove_* field (remove_interests, remove_priorities, remove_dealbreakers) with the items to remove. Leave additive arrays for new additions only.

CRITICAL: If the user mentions having VISITED, TOURED, or SEEN a school — phrases like "I visited Branksome Hall", "we toured the school", "we went to the open house", "just got back from visiting", "we saw the campus" — set intentSignal to 'visit_debrief'. This takes priority over 'continue' and 'ask-about-school'.

LOCATION SPECIFICITY (BUG-LOC-003): For locationArea, always use the most specific location the user mentioned — city name, NOT province or state. Examples: "Montreal" not "Quebec", "Vancouver" not "British Columbia", "Calgary" not "Alberta". If the user says a region alias like "GTA" or "Greater Toronto Area", preserve that exact term as-is.

LOCATION vs CURRICULUM: locationArea must ONLY contain geographic places. IB, AP, STEM, Montessori, Waldorf, Reggio, IGCSE, French immersion are curriculum types — put them in priorities, never locationArea.

LOCATION vs ACADEMIC SUBJECTS: Academic subjects like English, Math, Science, Art, Music, History, Drama are NEVER locations. 'does well in English' means the subject, not a place. Only extract geographic places as locationArea.

AGE vs GRADE HANDLING:
- If the user says "[name] is [number]" or "[name] is [number] years old" WITHOUT the word "grade", treat the number as AGE, not grade.
- Convert age to grade: age 3 = PK (grade -2), age 4 = JK (grade -1), age 5 = K (grade 0), age 6+ = grade (age - 5). So age 6 = grade 1, age 7 = grade 2, etc.
- If unclear whether age or grade, return childGrade as null and let the conversation ask for clarification.
- "grade 3" or "in grade 3" = grade 3. "is 3" or "is 3 years old" = age 3 = PK.

PRIORITY vs INTEREST CLASSIFICATION:
- PRIORITIES = requirements the SCHOOL must meet (curriculum type, teaching style, class size, gender policy, religious affiliation, boarding, learning support, structured environment, boys-only, STEM focus, French immersion)
- INTERESTS = things the CHILD enjoys or wants to do (robotics club, art classes, soccer, coding, music, drama, debate)
- When in doubt, if it describes what the SCHOOL should offer/be, it's a PRIORITY. If it describes what the CHILD likes doing, it's an INTEREST.
- Examples: 'STEM-focused school' = PRIORITY. 'likes robotics' = INTEREST. 'boys-only' = PRIORITY. 'structured learning' = PRIORITY. 'coding' = INTEREST.

CRITICAL: If the user confirms the brief or says something like "that looks right", "show me schools", "yes", "confirmed", "let's see", "go ahead", set intentSignal to 'confirm-brief'.
CRITICAL: If the user requests a Visit Prep Kit or tour preparation — phrases like "yes prepare my visit kit", "prepare the kit", "yes make it", "visit prep", "tour preparation", "prepare that", "yes please" (in context of a visit kit offer) — set intentSignal to 'visit_prep_request'.

CRITICAL: If the user asks to add, save, shortlist, or bookmark a specific school — phrases like "add Howlett Academy to my shortlist", "save that school", "shortlist Rosedale", "add it", "keep that one", "I want to save this school", "add to my list" — set intentSignal to 'shortlist-action'. This takes priority over 'ask-about-school' and 'continue'.`;

    const userPrompt = `CURRENT KNOWN DATA:
${JSON.stringify(knownData, null, 2)}

CONVERSATION HISTORY (last 5 messages):
${conversationSummary}

PARENT'S MESSAGE:
"${message}"

Extract all factual data from the parent's message. Return ONLY valid JSON. Do NOT explain.`;

    try {
      const combinedPrompt = systemPrompt + '\n\n' + userPrompt;
      let llmResult = await base44.integrations.Core.InvokeLLM({
        prompt: combinedPrompt,
        response_json_schema: {
          type: 'object',
          properties: {
            childName: { type: 'string' },
            childGrade: { type: 'number' },
            locationArea: { type: 'string' },
            maxTuition: { type: 'number' },
            gender: { type: 'string' },
            schoolGenderPreference: { type: 'string' },
            schoolGenderExclusions: { type: 'array', items: { type: 'string' } },
            priorities: { type: 'array', items: { type: 'string' } },
            interests: { type: 'array', items: { type: 'string' } },
            dealbreakers: { type: 'array', items: { type: 'string' } },
            remove_priorities: { type: 'array', items: { type: 'string' } },
            remove_interests: { type: 'array', items: { type: 'string' } },
            remove_dealbreakers: { type: 'array', items: { type: 'string' } },
            intentSignal: { type: 'string', enum: ['continue', 'request-brief', 'request-results', 'edit-criteria', 'ask-about-school', 'shortlist-action', 'back-to-results', 'restart', 'off-topic', 'confirm-brief', 'visit_prep_request', 'visit_debrief'] },
            briefDelta: { type: 'object', properties: { additions: { type: 'array', items: { type: 'string' } }, updates: { type: 'array', items: { type: 'string' } }, removals: { type: 'array', items: { type: 'string' } } } }
          },
          required: ['intentSignal', 'briefDelta']
        },
        model: 'gpt_5_mini'
      });
      if (typeof llmResult === 'string') {
        try { llmResult = JSON.parse(llmResult); } catch { llmResult = {}; }
      }
      result = llmResult || {};
      intentSignal = result?.intentSignal || 'continue';

      // Deterministic regex override — force shortlist-action regardless of LLM output
      const shortlistPatterns = /\b(add|save|shortlist|bookmark|keep)\b.{0,40}\b(school|academy|college|it|that|this|one)\b|\b(shortlist|save|add)\s+(it|that|this)\b|\badd\b.{0,30}\bto\b.{0,20}\b(shortlist|list|saved)\b/i;
      if (shortlistPatterns.test(message)) {
        intentSignal = 'shortlist-action';
        console.log('[INTENT OVERRIDE] shortlist-action detected via regex');
      }

      console.log('[INTENT SIGNAL]', intentSignal);
    } catch (llmError) {
      console.error('[EXTRACT ERROR] InvokeLLM failed:', llmError.message);
      result = {};
      intentSignal = 'continue';
    }

    let finalResult = result || {};
    if (extractedGrade !== null && !finalResult.childGrade) {
      finalResult = { ...finalResult, childGrade: extractedGrade };
    }
    const strongGenderKeyword = /\b(son|daughter|boy|girl)\b/i.test(message);
    if (extractedGender !== null && (strongGenderKeyword || !finalResult.gender)) {
      finalResult = { ...finalResult, gender: extractedGender };
    }
    if (finalResult.gender) {
      finalResult.childGender = finalResult.gender;
    }
    if (extractedChildName && (!finalResult.childName || PRONOUN_BLOCKLIST.has(finalResult.childName.toLowerCase()))) {
      finalResult = { ...finalResult, childName: extractedChildName };
    }
    if (extractedSchoolGenderPref && !finalResult.schoolGenderPreference) {
      finalResult = { ...finalResult, schoolGenderPreference: extractedSchoolGenderPref };
    }
    if (extractedSchoolGenderExclusions.length > 0 && (!finalResult.schoolGenderExclusions || finalResult.schoolGenderExclusions.length === 0)) {
      finalResult = { ...finalResult, schoolGenderExclusions: extractedSchoolGenderExclusions };
    }
    if ((finalResult.maxTuition === null || finalResult.maxTuition === undefined) && extractedBudget !== null) {
      finalResult = { ...finalResult, maxTuition: extractedBudget };
    }
    if (extractedInterests.length > 0 && (!finalResult.interests || finalResult.interests.length < extractedInterests.length)) {
      finalResult = { ...finalResult, interests: [...new Set([...(finalResult.interests || []), ...extractedInterests])] };
    }
    let effectiveLocation = finalResult.locationArea;
    if (effectiveLocation) {
      effectiveLocation = cleanLocation(effectiveLocation);
    }

    // S97-WC4: If LLM returned an invalid location (e.g. 'Grade' from 'Grade 5'),
    // but regex found a valid city/region, prefer the regex-extracted location.
    const isInvalidLocation = !effectiveLocation || effectiveLocation.length < 3 || /^(grade|school|class|program|budget|tuition|montessori|french|immersion|programs?)\b/i.test(effectiveLocation);

    if (isInvalidLocation && extractedLocation !== null) {
      effectiveLocation = extractedLocation;
    }

    if (effectiveLocation !== null && effectiveLocation !== undefined) {
      finalResult = { ...finalResult, locationArea: effectiveLocation };
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
  
  const updatedContext = { ...context };
  if (!updatedContext.extractedEntities) {
    updatedContext.extractedEntities = {};
  }
  // CRT-S109-F11 FIX: Merge extracted data directly into context for FamilyBrief display
  for (const [key, value] of Object.entries(extractedData)) {
    if (value !== null && value !== undefined) {
      // For arrays, merge with existing; for scalars, always overwrite with fresh extraction
      if (Array.isArray(value)) {
        if (Array.isArray(updatedContext.extractedEntities[key]) && updatedContext.extractedEntities[key].length > 0) {
          updatedContext.extractedEntities[key] = [...new Set([...updatedContext.extractedEntities[key], ...value])];
        } else {
          updatedContext.extractedEntities[key] = value;
        }
      } else {
        // Scalar value: always use fresh extraction (don't skip if context already has it)
        updatedContext.extractedEntities[key] = value;
      }
    }
  }
  
  const REMOVAL_MAP = {
    remove_priorities: 'priorities',
    remove_interests: 'interests',
    remove_dealbreakers: 'dealbreakers'
  };

  const updatedFamilyProfile = { ...conversationFamilyProfile };
  if (Object.keys(extractedData).length > 0) {
    for (const [removeKey, targetField] of Object.entries(REMOVAL_MAP)) {
      const toRemove = extractedData[removeKey];
      if (Array.isArray(toRemove) && toRemove.length > 0 && Array.isArray(updatedFamilyProfile[targetField])) {
        const removeSet = new Set(toRemove.filter(Boolean).map(s => s.toLowerCase()));
        updatedFamilyProfile[targetField] = updatedFamilyProfile[targetField].filter(
          item => !removeSet.has(item.toLowerCase())
        );
        console.log(`[REMOVE] ${targetField}: removed [${toRemove.join(', ')}]`);
      }
    }

    for (const [key, value] of Object.entries(extractedData)) {
      if (key in REMOVAL_MAP) continue;
      if (value !== null && value !== undefined) {
        const existing = updatedFamilyProfile[key];
        if (Array.isArray(value)) {
          if (Array.isArray(existing) && existing.length > 0) {
            updatedFamilyProfile[key] = [...new Set([...existing, ...value])];
          } else {
            updatedFamilyProfile[key] = value;
          }
        } else if (value !== '') {
          // CRT-S109-F11 FIX: Always overwrite scalar values with fresh extraction (don't preserve stale data)
          updatedFamilyProfile[key] = value;
        }
      }
    }
    if (updatedFamilyProfile?.id) {
      try {
        // F11 FIX: Strip non-schema keys before DB write to prevent Firestore rejection
        const NON_SCHEMA_KEYS = ['intentSignal', 'briefDelta', 'remove_priorities', 'remove_interests', 'remove_dealbreakers', 'gender'];
        const profileToSave = { ...updatedFamilyProfile };
        for (const key of NON_SCHEMA_KEYS) {
          delete profileToSave[key];
        }
        const persistedProfile = await base44.entities.FamilyProfile.update(updatedFamilyProfile.id, profileToSave);
        Object.assign(updatedFamilyProfile, persistedProfile);
        console.log('[EXTRACT] FamilyProfile persisted successfully:', updatedFamilyProfile.id);
      } catch (e) {
        console.error('[EXTRACT] Non-fatal: FamilyProfile update failed, using stale profile:', e.message);
      }
    }
  }
  
  const briefDelta = extractedData?.briefDelta || { additions: [], updates: [], removals: [] };
  intentSignal = intentSignal || 'continue';
  
  return {
    extractedEntities: extractedData,
    updatedFamilyProfile,
    updatedContext,
    intentSignal,
    briefDelta
  };
}

// =============================================================================
// MAIN: Deno.serve — extractEntities
// =============================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { message, conversationFamilyProfile, context, conversationHistory } = await req.json();

    console.log('[EXTRACT] Processing message:', message?.substring(0, 50));

    const result = await extractEntitiesLogic(base44, message, conversationFamilyProfile, context, conversationHistory);

    return Response.json(result);
  } catch (error) {
    console.error('[EXTRACT] Fatal error:', error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});