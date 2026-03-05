// Function: calculateCompletenessScore
// Purpose: Calculate and persist a 4-tier weighted profile completeness score (0-100) for one or more schools
// Entities: School
// Last Modified: 2026-03-05
// Dependencies: none

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// =============================================================================
// Tier definitions — must stay in sync with ProfileCompletenessRing.jsx
// T1=50%, T2=30%, T3=15%, T4=5%
// =============================================================================
const TIERS = [
  {
    weight: 50,
    fields: ['name', 'city', 'provinceState', 'country', 'lowestGrade', 'highestGrade', 'genderPolicy', 'dayTuition', 'schoolType'],
  },
  {
    weight: 30,
    fields: ['description', 'website', 'boardingAvailable', 'religiousAffiliation', 'languageOfInstruction', 'avgClassSize', 'studentTeacherRatio'],
  },
  {
    weight: 15,
    fields: ['artsPrograms', 'sportsPrograms', 'clubs', 'facilities', 'specialEdPrograms', 'curriculumType', 'accreditations'],
  },
  {
    weight: 5,
    fields: ['logoUrl', 'headerPhotoUrl', 'photoGallery'],
  },
];

function isFilled(value) {
  if (typeof value === 'boolean') return value !== null && value !== undefined;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return value !== null && value !== undefined;
}

function calcScore(school) {
  let total = 0;
  for (const tier of TIERS) {
    const filled = tier.fields.filter(f => isFilled(school[f])).length;
    total += (filled / tier.fields.length) * tier.weight;
  }
  return Math.round(total);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    // Mode 1: single school by id (post-save hook)
    if (body.schoolId) {
      const schools = await base44.asServiceRole.entities.School.filter({ id: body.schoolId });
      if (!schools || schools.length === 0) {
        return Response.json({ error: 'School not found' }, { status: 404 });
      }
      const school = schools[0];
      const score = calcScore(school);
      await base44.asServiceRole.entities.School.update(school.id, { completenessScore: score });
      return Response.json({ schoolId: school.id, completenessScore: score });
    }

    // Mode 2: batch backfill (admin only)
    if (body.backfill === true) {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
      }
      // Process in pages of 100
      let skip = 0;
      const limit = 100;
      let processed = 0;
      while (true) {
        const batch = await base44.asServiceRole.entities.School.list(null, limit, skip);
        if (!batch || batch.length === 0) break;
        for (const school of batch) {
          const score = calcScore(school);
          await base44.asServiceRole.entities.School.update(school.id, { completenessScore: score });
          processed++;
        }
        if (batch.length < limit) break;
        skip += limit;
      }
      return Response.json({ processed });
    }

    return Response.json({ error: 'Provide schoolId or backfill:true' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});