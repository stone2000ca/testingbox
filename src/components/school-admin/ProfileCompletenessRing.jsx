import { useState, useEffect } from 'react';

// =============================================================================
// Weighted tier scoring: T1=50%, T2=30%, T3=15%, T4=5%
// =============================================================================
const TIERS = [
  {
    id: 'tier1',
    label: 'Required',
    color: '#ef4444',
    weight: 50,
    fields: ['name', 'city', 'provinceState', 'country', 'lowestGrade', 'highestGrade', 'genderPolicy', 'dayTuition', 'schoolType'],
  },
  {
    id: 'tier2',
    label: 'Important',
    color: '#f59e0b',
    weight: 30,
    fields: ['description', 'website', 'boardingAvailable', 'religiousAffiliation', 'languageOfInstruction', 'avgClassSize', 'studentTeacherRatio'],
  },
  {
    id: 'tier3',
    label: 'Enrichment',
    color: '#14b8a6',
    weight: 15,
    fields: ['artsPrograms', 'sportsPrograms', 'clubs', 'facilities', 'specialEdPrograms', 'curriculumType', 'accreditations'],
  },
  {
    id: 'tier4',
    label: 'Media',
    color: '#6366f1',
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

function calcWeightedScore(school) {
  if (!school) return 0;
  let total = 0;
  for (const tier of TIERS) {
    const filled = tier.fields.filter(f => isFilled(school[f])).length;
    const tierPct = filled / tier.fields.length; // 0–1
    total += tierPct * tier.weight;              // contribution to 100
  }
  return Math.round(total);
}

export default function ProfileCompletenessRing({ school }) {
  const [score, setScore] = useState(0);

  useEffect(() => {
    setScore(calcWeightedScore(school));
  }, [school]);

  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  const ringColor =
    score >= 80 ? '#22c55e' :
    score >= 50 ? '#14b8a6' :
    score >= 25 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center space-y-5">
      {/* Ring */}
      <div className="relative w-36 h-36">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke={ringColor}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold text-slate-900">{score}%</div>
          <div className="text-xs text-slate-500">Profile Score</div>
        </div>
      </div>

      {/* Per-tier breakdown */}
      <div className="w-full space-y-2">
        {TIERS.map(tier => {
          const filled = tier.fields.filter(f => isFilled(school?.[f])).length;
          const total = tier.fields.length;
          const pct = Math.round((filled / total) * 100);
          return (
            <div key={tier.id}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 font-medium">{tier.label}</span>
                <span className="text-slate-500">{filled}/{total} · {tier.weight}% weight</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: tier.color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Teaser */}
      <div className="w-full p-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg">
        <div className="font-semibold text-slate-900 text-xs mb-1">Coming Soon: Profile Analytics</div>
        <div className="text-xs text-slate-500">
          Profile views, search appearances, and shortlist additions. Available with Enhanced membership.
        </div>
      </div>
    </div>
  );
}