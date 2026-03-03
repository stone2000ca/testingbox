import React, { useState } from 'react';
import { ClipboardList, Eye, Flag, AlertCircle, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

export default function VisitPrepCard({ schoolName, visitQuestions = [], observations = [], redFlags = [], defaultCollapsed = false, isPremium = false, onUpgrade }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Edge case: fewer than 3 questions → don't render
  if (!visitQuestions || visitQuestions.length < 3) return null;

  const limitedQuestions = visitQuestions.slice(0, 3);
  const firstQuestion = limitedQuestions.slice(0, 1);
  const remainingQuestions = limitedQuestions.slice(1);
  const showBlur = !isPremium && remainingQuestions.length > 0;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden my-3 w-full">
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-amber-900">
            {schoolName} — Visit Prep Kit
          </span>
        </div>
        {collapsed
          ? <ChevronDown className="h-4 w-4 text-amber-600" />
          : <ChevronUp className="h-4 w-4 text-amber-600" />
        }
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4 border-t border-amber-200 pt-3">

          {/* Questions to Ask */}
          <div className="relative">
            <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
              Questions to Ask
            </h4>
            <ol className="space-y-2">
              {firstQuestion.map((item, i) => {
                const question = typeof item === 'string' ? item : item.question;
                const tag = typeof item === 'object' ? item.priorityTag : null;
                return (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                    <span className="flex-shrink-0 font-semibold text-amber-500 w-4">{i + 1}.</span>
                    <span className="flex-1">{question}</span>
                    {tag && (
                      <Badge
                        variant="outline"
                        className={`text-xs flex-shrink-0 ${PRIORITY_COLORS[tag.toLowerCase()] || PRIORITY_COLORS.medium}`}
                      >
                        {tag}
                      </Badge>
                    )}
                  </li>
                );
              })}
              {showBlur && (
                <>
                  {remainingQuestions.slice(0, 2).map((item, i) => {
                    const question = typeof item === 'string' ? item : item.question;
                    const tag = typeof item === 'object' ? item.priorityTag : null;
                    return (
                      <li key={i + 1} className="flex items-start gap-2 text-sm text-amber-900 blur-sm pointer-events-none">
                        <span className="flex-shrink-0 font-semibold text-amber-500 w-4">{i + 2}.</span>
                        <span className="flex-1">{question}</span>
                        {tag && (
                          <Badge
                            variant="outline"
                            className={`text-xs flex-shrink-0 ${PRIORITY_COLORS[tag.toLowerCase()] || PRIORITY_COLORS.medium}`}
                          >
                            {tag}
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-amber-50/80 rounded-lg">
                    <Lock className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-semibold text-amber-900">Get Full Access</span>
                    <Button 
                      onClick={onUpgrade}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-2 py-0.5 h-auto"
                    >
                      Unlock
                    </Button>
                  </div>
                </>
              )}
            </ol>
          </div>

          {/* What to Observe */}
          {observations.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" /> What to Observe
              </h4>
              <ul className="space-y-1.5">
                {observations.map((obs, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    {obs}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Red Flags */}
          {redFlags.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Flag className="h-3.5 w-3.5" /> Red Flags
              </h4>
              <ul className="space-y-1.5">
                {redFlags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-500" />
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}
    </div>
  );
}