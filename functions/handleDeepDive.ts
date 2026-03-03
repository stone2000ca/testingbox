// Function: handleDeepDive
// Purpose: Handle deep-dive school analysis with visit prep generation and debrief mode routing
// Entities: School, SchoolAnalysis, GeneratedArtifact
// Last Modified: 2026-03-03
// Dependencies: OpenRouter API, Base44 InvokeLLM fallback, handleVisitDebrief function

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// =============================================================================
// INLINED: callOpenRouter
// =============================================================================
async function callOpenRouter(options) {
  const { systemPrompt, userPrompt, responseSchema, maxTokens = 1000, temperature = 0.7 } = options;
  
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) {
    console.warn('[OPENROUTER] OPENROUTER_API_KEY not set');
    throw new Error('OPENROUTER_API_KEY not set');
  }
  
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });
  
  const body = {
    models: ['google/gemini-2.5-flash', 'openai/gpt-4.1-mini', 'google/gemini-2.5-flash-lite'],
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
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nextschool.ca',
      'X-OpenRouter-Title': 'NextSchool'
    },
    body: JSON.stringify(body)
  });
  
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
// MAIN: Deno.serve — handleDeepDive
// =============================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { selectedSchoolId, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, userId, returningUserContextBlock, flags, conversationId } = await req.json();

    const STATES = { WELCOME: 'WELCOME', DISCOVERY: 'DISCOVERY', BRIEF: 'BRIEF', RESULTS: 'RESULTS', DEEP_DIVE: 'DEEP_DIVE' };

    // BUG-DEBRIEF-INTENT-S49 FIX: Check flags?.DEBRIEF_MODE at TOP and route to handleVisitDebrief
    if (flags?.DEBRIEF_MODE) {
      console.log('[DEEP_DIVE] DEBRIEF_MODE flag set, invoking handleVisitDebrief');
      try {
        const debriefResult = await base44.asServiceRole.functions.invoke('handleVisitDebrief', {
          selectedSchoolId,
          message,
          conversationFamilyProfile,
          context,
          consultantName,
          returningUserContextBlock,
          conversationId,
          userId
        });
        return Response.json(debriefResult.data);
      } catch (debriefError) {
        console.error('[DEBRIEF] Routing failed:', debriefError.message);
        // Fall through to standard deep dive
      }
    }

    console.log('[DEEPDIVE_START]', selectedSchoolId);
    let aiMessage = '';
    let selectedSchool = null;
    
    if (selectedSchoolId) {
      try {
        const schoolResults = await base44.entities.School.filter({ id: selectedSchoolId });
        if (schoolResults.length > 0) {
          selectedSchool = schoolResults[0];
          console.log('[DEEPDIVE] Loaded school:', selectedSchool.name);
        }
      } catch (e) {
        console.error('[DEEPDIVE ERROR] Failed to load selected school:', e.message);
      }
    }
    
    if (!selectedSchool) {
      return Response.json({
        message: "I couldn't load that school's details. Please try selecting it again.",
        state: currentState,
        briefStatus: briefStatus,
        schools: currentSchools || [],
        familyProfile: conversationFamilyProfile,
        conversationContext: context
      });
    }
    
    let childDisplayName = 'your child';
    if (conversationFamilyProfile?.childName) {
      childDisplayName = conversationFamilyProfile.childName;
    }
    
    let resolvedMaxTuition = null;
    if (conversationFamilyProfile?.maxTuition) {
      resolvedMaxTuition = typeof conversationFamilyProfile.maxTuition === 'number' ? conversationFamilyProfile.maxTuition : parseInt(conversationFamilyProfile.maxTuition);
      if (isNaN(resolvedMaxTuition)) { resolvedMaxTuition = null; }
    }

    let resolvedPriorities = null;
    if (conversationFamilyProfile?.priorities && Array.isArray(conversationFamilyProfile.priorities) && conversationFamilyProfile.priorities.length > 0) {
      resolvedPriorities = conversationFamilyProfile.priorities;
    }

    const compressedSchoolData = {
      name: selectedSchool.name,
      tuitionFee: selectedSchool.tuition || selectedSchool.dayTuition || 'Not specified',
      location: `${selectedSchool.city}, ${selectedSchool.provinceState || selectedSchool.country}`,
      genderPolicy: selectedSchool.genderPolicy || 'Co-ed'
    };
    
    const deepDiveSystemPrompt = `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}You are ${consultantName}, an education consultant. The parent is currently in a deep-dive on a specific school.

CRITICAL STATE RULE — READ THIS FIRST:
You are in DEEPDIVE state. If the parent updates any preference mid-conversation (e.g. "actually grade 6", "budget changed", "we want boarding"), you MUST:
1. Acknowledge it in ONE short sentence only. Example: "Got it, noted grade 6 — your matches will update shortly."
2. STOP. Do not write anything else. NEVER mention a "Refresh Matches" button — it does not exist.

ABSOLUTE PROHIBITIONS when a preference update is detected:
- Do NOT generate a numbered list of their preferences (Student, Location, Budget, etc.)
- Do NOT produce a brief summary or profile recap
- Do NOT ask "Does that look right?" or any confirmation question
- Do NOT produce more than 2 sentences total for a preference update

${consultantName === 'Jackie' 
  ? "JACKIE PERSONA: Warm, empathetic, supportive." 
  : "LIAM PERSONA: Direct, strategic, no-BS."}

Write naturally in conversational prose about why this school fits the family. Cover the student-school alignment, any trade-offs or concerns, and the cost reality. Speak like a consultant would—no headers, labels, or formatting markers. Just natural, helpful conversation. End your response with a brief, clear sentence summarizing whether this school is a strong fit for this family and the primary reason why or why not, based on what they shared in their brief.`;

    const deepDiveUserPrompt = `FAMILY BRIEF:
- Child: ${childDisplayName}
- Budget: ${resolvedMaxTuition ? '$' + resolvedMaxTuition : 'Not specified'}
- Priorities: ${resolvedPriorities?.join(', ') || 'Not specified'}

SCHOOL DATA:
${JSON.stringify(compressedSchoolData, null, 2)}

Generate the DEEPDIVE card for this family-school match.`;

    console.log('[DEEPDIVE] Attempting AI-generated card');

    let deepDiveAnalysis = null;
    try {
      const aiResponse = await callOpenRouter({
        systemPrompt: deepDiveSystemPrompt,
        userPrompt: deepDiveUserPrompt,
        maxTokens: 2000,
        temperature: 0.6
      });
      if (aiResponse) {
        console.log('[DEEPDIVE] AI card generated successfully');
        aiMessage = aiResponse;
      }
    } catch (llmError) {
      console.error('[DEEPDIVE] OpenRouter failed:', llmError.message);
      aiMessage = `**Great Fit for ${childDisplayName}**\n\n**Why ${selectedSchool.name} for ${childDisplayName}**\n${selectedSchool.description?.substring(0, 150) || 'School details available upon request.'}\n\n**Cost Reality**\nTuition: ${compressedSchoolData.tuitionFee}/year\n\nWhat would you like to know more about?`;
    }

    // E10b: Generate structured analysis in parallel
    let rawAnalysisResponse = null;
    try {
      const analysisResponse = await callOpenRouter({
        systemPrompt: `You are a school analysis engine. Given a consultant's analysis of a school for a specific family, extract structured data. Return ONLY valid JSON matching the schema.`,
        userPrompt: `Consultant's analysis: ${aiMessage}\n\nSchool data: ${JSON.stringify(compressedSchoolData)}\n\nFamily profile: child=${childDisplayName}, budget=${resolvedMaxTuition}, priorities=${resolvedPriorities?.join(', ') || 'None'}\n\nIMPORTANT: Every school has trade-offs. You MUST return at least 3 items in tradeOffs[]. For each trade-off, include the dimension name, and either a strength (what this school does well for this family) or a concern (what might not fit), or both. Consider dimensions like: learning support, class size, arts/athletics programs, commute distance, budget fit, academic approach, campus facilities, community culture. If school data is missing for a dimension the family cares about, that itself is a trade-off with concern noting the data gap. Each dimension should appear only once in tradeOffs[]. Do not repeat dimensions. If a dimension has both a strength and a concern, include both in the same trade-off object.\n\nExtract: fitLabel (strong_match/good_match/worth_exploring), fitScore (0-100), tradeOffs (array with dimension, strength, concern, dataSource), dataGaps (array of field names with missing data relevant to this family), visitQuestions (array of 3-5 personalized questions for school visit), financialSummary (tuition, aidAvailable boolean, estimatedNetCost, budgetFit).`,
        maxTokens: 800,
        temperature: 0.3,
        responseSchema: {
          name: 'school_analysis',
          schema: {
            type: 'object',
            properties: {
              fitLabel: { type: 'string', enum: ['strong_match', 'good_match', 'worth_exploring'] },
              fitScore: { type: 'number' },
              tradeOffs: { type: 'array', items: { type: 'object', properties: { dimension: { type: 'string' }, strength: { type: 'string' }, concern: { type: 'string' }, dataSource: { type: 'string' } } } },
              dataGaps: { type: 'array', items: { type: 'string' } },
              visitQuestions: { type: 'array', items: { type: 'string' } },
              financialSummary: { type: 'object', properties: { tuition: { type: 'number' }, aidAvailable: { type: 'boolean' }, estimatedNetCost: { type: 'number' }, budgetFit: { type: 'string' } } }
            },
            required: ['fitLabel', 'fitScore', 'tradeOffs', 'dataGaps', 'visitQuestions', 'financialSummary']
          }
        }
      });
      rawAnalysisResponse = analysisResponse;
      if (typeof analysisResponse === 'string') {
        const stripped = analysisResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        deepDiveAnalysis = JSON.parse(stripped);
      } else {
        deepDiveAnalysis = analysisResponse;
      }
      console.log('[E10b] Structured analysis extracted successfully');

      // Save to SchoolAnalysis entity (non-blocking, fire-and-forget)
      if (userId && selectedSchoolId && deepDiveAnalysis) {
        (async () => {
          try {
            const existing = await base44.entities.SchoolAnalysis.filter({ userId, schoolId: selectedSchoolId });
            if (existing && existing.length > 0) {
              await base44.entities.SchoolAnalysis.update(existing[0].id, { ...deepDiveAnalysis, lastAnalyzedAt: new Date().toISOString() });
              console.log('[E10b] SchoolAnalysis updated:', existing[0].id);
              const prevVisitQuestions = existing[0].visitQuestions;
              if (!prevVisitQuestions || prevVisitQuestions.length === 0) {
                const childName = conversationFamilyProfile?.childName || null;
                const schoolName = selectedSchool.name;
                if (consultantName === 'Jackie') {
                  aiMessage += `\n\nBy the way — I can put together a personalized Visit Prep Kit for ${schoolName}, with specific questions to ask during your tour, things to watch for, and red flags based on everything you've told me about ${childName || 'your child'}. Want me to prepare that?`;
                } else {
                  aiMessage += `\n\nI can prepare a Visit Prep Kit for ${schoolName} — targeted questions, observation checklist, and red flags specific to your priorities. Want me to put that together?`;
                }
              }
            } else {
              const created = await base44.entities.SchoolAnalysis.create({ userId, schoolId: selectedSchoolId, ...deepDiveAnalysis, lastAnalyzedAt: new Date().toISOString() });
              console.log('[E10b] SchoolAnalysis created:', created.id);
              const childName = conversationFamilyProfile?.childName || null;
              const schoolName = selectedSchool.name;
              if (consultantName === 'Jackie') {
                aiMessage += `\n\nBy the way — I can put together a personalized Visit Prep Kit for ${schoolName}, with specific questions to ask during your tour, things to watch for, and red flags based on everything you've told me about ${childName || 'your child'}. Want me to prepare that?`;
              } else {
                aiMessage += `\n\nI can prepare a Visit Prep Kit for ${schoolName} — targeted questions, observation checklist, and red flags specific to your priorities. Want me to put that together?`;
              }
            }
          } catch (persistError) {
            console.warn('[DEEPDIVE] SchoolAnalysis persist failed:', persistError.message);
          }
        })();
      }
    } catch (analysisError) {
      console.error('[E10b] deepDiveAnalysis generation failed:', analysisError.message, 'Raw response:', rawAnalysisResponse);
      if (rawAnalysisResponse && typeof rawAnalysisResponse === 'string') {
        try {
          const stripped = rawAnalysisResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          deepDiveAnalysis = JSON.parse(stripped);
          console.log('[E10b] Fallback JSON.parse succeeded');
        } catch (parseError) {
          console.error('[E10b] Fallback JSON.parse also failed:', parseError.message);
          deepDiveAnalysis = { fitLabel: 'worth_exploring', fitScore: 50, tradeOffs: [], dataGaps: [], visitQuestions: [], financialSummary: null };
        }
      } else {
        deepDiveAnalysis = { fitLabel: 'worth_exploring', fitScore: 50, tradeOffs: [], dataGaps: [], visitQuestions: [], financialSummary: null };
      }
    }

    const sanitizedMessage = aiMessage
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return !/^(DEEPDIVE Card:|Fit Label|Why This School|What to Know|Cost Reality|Dealbreaker Check|Tone Bridge)/.test(trimmed);
      })
      .join('\n')
      .trim();

    // Generate visitPrepKit from deepDiveAnalysis for immediate card rendering
    let generatedVisitPrepKit = null;
    if (deepDiveAnalysis && selectedSchool) {
      const schoolName = selectedSchool.name;
      const derivedObservations = (deepDiveAnalysis.dataGaps || []).map(gap => `Observe how the school addresses: ${gap}`);
      const derivedRedFlags = (deepDiveAnalysis.tradeOffs || [])
        .filter(t => t.concern)
        .map(t => `Watch for concerns around ${t.dimension}.`);
      generatedVisitPrepKit = {
        schoolName,
        visitQuestions: (deepDiveAnalysis.visitQuestions || []).map(q => ({ question: q, priorityTag: 'medium' })),
        observations: derivedObservations,
        redFlags: derivedRedFlags,
        intro: `Here's your personalized Visit Prep Kit for ${schoolName}.`
      };
      console.log('[DEEPDIVE] Generated visitPrepKit with', generatedVisitPrepKit.visitQuestions.length, 'questions');
    }
    console.log('[DEEPDIVE] deepDiveAnalysis populated:', !!deepDiveAnalysis, 'visitPrepKit populated:', !!generatedVisitPrepKit);

    // Add post-deep-dive follow-up prompt
    let followUpPrompt = '';
    const fitLabel = deepDiveAnalysis?.fitLabel || 'worth_exploring';
    const childName = conversationFamilyProfile?.childName || 'your child';
    const schoolName = selectedSchool?.name || 'this school';
    const deepDiveFollowUpKey = `deepDiveFollowUpShown_${selectedSchoolId}`;
    const alreadyShownFollowUp = context?.[deepDiveFollowUpKey] === true;

    if (deepDiveAnalysis && selectedSchool && !alreadyShownFollowUp) {
      if (!context) context = {};
      context[deepDiveFollowUpKey] = true;

      if (fitLabel === 'strong_match') {
        followUpPrompt = consultantName === 'Jackie'
          ? `\n\n---\n\nBased on everything we've discussed, ${schoolName} looks like a really strong fit for ${childName}. Have you thought about scheduling a visit? I can help you prepare questions to ask during your tour.`
          : `\n\n---\n\n**Bottom line:** ${schoolName} is a strong fit for ${childName}. If you haven't visited yet, that's the next step. I can put together a Visit Prep Kit. Want me to do that?`;
      } else if (fitLabel === 'good_match') {
        followUpPrompt = consultantName === 'Jackie'
          ? `\n\n---\n\n${schoolName} has a lot going for it. Would you like to **compare it side-by-side** with another school? Or if you're leaning toward it, I can help you **prepare for a visit**.`
          : `\n\n---\n\n**Next move:** ${schoolName} is solid but not a slam dunk. **Compare it** against another school, or **prep for a visit**. Your call.`;
      } else if (fitLabel === 'worth_exploring') {
        followUpPrompt = consultantName === 'Jackie'
          ? `\n\n---\n\n${schoolName} has some interesting strengths for ${childName}, though there are a few things worth weighing. Would you like to **compare it side-by-side** with another school on your list?`
          : `\n\n---\n\nThere are some trade-offs here. Want to **compare ${schoolName} against another option**? That usually makes the decision clearer.`;
      } else {
        followUpPrompt = consultantName === 'Jackie'
          ? `\n\n---\n\nBased on what we've discussed, ${schoolName} might not be the strongest match for ${childName}'s needs. Want me to suggest some other schools that might align better with your priorities?`
          : `\n\n---\n\n**Honest take:** ${schoolName} isn't the strongest match. I'd recommend looking at other options. Want me to pull up alternatives?`;
      }
    }
    const finalMessage = sanitizedMessage + followUpPrompt;

    console.log('[DEEPDIVE] Returning aiMessage length:', finalMessage?.length);
    return Response.json({
      message: finalMessage,
      state: currentState,
      briefStatus: briefStatus,
      schools: currentSchools || [],
      familyProfile: conversationFamilyProfile,
      conversationContext: { ...context, [deepDiveFollowUpKey]: true },
      deepDiveAnalysis: deepDiveAnalysis,
      visitPrepKit: generatedVisitPrepKit
    });
  } catch (error) {
    console.error('[DEEPDIVE] Fatal error:', error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});