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

    console.log(`[TIER 1 ENRICHMENT] Found ${targetSchools.length} Canadian schools outside Ontario missing Tier 1 fields`);

    if (targetSchools.length === 0) {
      return Response.json({
        success: true,
        count: 0,
        message: 'No Canadian schools outside Ontario missing Tier 1 fields',
        enrichmentStarted: false
      });
    }

    // Start enrichment in batches of 15
    const BATCH_SIZE = 15;
    const enrichmentResults = [];
    let totalEnriched = 0;

    for (let i = 0; i < targetSchools.length; i += BATCH_SIZE) {
      const batch = targetSchools.slice(i, i + BATCH_SIZE);
      console.log(`[TIER 1 ENRICHMENT] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(targetSchools.length / BATCH_SIZE)} (${batch.length} schools)`);

      for (const school of batch) {
        try {
          // Build enrichment prompt
          const missingFields = [];
          for (const field of TIER_1_FIELDS) {
            if (!school[field] || school[field] === '' || (Array.isArray(school[field]) && school[field].length === 0)) {
              missingFields.push(field);
            }
          }

          const prompt = `Research ${school.name} in ${school.city}, ${school.provinceState}, Canada. Find their website and extract:
- Tuition (annual day school tuition for elementary or middle school, in the school's currency)
- Religious affiliation (if any)
- Curriculum types offered (e.g., IB, AP, Traditional, Montessori, etc.)
- Financial aid availability (true/false)
- Brief description (2-3 sentences about the school)

School website: ${school.website || 'Not available'}

Return as JSON with fields: dayTuition (number or null), religiousAffiliation (string or null), curriculum (array of strings), financialAidAvailable (boolean), description (string).`;

          const enrichedData = await base44.integrations.Core.InvokeLLM({
            prompt: prompt,
            add_context_from_internet: true,
            response_json_schema: {
              type: 'object',
              properties: {
                dayTuition: { type: ['number', 'null'] },
                religiousAffiliation: { type: ['string', 'null'] },
                curriculum: { type: 'array', items: { type: 'string' } },
                financialAidAvailable: { type: 'boolean' },
                description: { type: 'string' }
              }
            }
          });

          // Prepare update data - only add non-null values
          const updateData = {};
          if (enrichedData.dayTuition !== null) {
            updateData.dayTuition = enrichedData.dayTuition;
          }
          if (enrichedData.religiousAffiliation !== null) {
            updateData.religiousAffiliation = enrichedData.religiousAffiliation;
          }
          if (enrichedData.curriculum && enrichedData.curriculum.length > 0) {
            updateData.curriculum = enrichedData.curriculum;
          }
          if (enrichedData.financialAidAvailable !== null) {
            updateData.financialAidAvailable = enrichedData.financialAidAvailable;
          }
          if (enrichedData.description) {
            updateData.description = enrichedData.description;
          }

          updateData.lastEnriched = new Date().toISOString();
          updateData.aiEnrichedFields = (school.aiEnrichedFields || []).concat(
            Object.keys(updateData).filter(k => k !== 'lastEnriched' && k !== 'aiEnrichedFields')
          );

          await base44.asServiceRole.entities.School.update(school.id, updateData);
          totalEnriched++;

          enrichmentResults.push({
            schoolId: school.id,
            schoolName: school.name,
            city: school.city,
            province: school.provinceState,
            enrichedFields: Object.keys(updateData).filter(k => k !== 'lastEnriched' && k !== 'aiEnrichedFields'),
            success: true
          });

          console.log(`[TIER 1 ENRICHMENT] Enriched ${school.name} (${totalEnriched}/${targetSchools.length})`);
        } catch (error) {
          enrichmentResults.push({
            schoolId: school.id,
            schoolName: school.name,
            city: school.city,
            province: school.provinceState,
            success: false,
            error: error.message
          });
          console.error(`[TIER 1 ENRICHMENT] Failed to enrich ${school.name}: ${error.message}`);
        }

        // Batch delay every 3 schools to avoid rate limits
        if ((totalEnriched % 3) === 0) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    return Response.json({
      success: true,
      count: targetSchools.length,
      enrichmentStarted: true,
      totalEnriched: totalEnriched,
      summary: {
        found: targetSchools.length,
        enriched: totalEnriched,
        failed: enrichmentResults.filter(r => !r.success).length
      },
      results: enrichmentResults
    });

  } catch (error) {
    console.error('[TIER 1 ENRICHMENT] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});