import { buildPriorityChecks } from '@/components/schools/SchoolCard';

export const IMPORTANT_FIELDS = ['name', 'city', 'curriculumType', 'genderPolicy', 'dayTuition', 'tuition', 'lowestGrade', 'highestGrade', 'boardingAvailable', 'description', 'headerPhotoUrl', 'logoUrl'];

export function buildTiers(schools, familyProfile, sortMode = 'bestFit', priorityOverrides = {}) {
  if (!schools || schools.length === 0) return null;

  // Apply T-RES-006: filter out musthave mismatches, weight dontcares out
  const effectiveProfile = familyProfile ? { ...familyProfile } : null;

  function applySort(arr) {
    if (sortMode === 'closest') {
      return [...arr].sort((a, b) => (a.school.distanceKm ?? 99999) - (b.school.distanceKm ?? 99999));
    }
    if (sortMode === 'affordable') {
      const tval = s => s.school.dayTuition ?? s.school.tuition ?? 99999;
      return [...arr].sort((a, b) => tval(a) - tval(b));
    }
    if (sortMode === 'newest') {
      return [...arr].sort(() => Math.random() - 0.5);
    }
    // bestFit (default)
    return [...arr].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.completeness !== a.completeness) return b.completeness - a.completeness;
      return a.proximity - b.proximity;
    });
  }

  const scored = schools.map(s => {
    const checks = buildPriorityChecks(s, effectiveProfile);
    // Apply overrides: musthave mismatch → penalize heavily; dontcare → skip from score
    let score = 0;
    let mustHaveFail = false;
    checks.forEach(row => {
      const flex = priorityOverrides[row.id] || 'nicetohave';
      if (flex === 'dontcare') return;
      if (row.status === 'match') score += (flex === 'musthave' ? 2 : 1);
      if (row.status === 'mismatch' && flex === 'musthave') mustHaveFail = true;
    });
    const completeness = IMPORTANT_FIELDS.filter(f => s[f] != null && s[f] !== '').length;
    const proximity = s.distanceKm != null ? s.distanceKm : 99999;
    return { school: s, score, completeness, proximity, mustHaveFail };
  });

  // Filter out must-have failures
  const passing = scored.filter(s => !s.mustHaveFail);
  const sorted = applySort(passing);

  const TIER1_SIZE = Math.min(5, Math.max(3, Math.ceil(sorted.length * 0.25)));
  const TIER2_SIZE = Math.min(5, Math.max(2, Math.ceil(sorted.length * 0.2)));
  const TOTAL_CAP = 7;

  const tier1 = sorted.slice(0, TIER1_SIZE).map(s => s.school);
  const remaining = sorted.slice(TIER1_SIZE);

  const tier2Count = Math.min(TIER2_SIZE, Math.max(0, TOTAL_CAP - tier1.length));
  // For non-bestFit sorts, preserve sort order in tier2; for bestFit shuffle tier2
  const tier2pool = sortMode === 'bestFit' ? [...remaining].sort(() => Math.random() - 0.5) : remaining;
  const tier2 = tier2pool.slice(0, tier2Count).map(s => s.school);
  const tier2Ids = new Set(tier2.map(s => s.id));

  const seeAll = remaining
    .filter(s => !tier2Ids.has(s.school.id))
    .map(s => s.school);

  return { topMatches: tier1, alsoWorthExploring: tier2, seeAll };
}