// Function: extractEntities
// Purpose: Extract and persist family profile data from parent messages with intent classification
// Entities: FamilyProfile
// Last Modified: 2026-03-03
// Dependencies: OpenRouter API, Base44 InvokeLLM fallback

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// =============================================================================
// INLINED: callOpenRouter
// =============================================================================
async function callOpenRouter(options) {
  // callOpenRouter v1.0 -- E25-S2 canonical
  const { systemPrompt, userPrompt, responseSchema, maxTokens = 1000, temperature = 0.7 } = options;
  
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) {
    console.warn('[OPENROUTER] OPENROUTER_API_KEY not set');
    throw new Error('OPENROUTER_API_KEY not set');
  }
  
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  // Model waterfall: quality-first (Gemini Flash), cost fallback (GPT-4.1-mini), latency fallback (Flash Lite)
  const models = ['google/gemini-2.5-flash', 'openai/gpt-4.1-mini', 'google/gemini-2.5-flash-lite'];

  const body = {
    models,
    messages,
    max_tokens: maxTokens,
    temperature
  };
  
  if (responseSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: responseSchema.name || 'response',
        strict: true,
        schema: responseSchema.schema
      }
    };
  }
  
  console.log('[OPENROUTER] Calling with models:', body.models, 'maxTokens:', maxTokens);

  const controller = new AbortController();
  const TIMEOUT_MS = 15000;
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nextschool.ca',
        'X-OpenRouter-Title': 'NextSchool'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[TIMEOUT] callOpenRouter timed out after ${TIMEOUT_MS}ms in extractEntities.ts`);
      throw new Error(`LLM request timed out after ${TIMEOUT_MS/1000}s`);
    }
    throw error;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[OPENROUTER] API error:', response.status, errorText);
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  console.log('[OPENROUTER] Response model used:', data.model, 'usage:', data.usage);
  
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned empty content');
  
  if (responseSchema) {
    try {
      return JSON.parse(content);
    } catch (e) {
      console.error('[OPENROUTER] JSON parse failed:', content.substring(0, 200));
      throw new Error('OpenRouter structured output parse failed');
    }
  }
  
  return content;
}

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
    }

    let extractedGender = null;
    if (/\b(son|boy|he|him|his)\b/i.test(message)) extractedGender = 'male';
    else if (/\b(daughter|girl|she|her|hers)\b/i.test(message)) extractedGender = 'female';

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
      const nonGeographicKeywords = /\b(budget|tuition|price|cost|afford|pay|spend|priority|priorities|interest|looking|need|want|IB|AP|STEM|IGCSE|Montessori|Waldorf|Reggio)\b/gi;
      let cleaned = loc.replace(nonGeographicKeywords, '').replace(/\s,/, ',').trim();
      cleaned = cleaned.replace(/,+$/, '').replace(/\s\s+/g, ' ').trim();
      return cleaned === '' ? null : cleaned;
    };

    let extractedLocation = null;
    const locationMatch = message.match(/\b(?:in|near|around|from)\s+([A-Z][a-zA-Z]+(?:[\s-][A-Z][a-zA-Z]+)?(?:,\s*[A-Za-z]{2,})?)/);
    if (locationMatch && locationMatch[1]) {
      const NON_LOCATION_TERMS = /^(IB|AP|STEM|IGCSE|Montessori|Waldorf|Reggio|French|Catholic|January|February|March|April|May|June|July|August|September|October|November|December|Fall|Winter|Spring|Summer|Next|This|Early|Late)$/i;
      if (!NON_LOCATION_TERMS.test(locationMatch[1].trim())) {
        extractedLocation = cleanLocation(locationMatch[1].trim());
      } else {
        console.log('[BUG-LOCATION-S46] Rejected non-location term:', locationMatch[1].trim());
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

PRIORITY vs INTEREST CLASSIFICATION:
- PRIORITIES = requirements the SCHOOL must meet (curriculum type, teaching style, class size, gender policy, religious affiliation, boarding, learning support, structured environment, boys-only, STEM focus, French immersion)
- INTERESTS = things the CHILD enjoys or wants to do (robotics club, art classes, soccer, coding, music, drama, debate)
- When in doubt, if it describes what the SCHOOL should offer/be, it's a PRIORITY. If it describes what the CHILD likes doing, it's an INTEREST.
- Examples: 'STEM-focused school' = PRIORITY. 'likes robotics' = INTEREST. 'boys-only' = PRIORITY. 'structured learning' = PRIORITY. 'coding' = INTEREST.

CRITICAL: If the user confirms the brief or says something like "that looks right", "show me schools", "yes", "confirmed", "let's see", "go ahead", set intentSignal to 'confirm-brief'.
CRITICAL: If the user requests a Visit Prep Kit or tour preparation — phrases like "yes prepare my visit kit", "prepare the kit", "yes make it", "visit prep", "tour preparation", "prepare that", "yes please" (in context of a visit kit offer) — set intentSignal to 'visit_prep_request'.`;

    const userPrompt = `CURRENT KNOWN DATA:
${JSON.stringify(knownData, null, 2)}

CONVERSATION HISTORY (last 5 messages):
${conversationSummary}

PARENT'S MESSAGE:
"${message}"

Extract all factual data from the parent's message. Return ONLY valid JSON. Do NOT explain.`;

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
              childGrade: { type: ['number', 'null'] },
              locationArea: { type: ['string', 'null'], description: 'Geographic location only — city, region, or neighborhood. Never curriculum types (IB, AP, Montessori, Waldorf, Reggio, IGCSE, French immersion).' },
              maxTuition: { type: ['number', 'null'] },
              gender: { type: ['string', 'null'] },
              schoolGenderPreference: { type: ['string', 'null'] },
              schoolGenderExclusions: { type: 'array', items: { type: 'string' } },
              priorities: { type: 'array', items: { type: 'string' }, description: 'School requirements and attributes the family needs (curriculum, structure, gender, religious, boarding, learning support, class size)' },
              interests: { type: 'array', items: { type: 'string' }, description: 'Child hobbies, activities, and extracurricular interests (sports, clubs, arts, coding)' },
              dealbreakers: { type: 'array', items: { type: 'string' } },
              remove_priorities: { type: 'array', items: { type: 'string' } },
              remove_interests: { type: 'array', items: { type: 'string' } },
              remove_dealbreakers: { type: 'array', items: { type: 'string' } },
              intentSignal: { type: 'string', enum: ['continue', 'request-brief', 'request-results', 'edit-criteria', 'ask-about-school', 'back-to-results', 'restart', 'off-topic', 'confirm-brief', 'visit_prep_request', 'visit_debrief'] },
              briefDelta: {
                type: 'object',
                properties: {
                  additions: { type: 'array' },
                  updates: { type: 'array' },
                  removals: { type: 'array' }
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
      intentSignal = result?.intentSignal || 'continue';
      console.log('[INTENT SIGNAL]', intentSignal);
    } catch (openrouterError) {
      console.error('[EXTRACT ERROR] OpenRouter failed:', openrouterError.message);
      try {
        let fallbackResult = await base44.integrations.Core.InvokeLLM({
          prompt: `Extract data from: "${message}". Return JSON with intentSignal and briefDelta.`
        });
        if (typeof fallbackResult === 'string') {
          try { fallbackResult = JSON.parse(fallbackResult); } catch { fallbackResult = {}; }
        }
        result = fallbackResult || {};
        intentSignal = result?.intentSignal || 'continue';
      } catch (fallbackError) {
        console.error('[FALLBACK ERROR] InvokeLLM extraction failed:', fallbackError.message);
        result = {};
        intentSignal = 'continue';
      }
    }

    let finalResult = result || {};
    if (extractedGrade !== null && !finalResult.childGrade) {
      finalResult = { ...finalResult, childGrade: extractedGrade };
    }
    if (extractedGender !== null && !finalResult.gender) {
      finalResult = { ...finalResult, gender: extractedGender };
    }
    if (finalResult.gender) {
      finalResult.childGender = finalResult.gender;
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
    let effectiveLocation = finalResult.locationArea;
    if (effectiveLocation) {
      effectiveLocation = cleanLocation(effectiveLocation);
    }
    if ((effectiveLocation === null || effectiveLocation === undefined) && extractedLocation !== null) {
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
  for (const [key, value] of Object.entries(extractedData)) {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value) && Array.isArray(updatedContext.extractedEntities[key]) && updatedContext.extractedEntities[key].length > 0) {
        if (Array.isArray(updatedContext.extractedEntities[key]) && Array.isArray(value)) {
          updatedContext.extractedEntities[key] = [...new Set([...updatedContext.extractedEntities[key], ...value])];
        } else {
          updatedContext.extractedEntities[key] = value;
        }
      } else {
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
          updatedFamilyProfile[key] = value;
        }
      }
    }
    if (updatedFamilyProfile?.id) {
      try {
        const persistedProfile = await base44.entities.FamilyProfile.update(updatedFamilyProfile.id, updatedFamilyProfile);
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