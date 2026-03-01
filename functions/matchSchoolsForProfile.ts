// Function: matchSchoolsForProfile
// Purpose: Re-run school matching when a user edits their profile, updating ChatSession with new matches
// Entities: ChatSession, School
// Last Modified: 2026-03-01
// Dependencies: searchSchools function, School entity

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function resolveLocationCoords(locationArea) {
  const CANADIAN_METRO_COORDS = {
    'toronto': { lat: 43.6532, lng: -79.3832 },
    'gta': { lat: 43.6532, lng: -79.3832 },
    'vancouver': { lat: 49.2827, lng: -123.1207 },
    'montreal': { lat: 45.5017, lng: -73.5673 },
    'ottawa': { lat: 45.4215, lng: -75.6972 },
    'calgary': { lat: 51.0447, lng: -114.0719 },
    'edmonton': { lat: 53.5461, lng: -113.4938 },
    'winnipeg': { lat: 49.8951, lng: -97.1384 },
  };
  if (!locationArea) return null;
  const key = locationArea.toLowerCase().trim();
  if (CANADIAN_METRO_COORDS[key]) return CANADIAN_METRO_COORDS[key];
  for (const [cityKey, coords] of Object.entries(CANADIAN_METRO_COORDS)) {
    if (key.includes(cityKey) || cityKey.includes(key)) {
      return coords;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { sessionId, familyProfile } = await req.json();

    if (!sessionId || !familyProfile) {
      return Response.json({ error: 'Missing sessionId or familyProfile' }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch ChatSession
    const sessions = await base44.entities.ChatSession.filter({ id: sessionId });
    if (sessions.length === 0) {
      return Response.json({ error: 'ChatSession not found' }, { status: 404 });
    }
    const session = sessions[0];

    // Build search params from updated profile
    const searchParams = {
      limit: 50,
      familyProfile: familyProfile
    };

    if (familyProfile.locationArea) {
      const locationAreaLower = familyProfile.locationArea.toLowerCase().trim();
      const regionAliases = ['gta', 'greater toronto area', 'lower mainland', 'metro vancouver'];
      if (regionAliases.includes(locationAreaLower)) {
        searchParams.region = familyProfile.locationArea;
      } else {
        const cityToProvinceMap = {
          'toronto': 'Ontario',
          'vancouver': 'British Columbia',
          'calgary': 'Alberta',
          'edmonton': 'Alberta',
          'montreal': 'Quebec',
          'ottawa': 'Ontario',
        };
        const locationParts = familyProfile.locationArea.split(',').map(s => s.trim());
        searchParams.city = locationParts[0];
        const inferredProvince = cityToProvinceMap[locationParts[0].toLowerCase()];
        if (inferredProvince) {
          searchParams.provinceState = inferredProvince;
        }
      }
    }

    const locationCoords = resolveLocationCoords(familyProfile.locationArea);
    if (locationCoords) {
      searchParams.resolvedLat = locationCoords.lat;
      searchParams.resolvedLng = locationCoords.lng;
    }

    if (familyProfile.childGrade !== null && familyProfile.childGrade !== undefined) {
      searchParams.minGrade = familyProfile.childGrade;
      searchParams.maxGrade = familyProfile.childGrade;
    }

    if (familyProfile.maxTuition) {
      searchParams.maxTuition = familyProfile.maxTuition;
    }

    // Call searchSchools
    let schools = [];
    try {
      const searchResult = await base44.asServiceRole.functions.invoke('searchSchools', {
        ...searchParams,
        conversationId: session.chatHistoryId,
        userId: user.id,
        searchQuery: 'profile_edit_refresh'
      });
      schools = searchResult.data.schools || [];
    } catch (searchError) {
      console.error('[matchSchoolsForProfile] searchSchools failed:', searchError.message);
      schools = [];
    }

    // Filter and deduplicate
    schools = schools.filter(s => s.schoolType !== 'Special Needs' && s.schoolType !== 'Public');
    const seen = new Set();
    const deduplicated = [];
    for (const school of schools) {
      if (!seen.has(school.name)) {
        seen.add(school.name);
        deduplicated.push(school);
      }
    }

    const matchingSchools = deduplicated.slice(0, 20);

    // Update ChatSession with new matches
    const matchedSchoolIds = matchingSchools.map(s => s.id);
    await base44.entities.ChatSession.update(sessionId, {
      matchedSchools: JSON.stringify(matchedSchoolIds)
    });

    console.log('[matchSchoolsForProfile] Updated ChatSession with', matchedSchoolIds.length, 'matched schools');

    return Response.json({
      success: true,
      matchedCount: matchingSchools.length,
      schools: matchingSchools
    });
  } catch (error) {
    console.error('[matchSchoolsForProfile] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});