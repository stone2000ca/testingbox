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

async function performSearch(req) {
  const base44 = createClientFromRequest(req);
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
      userLat,
      userLng,
      maxDistanceKm,
      limit = 20
    } = await req.json();

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

    // Build filter - fetch all active schools with high limit
    let schools = await base44.entities.School.filter({ status: 'active' }, '-created_date', 1000);

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
      schools = schools.filter(s => 
        aliasedCities.some(c => s.city?.toLowerCase() === c.toLowerCase())
      );
    }
    // Apply aliased provinces filter - exact match
    else if (aliasedProvinces.length > 0) {
      schools = schools.filter(s => {
        if (!s.provinceState) return false;
        const schoolPS = s.provinceState.toLowerCase();
        return aliasedProvinces.some(p => schoolPS === p.toLowerCase());
      });
    }

    // Apply city filter (if no aliases matched) - exact match
    if (city && aliasedCities.length === 0) {
      const cityLower = city.toLowerCase().trim();
      schools = schools.filter(s => s.city?.toLowerCase() === cityLower);
    }

    if (provinceState && aliasedProvinces.length === 0) {
      const psUpper = provinceState.toUpperCase().trim();
      const psLower = provinceState.toLowerCase().trim();
      
      // Check if it's an abbreviation
      const fullProvinceName = provinceAbbreviations[psUpper] || stateAbbreviations[psUpper];
      
      schools = schools.filter(s => {
        if (!s.provinceState) return false;
        const schoolPS = s.provinceState.toLowerCase();
        
        // Match full name or abbreviation - exact match
        return schoolPS === psLower || schoolPS === fullProvinceName?.toLowerCase();
      });
    }

    // Apply general region filter (Canada, US, Europe) - only if no aliases were used
    if (region && !aliasedCities.length && !aliasedProvinces.length) {
      schools = schools.filter(s => s.region === region);
    }
    if (country) {
      schools = schools.filter(s => s.country === country);
    }
    if (minGrade !== undefined) {
      schools = schools.filter(s => s.lowestGrade <= minGrade && s.highestGrade >= minGrade);
    }
    if (maxGrade !== undefined) {
      schools = schools.filter(s => s.lowestGrade <= maxGrade && s.highestGrade >= maxGrade);
    }
    if (minTuition !== undefined) {
      schools = schools.filter(s => s.tuition >= minTuition);
    }
    if (maxTuition !== undefined) {
      schools = schools.filter(s => s.tuition <= maxTuition);
    }
    if (curriculumType) {
      schools = schools.filter(s => s.curriculumType === curriculumType);
    }
    if (specializations && specializations.length > 0) {
      schools = schools.filter(s => 
        s.specializations && specializations.some(spec => s.specializations.includes(spec))
      );
    }

    // Calculate distances if user location provided
    if (userLat && userLng) {
      schools = schools.map(school => {
        if (school.lat && school.lng) {
          const distance = calculateDistance(userLat, userLng, school.lat, school.lng);
          return { ...school, distanceKm: distance };
        }
        return school;
      });

      if (maxDistanceKm) {
        schools = schools.filter(s => s.distanceKm && s.distanceKm <= maxDistanceKm);
      }

      schools.sort((a, b) => (a.distanceKm || 999999) - (b.distanceKm || 999999));
    }

    // Limit to max 20 results and return minimal fields
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
      currency: s.currency,
      curriculumType: s.curriculumType,
      region: s.region,
      specializations: s.specializations,
      distanceKm: s.distanceKm
    }));

    return Response.json({ 
      schools: condensedSchools, 
      total: schools.length,
      returned: condensedSchools.length
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