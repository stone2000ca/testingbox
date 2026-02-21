import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Normalize school name for comparison
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\b(st\.?|saint)\s+/g, 'st ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Count non-null fields
function countCompleteFields(school) {
  let count = 0;
  const data = school.data || school;
  const fields = [
    'name', 'address', 'city', 'provinceState', 'phone', 'email',
    'website', 'dayTuition', 'boardingTuition', 'currency', 'founded',
    'enrollment', 'studentCount', 'missionStatement', 'description',
    'logoUrl', 'headerPhotoUrl', 'curriculum', 'religiousAffiliation',
    'financialAidAvailable', 'genderPolicy', 'schoolType'
  ];
  for (const field of fields) {
    const val = data[field];
    if (val && val !== '' && (!Array.isArray(val) || val.length > 0)) {
      count++;
    }
  }
  return count;
}

// Determine primary school (best candidate to keep)
function selectPrimary(schools) {
  // Normalize: ensure all schools have .data property
  const normalized = schools.map(s => ({
    id: s.id,
    data: s.data || s
  }));

  // Priority 1: claimed status
  const claimed = normalized.find(s => s.data.claimStatus === 'claimed');
  if (claimed) return claimed;

  // Priority 2: manual source (user-created)
  const manual = normalized.find(s => s.data.dataSource === 'manual' || !s.data.importBatchId);
  if (manual) return manual;

  // Priority 3: most complete record
  return normalized.reduce((best, current) => 
    countCompleteFields(current) > countCompleteFields(best) ? current : best
  );
}

// Merge duplicate records
function mergeRecords(primary, duplicate) {
  const merged = { ...primary.data };
  
  for (const [key, value] of Object.entries(duplicate.data)) {
    if (value && !merged[key] && key !== 'id' && key !== 'created_date' && key !== 'created_by') {
      merged[key] = value;
    } else if (Array.isArray(value) && Array.isArray(merged[key])) {
      // Merge arrays, avoiding duplicates
      merged[key] = [...new Set([...merged[key], ...value])];
    }
  }

  return merged;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all schools - use list with sort descending to get all
    const schools = await base44.asServiceRole.entities.School.filter({});
    
    if (schools.length === 0) {
      return Response.json({ error: 'No schools found' }, { status: 400 });
    }

    console.log(`Fetched ${schools.length} schools`);
    
    // Verify data structure
    if (!Array.isArray(schools) || schools.length === 0) {
      console.log('Schools is not an array or empty');
      return Response.json({ error: 'Invalid school data' }, { status: 400 });
    }

    const firstSchool = schools[0];
    const schoolKeys = Object.keys(firstSchool || {});
    console.log(`First school keys:`, schoolKeys);
    
    // Check if schools have .data property or are flat
    const isFlatStructure = 'slug' in firstSchool;
    const hasDataProperty = 'data' in firstSchool;
    console.log(`isFlatStructure: ${isFlatStructure}, hasDataProperty: ${hasDataProperty}`);

    const report = {
      pass1: {
        totalProcessed: 0,
        duplicateSlugsFound: 0,
        groupsMerged: 0,
        recordsDeleted: 0,
        fieldsCopied: 0,
        merges: []
      },
      pass2: {
        duplicatesFound: 0,
        recordsDeleted: 0,
        merges: []
      },
      totalSchoolsBefore: schools.length,
      totalSchoolsAfter: 0
    };

    // PASS 1: Find and merge duplicate slugs
    const slugMap = {};
    for (const school of schools) {
      const slug = school.slug || school.data?.slug;
      if (slug) {
        if (!slugMap[slug]) slugMap[slug] = [];
        slugMap[slug].push(school);
      }
    }

    console.log(`Total unique slugs: ${Object.keys(slugMap).length}, schools: ${schools.length}`);
    const duplicateSlugs = Object.entries(slugMap).filter(([_, list]) => list.length > 1);
    console.log(`Duplicate slug groups: ${duplicateSlugs.length}`);
    if (duplicateSlugs.length > 0) {
      console.log('Sample duplicates:', duplicateSlugs.slice(0, 3).map(([slug, list]) => ({ slug, count: list.length })));
    }

    const deletedIds = new Set();

    for (const [slug, schoolList] of Object.entries(slugMap)) {
      if (schoolList.length > 1) {
        report.pass1.duplicateSlugsFound++;
        
        // Select primary school
        const primary = selectPrimary(schoolList);
        const duplicates = schoolList.filter(s => s.id !== primary.id);

        // Merge fields from duplicates into primary
        const primaryData = primary.data || primary;
        let mergedData = { ...primaryData };
        let fieldsCopied = 0;

        for (const duplicate of duplicates) {
          const dupData = duplicate.data || duplicate;
          const before = JSON.stringify(mergedData);
          mergedData = mergeRecords({ data: mergedData }, { data: dupData });
          const after = JSON.stringify(mergedData);
          
          if (before !== after) {
            const newFields = Object.keys(dupData).filter(
              k => dupData[k] && !primaryData[k]
            ).length;
            fieldsCopied += newFields;
          }
        }

        // Update primary with merged data
        await base44.asServiceRole.entities.School.update(primary.id, mergedData);

        // Delete duplicates
        for (const duplicate of duplicates) {
          await base44.asServiceRole.entities.School.delete(duplicate.id);
          deletedIds.add(duplicate.id);
          report.pass1.recordsDeleted++;
        }

        report.pass1.groupsMerged++;
        report.pass1.merges.push({
          slug: slug,
          primaryId: primary.id,
          primaryName: primaryData.name,
          primarySource: primaryData.dataSource,
          primaryCompleteFields: countCompleteFields(primary),
          duplicatesDeleted: duplicates.length,
          duplicateNames: duplicates.map(d => (d.data || d).name),
          fieldsCopied: fieldsCopied
        });
      }

      report.pass1.totalProcessed++;
    }

    report.pass1.fieldsCopied = report.pass1.merges.reduce((sum, m) => sum + (m.fieldsCopied || 0), 0);

    // PASS 2: Find schools with same normalized name + city but different slugs
    const remaining = schools.filter(s => !deletedIds.has(s.id));
    const nameMap = {};

    for (const school of remaining) {
      const data = school.data || school;
      if (data?.name && data?.city) {
        const key = `${normalizeName(data.name)}|${data.city}`;
        if (!nameMap[key]) nameMap[key] = [];
        nameMap[key].push(school);
      }
    }

    for (const [key, schoolList] of Object.entries(nameMap)) {
      if (schoolList.length > 1) {
        // Check if they have different slugs
        const slugs = new Set(schoolList.map(s => (s.data || s).slug));
        if (slugs.size > 1) {
          report.pass2.duplicatesFound++;

          const primary = selectPrimary(schoolList);
          const duplicates = schoolList.filter(s => s.id !== primary.id);

          const primaryData = primary.data || primary;
          let mergedData = { ...primaryData };
          let fieldsCopied = 0;

          for (const duplicate of duplicates) {
            const dupData = duplicate.data || duplicate;
            const before = JSON.stringify(mergedData);
            mergedData = mergeRecords({ data: mergedData }, { data: dupData });
            const after = JSON.stringify(mergedData);
            
            if (before !== after) {
              const newFields = Object.keys(dupData).filter(
                k => dupData[k] && !primaryData[k]
              ).length;
              fieldsCopied += newFields;
            }
          }

          // Update primary
          await base44.asServiceRole.entities.School.update(primary.id, mergedData);

          // Delete duplicates
          for (const duplicate of duplicates) {
            await base44.asServiceRole.entities.School.delete(duplicate.id);
            deletedIds.add(duplicate.id);
            report.pass2.recordsDeleted++;
          }

          report.pass2.merges.push({
            schoolNames: schoolList.map(s => (s.data || s).name),
            city: (schoolList[0].data || schoolList[0]).city,
            slugsConsolidated: Array.from(slugs),
            primaryId: primary.id,
            primarySlug: primaryData.slug,
            duplicatesDeleted: duplicates.length,
            fieldsCopied: fieldsCopied
          });
        }
      }
    }

    // Final count
    const finalSchools = await base44.asServiceRole.entities.School.list(null, 1000);
    report.totalSchoolsAfter = finalSchools.length;

    return Response.json({
      success: true,
      report: report,
      summary: {
        schoolsDeleted: report.pass1.recordsDeleted + report.pass2.recordsDeleted,
        schoolsRemaining: report.totalSchoolsAfter,
        pass1Merges: report.pass1.groupsMerged,
        pass2Merges: report.pass2.duplicatesFound
      }
    });

  } catch (error) {
    console.error('Merge duplicates failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});