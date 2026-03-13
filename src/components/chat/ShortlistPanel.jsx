import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Heart } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import SchoolDossierCard from '@/components/chat/SchoolDossierCard';

export default function ShortlistPanel({ shortlist, onClose, onRemove, onViewSchool, familyProfile, schoolAnalyses, artifactCache, consultantName, onSendMessage, isPremiumUser, onDossierExpandChange, onConfirmDeepDive, pendingDeepDiveSchoolIds, autoExpandSchoolId, onClearAutoExpand }) {
  const [expandedSchoolId, setExpandedSchoolId] = useState(null);

  // E30-012 + E30-013: Auto-expand school after deep dive
  useEffect(() => {
    if (autoExpandSchoolId) {
      setExpandedSchoolId(autoExpandSchoolId);
      onClearAutoExpand?.();
    }
  }, [autoExpandSchoolId]);

  return (
    <div className="h-full flex flex-col" style={{ background: '#1E1E30', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-l-4 border-l-teal-400" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-rose-400" />
          <h2 className="text-base font-bold text-white">Shortlist</h2>
          {shortlist.length > 0 && (
            <span className="text-xs font-medium bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded-full">
              {shortlist.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors rounded p-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        {shortlist.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Heart className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            <p className="text-sm text-slate-400">No schools saved yet.</p>
            <p className="text-xs text-slate-500 mt-1">Click the heart on any school to save it here.</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {shortlist.map((school) => (
              <SchoolDossierCard
                key={school.id}
                school={school}
                familyProfile={familyProfile}
                schoolAnalyses={schoolAnalyses}
                artifactCache={artifactCache}
                onRemove={onRemove}
                onViewSchool={onViewSchool}
                consultantName={consultantName}
                onSendMessage={onSendMessage}
                isPremiumUser={isPremiumUser}
                onDossierExpandChange={onDossierExpandChange}
                onConfirmDeepDive={onConfirmDeepDive}
                pendingDeepDiveSchoolIds={pendingDeepDiveSchoolIds}
                isExpanded={expandedSchoolId === school.id}
                onToggleExpand={() => setExpandedSchoolId(prev => prev === school.id ? null : school.id)}
              />
            ))}
          </div>
        )}


      </ScrollArea>
    </div>
  );
}