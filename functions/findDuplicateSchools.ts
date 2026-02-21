import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Normalize school name for comparison
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/^the\s+/, '') // Remove leading "The"
    .replace(/\b(st\.?|saint)\s+/g, 'st ') // Normalize St./Saint
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Normalize website URL for comparison
function normalizeUrl(url) {
  if (!url) return '';
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '') // Remove protocol
    .replace(/^www\./, '') // Remove www
    .replace(/\/$/, '') // Remove trailing slash
    .trim();
}

// Calculate string similarity (Levenshtein-based)
function stringSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 100;
  
  const editDistance = getEditDistance(longer, shorter);
  return ((longer.length - editDistance) / longer.length) * 100;
}

// Calculate edit distance
function getEditDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// Count non-null fields
function countCompleteFields(school) {
  let count = 0;
  const fields = [
    'name', 'address', 'city', 'provinceState', 'phone', 'email',
    'website', 'dayTuition', 'boardingTuition', 'currency', 'founded',
    'enrollment', 'studentCount', 'missionStatement', 'description',
    'logoUrl', 'headerPhotoUrl', 'curriculum', 'religiousAffiliation',
    'financialAidAvailable', 'genderPolicy', 'schoolType'
  ];
  for (const field of fields) {
    if (school.data[field] && school.data[field] !== '' && school.data[field].length > 0) {
      count++;
    }
  }
  return count;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all schools
    const schools = await base44.asServiceRole.entities.School.list(null, 1000);
    
    if (!schools || schools.length === 0) {
      return Response.json({ error: 'No schools found' }, { status: 400 });
    }

    const duplicates = {
      level1: [],
      level2: [],
      level3: [],
      relatedCampuses: [],
      merged: 0,
      flaggedForReview: 0
    };

    const processed = new Set();
    const merged = new Set();

    // Level 1: Same normalized website URL
    const urlMap = {};
    for (const school of schools) {
      if (school.data.website) {
        const normUrl = normalizeUrl(school.data.website);
        if (!urlMap[normUrl]) urlMap[normUrl] = [];
        urlMap[normUrl].push(school);
      }
    }

    for (const [url, schoolList] of Object.entries(urlMap)) {
      if (schoolList.length > 1 && !schoolList.some(s => merged.has(s.id))) {
        // Found duplicates - auto merge
        schoolList.sort((a, b) => countCompleteFields(b) - countCompleteFields(a));
        const primary = schoolList[0];
        
        for (let i = 1; i < schoolList.length; i++) {
          const duplicate = schoolList[i];
          if (!merged.has(duplicate.id)) {
            // Copy non-null fields from duplicate to primary
            for (const [key, value] of Object.entries(duplicate.data)) {
              if (value && !primary.data[key] && key !== 'id' && key !== 'created_date' && key !== 'created_by') {
                primary.data[key] = value;
              }
            }

            duplicates.level1.push({
              primaryId: primary.id,
              primaryName: primary.data.name,
              duplicateId: duplicate.id,
              duplicateName: duplicate.data.name,
              url: url,
              action: 'AUTO_MERGED'
            });

            // Delete duplicate
            await base44.asServiceRole.entities.School.delete(duplicate.id);
            merged.add(duplicate.id);
            duplicates.merged++;
          }
        }

        // Update primary
        await base44.asServiceRole.entities.School.update(primary.id, primary.data);
      }
    }

    // Level 2 & 3: Name and location similarity
    for (let i = 0; i < schools.length; i++) {
      const school1 = schools[i];
      if (merged.has(school1.id) || processed.has(school1.id)) continue;

      const norm1 = normalizeName(school1.data.name);
      
      for (let j = i + 1; j < schools.length; j++) {
        const school2 = schools[j];
        if (merged.has(school2.id) || processed.has(school2.id)) continue;

        const norm2 = normalizeName(school2.data.name);
        const similarity = stringSimilarity(norm1, norm2);

        // Level 2: Very likely duplicates
        if (
          (similarity > 85 && school1.data.city === school2.data.city) ||
          (norm1 === norm2 && school1.data.city === school2.data.city)
        ) {
          // Check if it's related campuses (different grades)
          const grades1 = [school1.data.lowestGrade, school1.data.highestGrade].filter(g => g !== null);
          const grades2 = [school2.data.lowestGrade, school2.data.highestGrade].filter(g => g !== null);
          
          const isRelatedCampus = grades1.length > 0 && grades2.length > 0 && 
            (grades1[0] !== grades2[0] || grades1[1] !== grades2[1]);

          if (isRelatedCampus) {
            duplicates.relatedCampuses.push({
              school1Id: school1.id,
              school1Name: school1.data.name,
              school1Grades: `${grades1[0]}-${grades1[1]}`,
              school2Id: school2.id,
              school2Name: school2.data.name,
              school2Grades: `${grades2[0]}-${grades2[1]}`,
              city: school1.data.city,
              similarity: similarity.toFixed(2)
            });
          } else {
            duplicates.level2.push({
              school1Id: school1.id,
              school1Name: school1.data.name,
              school1Fields: countCompleteFields(school1),
              school2Id: school2.id,
              school2Name: school2.data.name,
              school2Fields: countCompleteFields(school2),
              city: school1.data.city,
              similarity: similarity.toFixed(2),
              reason: norm1 === norm2 ? 'exact_match' : 'high_similarity'
            });
            duplicates.flaggedForReview++;
          }
        }
        // Level 3: Possible duplicates
        else if (
          (similarity > 70 && school1.data.provinceState === school2.data.provinceState) ||
          (school1.data.address && school2.data.address && 
           school1.data.address === school2.data.address && 
           norm1 !== norm2)
        ) {
          duplicates.level3.push({
            school1Id: school1.id,
            school1Name: school1.data.name,
            school1Fields: countCompleteFields(school1),
            school2Id: school2.id,
            school2Name: school2.data.name,
            school2Fields: countCompleteFields(school2),
            province: school1.data.provinceState,
            similarity: similarity.toFixed(2),
            reason: school1.data.address === school2.data.address ? 'same_address' : 'name_similarity'
          });
          duplicates.flaggedForReview++;
        }
      }

      processed.add(school1.id);
    }

    return Response.json({
      success: true,
      totalSchools: schools.length,
      totalProcessed: schools.length,
      summary: {
        level1AutoMerged: duplicates.merged,
        level2FlaggedForReview: duplicates.level2.length,
        level3FlaggedForReview: duplicates.level3.length,
        relatedCampuses: duplicates.relatedCampuses.length
      },
      details: duplicates
    });

  } catch (error) {
    console.error('Deduplication failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});