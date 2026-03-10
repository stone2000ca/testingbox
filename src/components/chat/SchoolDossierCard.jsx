import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, ExternalLink, ChevronDown, Lock, Sparkles, Loader2 } from 'lucide-react';
import { buildPriorityChecks } from '@/components/schools/SchoolCard';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGrade(grade) {
  if (grade === null || grade === undefined) return '';
  const num = Number(grade);
  if (num <= -2) return 'PK';
  if (num === -1) return 'JK';
  if (num === 0) return 'K';
  return String(num);
}

function formatGradeRange(lo, hi) {
  const from = formatGrade(lo);
  const to   = formatGrade(hi);
  if (!from && !to) return '';
  if (!from) return to;
  if (!to)   return from;
  return `${from}–${to}`;
}

function StatusDot({ status }) {
  if (status === 'match')    return <span className="inline-block w-2 h-2 rounded-full bg-teal-400 flex-shrink-0" />;
  if (status === 'mismatch') return <span className="inline-block w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-slate-500 flex-shrink-0" />;
}

const FIT_BADGE = {
  strong_match:    { bg: '#22c55e', label: 'Strong Match' },
  good_match:      { bg: '#14b8a6', label: 'Good Match' },
  worth_exploring: { bg: '#64748b', label: 'Worth Exploring' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function AccordionSection({ title, isOpen, onToggle, children }) {
  return (
    <div className="border-t mt-2" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full py-2 text-left hover:opacity-80 transition-opacity"
      >
        <span className="text-xs font-semibold text-slate-300 flex-1">{title}</span>
        <ChevronDown
          className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      {isOpen && <div className="pb-2">{children}</div>}
    </div>
  );
}

function LockedTeaser() {
  return (
    <div
      className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" />
      <span className="text-[11px] text-slate-400">Upgrade to see full prep kit</span>
    </div>
  );
}

function VisitPrepContent({ data, isPremiumUser }) {
  // Array format (flat list)
  if (Array.isArray(data)) {
    const freeItems   = data.slice(0, 2);
    const lockedItems = data.slice(2);
    return (
      <div>
        <ul className="space-y-1">
          {freeItems.map((item, i) => (
            <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
              <span className="mt-0.5 flex-shrink-0 text-slate-500">•</span>
              <span>{typeof item === 'string' ? item : item.text || item.question || JSON.stringify(item)}</span>
            </li>
          ))}
        </ul>
        {!isPremiumUser && lockedItems.length > 0 && <LockedTeaser />}
        {isPremiumUser && lockedItems.length > 0 && (
          <ul className="space-y-1 mt-1">
            {lockedItems.map((item, i) => (
              <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                <span className="mt-0.5 flex-shrink-0 text-slate-500">•</span>
                <span>{typeof item === 'string' ? item : item.text || item.question || JSON.stringify(item)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Object format with named sections
  const questions      = data.questions || [];
  const freeQuestions  = questions.slice(0, 2);
  const extraQuestions = questions.slice(2);
  const hasLockedContent = !isPremiumUser && (
    extraQuestions.length > 0 ||
    (data.thingsToNotice?.length > 0) ||
    (data.logisticalTips?.length > 0)
  );

  return (
    <div className="space-y-2">
      {freeQuestions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Questions to Ask</p>
          <ul className="space-y-0.5">
            {freeQuestions.map((item, i) => (
              <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                <span className="mt-0.5 flex-shrink-0 text-slate-500">•</span>
                <span>{typeof item === 'string' ? item : item.text || JSON.stringify(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasLockedContent && <LockedTeaser />}

      {isPremiumUser && (
        <>
          {extraQuestions.length > 0 && (
            <ul className="space-y-0.5">
              {extraQuestions.map((item, i) => (
                <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                  <span className="mt-0.5 flex-shrink-0 text-slate-500">•</span>
                  <span>{typeof item === 'string' ? item : item.text || JSON.stringify(item)}</span>
                </li>
              ))}
            </ul>
          )}
          {[{ key: 'thingsToNotice', label: 'Things to Notice' }, { key: 'logisticalTips', label: 'Logistics' }].map(({ key, label }) => {
            const items = data[key];
            if (!items?.length) return null;
            return (
              <div key={key}>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                <ul className="space-y-0.5">
                  {items.map((item, i) => (
                    <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                      <span className="mt-0.5 flex-shrink-0 text-slate-500">•</span>
                      <span>{typeof item === 'string' ? item : item.text || JSON.stringify(item)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function ReEvalContent({ data, isPremiumUser }) {
  const fitConfig     = data.fitLabel  ? FIT_BADGE[data.fitLabel]  : null;
  const prevFitConfig = data.previousFitLabel ? FIT_BADGE[data.previousFitLabel] : null;

  const delta = data.scoreDelta;
  const deltaDisplay = (delta === 0 || delta == null)
    ? { text: 'No change', color: '#94a3b8' }
    : delta > 0
      ? { text: `+${delta}`, color: '#22c55e' }
      : { text: `${delta}`,  color: '#f87171' };

  const narrative  = data.narrative || '';
  const sentences  = narrative.match(/[^.!?]+[.!?]+/g) || (narrative ? [narrative] : []);
  const freePart   = sentences.slice(0, 2).join(' ');
  const hasLocked  = !isPremiumUser && sentences.length > 2;

  let timeAgo = '';
  if (data.generatedAt) {
    const diffMs   = Date.now() - new Date(data.generatedAt).getTime();
    const diffDays  = Math.floor(diffMs / 86400000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffMins  = Math.floor(diffMs / 60000);
    if      (diffDays  > 0) timeAgo = `Generated ${diffDays} day${diffDays  > 1 ? 's' : ''} ago`;
    else if (diffHours > 0) timeAgo = `Generated ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    else if (diffMins  > 0) timeAgo = `Generated ${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    else                    timeAgo = 'Just generated';
  }

  return (
    <div className="space-y-2">
      {fitConfig && (
        <span style={{ background: fitConfig.bg, color: '#fff', fontSize: 11, borderRadius: 4, padding: '1px 6px', fontWeight: 500, display: 'inline-block' }}>
          {fitConfig.label}
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold" style={{ color: deltaDisplay.color }}>
          {deltaDisplay.text}
        </span>
        {delta !== 0 && delta != null && prevFitConfig && (
          <span className="text-xs text-slate-500">from {prevFitConfig.label}</span>
        )}
      </div>

      {narrative && (
        <div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {isPremiumUser ? narrative : freePart}
          </p>
          {hasLocked && (
            <div
              className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <span className="text-[11px] text-slate-400">Unlock full re-evaluation analysis</span>
            </div>
          )}
        </div>
      )}

      {timeAgo && <p className="text-[10px] text-slate-500">{timeAgo}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SchoolDossierCard({
  school, familyProfile, schoolAnalyses, artifactCache,
  onRemove, onViewSchool,
  consultantName, onSendMessage, isPremiumUser,
  onDossierExpandChange,
  onConfirmDeepDive, pendingDeepDiveSchoolIds,
  isExpanded: controlledExpanded,
  onToggleExpand,
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded(v => !v);
    }
  };
  const [aiRecOpen,     setAiRecOpen]     = useState(true);
  const [tradeOffsOpen, setTradeOffsOpen] = useState(true);
  const [visitPrepOpen, setVisitPrepOpen] = useState(true);
  const [reEvalOpen,    setReEvalOpen]    = useState(true);

  const checks    = familyProfile ? buildPriorityChecks(school, familyProfile).slice(0, 4) : [];
  const tuition   = school.dayTuition ?? school.tuition;
  const analysis  = schoolAnalyses?.[school.id];
  const fitConfig = analysis?.fitLabel ? FIT_BADGE[analysis.fitLabel] : null;

  const aiRecContent = artifactCache?.[`${school.id}_deep_dive_analysis`] || null;

  const tradeOffs = Array.isArray(analysis?.tradeOffs) && analysis.tradeOffs.length > 0
    ? analysis.tradeOffs
    : null;

  let visitPrepData = null;
  const visitPrepRaw = artifactCache?.[`${school.id}_visit_prep`];
  if (visitPrepRaw) {
    try {
      visitPrepData = typeof visitPrepRaw === 'string' ? JSON.parse(visitPrepRaw) : visitPrepRaw;
    } catch (_) {
      visitPrepData = null;
    }
  }

  const fitReEvaluation = artifactCache?.[`${school.id}_fit_reevaluation`] || null;

  const hasExpandedContent = aiRecContent || tradeOffs || visitPrepData || fitReEvaluation;
  // Empty state: no analysis record AND no artifact content for this school
  const hasAnalysisData = !!analysis || !!hasExpandedContent;

  const isPendingAnalysis = pendingDeepDiveSchoolIds?.has(school.id);

  const handleAnalyzeCTA = () => {
    if (!onConfirmDeepDive || isPendingAnalysis) return;
    onConfirmDeepDive(school);
  };

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* ── Header: name + expand toggle + remove ── */}
      <div className="flex items-start justify-between mb-1 gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-white leading-snug truncate">{school.name}</h3>
            {hasExpandedContent && (
              <button
                onClick={() => {
                  const next = !isExpanded;
                  handleToggle();
                  onDossierExpandChange?.(next);
                }}
                className="flex-shrink-0 text-slate-400 hover:text-white transition-colors"
                aria-label={isExpanded ? 'Collapse dossier' : 'Expand dossier'}
              >
                <ChevronDown
                  className="w-3.5 h-3.5 transition-transform duration-200"
                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
            )}
          </div>
          {fitConfig && (
            <span style={{ background: fitConfig.bg, color: '#fff', fontSize: 11, borderRadius: 4, padding: '1px 6px', fontWeight: 500, display: 'inline-block', marginTop: 3 }}>
              {fitConfig.label}
            </span>
          )}
        </div>
        <button
          onClick={() => onRemove(school.id)}
          className="text-slate-500 hover:text-rose-400 transition-colors flex-shrink-0 mt-0.5"
          aria-label="Remove from shortlist"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Location + grades ── */}
      <p className="text-xs text-slate-400 mb-1">
        {school.city}{school.provinceState ? `, ${school.provinceState}` : ''}
        {school.lowestGrade != null && ` · Gr ${formatGradeRange(school.lowestGrade, school.highestGrade)}`}
      </p>

      {/* ── Tuition ── */}
      {tuition > 0 && (
        <p className="text-xs text-slate-500 mb-2">
          {school.currency || 'CAD'} {tuition.toLocaleString()}/yr
        </p>
      )}

      {/* ── Priority checks ── */}
      {checks.length > 0 && (
        <div className="space-y-1 mb-2">
          {checks.map((row) => (
            <div key={row.id} className="flex items-center gap-1.5">
              <StatusDot status={row.status} />
              <span className="text-xs text-slate-400 truncate">{row.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── View Details button ── */}
      <button
        onClick={() => onViewSchool(school.id)}
        className="w-full flex items-center justify-center gap-1 text-xs font-medium py-1.5 rounded transition-colors"
        style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
      >
        <ExternalLink className="w-3 h-3" />
        View Details
      </button>

      {/* ── Empty state CTA / pending spinner ── */}
      {!hasAnalysisData && (
        isPendingAnalysis ? (
          <div className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 mt-2 text-slate-400">
            <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin" />
            Analyzing {school.name}…
          </div>
        ) : onConfirmDeepDive ? (
          <button
            onClick={handleAnalyzeCTA}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded mt-2 transition-colors"
            style={{ background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.3)', color: '#2dd4bf' }}
          >
            <Sparkles className="w-3 h-3 flex-shrink-0" />
            Ask {consultantName || 'your consultant'} to analyze {school.name}
          </button>
        ) : null
      )}

      {/* ── Expanded accordion sections ── */}
      {isExpanded && hasExpandedContent && (
        <div>
          {aiRecContent && (
            <AccordionSection title="AI Recommendation" isOpen={aiRecOpen} onToggle={() => setAiRecOpen(v => !v)}>
              <ReactMarkdown className="text-xs text-slate-300 prose prose-invert max-w-none leading-relaxed [&>p]:mb-1 [&>p:last-child]:mb-0">
                {aiRecContent}
              </ReactMarkdown>
            </AccordionSection>
          )}

          {tradeOffs && (
            <AccordionSection title="Trade-offs" isOpen={tradeOffsOpen} onToggle={() => setTradeOffsOpen(v => !v)}>
              <div className="space-y-1.5">
                {tradeOffs.map((item, i) => {
                  if (typeof item === 'string') {
                    return (
                      <div key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                        <span className="mt-0.5 flex-shrink-0 text-slate-500">•</span>
                        <span>{item}</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={i}
                      className="rounded px-2 py-1.5 space-y-0.5"
                      style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}
                    >
                      {item.dimension && (
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{item.dimension}</p>
                      )}
                      {item.strength && (
                        <p className="text-xs text-emerald-400 leading-snug">{item.strength}</p>
                      )}
                      {item.concern && (
                        <p className="text-xs text-amber-400 leading-snug">{item.concern}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </AccordionSection>
          )}

          {visitPrepData && (
            <AccordionSection title="Visit Prep" isOpen={visitPrepOpen} onToggle={() => setVisitPrepOpen(v => !v)}>
              <VisitPrepContent data={visitPrepData} isPremiumUser={isPremiumUser} />
            </AccordionSection>
          )}

          {fitReEvaluation && (
            <AccordionSection title="Post-Visit Re-Evaluation" isOpen={reEvalOpen} onToggle={() => setReEvalOpen(v => !v)}>
              <ReEvalContent data={fitReEvaluation} isPremiumUser={isPremiumUser} />
            </AccordionSection>
          )}
        </div>
      )}
    </div>
  );
}