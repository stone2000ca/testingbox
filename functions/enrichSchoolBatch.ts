import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { enrichments } = await req.json();

    if (!Array.isArray(enrichments)) {
      return Response.json({ error: 'enrichments must be an array' }, { status: 400 });
    }

    console.log(`Processing ${enrichments.length} school enrichments...`);

    let updated = 0;
    let skipped = 0;
    let errors = [];

    for (const enrichment of enrichments) {
      try {
        const { slug, dayTuition, boardingTuition, currency, religiousAffiliation, curriculum, financialAidAvailable } = enrichment;

        if (!slug) {
          skipped++;
          errors.push({
            slug: 'unknown',
            error: 'Missing required slug'
          });
          continue;
        }

        // Find school by slug
        const matches = await base44.asServiceRole.entities.School.filter({ slug });
        const school = matches?.[0];

        if (!school) {
          skipped++;
          errors.push({
            slug,
            error: 'School not found'
          });
          continue;
        }

        // Build update object - only include fields that are provided and null in existing school
        const updateData = {};
        let hasUpdates = false;

        if (dayTuition !== undefined && dayTuition !== null && !school.dayTuition) {
          updateData.dayTuition = dayTuition;
          hasUpdates = true;
        }

        if (boardingTuition !== undefined && boardingTuition !== null && !school.boardingTuition) {
          updateData.boardingTuition = boardingTuition;
          hasUpdates = true;
        }

        if (currency !== undefined && currency !== null && !school.currency) {
          updateData.currency = currency;
          hasUpdates = true;
        }

        if (religiousAffiliation !== undefined && religiousAffiliation !== null && !school.religiousAffiliation) {
          updateData.religiousAffiliation = religiousAffiliation;
          hasUpdates = true;
        }

        if (curriculum !== undefined && curriculum !== null && !school.curriculum) {
          updateData.curriculum = Array.isArray(curriculum) ? curriculum : [curriculum];
          hasUpdates = true;
        }

        if (financialAidAvailable !== undefined && financialAidAvailable !== null && school.financialAidAvailable === undefined) {
          updateData.financialAidAvailable = financialAidAvailable;
          hasUpdates = true;
        }

        if (hasUpdates) {
          updateData.lastEnriched = new Date().toISOString();
          await base44.asServiceRole.entities.School.update(school.id, updateData);
          updated++;
        } else {
          skipped++;
        }
      } catch (error) {
        errors.push({
          slug: enrichment.slug || 'unknown',
          error: error.message
        });
      }
    }

    return Response.json({
      success: true,
      totalProcessed: enrichments.length,
      results: {
        updated,
        skipped,
        errors: errors.length > 0 ? errors : null
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});