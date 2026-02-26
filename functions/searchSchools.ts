import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TIMEOUT_MS = 25000; // 25 second timeout

Deno.serve(async (req) => {
  try {
    // Race against timeout
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

async function performSearch(req) {
  const base44 = createClientFromRequest(req);
    const payload = await req.json();
    
    // P0 DIAGNOSTIC: Entry point tracing
    console.log('=== SEARCHSCHOOLS ENTRY ===', JSON.stringify({
      dealbreakers: payload?.familyProfile?.dealbreakers,
      familyProfile: payload?.familyProfile,
      allParams: Object.keys(payload || {})
    }));
    
    // DIAGNOSTIC: Log COMPLETE incoming parameters
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
      maxDistanceKm,
      commuteToleranceMinutes,
      limit = 20,
      familyProfile = null,
      conversationId = null,
      userId = null,
      searchQuery = ''
    } = payload;

    // TASK C: FUZZY SCHOOL NAME MATCHING - School name lookup map
    const schoolNameLookup = {
      // Abbreviations
      'ucc': 'Upper Canada College',
      'bss': 'Bishop Strachan School',
      'tcs': 'Trinity College School',
      'sac': "St. Andrew's College",
      'tfs': 'Toronto French School',
      'rsgc': "Royal St. George's College",
      'hsc': 'Hillfield Strathallan College',
      
      // Partial names
      'branksome': 'Branksome Hall',
      'havergal': 'Havergal College',
      'appleby': 'Appleby College',
      'ridley': 'Ridley College',
      'crescent': 'Crescent School',
      'lakefield': 'Lakefield College School',
      'pickering': 'Pickering College',
      'trinity': 'Trinity College School',
      'greenwood': 'Greenwood College School',
      'crestwood': 'Crestwood Preparatory College',
      
      // Common misspellings
      'st andrews': "St. Andrew's College",
      'saint andrews': "St. Andrew's College",
      'bishop strachen': 'Bishop Strachan School',
      'bishop strachan': 'Bishop Strachan School',
      'hillfield strathallen': 'Hillfield Strathallan College',
      'hillfield strathallan': 'Hillfield Strathallan College',
      
      // "The" variations
      'york school': 'The York School',
      'country day school': 'The Country Day School'
    };

    // TASK D: LOCATION-AWARE SEARCH - Toronto neighbourhood coordinates
    const neighbourhoodMap = {
      'midtown': { lat: 43.7, lng: -79.39 },
      'yorkville': { lat: 43.67, lng: -79.39 },
      'leaside': { lat: 43.71, lng: -79.36 },
      'forest hill': { lat: 43.69, lng: -79.41 },
      'rosedale': { lat: 43.68, lng: -79.38 },
      'the annex': { lat: 43.67, lng: -79.41 },
      'annex': { lat: 43.67, lng: -79.41 },
      'lawrence park': { lat: 43.73, lng: -79.40 },
      'north york': { lat: 43.77, lng: -79.41 },
      'scarborough': { lat: 43.77, lng: -79.26 },
      'etobicoke': { lat: 43.65, lng: -79.51 },
      'mississauga': { lat: 43.59, lng: -79.64 },
      'oakville': { lat: 43.45, lng: -79.68 },
      'richmond hill': { lat: 43.87, lng: -79.44 },
      'markham': { lat: 43.86, lng: -79.34 }
    };

    // Resolve neighbourhood to coordinates if mentioned
    let resolvedLat = userLat;
    let resolvedLng = userLng;
    if (city && !userLat && !userLng) {
      const neighbourhood = neighbourhoodMap[city.toLowerCase().trim()];
      if (neighbourhood) {
        resolvedLat = neighbourhood.lat;
        resolvedLng = neighbourhood.lng;
        console.log(`Resolved neighbourhood "${city}" to coordinates:`, neighbourhood);
      }
    }

    // Province/State abbreviation mappings
    const provinceAbbreviations = {
      'BC': 'British Columbia',
      'AB': 'Alberta',
      'SK': 'Saskatchewan',
      'MB': 'Manitoba',
      'ON': 'Ontario',
      'QC': 'Quebec',
      'NB': 'New Brunswick',
      'NS': 'Nova Scotia',
      'PE': 'Prince Edward Island',
      'PEI': 'Prince Edward Island',
      'NL': 'Newfoundland and Labrador',
      'YT': 'Yukon',
      'NT': 'Northwest Territories',
      'NU': 'Nunavut'
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

    // Regional aliases for expanded search
    const regionAliases = {
      'gta': {
        cities: ['Toronto', 'Mississauga', 'Brampton', 'Oakville', 'Markham', 'Vaughan', 'Richmond Hill']
      },
      'greater toronto area': {
        cities: ['Toronto', 'Mississauga', 'Brampton', 'Oakville', 'Markham', 'Vaughan', 'Richmond Hill']
      },
      'lower mainland': {
        cities: ['Vancouver', 'Burnaby', 'Surrey', 'Richmond', 'Coquitlam']
      },
      'metro vancouver': {
        cities: ['Vancouver', 'Burnaby', 'Surrey', 'Richmond', 'Coquitlam']
      },
      'greater vancouver': {
        cities: ['Vancouver', 'Burnaby', 'Surrey', 'Richmond', 'Coquitlam']
      },
      'montreal': {
        cities: ['Montreal', 'Laval', 'Longueuil']
      },
      'greater montreal': {
        cities: ['Montreal', 'Laval', 'Longueuil']
      },
      'golden horseshoe': {
        cities: ['Toronto', 'Hamilton', 'Niagara Falls', 'St. Catharines']
      },
      'new england': {
        provinces: ['Massachusetts', 'Connecticut', 'Rhode Island', 'Vermont', 'New Hampshire', 'Maine']
      },
      'pacific northwest': {
        provinces: ['British Columbia', 'Washington', 'Oregon']
      }
    };

    // FIX 5 + TASK C: If requestedSchools is provided, fetch them first (with fuzzy matching)
    let requestedSchoolsList = [];
    if (familyProfile?.requestedSchools && familyProfile.requestedSchools.length > 0) {
      console.log('[FIX 5] Fetching requested schools:', familyProfile.requestedSchools);
      
      // Apply fuzzy matching to requested schools
      const expandedNames = familyProfile.requestedSchools.map(name => {
        const normalized = name.toLowerCase().trim();
        return schoolNameLookup[normalized] || name;
      });
      
      requestedSchoolsList = await base44.entities.School.filter({
        name: { $in: expandedNames }
      });
      console.log('[FIX 5] Found requested schools:', requestedSchoolsList.map(s => s.name));
    }
    
    // Build filter - fetch all active schools with high limit
    let schools = await base44.entities.School.filter({}, '-created_date', 1000);
    
    // Filter to only active schools
    schools = schools.filter(s => s.status === 'active');
    
    // FIX 2: Log genderPolicy values for debugging
    const genderPolicies = new Set(schools.map(s => s.genderPolicy).filter(Boolean));
    console.log('[DEBUG] Unique genderPolicy values in database:', Array.from(genderPolicies));

    // FIX #1: LOCATION-FIRST WITH RELEVANCE SCORING
    // Step 1: Apply strict location filters to reduce dataset
    let locationFiltered = schools;

    // Check for regional aliases first
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

    // Apply aliased cities filter - exact match
    if (aliasedCities.length > 0) {
      locationFiltered = locationFiltered.filter(s => 
        aliasedCities.some(c => s.city?.toLowerCase() === c.toLowerCase())
      );
    }
    // Apply aliased provinces filter - exact match
    else if (aliasedProvinces.length > 0) {
      locationFiltered = locationFiltered.filter(s => {
        if (!s.provinceState) return false;
        const schoolPS = s.provinceState.toLowerCase();
        return aliasedProvinces.some(p => schoolPS === p.toLowerCase());
      });
    }

    // Apply city filter (if no aliases matched) - exact match first, then fallback to partial
    if (city && aliasedCities.length === 0) {
      const cityLower = city.trim().toLowerCase();
      // Try exact match first (handles "Vancouver", "Toronto", etc.)
      let cityMatches = locationFiltered.filter(s => 
        s.city && s.city.toLowerCase() === cityLower
      );
      // If no exact matches, try partial match
      if (cityMatches.length === 0) {
        cityMatches = locationFiltered.filter(s => 
          s.city && s.city.toLowerCase().includes(cityLower)
        );
      }
      locationFiltered = cityMatches;
      console.log(`[KI-12 CITY FILTER] city="${city}" → ${locationFiltered.length} schools`);
    }

    if (provinceState && aliasedProvinces.length === 0) {
      const psUpper = provinceState.toUpperCase().trim();
      
      // Check if it's an abbreviation
      const fullProvinceName = provinceAbbreviations[psUpper] || stateAbbreviations[psUpper];
      const normalizedProvince = fullProvinceName || toTitleCase(provinceState.trim());
      
      const provinceRegex = new RegExp(`^${normalizedProvince}$`, 'i');
      locationFiltered = locationFiltered.filter(s => {
        if (!s.provinceState) return false;
        return provinceRegex.test(s.provinceState);
      });
    }

    // Apply general region filter ONLY if no explicit city was provided
    if (region && !aliasedCities.length && !aliasedProvinces.length && !city) {
      locationFiltered = locationFiltered.filter(s => s.region === region);
    }
    if (country) {
      locationFiltered = locationFiltered.filter(s => s.country === country);
    }

    // STAGE 1: HARD FILTERS (eliminate schools that don't meet constraints)
    let hardFiltered = locationFiltered.filter(school => {
      // Hard filter 1: GRADE - child's grade must be within school's range
      const parsedMinGrade = minGrade !== undefined && minGrade !== null ? parseInt(minGrade) : null;
      if (parsedMinGrade !== null) {
        let sLow = parseInt(school.lowestGrade);
        let sHigh = parseInt(school.highestGrade);
        if (isNaN(sLow) || isNaN(sHigh)) {
          console.log(`[GRADE FILTER] Filtered out ${school.name}: Missing grade info`);
          return false;
        }
        if (!(sLow <= parsedMinGrade && sHigh >= parsedMinGrade)) {
          console.log(`[GRADE FILTER] Excluded ${school.name}: grades ${sLow}-${sHigh}, need ${parsedMinGrade}`);
          return false;
        }
        console.log(`[GRADE FILTER] Keeping ${school.name}: grade ${parsedMinGrade} is served (${sLow}-${sHigh})`);
      }
      
      // Hard filter 2: BUDGET - tuition must be within hard limits (skip if 'unlimited')
      const schoolTuition = school.tuition || school.dayTuition || school.tuitionMin || null;
      if (maxTuition && maxTuition !== 'unlimited') {
        console.log(`[BUDGET FILTER CHECK] Applying maxTuition filter: ${maxTuition}`);
        if (schoolTuition && schoolTuition > maxTuition) {
          console.log(`[BUDGET FILTER] Filtered out ${school.name}: tuition $${schoolTuition} exceeds budget $${maxTuition}`);
          return false;
        }
        // Schools with N/A tuition (null/undefined) are still included
      }
        if (schoolTuition && schoolTuition > maxTuition) {
          console.log(`[BUDGET FILTER] Filtered out ${school.name}: tuition $${schoolTuition} exceeds budget $${maxTuition}`);
          return false;
        }
        // Schools with N/A tuition (null/undefined) are still included
      }
      
      // Hard filter 3: RELIGIOUS DEALBREAKER - if marked, exclude non-secular schools
      const dealbreakers = payload.dealbreakers || familyProfile?.dealbreakers || [];
      const hasReligiousDealbreaker = Array.isArray(dealbreakers) && dealbreakers.some(d => 
        typeof d === 'string' && (
          d.toLowerCase().includes('religious') || 
          d.toLowerCase().includes('religion') ||
          d.toLowerCase().includes('no religious') ||
          d.toLowerCase().includes('secular only') ||
          d.toLowerCase().includes('non-religious')
        )
      );
      if (hasReligiousDealbreaker) {
        console.log(`[RELIGIOUS FILTER] Checking ${school.name}, affiliation: ${school.religiousAffiliation}`);
        
        // Check religiousAffiliation field
        if (school.religiousAffiliation && 
            school.religiousAffiliation !== 'None' && 
            school.religiousAffiliation !== 'none' &&
            school.religiousAffiliation !== 'Non-denominational' && 
            school.religiousAffiliation !== 'Secular') {
          console.log(`[RELIGIOUS FILTER] ✗ Excluded ${school.name}: religious affiliation (${school.religiousAffiliation})`);
          return false;
        }
        
        // Secondary check: religious keywords in school name (case-insensitive)
        const religiousKeywords = ['christian', 'catholic', 'islamic', 'jewish', 'lutheran', 'baptist', 'adventist', 'anglican', 'saint', 'st.', 'st ', 'holy', 'sacred', 'blessed'];
        const schoolNameLower = school.name?.toLowerCase() || '';
        const hasReligiousKeyword = religiousKeywords.some(keyword => schoolNameLower.includes(keyword));
        
        if (hasReligiousKeyword) {
          console.log(`[RELIGIOUS FILTER] ✗ Excluded ${school.name}: name contains religious keyword`);
          return false;
        }
        
        console.log(`[RELIGIOUS FILTER] ✓ Passed ${school.name}`);
      }
      
      // Hard filter 4: GENDER PREFERENCE - school type must match if specified (case-insensitive, multiple variations)
      if (familyProfile?.genderPreference) {
        const genderPref = familyProfile.genderPreference.toLowerCase();
        const schoolGender = (school.genderPolicy || school.schoolType || '').toLowerCase();
        
        // Match variations: 'all boys', 'boys', 'boys only', 'all-boys', 'male'
        if (genderPref === 'all boys' || genderPref === 'boys') {
          const isBoys = /\b(all[\s-]?boys?|boys?[\s-]?only|male)\b/i.test(schoolGender);
          if (!isBoys) return false;
        }
        // Match variations: 'all girls', 'girls', 'girls only', 'all-girls', 'female'
        else if (genderPref === 'all girls' || genderPref === 'girls') {
          const isGirls = /\b(all[\s-]?girls?|girls?[\s-]?only|female)\b/i.test(schoolGender);
          if (!isGirls) return false;
        }
        // Match variations: 'co-ed', 'coed', 'coeducational', 'mixed'
        else if (genderPref === 'co-ed' || genderPref === 'coed') {
          const isCoed = /\b(co[\s-]?ed|coeducational|mixed)\b/i.test(schoolGender);
          const isSingleGender = /\b(all[\s-]?boys?|all[\s-]?girls?|boys?[\s-]?only|girls?[\s-]?only|male|female)\b/i.test(schoolGender);
          if (!isCoed && isSingleGender) return false;
        }
      }
      
      // Hard filter 5: COMMUTE TOLERANCE - distance must not exceed tolerance
      if (familyProfile?.commuteToleranceMinutes && school.distanceKm) {
        const estimatedCommute = school.distanceKm * 2; // Rough: 1km ≈ 2 min
        if (estimatedCommute > familyProfile.commuteToleranceMinutes) {
          console.log(`Hard-filtered ${school.name}: commute ${estimatedCommute}min exceeds tolerance ${familyProfile.commuteToleranceMinutes}min`);
          return false;
        }
      }
      
      return true;
    });
    
    console.log(`Hard filters: ${locationFiltered.length} → ${hardFiltered.length} schools`);
    
    // If hard filters result in 0 schools, return empty with message
    if (hardFiltered.length === 0) {
      return Response.json({ 
        schools: [], 
        total: 0,
        returned: 0,
        edgeCaseMessage: "No schools matched your criteria. Try expanding your location, budget, or grade range.",
        relaxedFilters: false
      });
    }

    // STAGE 2: RELEVANCE SCORING (rank what remains)
    const scored = hardFiltered.map(school => {
      let score = 0;
      
      // Grade range: +2 for exact match
      if (minGrade !== undefined) {
        const targetGrade = minGrade !== undefined ? minGrade : maxGrade;
        if (school.lowestGrade <= targetGrade && school.highestGrade >= targetGrade) {
          score += 2; // Exact match
        }
      }
      
      // Tuition: +2 for in range
      if (maxTuition !== undefined && school.tuition) {
        if (school.tuition <= maxTuition) {
          score += 2;
        }
      }
      
      // Curriculum: +3 for exact match
      if (curriculumType && school.curriculumType === curriculumType) {
        score += 3;
      }
      
      // School type: +2 for exact match
      if (schoolType && school.schoolType === schoolType) {
        score += 2;
      }
      
      // Specializations: +1 per match
      if (specializations && specializations.length > 0) {
        if (school.specializations) {
          const matches = specializations.filter(spec => school.specializations.includes(spec)).length;
          score += matches;
        }
      }
      
      return { school, score };
    });

    // Step 3: Sort by score (descending) - keeps location-matched schools
    schools = scored.sort((a, b) => b.score - a.score).map(s => s.school);

    // Calculate distances if user location provided (use resolved neighbourhood coordinates)
    if (resolvedLat && resolvedLng) {
      schools = schools.map(school => {
        if (school.lat && school.lng) {
          const distance = calculateDistance(resolvedLat, resolvedLng, school.lat, school.lng);
          return { ...school, distanceKm: distance };
        }
        return school;
      });

      if (maxDistanceKm) {
        schools = schools.filter(s => s.distanceKm && s.distanceKm <= maxDistanceKm);
      }

      schools.sort((a, b) => (a.distanceKm || 999999) - (b.distanceKm || 999999));
    }

    // FILTER OUT DEALBREAKER SCHOOLS (if FamilyProfile available)
    if (familyProfile) {
      schools = schools.filter(school => {
        // Dealbreaker 1: Commute exceeds tolerance by 50%+ minutes
        if (familyProfile.commuteToleranceMinutes && school.distanceKm) {
          // Rough estimate: 1 km ≈ 2 min commute
          const estimatedCommute = school.distanceKm * 2;
          const tolerance = familyProfile.commuteToleranceMinutes;
          if (estimatedCommute > tolerance + 50) {
            console.log(`Filtered out ${school.name}: commute ${estimatedCommute}min exceeds tolerance ${tolerance}min by 50+min`);
            return false;
          }
        }

        // Dealbreaker 2: Tuition is 2x+ the budget
        if (familyProfile.maxTuition && school.tuition) {
          if (school.tuition > familyProfile.maxTuition * 2) {
            console.log(`Filtered out ${school.name}: tuition $${school.tuition} is 2x+ budget $${familyProfile.maxTuition}`);
            return false;
          }
        }

        return true;
      });
    }

    // FIX 5: Always include requested schools at the top, even if they fail filters
    const requestedSchoolIds = new Set(requestedSchoolsList.map(s => s.id));
    const otherSchools = schools.filter(s => !requestedSchoolIds.has(s.id));
    let finalSchools = [...requestedSchoolsList, ...otherSchools];
    
    // EDGE CASE HANDLING - Return empty array if hard filters result in 0 schools
    const originalFilteredCount = finalSchools.length;
    let edgeCaseMessage = null;
    let relaxedFilters = false;
    
    // If ALL schools filtered out by hard filters, return empty array with message
    if (finalSchools.length === 0) {
      edgeCaseMessage = "No schools matched your criteria. Try expanding your location, budget, or grade range.";
      console.log('[EDGE CASE] All schools filtered out - returning empty array');
    }
    // Edge case: Too many schools (>15) - prompt user to narrow down
    else if (finalSchools.length > 15) {
      edgeCaseMessage = "I found quite a few options! Would you like to narrow it down by adding more preferences (budget, curriculum, specializations)?";
    }
    
    // Limit to max 20 results and return minimal fields
    const maxResults = Math.min(finalSchools.length, 20);
    const condensedSchools = finalSchools.slice(0, maxResults).map(s => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      city: s.city,
      provinceState: s.provinceState,
      gradesServed: `${s.lowestGrade}-${s.highestGrade}`,
      lowestGrade: s.lowestGrade,
      highestGrade: s.highestGrade,
      tuition: s.tuition,
      currency: s.currency,
      curriculumType: s.curriculumType,
      region: s.region,
      specializations: s.specializations,
      distanceKm: s.distanceKm,
      schoolType: s.schoolType
    }));

    // TASK B: SEARCH LOGGING - Create SearchLog record
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
      // Don't fail the search if logging fails
    }

    return Response.json({ 
      schools: condensedSchools, 
      total: finalSchools.length,
      returned: condensedSchools.length,
      edgeCaseMessage,
      relaxedFilters
    });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}