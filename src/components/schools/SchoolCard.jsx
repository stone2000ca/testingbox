import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Heart, DollarSign, Users, Navigation, Check, AlertTriangle, X, Circle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HeaderPhotoDisplay, LogoDisplay, isClearbitUrl } from '@/components/schools/HeaderPhotoHelper';

// =============================================================================
// T-RES-002: Tuition Band Utility
// =============================================================================
function getTuitionBand(school) {
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
// T-RES-001: Priority Checkmarks Builder
// =============================================================================
function buildPriorityChecks(school, familyProfile) {
  if (!familyProfile) return [];

  const rows = [];

  // Row 0 - Distance
  if (school.distanceKm != null) {
    const match = school.distanceKm <= 50;
    rows.push({
      id: 'distance',
      rowNum: 0,
      label: 'Distance',
      status: match ? 'match' : 'mismatch',
      detail: match ? `${school.distanceKm.toFixed(1)} km away` : `${school.distanceKm.toFixed(1)} km away`,
    });
  }

  // Row 1 - Grade
  if (familyProfile.childGrade != null) {
    const grade = Number(familyProfile.childGrade);
    const lo = school.lowestGrade != null ? Number(school.lowestGrade) : null;
    const hi = school.highestGrade != null ? Number(school.highestGrade) : null;
    if (lo != null && hi != null) {
      const match = grade >= lo && grade <= hi;
      rows.push({
        id: 'grade',
        rowNum: 1,
        label: 'Grade',
        status: match ? 'match' : 'mismatch',
        detail: match ? `Gr ${lo}–${hi} ✓` : `School: Gr ${lo}–${hi}`,
      });
    }
  }

  // Row 2 - Budget
  if (familyProfile.maxTuition) {
    const budget = Number(familyProfile.maxTuition);
    const tuitionVal = school.dayTuition ?? school.tuition;
    if (tuitionVal == null) {
      rows.push({ id: 'budget', rowNum: 2, label: 'Budget', status: 'unknown', detail: 'Worth asking about' });
    } else {
      const match = tuitionVal <= budget;
      rows.push({
        id: 'budget',
        rowNum: 2,
        label: 'Budget',
        status: match ? 'match' : 'mismatch',
        detail: match ? 'Within budget' : 'Above budget',
      });
    }
  }

  // Row 3 - Gender
  if (familyProfile.gender) {
    const gp = school.genderPolicy;
    if (!gp) {
      rows.push({ id: 'gender', rowNum: 3, label: 'Gender', status: 'unknown', detail: 'Worth asking about' });
    } else {
      let match = true;
      if (gp === 'Co-ed' || gp === 'Co-ed with single-gender classes') {
        match = true;
      } else if (gp === 'All-Boys') {
        match = familyProfile.gender === 'male';
      } else if (gp === 'All-Girls') {
        match = familyProfile.gender === 'female';
      }
      if (!match) console.log('GENDER-MISMATCH:', school.name, gp, familyProfile.gender);
      rows.push({
        id: 'gender',
        rowNum: 3,
        label: 'Gender',
        status: match ? 'match' : 'mismatch',
        detail: gp,
      });
    }
  }

  // Row 4 - Curriculum
  if (familyProfile.curriculumPreference && familyProfile.curriculumPreference.length > 0) {
    const prefs = familyProfile.curriculumPreference.map(p => p.toLowerCase());
    const ct = (school.curriculumType || '').toLowerCase();
    if (!ct) {
      rows.push({ id: 'curriculum', rowNum: 4, label: 'Curriculum', status: 'unknown', detail: 'Worth asking about' });
    } else {
      const match = prefs.some(p => ct.includes(p) || p.includes(ct));
      rows.push({
        id: 'curriculum',
        rowNum: 4,
        label: 'Curriculum',
        status: match ? 'match' : 'mismatch',
        detail: school.curriculumType,
      });
    }
  }

  // Row 5 - Religious (skip if no preference or 'none'/'non-denominational')
  if (familyProfile.religiousPreference && !/none|non-denom/i.test(familyProfile.religiousPreference)) {
    const aff = school.religiousAffiliation;
    if (!aff) {
      rows.push({ id: 'religious', rowNum: 5, label: 'Religious', status: 'unknown', detail: 'Worth asking about' });
    } else {
      const match = aff.toLowerCase().includes(familyProfile.religiousPreference.toLowerCase());
      rows.push({ id: 'religious', rowNum: 5, label: 'Religious', status: match ? 'match' : 'mismatch', detail: aff });
    }
  }

  // Row 6 - Boarding
  const wantsBoarding = familyProfile.boardingPreference === 'open_to_boarding' || familyProfile.boardingPreference === 'boarding_preferred';
  if (wantsBoarding) {
    if (school.boardingAvailable == null) {
      rows.push({ id: 'boarding', rowNum: 6, label: 'Boarding', status: 'unknown', detail: 'Worth asking about' });
    } else {
      rows.push({
        id: 'boarding',
        rowNum: 6,
        label: 'Boarding',
        status: school.boardingAvailable ? 'match' : 'mismatch',
        detail: school.boardingAvailable ? 'Boarding available' : 'Day school only',
      });
    }
  }

  // Row 7 - Class Size
  const wantsSmallClasses = familyProfile.priorities?.some(p => /class size|small class/i.test(p)) ||
    familyProfile.dealbreakers?.some(p => /class size|small class/i.test(p));
  if (wantsSmallClasses) {
    const cs = school.avgClassSize ?? school.averageClassSize;
    if (cs == null) {
      rows.push({ id: 'classSize', rowNum: 7, label: 'Class Size', status: 'unknown', detail: 'Worth asking about' });
    } else {
      rows.push({
        id: 'classSize',
        rowNum: 7,
        label: 'Class Size',
        status: cs < 20 ? 'match' : 'mismatch',
        detail: `Avg ${cs} students`,
      });
    }
  }

  // Row 8 - Learning Support
  const wantsLS = familyProfile.learningDifferences?.length > 0 ||
    familyProfile.priorities?.some(p => /learning support|special needs|adhd/i.test(p));
  if (wantsLS) {
    const hasLS = school.specialEdPrograms?.length > 0;
    if (hasLS == null || school.specialEdPrograms == null) {
      rows.push({ id: 'learningSupport', rowNum: 8, label: 'Learning Support', status: 'unknown', detail: 'Worth asking about' });
    } else {
      rows.push({
        id: 'learningSupport',
        rowNum: 8,
        label: 'Learning Support',
        status: hasLS ? 'match' : 'mismatch',
        detail: hasLS ? 'Support programs available' : 'Not listed',
      });
    }
  }

  // Row 9 - Language
  if (familyProfile.languagePreference && !/^english$/i.test(familyProfile.languagePreference)) {
    const li = school.languageOfInstruction;
    if (!li) {
      rows.push({ id: 'language', rowNum: 9, label: 'Language', status: 'unknown', detail: 'Worth asking about' });
    } else {
      const match = li.toLowerCase().includes(familyProfile.languagePreference.toLowerCase());
      rows.push({ id: 'language', rowNum: 9, label: 'Language', status: match ? 'match' : 'mismatch', detail: li });
    }
  }

  // Sort: dealbreaker rows first, then by rowNum
  const dbRows = mapDealbreakersToRows(familyProfile.dealbreakers || []);
  rows.sort((a, b) => {
    const aDB = dbRows.includes(a.id) ? 0 : 1;
    const bDB = dbRows.includes(b.id) ? 0 : 1;
    if (aDB !== bDB) return aDB - bDB;
    return a.rowNum - b.rowNum;
  });

  // Apply rules: count data-backed rows (match or mismatch, not unknown)
  const dataBacked = rows.filter(r => r.status !== 'unknown').length;
  if (dataBacked < 3) return []; // fall back to commentary-only

  // Max 1 circle: drop extra unknowns
  let circleCount = 0;
  const filtered = rows.filter(r => {
    if (r.status === 'unknown') {
      circleCount++;
      return circleCount <= 1;
    }
    return true;
  });

  // Soft cap at 6
  return filtered.slice(0, 6);
}

export default function SchoolCard({ school, onViewDetails, onToggleShortlist, isShortlisted, index = 0, accentColor = "#0D9488", familyProfile = null }) {
  const getCurrencySymbol = (currency) => {
    const symbols = { CAD: 'CA$', USD: '$', EUR: '€', GBP: '£' };
    return symbols[currency] || '$';
  };

  const getRegionBadge = (region) => {
    const badges = {
      Canada: { emoji: '🍁', color: 'bg-red-50 text-red-700' },
      US: { emoji: '🇺🇸', color: 'bg-blue-50 text-blue-700' },
      Europe: { emoji: '🇪🇺', color: 'bg-indigo-50 text-indigo-700' }
    };
    return badges[region] || { emoji: '🌍', color: 'bg-slate-50 text-slate-700' };
  };

  function formatGrade(grade) {
    if (grade === null || grade === undefined) return '';
    const num = Number(grade);
    if (num <= -2) return 'PK';
    if (num === -1) return 'JK';
    if (num === 0) return 'K';
    return String(num);
  }

  function formatGradeRange(gradeFrom, gradeTo) {
    const from = formatGrade(gradeFrom);
    const to = formatGrade(gradeTo);
    if (!from && !to) return '';
    if (!from) return to;
    if (!to) return from;
    return `${from}-${to}`;
  }

  const badge = getRegionBadge(school.region);
  const tuitionBand = getTuitionBand(school);
  const priorityChecks = buildPriorityChecks(school, familyProfile);
  const showChecklist = priorityChecks.length > 0;

  return (
    <Card 
      className="overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group school-card h-full flex flex-col focus-within:ring-2 focus-within:ring-offset-2"
      style={{
        animation: 'fadeSlideUp 0.4s ease-out',
        animationDelay: `${index * 0.1}s`,
        animationFillMode: 'backwards',
        '--accent-color': accentColor
      }}
      onClick={onViewDetails}
      role="button"
      tabIndex={0}
      aria-label={`View ${school.name} school profile`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onViewDetails();
        }
      }}
    >
      <style jsx>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .group:hover {
          border-color: var(--accent-color);
        }
      `}</style>
      <div className="flex-1 flex flex-col">
        {/* Image */}
        <div className="relative h-40 sm:h-48 bg-slate-200 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-300 to-slate-400" />
          <div className="absolute inset-0 group-hover:scale-105 transition-transform duration-300">
            <HeaderPhotoDisplay 
              headerPhotoUrl={school.headerPhotoUrl}
              heroImage={school.heroImage}
              schoolName={school.name}
              height="h-40 sm:h-48"
            />
          </div>
          {/* Region Badge */}
          <div className={`absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
            {badge.emoji} {school.region}
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4 flex-1 flex flex-col">
          <div className="flex items-start gap-2 mb-2">
            <LogoDisplay logoUrl={school.logoUrl} schoolName={school.name} schoolWebsite={school.website} size="h-4 sm:h-5 w-4 sm:w-5" />
            <h3 className="font-bold text-base sm:text-lg line-clamp-2 flex-1">{school.name}</h3>
          </div>
          <div className="flex items-center gap-1 text-xs sm:text-sm text-slate-600 mb-3">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="line-clamp-1">{school.city}, {school.provinceState}</span>
          </div>
          
          {school.distanceKm && (
            <div className="mb-3">
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-700 rounded-md text-xs font-medium">
                <Navigation className="h-3 w-3" />
                {school.distanceKm.toFixed(1)} km away
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-3 text-xs">
            <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md">
              {formatGradeRange(school.lowestGrade, school.highestGrade)}
            </span>
            <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md">
              {school.curriculumType}
            </span>
            {school.enrollment && (
              <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md">
                {school.enrollment} students
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-slate-900 font-semibold text-xs sm:text-sm mb-3">
            <DollarSign className="h-3 sm:h-4 w-3 sm:w-4 flex-shrink-0" />
            <span className="line-clamp-1">
              {school.dayTuition && school.boardingTuition ? (
                <span className="text-xs">
                  {getCurrencySymbol(school.currency)}{school.dayTuition.toLocaleString()} (day) / {getCurrencySymbol(school.currency)}{school.boardingTuition.toLocaleString()} (boarding)
                </span>
              ) : school.dayTuition ? (
                <>
                  {getCurrencySymbol(school.currency)}{school.dayTuition.toLocaleString()}
                  <span className="text-xs text-slate-500 font-normal ml-1">(day)</span>
                </>
              ) : school.boardingTuition ? (
                <>
                  {getCurrencySymbol(school.currency)}{school.boardingTuition.toLocaleString()}
                  <span className="text-xs text-slate-500 font-normal ml-1">(boarding)</span>
                </>
              ) : (
                <>
                  {getCurrencySymbol(school.currency)}{school.tuition?.toLocaleString() || 'N/A'}
                  <span className="text-xs text-slate-500 font-normal ml-1">/year</span>
                </>
              )}
            </span>
          </div>

          {/* Match Explanations */}
          {school.matchExplanations && school.matchExplanations.length > 0 && (
            <>
              <div className="my-3 border-t border-slate-200" />
              <div className="space-y-2 text-xs">
                {school.matchExplanations.map((match, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    {match.type === 'positive' ? (
                      <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    )}
                    <span className={match.type === 'positive' ? 'text-slate-700' : 'text-slate-600'}>
                      {match.text}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4">
        <Button
          variant={isShortlisted ? "default" : "outline"}
          size="sm"
          className={`w-full text-xs sm:text-sm focus:ring-2 focus:ring-offset-2 ${isShortlisted ? 'bg-teal-600 hover:bg-teal-700' : ''}`}
          style={isShortlisted ? {} : { '--tw-ring-color': accentColor }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleShortlist(school.id);
          }}
          aria-label={isShortlisted ? `Remove ${school.name} from shortlist` : `Add ${school.name} to shortlist`}
        >
          <Heart className={`h-3 sm:h-4 w-3 sm:w-4 mr-2 ${isShortlisted ? 'fill-current' : ''}`} />
          {isShortlisted ? 'Shortlisted' : 'Add to Shortlist'}
        </Button>
      </div>
    </Card>
  );
}