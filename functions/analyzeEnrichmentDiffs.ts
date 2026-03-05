// Function: analyzeEnrichmentDiffs
// Purpose: Analyze all EnrichmentDiff records and return a structured summary for admin review
// Entities: EnrichmentDiff (read), School (read for names)
// Last Modified: 2026-03-05
// Dependencies: none

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    // Fetch all diffs
    const diffs = await base44.asServiceRole.entities.EnrichmentDiff.filter({});

    const totalDiffs = diffs.length;

    // byField: field name -> count
    const byField = {};
    for (const d of diffs) {
      byField[d.field] = (byField[d.field] || 0) + 1;
    }

    // byConfidence: bucketed by numeric confidence value
    const byConfidence = { low: 0, medium: 0, high: 0 };
    for (const d of diffs) {
      const c = d.confidence ?? 0;
      if (c >= 0.9) byConfidence.high++;
      else if (c >= 0.7) byConfidence.medium++;
      else byConfidence.low++;
    }

    // emptyVsPopulated: based on currentValue
    const emptyVsPopulated = { emptyCurrentValue: 0, populatedCurrentValue: 0 };
    for (const d of diffs) {
      const isEmpty = d.currentValue === null || d.currentValue === undefined || d.currentValue === '';
      if (isEmpty) emptyVsPopulated.emptyCurrentValue++;
      else emptyVsPopulated.populatedCurrentValue++;
    }

    // bySchool: schoolId -> { schoolName, diffCount }
    const bySchool = {};
    for (const d of diffs) {
      if (!bySchool[d.schoolId]) {
        bySchool[d.schoolId] = { schoolName: d.schoolId, diffCount: 0 };
      }
      bySchool[d.schoolId].diffCount++;
    }

    // Enrich school names — collect unique schoolIds
    const schoolIds = Object.keys(bySchool);
    if (schoolIds.length > 0) {
      const schools = await base44.asServiceRole.entities.School.filter({ id: { $in: schoolIds } });
      for (const s of schools) {
        if (bySchool[s.id]) {
          bySchool[s.id].schoolName = s.name;
        }
      }
    }

    // sampleDiffs: first 5 with full detail
    const sampleDiffs = diffs.slice(0, 5).map(d => ({
      field: d.field,
      currentValue: d.currentValue,
      proposedValue: d.proposedValue,
      confidence: d.confidence,
      schoolId: d.schoolId,
      status: d.status,
      sourceUrl: d.sourceUrl
    }));

    return Response.json({
      totalDiffs,
      byField,
      byConfidence,
      emptyVsPopulated,
      bySchool,
      sampleDiffs
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});