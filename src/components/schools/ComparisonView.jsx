import { ArrowLeft, Check, X, Circle } from 'lucide-react';
import { buildPriorityChecks } from './SchoolCard';
import { HeaderPhotoDisplay } from './HeaderPhotoHelper';

// =============================================================================
// COMPARISON VIEW — Full-screen, all School fields, grouped subheadings
// Replaces ShortlistComparisonModal (T-SL-003)
// =============================================================================

function fmt(val) {
  if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) return null;
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function formatGrade(grade) {
  if (grade === null || grade === undefined) return '';
  const n = Number(grade);
  if (n <= -2) return 'PK';
  if (n === -1) return 'JK';
  if (n === 0) return 'K';
  return String(n);
}

function formatTuition(val, currency) {
  if (!val) return null;
  const sym = currency === 'USD' ? 'US$' : currency === 'GBP' ? '£' : '$';
  return `${sym}${Number(val).toLocaleString()}`;
}

function StatusIcon({ status }) {
  if (status === 'match') return <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />;
  if (status === 'mismatch') return <X className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />;
  return <Circle className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />;
}

// Build rows for each section
const SECTIONS = [
  {
    title: 'Your Priorities',
    key: '_priorities',
  },
  {
    title: 'Basics',
    rows: [
      { id: 'location',    label: 'Location',       get: s => [s.city, s.provinceState, s.country].filter(Boolean).join(', ') },
      { id: 'grades',      label: 'Grades',          get: s => { const f = formatGrade(s.lowestGrade), t = formatGrade(s.highestGrade); return f && t ? `${f}–${t}` : (f || t || null); } },
      { id: 'enrollment',  label: 'Enrollment',      get: s => s.enrollment ? `${s.enrollment.toLocaleString()} students` : null },
      { id: 'schoolType',  label: 'School Type',     get: s => fmt(s.schoolType) },
      { id: 'founded',     label: 'Founded',         get: s => fmt(s.founded) },
      { id: 'gender',      label: 'Gender Policy',   get: s => fmt(s.genderPolicy) },
      { id: 'religious',   label: 'Religious',       get: s => fmt(s.religiousAffiliation) },
      { id: 'campus',      label: 'Campus',          get: s => fmt(s.campusSize) },
      { id: 'campusFeel',  label: 'Campus Feel',     get: s => fmt(s.campusFeel) },
    ]
  },
  {
    title: 'Academics',
    rows: [
      { id: 'curriculum',  label: 'Curriculum',      get: s => fmt(s.curriculum?.length ? s.curriculum : s.curriculumType) },
      { id: 'currType',    label: 'Curriculum Type', get: s => fmt(s.curriculumType) },
      { id: 'specs',       label: 'Specializations', get: s => fmt(s.specializations) },
      { id: 'classSize',   label: 'Avg Class Size',  get: s => s.avgClassSize ? `${s.avgClassSize} students` : null },
      { id: 'stRatio',     label: 'Student:Teacher', get: s => fmt(s.studentTeacherRatio) },
      { id: 'intlPct',     label: 'Intl Students',   get: s => s.internationalStudentPct != null ? `${s.internationalStudentPct}%` : null },
      { id: 'langInstr',   label: 'Language',        get: s => fmt(s.languageOfInstruction) },
      { id: 'langs',       label: 'Languages Taught',get: s => fmt(s.languages) },
      { id: 'uni',         label: 'University Placements', get: s => { try { const p = typeof s.universityPlacements === 'string' ? JSON.parse(s.universityPlacements) : s.universityPlacements; return Array.isArray(p) && p.length ? p.slice(0, 4).join(', ') : null; } catch { return fmt(s.universityPlacements); } } },
    ]
  },
  {
    title: 'Student Life',
    rows: [
      { id: 'arts',        label: 'Arts Programs',   get: s => fmt(s.artsPrograms) },
      { id: 'sports',      label: 'Sports',          get: s => fmt(s.sportsPrograms) },
      { id: 'clubs',       label: 'Clubs',           get: s => fmt(s.clubs) },
      { id: 'facilities',  label: 'Facilities',      get: s => fmt(s.facilities) },
      { id: 'specEd',      label: 'Learning Support',get: s => fmt(s.specialEdPrograms) },
      { id: 'uniform',     label: 'Uniform',         get: s => s.uniformRequired != null ? (s.uniformRequired ? 'Required' : 'Not required') : null },
      { id: 'community',   label: 'Community Vibe',  get: s => fmt(s.communityVibe) },
      { id: 'parents',     label: 'Parent Involvement', get: s => fmt(s.parentInvolvement) },
      { id: 'transport',   label: 'Transportation',  get: s => fmt(s.transportationOptions) },
      { id: 'care',        label: 'Before/After Care',get: s => fmt(s.beforeAfterCare) },
    ]
  },
  {
    title: 'Admissions',
    rows: [
      { id: 'acceptRate',  label: 'Acceptance Rate', get: s => s.acceptanceRate != null ? `${s.acceptanceRate}%` : null },
      { id: 'deadline',    label: 'Application Deadline', get: s => fmt(s.applicationDeadline) },
      { id: 'entrance',    label: 'Entrance Requirements', get: s => fmt(s.entranceRequirements) },
      { id: 'admReqs',     label: 'Admission Requirements', get: s => fmt(s.admissionRequirements) },
      { id: 'openHouse',   label: 'Open House',      get: s => fmt(s.openHouseDates) },
    ]
  },
  {
    title: 'Tuition & Financial',
    rows: [
      { id: 'dayTuition',  label: 'Day Tuition',     get: s => formatTuition(s.dayTuition ?? s.tuition, s.currency) },
      { id: 'boarding',    label: 'Boarding',        get: s => s.boardingAvailable != null ? (s.boardingAvailable ? `Yes (${s.boardingType || 'available'})` : 'Day school only') : null },
      { id: 'boardTuition',label: 'Boarding Tuition',get: s => formatTuition(s.boardingTuition, s.currency) },
      { id: 'finAid',      label: 'Financial Aid',   get: s => s.financialAidAvailable != null ? (s.financialAidAvailable ? 'Available' : 'Not listed') : null },
      { id: 'finAidDetail',label: 'Aid Details',     get: s => fmt(s.financialAidDetails) },
      { id: 'scholar',     label: 'Scholarships',    get: s => { try { const p = typeof s.scholarshipsJson === 'string' ? JSON.parse(s.scholarshipsJson) : s.scholarshipsJson; return Array.isArray(p) && p.length ? `${p.length} available` : null; } catch { return null; } } },
      { id: 'accreds',     label: 'Accreditations',  get: s => fmt(s.accreditations) },
    ]
  },
];

function getCellValue(row, school) {
  const val = row.get(school);
  return val;
}

function buildPriorityRows(schools, familyProfile) {
  if (!familyProfile) return [];
  const rowMap = new Map();
  for (const school of schools) {
    const checks = buildPriorityChecks(school, familyProfile);
    for (const row of checks) {
      if (!rowMap.has(row.id)) rowMap.set(row.id, row.label);
    }
  }
  return Array.from(rowMap.entries()).map(([id, label]) => ({ id, label }));
}

function getPriorityCell(rowId, school, familyProfile) {
  const checks = buildPriorityChecks(school, familyProfile);
  return checks.find(r => r.id === rowId) || null;
}

const RELEVANCE_STYLES = {
  priority:    { bg: 'bg-teal-900/10', border: 'border-l-4 border-l-teal-500', badge: 'bg-teal-100 text-teal-700' },
  dealbreaker: { bg: 'bg-red-900/10',  border: 'border-l-4 border-l-red-500',  badge: 'bg-red-100 text-red-700' },
  neutral:     { bg: '',               border: '',                               badge: '' },
};

export default function ComparisonView({ schools, familyProfile, comparisonMatrix, onBack }) {
  if (!schools || schools.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-slate-500">No schools to compare</p>
      </div>
    );
  }

  const priorityRows = buildPriorityRows(schools, familyProfile);
  const colCount = schools.length;
  const LABEL_W = 160;
  const COL_W = 220;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Fixed header bar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white z-20">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Results
        </button>
        <span className="text-slate-300">|</span>
        <span className="text-sm font-semibold text-slate-800">Comparing {colCount} Schools</span>
        <span className="text-xs text-slate-400 ml-1">{schools.map(s => s.name).join(' vs ')}</span>
      </div>

      {/* Scrollable table area */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ width: LABEL_W + COL_W * colCount, minWidth: '100%' }}>
          <colgroup>
            <col style={{ width: LABEL_W }} />
            {schools.map(s => <col key={s.id} style={{ width: COL_W }} />)}
          </colgroup>

          {/* Sticky school headers */}
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="bg-white border-b border-slate-200 p-0" />
              {schools.map(school => (
                <th key={school.id} className="bg-white border-b border-slate-200 border-l border-l-slate-100 p-0 align-bottom">
                  <div className="relative h-28 bg-slate-100 overflow-hidden">
                    <HeaderPhotoDisplay
                      headerPhotoUrl={school.headerPhotoUrl}
                      heroImage={school.heroImage}
                      schoolName={school.name}
                      height="h-28"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      {school.logoUrl && (
                        <img src={school.logoUrl} alt="" className="h-5 w-5 rounded object-cover mb-1 border border-white/30" />
                      )}
                      <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{school.name}</p>
                      <p className="text-white/70 text-xs">{[school.city, school.provinceState].filter(Boolean).join(', ')}</p>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {SECTIONS.map(section => {
              // Special case: priorities section
              if (section.key === '_priorities') {
                if (!familyProfile || priorityRows.length === 0) return null;
                return (
                  <>
                    {/* Section heading */}
                    <tr key="_priorities-heading">
                      <td colSpan={colCount + 1} className="bg-teal-50 px-4 py-2 border-b border-teal-100">
                        <span className="text-xs font-bold text-teal-700 uppercase tracking-wide">{section.title}</span>
                      </td>
                    </tr>
                    {priorityRows.map(row => (
                      <tr key={`_pri_${row.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-xs font-medium text-slate-600 sticky left-0 bg-inherit z-[1] align-middle">
                          {row.label}
                        </td>
                        {schools.map(school => {
                          const cell = getPriorityCell(row.id, school, familyProfile);
                          if (!cell) return <td key={school.id} className="px-4 py-2.5 text-xs text-slate-300 italic border-l border-l-slate-100">—</td>;
                          return (
                            <td key={school.id} className="px-4 py-2.5 border-l border-l-slate-100 align-middle">
                              <div className="flex items-center gap-1.5">
                                <StatusIcon status={cell.status} />
                                <span className={`text-xs ${
                                  cell.status === 'match' ? 'text-slate-700' :
                                  cell.status === 'mismatch' ? 'text-slate-400' :
                                  'text-slate-400 italic'
                                }`}>{cell.detail}</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                );
              }

              // Filter rows that have at least one non-null value across schools
              const visibleRows = section.rows.filter(row =>
                schools.some(s => getCellValue(row, s) != null)
              );
              if (visibleRows.length === 0) return null;

              return (
                <>
                  <tr key={`${section.title}-heading`}>
                    <td colSpan={colCount + 1} className="bg-slate-100 px-4 py-2 border-b border-slate-200">
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{section.title}</span>
                    </td>
                  </tr>
                  {visibleRows.map((row, i) => (
                    <tr key={row.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-slate-50/80`}>
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-500 sticky left-0 bg-inherit z-[1] align-middle">
                        {row.label}
                      </td>
                      {schools.map(school => {
                        const val = getCellValue(row, school);
                        return (
                          <td key={school.id} className="px-4 py-2.5 text-xs text-slate-700 border-l border-l-slate-100 align-middle">
                            {val ?? <span className="text-slate-300 italic">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}