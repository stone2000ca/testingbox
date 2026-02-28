import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Heart, DollarSign, Navigation, Check, AlertTriangle, X, Circle, ChevronDown, ChevronUp, Lock, Scale, EyeOff } from "lucide-react";
import { HeaderPhotoDisplay, LogoDisplay } from '@/components/schools/HeaderPhotoHelper';

// =============================================================================
// T-RES-002: Tuition Band Utility
// =============================================================================
export function getTuitionBand(school) {
  const val = school.dayTuition ?? school.tuition;
  if (val == null) return { label: null, display: 'Contact school' };
  if (val < 15000) return { label: '$', display: 'Under $15K' };
  if (val < 25000) return { label: '$$', display: '$15K–$25K' };
  if (val < 40000) return { label: '$$$', display: '$25K–$40K' };
  return { label: '$$$$', display: '$40K+' };
}

// =============================================================================
// T-RES-001: Dealbreaker Keyword Mapper
// =============================================================================
function mapDealbreakersToRows(dealbreakers) {
  if (!dealbreakers || dealbreakers.length === 0) return [];
  const rowIds = new Set();
  const text = dealbreakers.join(' ').toLowerCase();
  if (/class size|small class/.test(text)) rowIds.add('classSize');
  if (/co-ed|coed|boys|girls|all-boys|all-girls|gender/.test(text)) rowIds.add('gender');
  if (/french|immersion|bilingual|language/.test(text)) rowIds.add('language');
  if (/close|commute|distance|nearby/.test(text)) rowIds.add('distance');
  if (/religious|catholic|christian|jewish|muslim|faith/.test(text)) rowIds.add('religious');
  if (/boarding|residential/.test(text)) rowIds.add('boarding');
  if (/learning support|special needs|adhd|learning disability/.test(text)) rowIds.add('learningSupport');
  if (/budget|affordable|cost|tuition/.test(text)) rowIds.add('budget');
  if (/\bib\b|ap\b|montessori|curriculum|waldorf|reggio/.test(text)) rowIds.add('curriculum');
  return Array.from(rowIds);
}

// =============================================================================
// T-RES-001: Priority Checkmarks Builder (exported for scoring)
// =============================================================================
export function buildPriorityChecks(school, familyProfile) {
  if (!familyProfile) return [];

  const rows = [];

  if (school.distanceKm != null) {
    const match = school.distanceKm <= 50;
    rows.push({ id: 'distance', rowNum: 0, label: 'Distance', status: match ? 'match' : 'mismatch', detail: `${school.distanceKm.toFixed(1)} km away` });
  }

  if (familyProfile.childGrade != null) {
    const grade = Number(familyProfile.childGrade);
    const lo = school.lowestGrade != null ? Number(school.lowestGrade) : null;
    const hi = school.highestGrade != null ? Number(school.highestGrade) : null;
    if (lo != null && hi != null) {
      const match = grade >= lo && grade <= hi;
      rows.push({ id: 'grade', rowNum: 1, label: 'Grade', status: match ? 'match' : 'mismatch', detail: match ? `Gr ${lo}–${hi} ✓` : `School: Gr ${lo}–${hi}` });
    }
  }

  if (familyProfile.maxTuition) {
    const budget = Number(familyProfile.maxTuition);
    const tuitionVal = school.dayTuition ?? school.tuition;
    if (tuitionVal == null) {
      rows.push({ id: 'budget', rowNum: 2, label: 'Budget', status: 'unknown', detail: 'Worth asking about' });
    } else {
      rows.push({ id: 'budget', rowNum: 2, label: 'Budget', status: tuitionVal <= budget ? 'match' : 'mismatch', detail: tuitionVal <= budget ? 'Within budget' : 'Above budget' });
    }
  }

  if (familyProfile.gender) {
    const gp = school.genderPolicy;
    if (!gp) {
      rows.push({ id: 'gender', rowNum: 3, label: 'Gender', status: 'unknown', detail: 'Worth asking about' });
    } else {
      let match = true;
      if (gp === 'All-Boys') match = familyProfile.gender === 'male';
      else if (gp === 'All-Girls') match = familyProfile.gender === 'female';
      rows.push({ id: 'gender', rowNum: 3, label: 'Gender', status: match ? 'match' : 'mismatch', detail: gp });
    }
  }

  if (familyProfile.curriculumPreference && familyProfile.curriculumPreference.length > 0) {
    const prefs = familyProfile.curriculumPreference.map(p => p.toLowerCase());
    const ct = (school.curriculumType || '').toLowerCase();
    if (!ct) {
      rows.push({ id: 'curriculum', rowNum: 4, label: 'Curriculum', status: 'unknown', detail: 'Worth asking about' });
    } else {
      rows.push({ id: 'curriculum', rowNum: 4, label: 'Curriculum', status: prefs.some(p => ct.includes(p) || p.includes(ct)) ? 'match' : 'mismatch', detail: school.curriculumType });
    }
  }

  if (familyProfile.religiousPreference && !/none|non-denom/i.test(familyProfile.religiousPreference)) {
    const aff = school.religiousAffiliation;
    if (!aff) {
      rows.push({ id: 'religious', rowNum: 5, label: 'Religious', status: 'unknown', detail: 'Worth asking about' });
    } else {
      rows.push({ id: 'religious', rowNum: 5, label: 'Religious', status: aff.toLowerCase().includes(familyProfile.religiousPreference.toLowerCase()) ? 'match' : 'mismatch', detail: aff });
    }
  }

  const wantsBoarding = familyProfile.boardingPreference === 'open_to_boarding' || familyProfile.boardingPreference === 'boarding_preferred';
  if (wantsBoarding) {
    if (school.boardingAvailable == null) {
      rows.push({ id: 'boarding', rowNum: 6, label: 'Boarding', status: 'unknown', detail: 'Worth asking about' });
    } else {
      rows.push({ id: 'boarding', rowNum: 6, label: 'Boarding', status: school.boardingAvailable ? 'match' : 'mismatch', detail: school.boardingAvailable ? 'Boarding available' : 'Day school only' });
    }
  }

  const wantsSmallClasses = familyProfile.priorities?.some(p => /class size|small class/i.test(p)) || familyProfile.dealbreakers?.some(p => /class size|small class/i.test(p));
  if (wantsSmallClasses) {
    const cs = school.avgClassSize ?? school.averageClassSize;
    if (cs == null) {
      rows.push({ id: 'classSize', rowNum: 7, label: 'Class Size', status: 'unknown', detail: 'Worth asking about' });
    } else {
      rows.push({ id: 'classSize', rowNum: 7, label: 'Class Size', status: cs < 20 ? 'match' : 'mismatch', detail: `Avg ${cs} students` });
    }
  }

  const wantsLS = familyProfile.learningDifferences?.length > 0 || familyProfile.priorities?.some(p => /learning support|special needs|adhd/i.test(p));
  if (wantsLS) {
    const hasLS = school.specialEdPrograms?.length > 0;
    if (school.specialEdPrograms == null) {
      rows.push({ id: 'learningSupport', rowNum: 8, label: 'Learning Support', status: 'unknown', detail: 'Worth asking about' });
    } else {
      rows.push({ id: 'learningSupport', rowNum: 8, label: 'Learning Support', status: hasLS ? 'match' : 'mismatch', detail: hasLS ? 'Support programs available' : 'Not listed' });
    }
  }

  if (familyProfile.languagePreference && !/^english$/i.test(familyProfile.languagePreference)) {
    const li = school.languageOfInstruction;
    if (!li) {
      rows.push({ id: 'language', rowNum: 9, label: 'Language', status: 'unknown', detail: 'Worth asking about' });
    } else {
      rows.push({ id: 'language', rowNum: 9, label: 'Language', status: li.toLowerCase().includes(familyProfile.languagePreference.toLowerCase()) ? 'match' : 'mismatch', detail: li });
    }
  }

  const dbRows = mapDealbreakersToRows(familyProfile.dealbreakers || []);
  rows.sort((a, b) => {
    const aDB = dbRows.includes(a.id) ? 0 : 1;
    const bDB = dbRows.includes(b.id) ? 0 : 1;
    if (aDB !== bDB) return aDB - bDB;
    return a.rowNum - b.rowNum;
  });

  const dataBacked = rows.filter(r => r.status !== 'unknown').length;
  if (dataBacked < 3) return [];

  let circleCount = 0;
  const filtered = rows.filter(r => {
    if (r.status === 'unknown') { circleCount++; return circleCount <= 1; }
    return true;
  });

  return filtered.slice(0, 6);
}

// =============================================================================
// CheckmarkIcon helper
// =============================================================================
function CheckIcon({ status }) {
  if (status === 'match') return <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />;
  if (status === 'mismatch') return <X className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />;
  return <Circle className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />;
}

// Priority flex state icons
const FLEX_STATES = ['nicetohave', 'musthave', 'dontcare'];
const FLEX_ICONS = {
  musthave:   { icon: Lock,   label: 'Must Have',   cls: 'text-teal-600' },
  nicetohave: { icon: Scale,  label: 'Nice to Have', cls: 'text-slate-400' },
  dontcare:   { icon: EyeOff, label: "Don't Care",  cls: 'text-slate-300' },
};

function FlexButton({ rowId, state, onToggle, totalActive }) {
  const cfg = FLEX_ICONS[state] || FLEX_ICONS.nicetohave;
  const Icon = cfg.icon;
  const isDisabled = state !== 'dontcare' && totalActive <= 1;
  return (
    <button
      title={`${cfg.label} — click to change`}
      disabled={isDisabled}
      onClick={(e) => { e.stopPropagation(); onToggle(rowId); }}
      className={`ml-auto flex-shrink-0 transition-opacity ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-70'} ${cfg.cls}`}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}

// =============================================================================
// T-RES-004: SchoolCard with collapsed / expanded states
// =============================================================================
export default function SchoolCard({ school, onViewDetails, onToggleShortlist, isShortlisted, index = 0, accentColor = "#0D9488", familyProfile = null, priorityOverrides = {}, onPriorityToggle = null }) {
  const [isExpanded, setIsExpanded] = useState(false);

  function formatGrade(grade) {
    if (grade === null || grade === undefined) return '';
    const num = Number(grade);
    if (num <= -2) return 'PK';
    if (num === -1) return 'JK';
    if (num === 0) return 'K';
    return String(num);
  }

  function formatGradeRange(from, to) {
    const f = formatGrade(from), t = formatGrade(to);
    if (!f && !t) return '';
    if (!f) return t;
    if (!t) return f;
    return `${f}–${t}`;
  }

  const tuitionBand = getTuitionBand(school);
  const priorityChecks = buildPriorityChecks(school, familyProfile);
  const greenCount = priorityChecks.filter(r => r.status === 'match').length;
  const totalChecks = priorityChecks.length;
  const hasChecks = totalChecks > 0;

  const rationale = school.matchExplanations?.[0]?.text?.split('.')[0];

  return (
    <Card
      className="overflow-hidden transition-all duration-300 group school-card flex flex-col"
      style={{ '--accent-color': accentColor }}
    >
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Photo */}
      <div className="relative h-36 bg-slate-200 overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-300 to-slate-400" />
        <div className="absolute inset-0">
          <HeaderPhotoDisplay
            headerPhotoUrl={school.headerPhotoUrl}
            heroImage={school.heroImage}
            schoolName={school.name}
            height="h-36"
          />
        </div>
        {/* Checkmark summary badge — always visible */}
        {hasChecks && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm">
            <Check className="h-3 w-3 text-green-600" />
            {greenCount}/{totalChecks}
          </div>
        )}
      </div>

      {/* Collapsed content — always visible */}
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <LogoDisplay logoUrl={school.logoUrl} schoolName={school.name} schoolWebsite={school.website} size="h-4 w-4" />
          <h3 className="font-bold text-sm leading-tight line-clamp-2 flex-1">{school.name}</h3>
        </div>

        <div className="flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="h-3 w-3 flex-shrink-0" />
          <span className="line-clamp-1">{school.city}{school.provinceState ? `, ${school.provinceState}` : ''}</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
          {school.distanceKm != null && (
            <span className="inline-flex items-center gap-1 text-teal-700 font-medium">
              <Navigation className="h-3 w-3" />{school.distanceKm.toFixed(1)} km
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-slate-600">
            <DollarSign className="h-3 w-3" />
            {tuitionBand.label ? <><strong>{tuitionBand.label}</strong> {tuitionBand.display}</> : <span className="italic text-slate-400">{tuitionBand.display}</span>}
          </span>
        </div>

        {/* Grades + curriculum chips */}
        <div className="flex flex-wrap gap-1.5 text-xs">
          {formatGradeRange(school.lowestGrade, school.highestGrade) && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">{formatGradeRange(school.lowestGrade, school.highestGrade)}</span>
          )}
          {school.curriculumType && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">{school.curriculumType}</span>
          )}
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-2 border-t border-slate-100 pt-2 space-y-2">
            {rationale && (
              <p className="text-xs text-slate-500 line-clamp-2">{rationale}.</p>
            )}
            {hasChecks && (() => {
              // Count active (non-dontcare) priorities for guard
              const activeCount = priorityChecks.filter(r => (priorityOverrides[r.id] || 'nicetohave') !== 'dontcare').length;
              return (
                <div className="space-y-1.5">
                  {priorityChecks.map((row) => {
                    const flexState = priorityOverrides[row.id] || 'nicetohave';
                    const isDontCare = flexState === 'dontcare';
                    return (
                      <div key={row.id} className={`flex items-center gap-2 text-xs ${isDontCare ? 'opacity-40' : ''}`}>
                        <CheckIcon status={row.status} />
                        <span className={`font-medium ${row.status === 'match' ? 'text-slate-700' : row.status === 'mismatch' ? 'text-slate-500' : 'text-slate-400'}`}>{row.label}</span>
                        <span className="text-slate-400 truncate flex-1">{row.detail}</span>
                        {onPriorityToggle && (
                          <FlexButton rowId={row.id} state={flexState} onToggle={onPriorityToggle} totalActive={activeCount} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {!hasChecks && school.matchExplanations?.length > 0 && (
              <div className="space-y-1.5">
                {school.matchExplanations.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {m.type === 'positive'
                      ? <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                      : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />}
                    <span className={m.type === 'positive' ? 'text-slate-700' : 'text-slate-500'}>{m.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 mt-auto flex flex-col gap-2">
        {/* Expand / collapse toggle */}
        <button
          className="w-full flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
          onClick={() => setIsExpanded(e => !e)}
          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
        >
          {isExpanded ? <><ChevronUp className="h-3.5 w-3.5" /> Less</> : <><ChevronDown className="h-3.5 w-3.5" /> {hasChecks ? `${greenCount}/${totalChecks} match` : 'Details'}</>}
        </button>

        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 text-xs bg-teal-600 hover:bg-teal-700 text-white"
            onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
          >
            View Details
          </Button>
          <Button
            variant={isShortlisted ? "default" : "outline"}
            size="sm"
            className={`text-xs px-2 ${isShortlisted ? 'bg-slate-800 hover:bg-slate-700' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleShortlist(school.id); }}
            aria-label={isShortlisted ? `Remove ${school.name} from shortlist` : `Add ${school.name} to shortlist`}
          >
            <Heart className={`h-3.5 w-3.5 ${isShortlisted ? 'fill-current' : ''}`} />
          </Button>
        </div>
      </div>
    </Card>
  );
}