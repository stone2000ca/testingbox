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
  const data = school;
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
  // Priority 1: claimed status
  const claimed = schools.find(s => s.claimStatus === 'claimed');
  if (claimed) return claimed;

  // Priority 2: manual source (user-created)
  const manual = schools.find(s => s.dataSource === 'manual' || !s.importBatchId);
  if (manual) return manual;

  // Priority 3: most complete record
  return schools.reduce((best, current) => 
    countCompleteFields(current) > countCompleteFields(best) ? current : best
  );
}

// Merge duplicate records
function mergeRecords(primary, duplicate) {
  const merged = { ...primary };
  
  for (const [key, value] of Object.entries(duplicate)) {
    if (value && !merged[key] && key !== 'id' && key !== 'created_date' && key !== 'created_by' && key !== 'updated_date') {
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

    // Fetch all schools
    const schools = await base44.asServiceRole.entities.School.filter({});
    
    if (!schools || schools.length === 0) {
      return Response.json({ error: 'No schools found' }, { status: 400 });
    }

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
      if (school.slug) {
        if (!slugMap[school.slug]) slugMap[school.slug] = [];
        slugMap[school.slug].push(school);
      }
    }

    const deletedIds = new Set();
    const updateQueue = []; // Queue updates to avoid rate limit

    for (const [slug, schoolList] of Object.entries(slugMap)) {
      if (schoolList.length > 1) {
        report.pass1.duplicateSlugsFound++;
        
        // Select primary school
        const primary = selectPrimary(schoolList);
        const duplicates = schoolList.filter(s => s.id !== primary.id);

        // Merge fields from duplicates into primary
        let mergedData = { ...primary };
        let fieldsCopied = 0;

        for (const duplicate of duplicates) {
          const before = JSON.stringify(mergedData);
          mergedData = mergeRecords(mergedData, duplicate);
          const after = JSON.stringify(mergedData);
          
          if (before !== after) {
            const newFields = Object.keys(duplicate).filter(
              k => duplicate[k] && !primary[k]
            ).length;
            fieldsCopied += newFields;
          }
        }

        // Queue update
        updateQueue.push({
          type: 'update',
          id: primary.id,
          data: mergedData
        });

        // Queue deletes
        for (const duplicate of duplicates) {
          updateQueue.push({
            type: 'delete',
            id: duplicate.id
          });
          deletedIds.add(duplicate.id);
          report.pass1.recordsDeleted++;
        }

        report.pass1.groupsMerged++;
        report.pass1.merges.push({
          slug: slug,
          primaryId: primary.id,
          primaryName: primary.name,
          primarySource: primary.dataSource,
          primaryCompleteFields: countCompleteFields(primary),
          duplicatesDeleted: duplicates.length,
          duplicateNames: duplicates.map(d => d.name),
          fieldsCopied: fieldsCopied
        });
      }

      report.pass1.totalProcessed++;
    }

    // Execute update queue with batch processing and delays
    for (let i = 0; i < updateQueue.length; i++) {
      const op = updateQueue[i];
      if (op.type === 'update') {
        await base44.asServiceRole.entities.School.update(op.id, op.data);
      } else if (op.type === 'delete') {
        await base44.asServiceRole.entities.School.delete(op.id);
      }
      // Batch delay every 5 operations
      if ((i + 1) % 5 === 0) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Final count
    const finalSchools = await base44.asServiceRole.entities.School.filter({});
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