// Function: generateDecisionNarration
// Purpose: Generate honest tradeoff analysis and decision narration with optional debrief data
// Entities: FamilyProfile, ComparisonMatrix (via input), SchoolJourney (via input)
// Last Modified: 2026-03-08
// Dependencies: Base44 InvokeLLM

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export async function generateDecisionNarration(base44, { schools, comparisonMatrix, familyProfile, schoolJourneys, isPremiumUser }) {
  // E29-017: Return null immediately for non-premium users to avoid LLM cost
  if (!isPremiumUser) {
    return null;
  }

  // Compute whether we have post-visit debrief data
  const hasDebriefs = Array.isArray(schoolJourneys) && schoolJourneys.some(j => j?.postVisitFitLabel || j?.visitVerdict || (j?.revisedConcerns?.length > 0));

  // Return default response if insufficient personalized data
  if (!familyProfile && (!Array.isArray(schoolJourneys) || schoolJourneys.length === 0)) {
    return {
      hasDebriefs: false,
      narrative: null,
      tradeoffs: [],
      nextStep: null,
      limitationsNotice: 'Not enough personalized data available for tradeoff analysis.'
    };
  }

  try {
    // Build briefSummary from familyProfile
    const briefSummary = familyProfile ? {
      priorities: familyProfile.priorities || [],
      dealbreakers: familyProfile.dealbreakers || [],
      childAge: familyProfile.childAge || null,
      childGrade: familyProfile.childGrade || null,
      learningDifferences: familyProfile.learningDifferences || [],
      budgetRange: familyProfile.budgetRange || null,
      maxTuition: familyProfile.maxTuition || null,
      goals: familyProfile.interests || []
    } : null;

    // Build comparisonSummary from comparisonMatrix dimensions
    const comparisonSummary = comparisonMatrix?.dimensions?.map(dim => ({
      category: dim.category,
      label: dim.label,
      values: dim.values,
      relevance: dim.relevance || null
    })) || [];

    // Build debriefSummary from schoolJourneys if available
    let debriefSummary = null;
    if (hasDebriefs && Array.isArray(schoolJourneys)) {
      debriefSummary = schoolJourneys.map(j => ({
        schoolId: j.schoolId,
        schoolName: j.schoolName || 'Unknown School',
        status: j.status || 'MATCHED',
        postVisitFitLabel: j.postVisitFitLabel || null,
        visitVerdict: j.visitVerdict || null,
        revisedStrengths: j.revisedStrengths || [],
        revisedConcerns: j.revisedConcerns || []
      }));
    }

    // Build honest tradeoff prompt
    const tradeoffPrompt = `You are a cautious educational consultant. You are given a family's school brief, comparison matrix, and optionally post-visit debrief data. Your task is to write an HONEST tradeoff summary using ONLY the supplied data.

RULES:
- NEVER invent numbers, program names, or features not explicitly in the inputs.
- If information is missing, say so explicitly.
- Focus on real tradeoffs between the schools (cost vs. program breadth, location vs. academic rigor, etc.)
- If there are post-visit debriefs, incorporate the family's honest reflections.
- Be direct: if one school is clearly winning, say so. If there are genuine downsides, name them.

Family Brief:
${JSON.stringify(briefSummary, null, 2)}

Comparison Matrix (selected dimensions):
${comparisonSummary.map(d => `- ${d.category} / ${d.label}: ${d.values.join(' vs. ')} (relevance: ${d.relevance || 'neutral'})`).join('\n')}

${debriefSummary ? `Post-Visit Debriefs:
${debriefSummary.map(d => `- ${d.schoolName}: Status=${d.status}, PostVisitFit=${d.postVisitFitLabel || 'Not yet assessed'}, Verdict=${d.visitVerdict || 'Pending'}, Strengths=[${d.revisedStrengths?.join(', ') || 'None noted'}], Concerns=[${d.revisedConcerns?.join(', ') || 'None noted'}]`).join('\n')}` : '- No post-visit debriefs available.'}

Output JSON matching this schema exactly:
{
  "narrative": "3-6 sentence honest summary of the tradeoffs and what the data suggests",
  "tradeoffs": ["bullet 1: specific school vs. specific school on specific attribute", "bullet 2: ...", "bullet 3: ..."],
  "nextStep": "one concrete recommended next action grounded in the data",
  "limitationsNotice": "string describing missing data that would help, or null if sufficient data"
}`;

    const llmResponse = await base44.integrations.Core.InvokeLLM({
      prompt: tradeoffPrompt,
      model: 'gpt-5',
      response_json_schema: {
        type: "object",
        properties: {
          narrative: { type: "string" },
          tradeoffs: { type: "array", items: { type: "string" } },
          nextStep: { type: "string" },
          limitationsNotice: { type: ["string", "null"] }
        },
        required: ["narrative", "tradeoffs", "nextStep"]
      }
    });

    // Normalize output
    const output = {
      hasDebriefs,
      narrative: llmResponse?.narrative || null,
      tradeoffs: (Array.isArray(llmResponse?.tradeoffs) ? llmResponse.tradeoffs.slice(0, 3) : []),
      nextStep: llmResponse?.nextStep || null,
      limitationsNotice: llmResponse?.limitationsNotice || null
    };

    console.log('[E29-017] Decision narration generated successfully');
    return output;
  } catch (error) {
    console.error('[E29-017] generateDecisionNarration failed:', error.message);
    return null;
  }
}