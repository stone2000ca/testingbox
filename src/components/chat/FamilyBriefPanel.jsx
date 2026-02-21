import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Check, Circle, MapPin, DollarSign, Heart, Target, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FamilyBriefPanel({ 
  familyProfile, 
  shortlist = [], 
  isExpanded, 
  onToggleExpand,
  onSectionClick 
}) {
  const [newlyPopulated, setNewlyPopulated] = useState(null);

  // Auto-expand when new stage is populated
  useEffect(() => {
    if (!familyProfile) return;
    
    const populatedStages = getPopulatedStages();
    const prevStages = JSON.parse(localStorage.getItem('briefStages') || '[]');
    
    // Check if a new stage was populated
    const newStage = populatedStages.find(s => !prevStages.includes(s));
    if (newStage && prevStages.length > 0) {
      setNewlyPopulated(newStage);
      onToggleExpand(true);
      
      // Auto-collapse after 3 seconds
      setTimeout(() => {
        onToggleExpand(false);
        setNewlyPopulated(null);
      }, 3000);
    }
    
    localStorage.setItem('briefStages', JSON.stringify(populatedStages));
  }, [familyProfile]);

  const getPopulatedStages = () => {
    if (!familyProfile) return [];
    const stages = [];
    
    if (familyProfile.childName || familyProfile.childGrade || familyProfile.interests?.length > 0) {
      stages.push('child');
    }
    if (familyProfile.locationArea || familyProfile.commuteToleranceMinutes) {
      stages.push('location');
    }
    if (familyProfile.budgetRange || familyProfile.maxTuition) {
      stages.push('budget');
    }
    if (familyProfile.priorities?.length > 0) {
      stages.push('priorities');
    }
    if (familyProfile.dealbreakers?.length > 0) {
      stages.push('dealbreakers');
    }
    
    return stages;
  };

  const populatedStages = getPopulatedStages();
  const completeness = Math.round((populatedStages.length / 5) * 100);

  const stages = [
    {
      id: 'child',
      icon: Users,
      title: 'Your Child',
      populated: familyProfile?.childName || familyProfile?.childGrade || familyProfile?.interests?.length > 0,
      content: () => (
        <div className="space-y-1">
          {familyProfile?.childName && (
            <p className="text-sm"><span className="font-medium">Name:</span> {familyProfile.childName}</p>
          )}
          {familyProfile?.childGrade !== null && familyProfile?.childGrade !== undefined && (
            <p className="text-sm"><span className="font-medium">Grade:</span> {formatGrade(familyProfile.childGrade)}</p>
          )}
          {familyProfile?.interests?.length > 0 && (
            <p className="text-sm"><span className="font-medium">Interests:</span> {familyProfile.interests.join(', ')}</p>
          )}
        </div>
      )
    },
    {
      id: 'location',
      icon: MapPin,
      title: 'Location & Logistics',
      populated: familyProfile?.locationArea || familyProfile?.commuteToleranceMinutes,
      content: () => (
        <div className="space-y-1">
          {familyProfile?.locationArea && (
            <p className="text-sm"><span className="font-medium">Area:</span> {familyProfile.locationArea}</p>
          )}
          {familyProfile?.commuteToleranceMinutes && (
            <p className="text-sm"><span className="font-medium">Max commute:</span> {familyProfile.commuteToleranceMinutes} min</p>
          )}
        </div>
      )
    },
    {
      id: 'budget',
      icon: DollarSign,
      title: 'Budget',
      populated: familyProfile?.budgetRange || familyProfile?.maxTuition,
      content: () => (
        <div className="space-y-1">
          {familyProfile?.maxTuition === 'unlimited' ? (
            <p className="text-sm">Budget is flexible</p>
          ) : familyProfile?.maxTuition ? (
            <p className="text-sm">${familyProfile.maxTuition.toLocaleString()}/year</p>
          ) : familyProfile?.budgetRange ? (
            <p className="text-sm">{formatBudgetRange(familyProfile.budgetRange)}</p>
          ) : null}
        </div>
      )
    },
    {
      id: 'priorities',
      icon: Target,
      title: 'Priorities',
      populated: familyProfile?.priorities?.length > 0,
      content: () => (
        <div className="space-y-1">
          {familyProfile?.priorities?.map((priority, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <span className="text-teal-600 font-semibold">{idx + 1}.</span>
              <span>{priority}</span>
            </div>
          ))}
        </div>
      )
    },
    {
      id: 'dealbreakers',
      icon: X,
      title: 'Dealbreakers',
      populated: familyProfile?.dealbreakers?.length > 0,
      content: () => (
        <div className="space-y-1">
          {familyProfile?.dealbreakers?.map((dealbreaker, idx) => (
            <p key={idx} className="text-sm">• {dealbreaker}</p>
          ))}
        </div>
      )
    },
    {
      id: 'shortlist',
      icon: Heart,
      title: 'Shortlist',
      populated: shortlist.length > 0,
      content: () => (
        <div className="space-y-1">
          {shortlist.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No schools shortlisted yet</p>
          ) : (
            shortlist.map((school, idx) => (
              <p key={idx} className="text-sm">• {school.name}</p>
            ))
          )}
        </div>
      )
    }
  ];

  const formatGrade = (grade) => {
    if (grade === null || grade === undefined) return '';
    const num = Number(grade);
    if (num <= -2) return 'PK';
    if (num === -1) return 'JK';
    if (num === 0) return 'K';
    return `Grade ${num}`;
  };

  const formatBudgetRange = (range) => {
    const ranges = {
      'under_20k': 'Under $20K',
      '20k_35k': '$20K - $35K',
      '35k_plus': '$35K+',
      'flexible': 'Flexible'
    };
    return ranges[range] || range;
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-white border-t shadow-2xl z-30 transition-all duration-300 ${
      isExpanded ? 'h-[30vh]' : 'h-14'
    }`}>
      {/* Collapsed Header Bar */}
      <button
        onClick={() => onToggleExpand(!isExpanded)}
        className="w-full h-14 px-6 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center">
            <Users className="h-4 w-4 text-teal-700" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-slate-900">
              {familyProfile?.childName ? `${familyProfile.childName}'s Brief` : 'Family Brief'}
            </h3>
            <p className="text-xs text-slate-600">
              {completeness}% complete
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Progress indicator */}
          <div className="flex gap-1">
            {stages.map((stage, idx) => (
              <div
                key={stage.id}
                className={`h-2 w-2 rounded-full transition-colors ${
                  stage.populated ? 'bg-teal-600' : 'bg-slate-200'
                } ${newlyPopulated === stage.id ? 'animate-pulse' : ''}`}
              />
            ))}
          </div>
          
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-slate-600" />
          ) : (
            <ChevronUp className="h-5 w-5 text-slate-600" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="h-[calc(100%-3.5rem)] overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {stages.map((stage) => {
              const Icon = stage.icon;
              return (
                <button
                  key={stage.id}
                  onClick={() => onSectionClick && onSectionClick(stage.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    stage.populated
                      ? 'bg-white border-teal-200 hover:border-teal-400 hover:shadow-md'
                      : 'bg-slate-50 border-slate-200 opacity-50'
                  } ${newlyPopulated === stage.id ? 'ring-2 ring-teal-400 animate-pulse' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center ${
                      stage.populated ? 'bg-teal-100' : 'bg-slate-200'
                    }`}>
                      {stage.populated ? (
                        <Check className="h-4 w-4 text-teal-700" />
                      ) : (
                        <Circle className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <h4 className="font-semibold text-sm text-slate-900">{stage.title}</h4>
                  </div>
                  {stage.populated && stage.content ? (
                    <div className="text-slate-700">
                      {stage.content()}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Not yet discussed</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}