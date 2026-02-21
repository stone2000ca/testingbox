import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all schools in batches
    let allSchools = [];
    let batchSize = 1000;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await base44.asServiceRole.entities.School.filter({}, null, batchSize, skip);
      
      if (!batch || batch.length === 0) {
        hasMore = false;
      } else {
        allSchools = allSchools.concat(batch);
        skip += batchSize;
        if (batch.length < batchSize) {
          hasMore = false;
        }
      }
    }
    
    if (!allSchools || allSchools.length === 0) {
      return Response.json({ error: 'No schools found' }, { status: 400 });
    }

    const schools = allSchools;

    // Group by slug
    const slugMap = {};
    for (const school of schools) {
      if (school.slug) {
        if (!slugMap[school.slug]) {
          slugMap[school.slug] = [];
        }
        slugMap[school.slug].push({
          id: school.id,
          name: school.name
        });
      }
    }

    // Find duplicates
    const duplicates = {};
    let totalDuplicateSlugs = 0;
    let totalDuplicateRecords = 0;

    for (const [slug, schools] of Object.entries(slugMap)) {
      if (schools.length > 1) {
        duplicates[slug] = schools;
        totalDuplicateSlugs++;
        totalDuplicateRecords += schools.length;
      }
    }

    return Response.json({
      timestamp: new Date().toISOString(),
      totalSchools: schools.length,
      totalUniqueSlugs: Object.keys(slugMap).length,
      totalDuplicateSlugs: totalDuplicateSlugs,
      totalDuplicateRecords: totalDuplicateRecords,
      duplicates: duplicates
    });

  } catch (error) {
    console.error('Report failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});