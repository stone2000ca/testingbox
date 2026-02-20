import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { userMessage, conversationHistory, currentProfile } = await req.json();

    // Build context for the LLM
    const knownData = currentProfile ? {
      childName: currentProfile.childName,
      childGrade: currentProfile.childGrade,
      locationArea: currentProfile.locationArea,
      maxTuition: currentProfile.maxTuition,
      interests: currentProfile.interests,
      priorities: currentProfile.priorities,
      dealbreakers: currentProfile.dealbreakers,
      curriculumPreference: currentProfile.curriculumPreference,
      religiousPreference: currentProfile.religiousPreference,
      boardingPreference: currentProfile.boardingPreference
    } : {};

    const conversationSummary = conversationHistory?.slice(-5)
      .map(m => `${m.role === 'user' ? 'Parent' : 'AI'}: ${m.content}`)
      .join('\n') || '';

    // First pass: Extract grade using regex (for speed & reliability)
    const gradeMatch = userMessage.match(/\b(?:grade|gr\.?)\s*([0-9]+|\b(?:pk|jk|k|junior|senior)\b)/i);
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
"${userMessage}"

Extract and return ONLY these fields (null if not mentioned):
- childName: string (parent used child's name)
- childGrade: number (grade level, e.g., 3 for Grade 3. If you see "grade 1" or "Grade 3" or similar, extract the number. CRITICAL: Return as a number, not a string.)
- locationArea: string (city or area name)
- maxTuition: number (annual tuition budget mentioned)
- interests: array of strings (child's interests: sports, arts, STEM, etc.)
- priorities: array of strings (family priorities)
- dealbreakers: array of strings (things parent explicitly said they DON'T want)
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
          dealbreakers: { type: ["array", "null"], items: { type: "string" } },
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

    return Response.json({ extracted: cleaned });
  } catch (error) {
    console.error('Entity extraction error:', error);
    return Response.json({ extracted: {} }, { status: 500 });
  }
});