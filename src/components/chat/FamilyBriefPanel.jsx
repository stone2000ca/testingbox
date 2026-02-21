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

  // Track newly populated stages for visual highlighting (no auto-expand)
  useEffect(() => {
    if (!familyProfile) return;
    
    const populatedStages = getPopulatedStages();
    const prevStages = JSON.parse(localStorage.getItem('briefStages') || '[]');
    
    // Check if a new stage was populated and highlight it
    const newStage = populatedStages.find(s => !prevStages.includes(s));
    if (newStage && prevStages.length > 0) {
      setNewlyPopulated(newStage);
      
      // Clear highlight after 2 seconds
      setTimeout(() => {
        setNewlyPopulated(null);
      }, 2000);
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
    <div className={`fixed bottom-0 left-0 right-0 bg-[#2A2A3D] border-t border-white/10 shadow-2xl z-30 transition-all duration-400 ${
      isExpanded ? 'h-1/3' : 'h-0 overflow-hidden'
    }`} style={{ pointerEvents: isExpanded ? 'auto' : 'none' }}>
      {/* Collapsed Header Bar - Only show when not expanded */}
      {!isExpanded && (
      <button
        onClick={() => onToggleExpand(!isExpanded)}
        className="w-full h-12 sm:h-14 px-4 sm:px-6 flex items-center justify-between hover:bg-[#1E1E2E] transition-colors focus:ring-2 focus:ring-inset focus:ring-white/30 focus:outline-none bg-[#2A2A3D]"
        aria-label={isExpanded ? "Collapse family brief" : "Expand family brief"}
      >
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <div className="h-6 sm:h-8 w-6 sm:w-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
            <Users className="h-3 sm:h-4 w-3 sm:w-4 text-[#E8E8ED]" />
          </div>
          <div className="text-left min-w-0 flex-1">
            <h3 className="font-semibold text-sm sm:text-base text-[#E8E8ED] truncate">
              {familyProfile?.childName ? `${familyProfile.childName}'s Brief` : 'Family Brief'}
            </h3>
            <p className="text-xs text-[#E8E8ED]/60">
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
                  stage.populated ? 'bg-teal-500' : 'bg-white/20'
                } ${newlyPopulated === stage.id ? 'animate-pulse' : ''}`}
              />
            ))}
          </div>
          
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-[#E8E8ED]" />
          ) : (
            <ChevronUp className="h-5 w-5 text-[#E8E8ED]" />
          )}
          </div>
          </button>
          )}

          {/* Expanded Content Header */}
          {isExpanded && (
          <button
          onClick={() => onToggleExpand(false)}
          className="w-full h-12 sm:h-14 px-4 sm:px-6 flex items-center justify-between hover:bg-[#1E1E2E] transition-colors focus:ring-2 focus:ring-inset focus:ring-white/30 focus:outline-none bg-[#2A2A3D] border-b border-white/10"
          aria-label="Collapse family brief"
          >
          <h3 className="font-semibold text-sm sm:text-base text-[#E8E8ED]">
          {familyProfile?.childName ? `${familyProfile.childName}'s Brief` : 'Family Brief'}
          </h3>
          <ChevronDown className="h-5 w-5 text-[#E8E8ED]" />
          </button>
          )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="h-[calc(100%-3rem)] sm:h-[calc(100%-3.5rem)] overflow-y-auto px-3 sm:px-6 py-3 sm:py-4 bg-[#1E1E2E] z-40">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {stages.map((stage) => {
              const Icon = stage.icon;
              return (
                <button
                  key={stage.id}
                  onClick={() => onSectionClick && onSectionClick(stage.id)}
                  className={`p-3 sm:p-4 rounded-xl border-2 text-left transition-all focus:ring-2 focus:ring-teal-400 focus:outline-none ${
                    stage.populated
                      ? 'bg-[#2A2A3D] border-teal-500/30 hover:border-teal-500/50 hover:shadow-md'
                      : 'bg-[#2A2A3D]/50 border-white/10 opacity-50'
                  } ${newlyPopulated === stage.id ? 'ring-2 ring-teal-500 animate-pulse' : ''}`}
                  aria-label={`${stage.title} section - ${stage.populated ? 'completed' : 'not yet discussed'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center ${
                      stage.populated ? 'bg-teal-500/20' : 'bg-white/10'
                    }`}>
                      {stage.populated ? (
                        <Check className="h-4 w-4 text-teal-500" />
                      ) : (
                        <Circle className="h-4 w-4 text-[#E8E8ED]/40" />
                      )}
                    </div>
                    <h4 className="font-semibold text-sm text-[#E8E8ED]">{stage.title}</h4>
                  </div>
                  {stage.populated && stage.content ? (
                    <div className="text-[#E8E8ED]/80">
                      {stage.content()}
                    </div>
                  ) : (
                    <p className="text-xs text-[#E8E8ED]/40 italic">Not yet discussed</p>
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