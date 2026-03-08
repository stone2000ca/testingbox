// Function: handleJourneyOutcome
// Purpose: Record enrollment outcome on FamilyJourney and archive after successful enrollment
// Entities: FamilyJourney, SchoolJourney (nested array within FamilyJourney)
// Last Modified: 2026-03-08
// Dependencies: Base44 SDK (FamilyJourney entity)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { journeyId, outcome, outcomeSchoolId, userId } = await req.json();

    // 1. Validate inputs
    if (!journeyId || !outcome || !outcomeSchoolId || !userId) {
      return Response.json(
        { success: false, error: 'Missing required fields: journeyId, outcome, outcomeSchoolId, userId', code: 400 },
        { status: 400 }
      );
    }

    const validOutcomes = ['ENROLLED', 'DEFERRED', 'ABANDONED'];
    if (!validOutcomes.includes(outcome)) {
      return Response.json(
        { success: false, error: `Invalid outcome. Must be one of: ${validOutcomes.join(', ')}`, code: 400 },
        { status: 400 }
      );
    }

    // 2. Fetch FamilyJourney
    let journey = null;
    try {
      journey = await base44.entities.FamilyJourney.get(journeyId);
    } catch (fetchErr) {
      console.warn('[E29-019] FamilyJourney fetch failed:', fetchErr.message);
    }

    if (!journey) {
      return Response.json(
        { success: false, error: 'Journey not found', code: 404 },
        { status: 404 }
      );
    }

    // 3. Validate ownership and state
    if (journey.userId !== userId) {
      return Response.json(
        { success: false, error: 'Unauthorized: userId does not match journey owner', code: 403 },
        { status: 403 }
      );
    }

    if (journey.isArchived === true) {
      return Response.json(
        { success: false, error: 'Journey is already archived', code: 409 },
        { status: 409 }
      );
    }

    // 4. Parse schoolJourneys and validate outcomeSchoolId exists
    let schoolJourneys = journey.schoolJourneys || [];
    if (typeof schoolJourneys === 'string') {
      try {
        schoolJourneys = JSON.parse(schoolJourneys);
      } catch (parseErr) {
        console.warn('[E29-019] Failed to parse schoolJourneys:', parseErr.message);
        schoolJourneys = [];
      }
    }

    const matchingSchool = schoolJourneys.find(sj => sj.schoolId === outcomeSchoolId);
    if (!matchingSchool) {
      return Response.json(
        { success: false, error: `School ID ${outcomeSchoolId} not found in journey schoolJourneys`, code: 422 },
        { status: 422 }
      );
    }

    // 5. Update the matching SchoolJourneyItem status
    const updatedSchoolJourneys = schoolJourneys.map(sj =>
      sj.schoolId === outcomeSchoolId ? { ...sj, status: 'ENROLLED' } : sj
    );

    // 6. WRITE SEQUENCE: outcome fields FIRST, then archive SECOND
    const outcomeDate = new Date().toISOString();

    try {
      // 6a. First update: set outcome fields
      await base44.entities.FamilyJourney.update(journeyId, {
        outcome,
        outcomeSchoolId,
        outcomeDate,
        currentPhase: 'ACT',
        schoolJourneys: updatedSchoolJourneys
      });
      console.log('[E29-019] Outcome fields updated:', { journeyId, outcome, outcomeSchoolId, outcomeDate });

      // 6b. Second update: archive the journey
      await base44.entities.FamilyJourney.update(journeyId, {
        isArchived: true
      });
      console.log('[E29-019] Journey archived:', journeyId);
    } catch (updateErr) {
      console.error('[E29-019] FamilyJourney update failed:', updateErr.message);
      return Response.json(
        { success: false, error: 'Failed to update journey outcome', code: 500 },
        { status: 500 }
      );
    }

    // 7. Build congratulations response
    const response = {
      success: true,
      outcome,
      schoolName: matchingSchool.schoolName,
      childName: journey.childName,
      message: `Congratulations! ${journey.childName} is heading to ${matchingSchool.schoolName}!`,
      journeyId,
      outcomeDate
    };

    console.log('[E29-019] Outcome recorded successfully:', response);

    // 8. Return 200 with response
    return Response.json(response, { status: 200 });
  } catch (error) {
    console.error('[E29-019] Unexpected error:', error.message);
    return Response.json(
      { success: false, error: error.message || 'Internal server error', code: 500 },
      { status: 500 }
    );
  }
});