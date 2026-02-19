import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
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

    // Build filter
    let schools = await base44.entities.School.filter({ status: 'active' });

    // Apply location filters with smart matching
    if (city) {
      const cityLower = city.toLowerCase().trim();
      schools = schools.filter(s => s.city?.toLowerCase().includes(cityLower));
    }

    if (provinceState) {
      const psUpper = provinceState.toUpperCase().trim();
      const psLower = provinceState.toLowerCase().trim();
      
      // Check if it's an abbreviation
      const fullProvinceName = provinceAbbreviations[psUpper] || stateAbbreviations[psUpper];
      
      schools = schools.filter(s => {
        if (!s.provinceState) return false;
        const schoolPS = s.provinceState.toLowerCase();
        
        // Match full name, abbreviation, or partial match
        return schoolPS === psLower || 
               schoolPS === fullProvinceName?.toLowerCase() ||
               schoolPS.includes(psLower) ||
               (fullProvinceName && schoolPS === fullProvinceName.toLowerCase());
      });
    }

    // Apply region filter
    if (region) {
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

    // Limit results
    schools = schools.slice(0, limit);

    return Response.json({ schools, total: schools.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

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