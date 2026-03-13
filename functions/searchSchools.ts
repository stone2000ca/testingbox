// Function: searchSchools
// Purpose: Search and rank schools based on family profile and location filters
// Entities: School, SearchLog
// Last Modified: 2026-03-09
// Dependencies: OpenRouter API (via orchestrateConversation)
// S112-WC1: F7 P0 Fix - Religious & gender filters now enforced in relaxed fallback pass

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TIMEOUT_MS = 25000;

Deno.serve(async (req) => {
  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Search request timeout')), TIMEOUT_MS)
    );
    
    const searchPromise = performSearch(req);
    
    return await Promise.race([searchPromise, timeoutPromise]);
  } catch (error) {
    console.error('Search error:', error.message);
    return Response.json({ 
      error: error.message === 'Search request timeout' ? 'Search timed out - try being more specific' : error.message, 
      status: 500 
    }, { status: 500 });
  }
});

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// S112-WC3: F7 P0 Fix
function applyReligiousFilter(school, familyProfile, payload) {
  const dealbreakers = payload?.dealbreakers || familyProfile?.dealbreakers || [];
  const religiousDealbreakTerms = ['religious', 'religion', 'secular only', 'non-religious', 'faith-based', 'faith based', 'catholic', 'christian', 'church', 'denominational', 'secular', 'islamic', 'jewish'];
  const hasReligiousDealbreaker = Array.isArray(dealbreakers) && dealbreakers.some(d =>
    typeof d === 'string' && religiousDealbreakTerms.some(term => d.toLowerCase().includes(term))
  );
  if (hasReligiousDealbreaker) {
    const schoolAffiliation = (school.religiousAffiliation || '').toLowerCase().trim().replace(/[\s-]+/g, ' ');
    const knownReligiousAffiliations = ['christian', 'catholic', 'islamic', 'jewish', 'lutheran', 'baptist', 'methodist', 'presbyterian', 'anglican', 'orthodox', 'evangelical', 'pentecostal', 'adventist', 'mormon', 'lds', 'quaker', 'mennonite', 'amish', 'hindu', 'buddhist', 'sikh', 'muslim'];
    if (school.religiousAffiliation && knownReligiousAffiliations.includes(schoolAffiliation)) {
      console.log(`[RELIGIOUS FILTER] Excluded ${school.name}: religious affiliation`);
      return false;
    }
    // DISABLED S150: name-keyword check too aggressive
    // const religiousKeywords = ['christian', 'catholic', 'islamic', 'jewish', 'lutheran', 'baptist', 'adventist', 'anglican', 'saint', 'st.', 'st. ', 'holy', 'sacred', 'blessed', 'bishop', 'trinity', 'yeshiva', 'hebrew', 'our lady', 'gospel', 'covenant', 'faith'];
    // const schoolNameLower = school.name?.toLowerCase() || '';
    // if (religiousKeywords.some(keyword => schoolNameLower.includes(keyword))) {
    //   console.log(`[RELIGIOUS FILTER] Excluded ${school.name}: name contains religious keyword`);
    //   return false;
    // }
  }
  return true;
}

function applyGenderFilter(school, familyProfile) {
  const gp = school.genderPolicy || null;
  if (gp === null) return true;
  
  // HARD SAFETY: childGender vs genderPolicy - always enforced, never a fallback
  const childGender = familyProfile?.childGender || null;
  const gpLower = gp.toLowerCase();
  if (childGender === 'male' && (gpLower === 'all-girls' || gpLower === 'girls only')) {
    console.log(`[GENDER] Excluded (childGender=male) ${school.name}: genderPolicy="${gp}"`);
    return false;
  }
  if (childGender === 'female' && (gpLower === 'all-boys' || gpLower === 'boys only')) {
    console.log(`[GENDER] Excluded (childGender=female) ${school.name}: genderPolicy="${gp}"`);
    return false;
  }
  
  const exclusions = familyProfile?.schoolGenderExclusions || [];
  if (Array.isArray(exclusions) && exclusions.length > 0) {
    const excluded = exclusions.some(ex => {
      const exL = ex.toLowerCase();
      if (exL === 'all-girls') return gpLower === 'all-girls';
      if (exL === 'all-boys') return gpLower === 'all-boys';
      if (exL === 'co-ed') return gpLower === 'co-ed' || gpLower === 'co-ed with single-gender classes';
      return false;
    });
    if (excluded) { console.log(`[GENDER] Excluded (exclusion) ${school.name}: genderPolicy="${gp}"`); return false; }
  }
  
  const genderPref = familyProfile?.schoolGenderPreference || null;
  if (genderPref) {
    const prefLower = genderPref.toLowerCase();
    let matches = false;
    if (prefLower === 'all-girls') matches = gpLower === 'all-girls';
    else if (prefLower === 'all-boys') matches = gpLower === 'all-boys';
    else if (prefLower === 'co-ed') matches = gpLower === 'co-ed' || gpLower === 'co-ed with single-gender classes';
    if (!matches) { console.log(`[GENDER] Excluded (pref=${genderPref}) ${school.name}: genderPolicy="${gp}"`); return false; }
  }
  
  return true;
}

async function performSearch(req) {
  const base44 = createClientFromRequest(req);
  const payload = await req.json();
  
  console.log('[SEARCH RECEIVED] Complete payload:', JSON.stringify(payload, null, 2));
  
  const { 
    region, 
    country,
    city,
    provinceState,
    minGrade, 
    maxGrade, 
    minTuition, 
    maxTuition, 
    curriculumType,
    specializations,
    schoolType,
    userLat,
    userLng,
    resolvedLat,
    resolvedLng,
    maxDistanceKm,
    commuteToleranceMinutes,
    limit = 20,
    familyProfile = null,
    conversationId = null,
    userId = null,
    searchQuery = ''
  } = payload;

  // BUG-SEARCH-003: Validate minimum required search params exist
  const hasLocation = !!(region || city || provinceState || country || resolvedLat || resolvedLng);
  const hasGrade = minGrade !== null && minGrade !== undefined;
  
  if (!hasLocation && !hasGrade) {
    console.error('[SEARCH] Both location and grade are missing — cannot perform meaningful search');
    return Response.json({ 
      schools: [], 
      total: 0,
      returned: 0,
      edgeCaseMessage: "I need your location and your child's grade to search for schools.",
      error: 'insufficient_data'
    });
  }

  const provinceAbbreviations = {
    'BC': 'British Columbia', 'AB': 'Alberta', 'SK': 'Saskatchewan', 'MB': 'Manitoba',
    'ON': 'Ontario', 'QC': 'Quebec', 'NB': 'New Brunswick', 'NS': 'Nova Scotia',
    'PE': 'Prince Edward Island', 'PEI': 'Prince Edward Island', 'NL': 'Newfoundland and Labrador',
    'YT': 'Yukon', 'NT': 'Northwest Territories', 'NU': 'Nunavut'
  };

  const stateAbbreviations = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
  };

  const neighbourhoodMap = {
    'midtown': { lat: 43.7, lng: -79.39 }, 'yorkville': { lat: 43.67, lng: -79.39 },
    'leaside': { lat: 43.71, lng: -79.36 }, 'forest hill': { lat: 43.69, lng: -79.41 },
    'rosedale': { lat: 43.68, lng: -79.38 }, 'the annex': { lat: 43.67, lng: -79.41 },
    'annex': { lat: 43.67, lng: -79.41 }, 'lawrence park': { lat: 43.73, lng: -79.40 },
    'north york': { lat: 43.77, lng: -79.41 }, 'scarborough': { lat: 43.77, lng: -79.26 },
    'etobicoke': { lat: 43.65, lng: -79.51 }, 'mississauga': { lat: 43.59, lng: -79.64 },
    'oakville': { lat: 43.45, lng: -79.68 }, 'richmond hill': { lat: 43.87, lng: -79.44 },
    'markham': { lat: 43.86, lng: -79.34 }
  };

  const regionAliases = {
    'gta': { cities: ['Toronto', 'Mississauga', 'Brampton', 'Oakville', 'Markham', 'Vaughan', 'Richmond Hill'] },
    'greater toronto area': { cities: ['Toronto', 'Mississauga', 'Brampton', 'Oakville', 'Markham', 'Vaughan', 'Richmond Hill'] },
    'lower mainland': { cities: ['Vancouver', 'Burnaby', 'Surrey', 'Richmond', 'Coquitlam'] },
    'metro vancouver': { cities: ['Vancouver', 'Burnaby', 'Surrey', 'Richmond', 'Coquitlam'] },
    'greater vancouver': { cities: ['Vancouver', 'Burnaby', 'Surrey', 'Richmond', 'Coquitlam'] },
    'montreal': { cities: ['Montreal', 'Laval', 'Longueuil'] },
    'greater montreal': { cities: ['Montreal', 'Laval', 'Longueuil'] }
  };

  // T045: resolvedLat/resolvedLng from orchestrator take priority (stated city coords),
  // then fall back to neighbourhood lookup, then userLat/userLng from browser geolocation
  let finalLat = resolvedLat || userLat;
  let finalLng = resolvedLng || userLng;
  if (!finalLat && !finalLng && city) {
    const neighbourhood = neighbourhoodMap[city.toLowerCase().trim()];
    if (neighbourhood) {
      finalLat = neighbourhood.lat;
      finalLng = neighbourhood.lng;
      console.log(`Resolved neighbourhood "${city}" to coordinates:`, neighbourhood);
    }
  }
  if (resolvedLat && resolvedLng) {
    console.log(`[T045] Using orchestrator-resolved coords: ${finalLat}, ${finalLng}`);
  }

  // TODO: migrate to paginated/server-filtered query when school count exceeds 1000
  let allSchools = [];
  try {
    allSchools = await base44.entities.School.filter({}, '-created_date', 1000);
    if (allSchools.length === 1000) {
      console.warn('[searchSchools] WARNING: School count hit limit (1000). Results may be incomplete.');
    }
  } catch (filterError) {
    console.error('[searchSchools] School.filter failed:', filterError.message);
    return Response.json({
      schools: [],
      total: 0,
      returned: 0,
      edgeCaseMessage: 'School data could not be loaded. Please try again.',
      error: 'db_fetch_failed'
    });
  }
  let schools = allSchools.filter(s => s.status === 'active');

  let locationFiltered = schools;

  let aliasedCities = [];
  let aliasedProvinces = [];
  if (region) {
    const regionLower = region.toLowerCase().trim();
    const alias = regionAliases[regionLower];
    if (alias) {
      if (alias.cities) aliasedCities = alias.cities;
      if (alias.provinces) aliasedProvinces = alias.provinces;
    }
  }

  if (aliasedCities.length > 0) {
    locationFiltered = locationFiltered.filter(s => 
      aliasedCities.some(c => s.city?.toLowerCase() === c.toLowerCase())
    );
  } else if (aliasedProvinces.length > 0) {
    locationFiltered = locationFiltered.filter(s => {
      if (!s.provinceState) return false;
      const schoolPS = s.provinceState.toLowerCase();
      return aliasedProvinces.some(p => schoolPS === p.toLowerCase());
    });
  }

  if (city && aliasedCities.length === 0) {
    const cityLower = city.trim().toLowerCase();
    // Exact match first
    let cityMatches = locationFiltered.filter(s => 
      s.city && s.city.toLowerCase() === cityLower
    );
    // Partial match fallback
    if (cityMatches.length === 0) {
      cityMatches = locationFiltered.filter(s => 
        s.city && s.city.toLowerCase().includes(cityLower)
      );
    }
    // KI-22 FIX: If still 0 results but we have lat/lng coords, apply 75km distance cap
    // instead of no filter — this handles Ontario cities where school records may use a different
    // city name (e.g. "North York" vs "Toronto") but prevents out-of-region schools
    if (cityMatches.length === 0 && (resolvedLat || finalLat)) {
      console.log(`[CITY FILTER] Falling back to coordinate-based with 75km cap`);
      locationFiltered = locationFiltered.filter(s => {
        if (!s.lat || !s.lng) return false;
        const dist = calculateDistance(finalLat, finalLng, s.lat, s.lng);
        return dist <= 75;
      });
    } else {
      locationFiltered = cityMatches;
    }
    console.log(`[CITY FILTER] city="${city}" → ${locationFiltered.length} schools`);
  }

  // BUG-SEARCH-002 FIX: Only apply province filter if provinceState is actually provided
  if (provinceState && provinceState.trim() && aliasedProvinces.length === 0) {
    const psUpper = provinceState.toUpperCase().trim();
    const fullProvinceName = provinceAbbreviations[psUpper] || stateAbbreviations[psUpper];
    const normalizedProvince = fullProvinceName || toTitleCase(provinceState.trim());
    const provinceRegex = new RegExp(`^${normalizedProvince}$`, 'i');
    locationFiltered = locationFiltered.filter(s => {
      if (!s.provinceState) return false;
      return provinceRegex.test(s.provinceState);
    });
  }

  if (region && !aliasedCities.length && !aliasedProvinces.length && !city) {
    locationFiltered = locationFiltered.filter(s => s.region === region);
  }
  if (country) {
    locationFiltered = locationFiltered.filter(s => s.country === country);
  }

  let hardFiltered = locationFiltered.filter(school => {
     const parsedMinGrade = minGrade !== undefined && minGrade !== null ? parseInt(minGrade) : null;
     // BUG-MATCH-S41 FIX: Grade range check moved to soft penalty (scoring) instead of hard filter.
     // Only hard-exclude if grade is MORE than 2 grades outside the range.
     if (parsedMinGrade !== null) {
       let sLow = parseInt(school.lowestGrade);
       let sHigh = parseInt(school.highestGrade);
       if (!isNaN(sLow) && !isNaN(sHigh)) {
         const distanceOutsideRange = parsedMinGrade < sLow ? sLow - parsedMinGrade : (parsedMinGrade > sHigh ? parsedMinGrade - sHigh : 0);
         if (distanceOutsideRange > 2) {
           console.log(`[GRADE FILTER] Excluded ${school.name}: grades ${sLow}-${sHigh}, need ${parsedMinGrade} (${distanceOutsideRange} grades outside range)`);
           return false;
         }
       } else {
         console.log(`[GRADE FILTER] Keeping ${school.name}: Missing grade info, but not filtering out`);
       }
     }
    
    const schoolTuition = school.tuition || school.dayTuition || school.tuitionMin || null;
    if (maxTuition && maxTuition !== 'unlimited') {
      if (schoolTuition && schoolTuition > maxTuition) {
        console.log(`[BUDGET FILTER] Filtered out ${school.name}: tuition $${schoolTuition} exceeds budget $${maxTuition}`);
        return false;
      }
    }
    
    if (!applyReligiousFilter(school, familyProfile, payload)) return false;
    if (!applyGenderFilter(school, familyProfile)) return false;
    
    if (familyProfile?.commuteToleranceMinutes && school.distanceKm) {
      const estimatedCommute = school.distanceKm * 2;
      if (estimatedCommute > familyProfile.commuteToleranceMinutes) {
        console.log(`Hard-filtered ${school.name}: commute ${estimatedCommute}min exceeds tolerance ${familyProfile.commuteToleranceMinutes}min`);
        return false;
      }
    }
    
    return true;
  });
  
  console.log(`Hard filters: ${locationFiltered.length} → ${hardFiltered.length} schools`);
  
  // BUG-MATCH-S41 FIX: Fallback with relaxed filters if no results found
  let schoolsToRank = hardFiltered;
  let isRelaxedPass = false;
  if (hardFiltered.length === 0) {
    console.log('[FALLBACK] No schools after strict filters — attempting relaxed pass');
    // Relaxed pass: keep location + grade range check only, remove distance and budget filters
    schoolsToRank = locationFiltered.filter(school => {
      const parsedMinGrade = minGrade !== undefined && minGrade !== null ? parseInt(minGrade) : null;
      if (parsedMinGrade !== null) {
        let sLow = parseInt(school.lowestGrade);
        let sHigh = parseInt(school.highestGrade);
        if (!isNaN(sLow) && !isNaN(sHigh)) {
          // In relaxed mode, allow grades up to 1 outside range (borderline cases only)
          const distanceOutsideRange = parsedMinGrade < sLow ? sLow - parsedMinGrade : (parsedMinGrade > sHigh ? parsedMinGrade - sHigh : 0);
          if (distanceOutsideRange > 1) {
            return false;
          }
        }
      }
      // S112-WC1: Safety-critical filters ALWAYS enforced in relaxed pass
      if (!applyReligiousFilter(school, familyProfile, payload)) return false;
      if (!applyGenderFilter(school, familyProfile)) return false;
      return true;
    });
    isRelaxedPass = true;
    console.log(`[FALLBACK] Relaxed pass: ${schoolsToRank.length} schools available`);
  }
  
  if (schoolsToRank.length === 0) {
    return Response.json({ 
      schools: [], 
      total: 0,
      returned: 0,
      edgeCaseMessage: "No schools matched your criteria. Try expanding your location, budget, or grade range.",
      relaxedFilters: false
    });
  }

  const scored = schoolsToRank.map(school => {
    let score = 0;
    
    // BUG-MATCH-S41 FIX: Soft penalty for grades outside range (instead of hard filter)
    if (minGrade !== undefined) {
      const targetGrade = minGrade !== undefined ? minGrade : maxGrade;
      if (school.lowestGrade <= targetGrade && school.highestGrade >= targetGrade) {
        score += 2;
      } else {
        const distanceOutsideRange = targetGrade < school.lowestGrade ? school.lowestGrade - targetGrade : (targetGrade > school.highestGrade ? targetGrade - school.highestGrade : 0);
        if (distanceOutsideRange <= 2) {
          score -= 1; // Soft penalty for grades 1-2 outside range
          console.log(`[GRADE SCORE] Soft penalty for ${school.name}: ${distanceOutsideRange} grade(s) outside range`);
        }
      }
    }
    
    if (maxTuition !== undefined && school.tuition) {
      if (school.tuition <= maxTuition) {
        score += 2;
      }
    }
    
    if (curriculumType && school.curriculumType === curriculumType) {
      score += 3;
    }
    
    if (schoolType && school.schoolType === schoolType) {
      score += 2;
    }
    
    if (specializations && specializations.length > 0) {
      if (school.specializations) {
        const matches = specializations.filter(spec => school.specializations.includes(spec)).length;
        score += matches;
      }
    }
    
    // E28-S1: Interest-to-specialization alignment
    if (familyProfile?.interests?.length > 0 && school.specializations?.length > 0) {
      const interestLower = familyProfile.interests.map(i => i.toLowerCase());
      const specLower = school.specializations.map(s => s.toLowerCase());
      const interestMatches = interestLower.filter(interest =>
        specLower.some(spec => spec.includes(interest) || interest.includes(spec))
      ).length;
      if (interestMatches > 0) score += interestMatches;
    }

    // E28-S1: Arts/sports interest alignment
    if (familyProfile?.interests?.length > 0) {
      const interestLower = familyProfile.interests.map(i => i.toLowerCase());
      const schoolArts = (school.artsPrograms || []).map(a => a.toLowerCase());
      const schoolSports = (school.sportsPrograms || []).map(s => s.toLowerCase());
      const artMatches = interestLower.filter(i => schoolArts.some(a => a.includes(i) || i.includes(a))).length;
      const sportMatches = interestLower.filter(i => schoolSports.some(s => s.includes(i) || i.includes(s))).length;
      score += Math.min(artMatches + sportMatches, 3);
    }

    // E28-S1: Learning support scoring
    if (familyProfile?.academicStruggles?.length > 0 || familyProfile?.learningDifferences?.length > 0) {
      if (school.avgClassSize && school.avgClassSize <= 18) score += 1;
      if (school.studentTeacherRatio && parseFloat(school.studentTeacherRatio) <= 10) score += 1;
      const supportKeywords = ['learning support', 'special needs', 'differentiated', 'individualized', 'ld support', 'resource'];
      const specLower = (school.specializations || []).map(s => s.toLowerCase());
      if (supportKeywords.some(kw => specLower.some(s => s.includes(kw)))) score += 2;
    }
    
    return { school, score };
  });

  schools = scored.sort((a, b) => b.score - a.score).map(s => { s.school._matchScore = s.score; return s.school; });

  if (finalLat && finalLng) {
    schools = schools.map(school => {
      if (school.lat && school.lng) {
        const distance = calculateDistance(finalLat, finalLng, school.lat, school.lng);
        return { ...school, distanceKm: distance };
      }
      return school;
    });

    if (maxDistanceKm) {
      schools = schools.filter(s => s.distanceKm && s.distanceKm <= maxDistanceKm);
    }

    // E26-S2: Composite sort - score primary, distance penalty secondary
    schools.sort((a, b) => {
      const scoreA = (a._matchScore || 0) - ((a.distanceKm || 0) * 0.1);
      const scoreB = (b._matchScore || 0) - ((b.distanceKm || 0) * 0.1);
      return scoreB - scoreA;
    });
  }

  if (familyProfile) {
    schools = schools.filter(school => {
      if (familyProfile.commuteToleranceMinutes && school.distanceKm) {
        const estimatedCommute = school.distanceKm * 2;
        const tolerance = familyProfile.commuteToleranceMinutes;
        if (estimatedCommute > tolerance + 50) {
          console.log(`Filtered out ${school.name}: commute ${estimatedCommute}min exceeds tolerance ${tolerance}min by 50+min`);
          return false;
        }
      }

      if (familyProfile.maxTuition && school.tuition) {
        if (school.tuition > familyProfile.maxTuition * 2) {
          console.log(`Filtered out ${school.name}: tuition $${school.tuition} is 2x+ budget $${familyProfile.maxTuition}`);
          return false;
        }
      }

      return true;
    });
  }

  const originalFilteredCount = schools.length;
  let edgeCaseMessage = null;
  
  if (schools.length === 0) {
    edgeCaseMessage = "No schools matched your criteria. Try expanding your location, budget, or grade range.";
    console.log('[EDGE CASE] All schools filtered out - returning empty array');
  } else if (schools.length > 15) {
    edgeCaseMessage = "I found quite a few options! Would you like to narrow it down by adding more preferences (budget, curriculum, specializations)?";
  }
  
  const maxResults = Math.min(schools.length, 20);
  const condensedSchools = schools.slice(0, maxResults).map(s => ({
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
    relaxedMatch: isRelaxedPass
  }));

  try {
    const topResultsForLog = condensedSchools.slice(0, 10).map((s, idx) => ({
      schoolName: s.name,
      score: scored.find(sc => sc.school.id === s.id)?.score || 0,
      reasons: [
        s.distanceKm ? `${s.distanceKm.toFixed(1)}km away` : null,
        s.tuition && maxTuition && s.tuition <= maxTuition ? 'Within budget' : null,
        s.curriculumType === curriculumType ? `${curriculumType} curriculum` : null,
        s.specializations?.some(spec => specializations?.includes(spec)) ? 'Matches specializations' : null
      ].filter(Boolean)
    }));

    await base44.asServiceRole.entities.SearchLog.create({
      query: searchQuery || `Search for grade ${minGrade} in ${city || region || 'unspecified'}`,
      inputFilters: {
        city,
        provinceState,
        region,
        minGrade,
        maxGrade,
        maxTuition,
        curriculumType,
        specializations,
        schoolType,
        maxDistanceKm,
        dealbreakers: payload.dealbreakers || familyProfile?.dealbreakers || []
      },
      totalSchoolsPassingFilters: originalFilteredCount,
      topResults: topResultsForLog,
      conversationId,
      userId
    });
  } catch (logError) {
    console.error('Failed to create SearchLog:', logError);
  }

  return Response.json({ 
    schools: condensedSchools, 
    total: schools.length,
    returned: condensedSchools.length,
    edgeCaseMessage,
    relaxedFilters: isRelaxedPass
  });
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