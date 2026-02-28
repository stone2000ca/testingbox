import { Button } from "@/components/ui/button";
import { ArrowLeft, Heart, ExternalLink, Zap, Check, X } from "lucide-react";

function gradeLabel(grade) {
  if (grade === null || grade === undefined) return '?';
  if (grade === -2) return 'PK';
  if (grade === -1) return 'JK';
  if (grade === 0) return 'K';
  return String(grade);
}

function calculateMatchScore(school, familyProfile) {
  if (!familyProfile) return 'Explore';
  
  let score = 0;
  const maxScore = 10;
  
  // Grade match
  const childGrade = familyProfile.childGrade;
  if (childGrade !== null && childGrade !== undefined) {
    const schoolServes = childGrade >= school.lowestGrade && childGrade <= school.highestGrade;
    if (schoolServes) score += 2;
  }
  
  // Budget match
  if (familyProfile.maxTuition && school.dayTuition) {
    if (school.dayTuition <= familyProfile.maxTuition) score += 2;
    else if (school.dayTuition <= familyProfile.maxTuition * 1.2) score += 1;
  }
  
  // Gender match
  if (familyProfile.gender && school.genderPolicy) {
    const isSingleGender = school.genderPolicy.includes(familyProfile.gender === 'male' ? 'Boy' : 'Girl');
    if (isSingleGender && familyProfile.boardingPreference === 'no') score += 1;
    if (school.genderPolicy === 'Co-ed' && !isSingleGender) score += 1;
  }
  
  // Priority matches
  if (familyProfile.priorities?.length > 0) {
    const specializations = (school.specializations || []).map(s => s.toLowerCase());
    const curriculumStr = (school.curriculum || []).join(' ').toLowerCase();
    const allStr = `${specializations.join(' ')} ${curriculumStr}`.toLowerCase();
    
    let priorityMatches = 0;
    familyProfile.priorities.forEach(p => {
      if (allStr.includes(p.toLowerCase())) priorityMatches++;
    });
    score += Math.min(priorityMatches * 2, 3);
  }
  
  if (score >= 8) return 'Strong';
  if (score >= 5) return 'Good';
  return 'Explore';
}

function getMatchReasons(school, familyProfile) {
  const reasons = [];
  if (!familyProfile) return reasons;
  
  // Grade
  const childGrade = familyProfile.childGrade;
  if (childGrade !== null && childGrade !== undefined && childGrade >= school.lowestGrade && childGrade <= school.highestGrade) {
    reasons.push(`Serves Grade ${gradeLabel(childGrade)}`);
  }
  
  // Budget
  if (familyProfile.maxTuition && school.dayTuition && school.dayTuition <= familyProfile.maxTuition) {
    reasons.push(`Within budget ($${school.dayTuition.toLocaleString()})`);
  }
  
  // Specializations matching priorities
  if (familyProfile.priorities?.length > 0) {
    const specializations = (school.specializations || []).map(s => s.toLowerCase());
    const curriculumStr = (school.curriculum || []).join(' ').toLowerCase();
    const allStr = `${specializations.join(' ')} ${curriculumStr}`.toLowerCase();
    
    const matchedPriorities = familyProfile.priorities.filter(p => allStr.includes(p.toLowerCase()));
    if (matchedPriorities.length > 0) {
      reasons.push(`${matchedPriorities.slice(0, 2).join(' & ')} focus`);
    }
  }
  
  // Boarding
  if (familyProfile.boardingPreference?.includes('boarding') && school.boardingAvailable) {
    reasons.push('Boarding available');
  }
  
  return reasons.slice(0, 4);
}

// TIER 1: Hero Section
function HeroTier({ school, familyProfile, matchScore, matchReasons }) {
  const accentColor = 'teal';
  
  return (
    <div className="relative h-96 bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden">
      {school.headerPhotoUrl || school.heroImage ? (
        <img
          src={school.headerPhotoUrl || school.heroImage}
          alt={school.name}
          className="w-full h-full object-cover opacity-70"
        />
      ) : null}
      
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
      
      <div className="absolute bottom-0 left-0 right-0 p-6 text-white space-y-4">
        <div>
          <h1 className="text-4xl font-bold">{school.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span>{school.city}, {school.provinceState}</span>
            {school.schoolType && <span className="px-3 py-1 bg-white/20 rounded-full">{school.schoolType}</span>}
            {school.gradesServed && <span className="px-3 py-1 bg-white/20 rounded-full">Grades {school.gradesServed}</span>}
            {school.genderPolicy && <span className="px-3 py-1 bg-white/20 rounded-full">{school.genderPolicy}</span>}
          </div>
        </div>
        
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            {matchReasons.length > 0 && (
              <div className="text-xs space-y-1">
                {matchReasons.map((reason, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-teal-300">
                    <Check className="h-3 w-3" />
                    {reason}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className={`px-4 py-2 rounded-lg font-semibold text-sm ${
            matchScore === 'Strong' ? 'bg-emerald-500/90 text-white' :
            matchScore === 'Good' ? 'bg-amber-500/90 text-white' :
            'bg-slate-500/90 text-white'
          }`}>
            {matchScore} Match
          </div>
        </div>
      </div>
    </div>
  );
}

// TIER 2: Data Grid
function DataGridTier({ school, familyProfile }) {
  const gridItems = [
    { label: 'Enrollment', value: school.enrollment?.toLocaleString() || 'N/A', key: 'enrollment' },
    { label: 'Class Size', value: school.avgClassSize || 'N/A', key: 'classSize' },
    { label: 'Student-Teacher Ratio', value: school.studentTeacherRatio || 'N/A', key: 'ratio' },
    { label: 'Tuition (Day)', value: school.dayTuition ? `$${school.dayTuition.toLocaleString()}` : 'N/A', key: 'dayTuition', priority: familyProfile?.maxTuition },
    { label: 'Tuition (Boarding)', value: school.boardingTuition ? `$${school.boardingTuition.toLocaleString()}` : 'N/A', key: 'boardingTuition' },
    { label: 'Boarding', value: school.boardingAvailable ? 'Available' : 'Day Only', key: 'boarding', priority: familyProfile?.boardingPreference },
    { label: 'Religion', value: school.religiousAffiliation || 'Non-religious', key: 'religion' },
    { label: 'Language', value: school.languageOfInstruction || 'English', key: 'language' },
    { label: 'Founded', value: school.founded || 'N/A', key: 'founded' },
  ];
  
  const isPriority = (key) => {
    if (key === 'dayTuition' && familyProfile?.maxTuition) return true;
    if (key === 'boarding' && familyProfile?.boardingPreference) return true;
    return false;
  };
  
  return (
    <div className="grid grid-cols-2 gap-4 p-6 border-b border-slate-700">
      {gridItems.filter(item => item.value !== 'N/A').map((item) => (
        <div key={item.key} className={`p-4 rounded-lg ${isPriority(item.key) ? 'bg-teal-500/10 border border-teal-500/30' : 'bg-slate-800/50'}`}>
          <p className={`text-xs ${isPriority(item.key) ? 'text-teal-400' : 'text-slate-400'}`}>{item.label}</p>
          <p className={`text-lg font-semibold mt-1 ${isPriority(item.key) ? 'text-teal-300' : 'text-white'}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

// TIER 3: Detailed Sections
function DetailedSectionsTier({ school }) {
  return (
    <div className="p-6 space-y-8 border-b border-slate-700">
      {/* About */}
      {(school.description || school.missionStatement) && (
        <div>
          <h3 className="text-lg font-bold text-white mb-3">About</h3>
          {school.missionStatement && (
            <p className="text-sm text-slate-300 mb-3 italic">"{school.missionStatement}"</p>
          )}
          {school.description && (
            <p className="text-sm text-slate-400">{school.description}</p>
          )}
        </div>
      )}
      
      {/* Curriculum */}
      <div>
        <h3 className="text-lg font-bold text-white mb-3">Curriculum & Specializations</h3>
        <div className="space-y-2">
          {school.curriculumType && (
            <p className="text-sm text-slate-300"><span className="font-semibold">Type:</span> {school.curriculumType}</p>
          )}
          {school.curriculum?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {school.curriculum.map((curr, idx) => (
                <span key={idx} className="px-3 py-1 bg-teal-500/20 text-teal-300 rounded-full text-xs">
                  {curr}
                </span>
              ))}
            </div>
          )}
          {school.specializations?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {school.specializations.map((spec, idx) => (
                <span key={idx} className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs">
                  {spec}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Programs */}
      {(school.artsPrograms?.length > 0 || school.sportsPrograms?.length > 0 || school.clubs?.length > 0) && (
        <div>
          <h3 className="text-lg font-bold text-white mb-3">Programs & Activities</h3>
          <div className="space-y-3">
            {school.artsPrograms?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-teal-300 mb-2">Arts</p>
                <div className="flex flex-wrap gap-2">
                  {school.artsPrograms.slice(0, 6).map((prog, idx) => (
                    <span key={idx} className="text-xs text-slate-400">{prog}</span>
                  ))}
                </div>
              </div>
            )}
            {school.sportsPrograms?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-300 mb-2">Sports</p>
                <div className="flex flex-wrap gap-2">
                  {school.sportsPrograms.slice(0, 6).map((prog, idx) => (
                    <span key={idx} className="text-xs text-slate-400">{prog}</span>
                  ))}
                </div>
              </div>
            )}
            {school.clubs?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-purple-300 mb-2">Clubs</p>
                <div className="flex flex-wrap gap-2">
                  {school.clubs.slice(0, 6).map((club, idx) => (
                    <span key={idx} className="text-xs text-slate-400">{club}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Admissions */}
      {(school.applicationDeadline || school.admissionRequirements?.length > 0 || school.openHouseDates?.length > 0) && (
        <div>
          <h3 className="text-lg font-bold text-white mb-3">Admissions</h3>
          <div className="space-y-2 text-sm text-slate-400">
            {school.applicationDeadline && (
              <p><span className="font-semibold text-slate-300">Deadline:</span> {school.applicationDeadline}</p>
            )}
            {school.admissionRequirements?.length > 0 && (
              <div>
                <p className="font-semibold text-slate-300">Requirements:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  {school.admissionRequirements.slice(0, 4).map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              </div>
            )}
            {school.openHouseDates?.length > 0 && (
              <p><span className="font-semibold text-slate-300">Open House Dates:</span> {school.openHouseDates.join(', ')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// TIER 4: Reviews/Testimonials (Placeholder)
function ReviewsTier() {
  return (
    <div className="p-6 border-b border-slate-700">
      <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        <Zap className="h-5 w-5 text-amber-400" />
        Student & Family Reviews
      </h3>
      <div className="bg-slate-800/50 rounded-lg p-8 text-center">
        <p className="text-slate-400 text-sm">Reviews coming soon. Be the first to share your experience.</p>
      </div>
    </div>
  );
}

// TIER 5: Sticky CTA Bar
function CtaBar({ school, isShortlisted, onToggleShortlist, onCompare }) {
  return (
    <div className="sticky bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-4 flex gap-3 z-40">
      <Button
        onClick={() => window.open(school.website, '_blank')}
        variant="outline"
        className="flex-1 flex items-center justify-center gap-2"
      >
        <ExternalLink className="h-4 w-4" />
        Visit Website
      </Button>
      <Button
        onClick={() => onToggleShortlist(school.id)}
        variant={isShortlisted ? 'default' : 'outline'}
        className="flex-1 flex items-center justify-center gap-2"
      >
        <Heart className={`h-4 w-4 ${isShortlisted ? 'fill-current' : ''}`} />
        {isShortlisted ? 'Shortlisted' : 'Add to Shortlist'}
      </Button>
      <Button
        onClick={() => onCompare?.(school.id)}
        variant="outline"
        className="flex-1"
      >
        Compare
      </Button>
    </div>
  );
}

export default function SchoolDetailPanel({ 
  school, 
  familyProfile,
  onBack, 
  onToggleShortlist, 
  onCompare,
  isShortlisted 
}) {
  if (!school) return null;

  const matchScore = calculateMatchScore(school, familyProfile);
  const matchReasons = getMatchReasons(school, familyProfile);

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      {/* Header with Back Button */}
      <div className="p-4 border-b border-slate-700 flex items-center gap-2 bg-slate-800/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="flex items-center gap-1 text-slate-300 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Results
        </Button>
      </div>
      
      {/* Content Tiers */}
      <div className="flex-1 overflow-auto">
        {/* TIER 1 */}
        <HeroTier school={school} familyProfile={familyProfile} matchScore={matchScore} matchReasons={matchReasons} />
        
        {/* TIER 2 */}
        <DataGridTier school={school} familyProfile={familyProfile} />
        
        {/* TIER 3 */}
        <DetailedSectionsTier school={school} />
        
        {/* TIER 4 */}
        <ReviewsTier />
      </div>
      
      {/* TIER 5 */}
      <CtaBar 
        school={school} 
        isShortlisted={isShortlisted} 
        onToggleShortlist={onToggleShortlist}
        onCompare={onCompare}
      />
    </div>
  );
}