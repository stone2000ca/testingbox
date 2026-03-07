// Function: processDebriefCompletion
// Purpose: Handle debrief-completion post-processing (journey sync + fit re-eval) asynchronously
// Entities: GeneratedArtifact, FamilyJourney
// Last Modified: 2026-03-07
// Dependencies: Core.InvokeLLM (structured), Base44 SDK (entities CRUD)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { conversationId, schoolId, userId, journeyId, conversationFamilyProfile } = await req.json();

    if (!conversationId || !schoolId || !userId) {
      return Response.json({ error: '[E29-010] Missing required params' }, { status: 400 });
    }

    // 1) Load artifacts (visit_debrief and deep_dive_analysis)
    const [debriefArtifacts, deepDiveArtifacts] = await Promise.all([
      base44.entities.GeneratedArtifact.filter({
        conversationId,
        schoolId,
        artifactType: 'visit_debrief',
      }),
      base44.entities.GeneratedArtifact.filter({
        conversationId,
        schoolId,
        artifactType: 'deep_dive_analysis',
      }),
    ]);
    const debriefArtifact = debriefArtifacts?.[0] || null;
    const deepDiveAnalysis = deepDiveArtifacts?.[0] || null;

    // 2) Load FamilyJourney by id or userId
    const journey =
      (journeyId && (await base44.entities.FamilyJourney.filter({ id: journeyId }))?.[0]) ||
      (await base44.entities.FamilyJourney.filter({ userId }))?.[0] ||
      null;

    if (!journey) {
      console.warn('[E29-010] No FamilyJourney found; skipping journey updates');
    }

    // 3) Find/create schoolJourney entry; set VISITED + timestamps
    let currentPhase = journey?.currentPhase || null;
    const nowIso = new Date().toISOString();
    let schoolJourneys = Array.isArray(journey?.schoolJourneys) ? [...journey.schoolJourneys] : [];
    let item = schoolJourneys.find((sj: any) => sj.schoolId === schoolId);

    if (item) {
      item.status = 'VISITED';
      item.visitedAt = nowIso;
      item.debriefCompletedAt = nowIso;
      if (debriefArtifact?.id) item.debriefArtifactId = debriefArtifact.id;
    } else if (journey) {
      schoolJourneys.push({
        schoolId,
        schoolName: '', // optional; can be filled elsewhere
        status: 'VISITED',
        addedVia: 'DEBRIEF',
        visitedAt: nowIso,
        debriefCompletedAt: nowIso,
        debriefArtifactId: debriefArtifact?.id || undefined,
      });
    }

    // 4) Fit re-eval via InvokeLLM with response_json_schema (structured)
    let reevalResult: any = null;
    try {
      if (debriefArtifact?.content?.qaPairs?.length && deepDiveAnalysis?.content) {
        const originalAnalysis = deepDiveAnalysis.content || {};
        const qaPairs = debriefArtifact.content.qaPairs || [];
        const priorities = conversationFamilyProfile?.priorities || [];

        const qaContext = qaPairs
          .map((qa: any, idx: number) => `Q${idx + 1}: ${qa.question}\nA${idx + 1}: ${qa.answer}`)
          .join('\n\n');

        const reevalSystemPrompt = `You are a school fit analyst. Given original school analysis and post-visit debrief responses, re-evaluate whether the school remains a good fit.

CRITICAL: Return ONLY valid JSON. Do NOT include any markdown code blocks, explanations, or text outside the JSON.`;

        const reevalUserPrompt = `ORIGINAL ANALYSIS:
- Fit Label: ${originalAnalysis.fitLabel || 'unknown'}
- Trade-offs: ${(originalAnalysis.tradeOffs || []).map((t: any) => `${t.dimension}: ${t.concern || 'neutral'}`).join('; ') || 'none'}
- Strengths: ${(originalAnalysis.strengths || []).join(', ') || 'none noted'}

FAMILY PRIORITIES: ${priorities.join(', ') || 'not specified'}

POST-VISIT DEBRIEF Q&A:
${qaContext}

Based on what the family shared during their visit, provide a fit re-evaluation. Return JSON: { updatedFitLabel (enum: "strong_match", "good_match", "worth_exploring"), fitDirection (enum: "improved", "declined", "unchanged"), revisedStrengths (array of strings), revisedConcerns (array of strings), visitVerdict (string, 1-2 sentences) }`;

        const structured = await base44.integrations.Core.InvokeLLM({
          prompt: `${reevalSystemPrompt}\n\n${reevalUserPrompt}`,
          response_json_schema: {
            type: 'object',
            properties: {
              updatedFitLabel: { type: 'string', enum: ['strong_match', 'good_match', 'worth_exploring'] },
              fitDirection: { type: 'string', enum: ['improved', 'declined', 'unchanged'] },
              revisedStrengths: { type: 'array', items: { type: 'string' } },
              revisedConcerns: { type: 'array', items: { type: 'string' } },
              visitVerdict: { type: 'string' },
            },
            required: ['updatedFitLabel', 'fitDirection', 'revisedStrengths', 'revisedConcerns', 'visitVerdict'],
            additionalProperties: false,
          },
        });

        reevalResult = structured || null;

        // 5) Create fit_reevaluation artifact
        if (reevalResult) {
          const fitReevalContent = {
            ...reevalResult,
            originalFitLabel: originalAnalysis.fitLabel || 'unknown',
            debriefTimestamp: nowIso,
          };

          await base44.entities.GeneratedArtifact.create({
            userId,
            conversationId,
            schoolId,
            artifactType: 'fit_reevaluation',
            title: 'Fit Re-evaluation',
            content: fitReevalContent,
            status: 'ready',
            isShared: false,
            pdfUrl: null,
            shareToken: null,
          });
        }
      } else {
        console.log('[E29-010] Skipping fit re-eval: missing debrief QA pairs or deepDiveAnalysis');
      }
    } catch (e) {
      console.error('[E29-010] Fit re-eval failed:', e?.message || e);
    }

    // 6) Patch schoolJourney with re-eval fields (if we got them)
    if (reevalResult && item) {
      item.postVisitFitLabel = reevalResult.updatedFitLabel;
      item.fitDirection = reevalResult.fitDirection;
      item.visitVerdict = reevalResult.visitVerdict;
      item.revisedStrengths = reevalResult.revisedStrengths;
      item.revisedConcerns = reevalResult.revisedConcerns;
    }

    // 7) Phase advance: if all TOURING items now VISITED and phase is EXPERIENCE -> DECIDE
    let nextPhase: string | null = null;
    if (journey) {
      const hasTouring = schoolJourneys.some((sj: any) => sj.status === 'TOURING');
      if (!hasTouring && currentPhase === 'EXPERIENCE') {
        nextPhase = 'DECIDE';
      }
      const updatePayload: any = { schoolJourneys };
      if (nextPhase) updatePayload.currentPhase = nextPhase;
      await base44.entities.FamilyJourney.update(journey.id, updatePayload);
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[E29-010] processDebriefCompletion failed:', err?.message || err);
    return Response.json({ error: '[E29-010] ' + (err?.message || 'Unknown error') }, { status: 500 });
  }
});