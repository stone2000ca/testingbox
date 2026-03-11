// Function: getNearbySchools
// Purpose: Distance-based school discovery with pagination
// Entities: School
// Last Modified: 2026-03-11
// Dependencies: none
// E31-003: Load More Schools feature

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TIMEOUT_MS = 25000;

Deno.serve(async (req) => {
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), TIMEOUT_MS)
    );
    return await Promise.race([performSearch(req), timeoutPromise]);
  } catch (error) {
    console.error('[getNearbySchools] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// --- Inlined filter utilities (aligned with searchSchools.ts) ---

const religiousDealbreakTerms = [
  'religious', 'religion', 'secular only', 'non-religious', 'faith-based', 'faith based',
  'catholic', 'christian', 'church', 'denominational', 'secular', 'islamic', 'jewish'
];

const nonReligiousAffiliations = new Set(['none', 'secular', 'non-denominational', 'n/a', '']);

const religiousKeywords = [
  'christian', 'catholic', 'islamic', 'jewish', 'lutheran', 'baptist',
  'adventist', 'anglican', 'saint', 'st.', 'holy', 'sacred', 'blessed',
  'bishop', 'trinity', 'yeshiva', 'hebrew', 'our lady', 'gospel', 'covenant', 'faith'
];

function applyReligiousFilter(school, dealbreakers) {
  const hasReligiousDealbreaker = Array.isArray(dealbreakers) && dealbreakers.some(d =>
    typeof d === 'string' && religiousDealbreakTerms.some(term => d.toLowerCase().includes(term))
  );
  if (!hasReligiousDealbreaker) return true;

  const affiliationNorm = (school.religiousAffiliation || '').toLowerCase().trim();
  if (school.religiousAffiliation && !nonReligiousAffiliations.has(affiliationNorm)) {
    console.log(`[RELIGIOUS FILTER] Excluded ${school.name}: affiliation (${school.religiousAffiliation})`);
    return false;
  }
  const nameLower = school.name?.toLowerCase() || '';
  if (religiousKeywords.some(kw => nameLower.includes(kw))) {
    console.log(`[RELIGIOUS FILTER] Excluded ${school.name}: name keyword`);
    return false;
  }
  return true;
}

function applyGenderFilter(school, familyGender, schoolGenderExclusions, schoolGenderPreference) {
  const gp = school.genderPolicy || null;
  if (gp === null) return true;

  const exclusions = schoolGenderExclusions || [];
  if (exclusions.length > 0) {
    const gpLower = gp.toLowerCase();
    const excluded = exclusions.some(ex => {
      const exL = ex.toLowerCase();
      if (exL === 'all-girls') return gpLower === 'all-girls';
      if (exL === 'all-boys') return gpLower === 'all-boys';
      if (exL === 'co-ed') return gpLower === 'co-ed' || gpLower === 'co-ed with single-gender classes';
      return false;
    });
    if (excluded) return false;
  }

  if (schoolGenderPreference) {
    const gpLower = gp.toLowerCase();
    const prefLower = schoolGenderPreference.toLowerCase();
    let matches = false;
    if (prefLower === 'all-girls') matches = gpLower === 'all-girls';
    else if (prefLower === 'all-boys') matches = gpLower === 'all-boys';
    else if (prefLower === 'co-ed') matches = gpLower === 'co-ed' || gpLower === 'co-ed with single-gender classes';
    if (!matches) return false;
  }

  if (!schoolGenderPreference && familyGender) {
    if (familyGender === 'male' && gp === 'All-Girls') return false;
    if (familyGender === 'female' && gp === 'All-Boys') return false;
  }

  return true;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- Main handler ---

async function performSearch(req) {
  const base44 = createClientFromRequest(req);
  const payload = await req.json();

  const {
    lat,
    lng,
    excludeIds = [],
    gradeMin,
    maxTuition,
    dealbreakers = [],
    familyGender,
    schoolGenderExclusions = [],
    schoolGenderPreference,
    page = 1,
    pageSize = 20,
  } = payload;

  if (!lat || !lng) {
    return Response.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  // 1. Fetch all active schools
  let allSchools = [];
  try {
    allSchools = await base44.entities.School.filter({}, '-created_date', 1000);
  } catch (err) {
    console.error('[getNearbySchools] School fetch failed:', err.message);
    return Response.json({ schools: [], hasMore: false, totalRemaining: 0 });
  }
  let schools = allSchools.filter(s => s.status === 'active');

  // 2. Exclude already-displayed/shortlisted IDs
  const excludeSet = new Set(excludeIds);
  schools = schools.filter(s => !excludeSet.has(s.id));

  // 3. Grade filter: exclude if >2 grades outside range
  if (gradeMin !== undefined && gradeMin !== null) {
    const grade = parseInt(gradeMin);
    if (!isNaN(grade)) {
      schools = schools.filter(school => {
        const sLow = parseInt(school.lowestGrade);
        const sHigh = parseInt(school.highestGrade);
        if (isNaN(sLow) || isNaN(sHigh)) return true;
        const outside = grade < sLow ? sLow - grade : grade > sHigh ? grade - sHigh : 0;
        return outside <= 2;
      });
    }
  }

  // 4. Budget filter at 1.5x tolerance
  if (maxTuition) {
    const budget = typeof maxTuition === 'number' ? maxTuition : parseInt(maxTuition);
    if (!isNaN(budget)) {
      const cap = budget * 1.5;
      schools = schools.filter(school => {
        const tuition = school.tuition || school.dayTuition || school.tuitionMin;
        if (!tuition) return true;
        return tuition <= cap;
      });
    }
  }

  // 5. Religious filter
  schools = schools.filter(s => applyReligiousFilter(s, dealbreakers));

  // 6. Gender filter
  schools = schools.filter(s =>
    applyGenderFilter(s, familyGender, schoolGenderExclusions, schoolGenderPreference)
  );

  // 7. Calculate Haversine distance (only for schools with coords)
  schools = schools.map(school => {
    if (school.lat && school.lng) {
      return { ...school, distanceKm: calculateDistance(lat, lng, school.lat, school.lng) };
    }
    return school;
  });

  // 8. Sort by distance ASC (schools without coords go last)
  schools.sort((a, b) => (a.distanceKm || Infinity) - (b.distanceKm || Infinity));

  const totalRemaining = schools.length;

  // 9. Paginate
  const offset = (page - 1) * pageSize;
  const pageSchools = schools.slice(offset, offset + pageSize);
  const hasMore = offset + pageSize < totalRemaining;

  // 10. Condense to same shape as searchSchools.ts
  const condensed = pageSchools.map(s => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    city: s.city,
    provinceState: s.provinceState,
    gradesServed: `${s.lowestGrade}-${s.highestGrade}`,
    lowestGrade: s.lowestGrade,
    highestGrade: s.highestGrade,
    tuition: s.tuition,
    dayTuition: s.dayTuition,
    currency: s.currency,
    curriculumType: s.curriculumType,
    genderPolicy: s.genderPolicy,
    region: s.region,
    specializations: s.specializations,
    distanceKm: s.distanceKm,
    schoolType: s.schoolType,
    headerPhotoUrl: s.headerPhotoUrl,
    logoUrl: s.logoUrl,
    artsPrograms: s.artsPrograms?.slice(0, 5) || [],
    sportsPrograms: s.sportsPrograms?.slice(0, 5) || [],
    avgClassSize: s.avgClassSize || null,
    schoolTier: s.schoolTier || null,
    claimStatus: s.claimStatus || null,
    relaxedMatch: false,
  }));

  console.log(`[getNearbySchools] page=${page} pageSize=${pageSize} totalRemaining=${totalRemaining} returned=${condensed.length}`);

  return Response.json({ schools: condensed, hasMore, totalRemaining });
}