import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch US schools
    const usSchools = await base44.asServiceRole.entities.School.list(null, 5000);
    
    if (!usSchools || usSchools.length === 0) {
      return Response.json({ error: 'No US schools found' }, { status: 400 });
    }

    // Filter: United States AND (description IS NULL OR dayTuition IS NULL)
    const targetSchools = usSchools.filter(school => {
      const isUS = school.country === 'United States';
      const missingDescription = !school.description || school.description === '';
      const missingDayTuition = !school.dayTuition;
      return isUS && (missingDescription || missingDayTuition);
    });

    // Group by state
    const byState = {};
    targetSchools.forEach(school => {
      const state = school.provinceState || 'Unknown';
      if (!byState[state]) byState[state] = [];
      byState[state].push(school);
    });

    return Response.json({
      success: true,
      totalCount: targetSchools.length,
      byState: Object.fromEntries(
        Object.entries(byState).map(([state, schools]) => [state, schools.length])
      ),
      tier1Fields: ['description', 'dayTuition', 'boardingTuition', 'curriculum', 'religiousAffiliation', 'financialAid', 'accreditation'],
      message: `Found ${targetSchools.length} US schools missing Tier 1 fields. Ready for enrichment.`
    });

  } catch (error) {
    console.error('[COUNT US] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});