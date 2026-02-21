import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const levenshteinDistance = (str1, str2) => {
  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null));
  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }
  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }
  return track[str2.length][str1.length];
};

const calculateSimilarity = (str1, str2) => {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1.toLowerCase().trim(), str2.toLowerCase().trim());
  return Math.max(0, 1 - (distance / maxLen));
};

const normalizeUrl = (url) => {
  if (!url) return '';
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .trim();
};

const calculateCompletenessScore = (school) => {
  const scoringFields = {
    name: 10,
    slug: 5,
    address: 8,
    city: 5,
    country: 5,
    region: 5,
    phone: 5,
    email: 5,
    website: 5,
    logo: 3,
    headerPhoto: 5,
    missionStatement: 8,
    tuition: 8,
    currency: 3,
    gradesServed: 8,
    enrollment: 5,
    studentTeacherRatio: 5,
    genderPolicy: 5,
    curriculumType: 8,
    specializations: 5,
    artsPrograms: 5,
    sportsPrograms: 5,
    highlights: 8
  };

  let filledPoints = 0;
  let totalPoints = 0;

  for (const [field, points] of Object.entries(scoringFields)) {
    totalPoints += points;
    let value = school[field];
    if (field === 'logo') value = school.logoUrl;
    if (field === 'headerPhoto') value = school.headerPhotoUrl;
    
    if (value !== null && value !== undefined && value !== '' && 
        !(Array.isArray(value) && value.length === 0)) {
      filledPoints += points;
    }
  }

  return totalPoints > 0 ? Math.round((filledPoints / totalPoints) * 100) : 0;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { schools, importBatchId } = await req.json();

    if (!Array.isArray(schools) || schools.length === 0) {
      return Response.json({ error: 'Invalid input: schools array required' }, { status: 400 });
    }

    if (!importBatchId) {
      return Response.json({ error: 'Invalid input: importBatchId required' }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    const dedupLog = [];

    // Process in chunks to avoid payload limits
    const CHUNK_SIZE = 50;

    for (let i = 0; i < schools.length; i += CHUNK_SIZE) {
      const chunk = schools.slice(i, i + CHUNK_SIZE);

      for (const school of chunk) {
        try {
          if (!school.name || !school.city || !school.country) {
            errors.push({
              index: i + chunk.indexOf(school),
              error: 'Missing required fields: name, city, country'
            });
            skipped++;
            continue;
          }

          // Fetch existing schools by country
          const existingSchools = await base44.asServiceRole.entities.School.filter({
            country: school.country
          }, undefined, 1000);

          let matchedSchool = null;
          let matchReason = null;

          // 1) First check: Normalized website URL match
          if (school.website) {
            const normInputUrl = normalizeUrl(school.website);
            if (normInputUrl) {
              const urlMatch = existingSchools.find(existing => {
                const normExistingUrl = normalizeUrl(existing.website || '');
                return normExistingUrl && normExistingUrl === normInputUrl;
              });

              if (urlMatch) {
                matchedSchool = urlMatch;
                matchReason = 'website_url_match';
              }
            }
          }

          // 2) Second check: Name + city fuzzy match > 85%
          if (!matchedSchool) {
            let bestScore = 0;
            for (const existing of existingSchools) {
              const nameScore = calculateSimilarity(school.name, existing.name);
              const cityScore = calculateSimilarity(school.city || '', existing.city || '');
              const combinedScore = (nameScore * 0.7) + (cityScore * 0.3);

              if (combinedScore > bestScore) {
                bestScore = combinedScore;
                if (combinedScore > 0.85) {
                  matchedSchool = existing;
                  matchReason = 'name_city_fuzzy_match';
                }
              }
            }
          }

          if (matchedSchool) {
            // Update existing - don't overwrite non-empty fields
            const updateData = {
              importBatchId,
              lastEnriched: new Date().toISOString(),
              completenessScore: calculateCompletenessScore(school)
            };

            for (const [key, value] of Object.entries(school)) {
              if (value !== null && value !== undefined && value !== '') {
                if (!matchedSchool[key] || matchedSchool[key] === '' || 
                    (Array.isArray(matchedSchool[key]) && matchedSchool[key].length === 0)) {
                  updateData[key] = value;
                }
              }
            }

            await base44.asServiceRole.entities.School.update(matchedSchool.id, updateData);
            updated++;
            dedupLog.push({
              action: 'updated_existing',
              matchReason,
              inputName: school.name,
              existingId: matchedSchool.id,
              existingName: matchedSchool.name
            });
          } else {
            // Create new
            const newSchool = {
              ...school,
              importBatchId,
              lastEnriched: new Date().toISOString(),
              completenessScore: calculateCompletenessScore(school),
              status: 'active',
              slug: school.slug || school.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            };

            await base44.asServiceRole.entities.School.create(newSchool);
            created++;
          }
        } catch (error) {
          errors.push({
            schoolName: school.name,
            error: error.message
          });
        }
      }
    }

    return Response.json({
      success: true,
      summary: {
        created,
        updated,
        skipped,
        total: schools.length,
        errors
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});