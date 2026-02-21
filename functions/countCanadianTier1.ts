import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TIER_1_FIELDS = ['dayTuition', 'religiousAffiliation', 'curriculum', 'financialAidAvailable', 'description'];

const countMissingFields = (school) => {
  let missing = 0;
  for (const field of TIER_1_FIELDS) {
    const value = school[field];
    if (!value || value === '' || (Array.isArray(value) && value.length === 0)) {
      missing++;
    }
  }
  return missing;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch Canadian schools
    const canadianSchools = await base44.asServiceRole.entities.School.list(null, 5000);
    
    if (!canadianSchools || canadianSchools.length === 0) {
      return Response.json({ error: 'No Canadian schools found' }, { status: 400 });
    }

    // Filter: Canada AND NOT Ontario AND missing Tier 1 fields
    const targetSchools = canadianSchools.filter(school => {
      const isCanada = school.country === 'Canada';
      const isNotOntario = school.provinceState && school.provinceState !== 'Ontario';
      const hasMissingFields = countMissingFields(school) > 0;
      return isCanada && isNotOntario && hasMissingFields;
    });

    // Group by province
    const byProvince = {};
    targetSchools.forEach(school => {
      const prov = school.provinceState || 'Unknown';
      if (!byProvince[prov]) byProvince[prov] = [];
      byProvince[prov].push(school);
    });

    return Response.json({
      success: true,
      totalCount: targetSchools.length,
      byProvince: Object.fromEntries(
        Object.entries(byProvince).map(([prov, schools]) => [prov, schools.length])
      ),
      tierFields: TIER_1_FIELDS,
      message: `Found ${targetSchools.length} Canadian schools outside Ontario missing Tier 1 fields. Ready for enrichment.`
    });

  } catch (error) {
    console.error('[COUNT] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});