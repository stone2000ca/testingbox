import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin for scheduled tasks
    const isServiceRole = !req.headers.get('authorization');
    if (!isServiceRole) {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
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

    if (targetSchools.length === 0) {
      return Response.json({
        success: true,
        processed: 0,
        message: 'No US schools missing Tier 1 fields'
      });
    }

    // Process one batch of 10 schools max to avoid timeout
    const BATCH_SIZE = 10;
    const batch = targetSchools.slice(0, BATCH_SIZE);
    const enrichmentResults = [];
    let totalEnriched = 0;

    console.log(`[US TIER 1 BATCH] Processing ${batch.length} schools...`);

    for (const school of batch) {
      try {
        const prompt = `Research ${school.name} in ${school.city}, ${school.provinceState}, United States. Find their website and extract:
- Brief description (2-3 sentences about the school)
- Annual day school tuition (USD, for elementary or middle school)
- Annual boarding tuition if available (USD)
- Curriculum types offered (e.g., IB, AP, Traditional, Montessori, etc.)
- Religious affiliation if any (null if none)
- Financial aid availability (true/false)
- School accreditations (e.g., NAIS, ISACS, regional accreditation)

School website: ${school.website || 'Not available'}

Return as JSON with fields: description (string), dayTuition (number or null), boardingTuition (number or null), curriculum (array of strings), religiousAffiliation (string or null), financialAid (boolean), accreditation (array of strings).`;

        const enrichedData = await base44.integrations.Core.InvokeLLM({
          prompt: prompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              dayTuition: { type: ['number', 'null'] },
              boardingTuition: { type: ['number', 'null'] },
              curriculum: { type: 'array', items: { type: 'string' } },
              religiousAffiliation: { type: ['string', 'null'] },
              financialAid: { type: 'boolean' },
              accreditation: { type: 'array', items: { type: 'string' } }
            }
          }
        });

        // Prepare update data
        const updateData = {};
        if (enrichedData.description) updateData.description = enrichedData.description;
        if (enrichedData.dayTuition !== null) updateData.dayTuition = enrichedData.dayTuition;
        if (enrichedData.boardingTuition !== null) updateData.boardingTuition = enrichedData.boardingTuition;
        if (enrichedData.curriculum && enrichedData.curriculum.length > 0) updateData.curriculum = enrichedData.curriculum;
        if (enrichedData.religiousAffiliation !== null) updateData.religiousAffiliation = enrichedData.religiousAffiliation;
        if (enrichedData.financialAid !== null) updateData.financialAid = enrichedData.financialAid;
        if (enrichedData.accreditation && enrichedData.accreditation.length > 0) updateData.accreditation = enrichedData.accreditation;

        // Set USD currency if we added tuition
        if (updateData.dayTuition || updateData.boardingTuition) {
          updateData.currency = 'USD';
        }

        updateData.lastEnriched = new Date().toISOString();
        updateData.aiEnrichedFields = (school.aiEnrichedFields || []).concat(
          Object.keys(updateData).filter(k => k !== 'lastEnriched' && k !== 'aiEnrichedFields' && k !== 'currency')
        );

        await base44.asServiceRole.entities.School.update(school.id, updateData);
        totalEnriched++;

        enrichmentResults.push({
          schoolName: school.name,
          city: school.city,
          enrichedFields: Object.keys(updateData).filter(k => k !== 'lastEnriched' && k !== 'aiEnrichedFields' && k !== 'currency'),
          success: true
        });

        console.log(`[US TIER 1 BATCH] Enriched ${school.name} (${totalEnriched}/${BATCH_SIZE})`);

        // Delay between requests
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        enrichmentResults.push({
          schoolName: school.name,
          success: false,
          error: error.message
        });
        console.error(`[US TIER 1 BATCH] Failed ${school.name}: ${error.message}`);
      }
    }

    return Response.json({
      success: true,
      processed: totalEnriched,
      remaining: Math.max(0, targetSchools.length - BATCH_SIZE),
      results: enrichmentResults
    });

  } catch (error) {
    console.error('[US TIER 1 BATCH] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});