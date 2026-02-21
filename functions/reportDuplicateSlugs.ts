import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all schools using list with proper limit
    const schools = await base44.asServiceRole.entities.School.list('-updated_date', 10000);
    
    if (!schools || schools.length === 0) {
      return Response.json({ error: 'No schools found' }, { status: 400 });
    }

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