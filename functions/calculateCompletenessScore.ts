// Function: calculateCompletenessScore
// Purpose: Calculate and persist a weighted profile completeness score (0-100) for one or more schools
// Entities: School
// Last Modified: 2026-03-06
// Dependencies: none

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// =============================================================================
// Field weight tiers — per PM spec 2026-03-05
// CRITICAL (3x), HIGH (2x), STANDARD (1x)
// System/derived fields are excluded from scoring entirely.
// =============================================================================

const CRITICAL_FIELDS = [
  'name', 'description', 'dayTuition', 'lowestGrade', 'highestGrade',
  'provinceState', 'country', 'genderPolicy', 'schoolType', 'city', 'lat', 'lng',
];

const HIGH_FIELDS = [
  'enrollment', 'avgClassSize', 'studentTeacherRatio', 'curriculumType',
  'address', 'phone', 'email', 'website', 'missionStatement',
  'headerPhotoUrl',
];

// Fields that are system-managed, derived, or intentionally excluded from scoring
const EXCLUDED_FIELDS = new Set([
  'id', 'created_date', 'updated_date', 'created_by', 'created_by_id',
  'slug', 'status', 'verified', 'claimStatus',
  'membershipTier', 'subscriptionTier', 'schoolTier', 'completenessScore',
  'adminUserId', 'is_sample', 'source', 'dataSource', 'governmentId',
  'aiEnrichedFields', 'verifiedFields', 'lastEnriched', 'importBatchId',
  // Excluded profile fields per spec
  'gradeSystem', 'gradesServed', 'heroImage', 'tuition', 'currency',
  'tuitionMin', 'tuitionMax', 'acceptanceRate', 'internationalStudentPct',
  'campusFeel',
]);

const CRITICAL_SET = new Set(CRITICAL_FIELDS);
const HIGH_SET = new Set(HIGH_FIELDS);

const GRADE_FIELDS = new Set(['lowestGrade', 'highestGrade']);
const PLACEHOLDER_STRINGS = new Set(['', 'n/a', 'not available', 'unknown', 'tbd']);

function isFieldPopulated(value, fieldName) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') {
    return !PLACEHOLDER_STRINGS.has(value.trim().toLowerCase());
  }
  if (typeof value === 'number') {
    if (GRADE_FIELDS.has(fieldName)) return true;
    return value !== 0;
  }
  return true;
}

function weightFor(fieldName) {
  if (CRITICAL_SET.has(fieldName)) return 3;
  if (HIGH_SET.has(fieldName)) return 2;
  return 1;
}

function calculateScore(school) {
  let earnedWeight = 0;
  let totalWeight = 0;

  // Score all schema fields that are not excluded
  const allScoredFields = new Set([
    ...CRITICAL_FIELDS,
    ...HIGH_FIELDS,
  ]);

  // Add any additional fields present on the object that aren't excluded and aren't already scored
  for (const key of Object.keys(school)) {
    if (!EXCLUDED_FIELDS.has(key) && !allScoredFields.has(key)) {
      allScoredFields.add(key);
    }
  }

  for (const fieldName of allScoredFields) {
    if (EXCLUDED_FIELDS.has(fieldName)) continue;
    const w = weightFor(fieldName);
    totalWeight += w;
    if (isFieldPopulated(school[fieldName], fieldName)) {
      earnedWeight += w;
    }
  }

  if (totalWeight === 0) return 0;
  return Math.round((earnedWeight / totalWeight) * 100);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { backfill, schoolId, limit: batchLimit, skip: batchSkip } = body;

    // Mode 1: single school by id (post-save hook)
    if (schoolId) {
      const schools = await base44.asServiceRole.entities.School.filter({ id: schoolId });
      if (!schools || schools.length === 0) {
        return Response.json({ error: 'School not found' }, { status: 404 });
      }
      const school = schools[0];
      const score = calculateScore(school);
      await base44.asServiceRole.entities.School.update(school.id, { completenessScore: score });
      return Response.json({ schoolId: school.id, completenessScore: score });
    }

    // Mode 2: batch backfill (admin only)
    if (backfill === true) {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
      }
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const errors = [];

      // --- Paginated single-batch mode (caller controls pagination) ---
      if (batchLimit != null) {
        const startSkip = batchSkip || 0;
        const batch = await base44.asServiceRole.entities.School.list(null, batchLimit, startSkip);
        let processed = 0;

        for (const school of batch || []) {
          try {
            const score = calculateScore(school);
            await base44.asServiceRole.entities.School.update(school.id, { completenessScore: score });
            processed++;
          } catch (err) {
            errors.push({ schoolId: school.id, error: err.message });
          }
          await delay(150);
        }

        const hasMore = (batch || []).length === batchLimit;
        return Response.json({ processed, skipped: startSkip, hasMore, errors });
      }

      // --- Full backfill mode (original behavior: process all schools) ---
      const limit = 20;
      let skip = 0;
      let totalProcessed = 0;
      let totalUpdated = 0;

      while (true) {
        const batch = await base44.asServiceRole.entities.School.list(null, limit, skip);
        if (!batch || batch.length === 0) break;

        for (const school of batch) {
          totalProcessed++;
          try {
            const score = calculateScore(school);
            await base44.asServiceRole.entities.School.update(school.id, { completenessScore: score });
            totalUpdated++;
          } catch (err) {
            errors.push({ schoolId: school.id, error: err.message });
          }
          await delay(150);
        }

        if (batch.length < limit) break;
        skip += limit;
      }

      return Response.json({ totalProcessed, totalUpdated, errors });
    }

    return Response.json({ error: 'Provide schoolId or backfill:true' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});