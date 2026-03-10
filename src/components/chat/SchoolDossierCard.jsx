import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, ExternalLink, ChevronDown, Lock, Sparkles } from 'lucide-react';
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

// ── Main component ────────────────────────────────────────────────────────────

export default function SchoolDossierCard({
  school, familyProfile, schoolAnalyses, artifactCache,
  onRemove, onViewSchool,
  consultantName, onSendMessage, isPremiumUser,
  onDossierExpandChange,
}) {
  const [isExpanded,        setIsExpanded]        = useState(false);
  const [aiRecOpen,         setAiRecOpen]         = useState(true);
  const [tradeOffsOpen,     setTradeOffsOpen]     = useState(true);
  const [visitPrepOpen,     setVisitPrepOpen]     = useState(true);
  const [isAnalyzingSchool, setIsAnalyzingSchool] = useState(false);

  const checks    = familyProfile ? buildPriorityChecks(school, familyProfile).slice(0, 4) : [];
  const tuition   = school.dayTuition ?? school.tuition;
  const analysis  = schoolAnalyses?.[school.id];
  const fitConfig = analysis?.fitLabel ? FIT_BADGE[analysis.fitLabel] : null;

  const aiRecContent = artifactCache?.[`${school.id}_deep_dive_recommendation`] || null;

  const tradeOffs = Array.isArray(analysis?.tradeOffs) && analysis.tradeOffs.length > 0
    ? analysis.tradeOffs
    : null;

  let visitPrepData = null;
  const visitPrepRaw = artifactCache?.[`${school.id}_visit_prep_kit`];
  if (visitPrepRaw) {
    try {
      visitPrepData = typeof visitPrepRaw === 'string' ? JSON.parse(visitPrepRaw) : visitPrepRaw;
    } catch (_) {
      visitPrepData = null;
    }
  }

  const hasExpandedContent = aiRecContent || tradeOffs || visitPrepData;
  // Empty state: no analysis record AND no artifact content for this school
  const hasAnalysisData = !!analysis || !!hasExpandedContent;

  const handleAnalyzeCTA = () => {
    if (!onSendMessage || isAnalyzingSchool) return;
    setIsAnalyzingSchool(true);
    onSendMessage(`Tell me more about ${school.name}`);
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
                onClick={() => setIsExpanded(v => !v)}
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

      {/* ── Empty state CTA: trigger analysis via chat ── */}
      {!hasAnalysisData && onSendMessage && (
        <button
          onClick={handleAnalyzeCTA}
          disabled={isAnalyzingSchool}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded mt-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.3)', color: '#2dd4bf' }}
        >
          <Sparkles className="w-3 h-3 flex-shrink-0" />
          {isAnalyzingSchool
            ? `Analyzing ${school.name}…`
            : `Ask ${consultantName || 'your consultant'} to analyze ${school.name}`}
        </button>
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
              <ul className="space-y-1">
                {tradeOffs.map((item, i) => (
                  <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                    <span className="mt-0.5 flex-shrink-0 text-slate-500">•</span>
                    <span>{typeof item === 'string' ? item : item.text || item.description || JSON.stringify(item)}</span>
                  </li>
                ))}
              </ul>
            </AccordionSection>
          )}

          {visitPrepData && (
            <AccordionSection title="Visit Prep" isOpen={visitPrepOpen} onToggle={() => setVisitPrepOpen(v => !v)}>
              <VisitPrepContent data={visitPrepData} isPremiumUser={isPremiumUser} />
            </AccordionSection>
          )}
        </div>
      )}
    </div>
  );
}