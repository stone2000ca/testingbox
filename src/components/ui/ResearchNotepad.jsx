import React, { useState } from 'react';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_SCHOOL = {
  name: 'Upper Canada College',
  location: 'Toronto, ON',
  students: 1100,
  teacherRatio: '8:1',
  tuition: '$42,500',
};

const MOCK_JOURNEY = [
  { label: 'Match Found',  status: 'completed' },
  { label: 'Deep Dive',    status: 'active'    },
  { label: 'Book Tour',    status: 'pending'   },
  { label: 'Debrief Tour', status: 'pending'   },
  { label: 'Apply',        status: 'pending'   },
];

const MOCK_CHAT_BUBBLES = [
  "UCC has an exceptional IB programme that aligns perfectly with your academic goals for Ethan.",
  "Their student-teacher ratio of 8:1 means Ethan will get the individual attention he needs.",
  "Strong arts and music programmes match the extracurricular priorities you mentioned.",
];

const MOCK_PREFERENCES = {
  matches: [
    { icon: 'check', label: 'IB Curriculum', detail: 'Offered' },
    { icon: 'check', label: 'Small Classes', detail: 'Avg 18 students' },
    { icon: 'check', label: 'Arts Programme', detail: 'Music & Visual' },
    { icon: 'check', label: 'University Prep', detail: '98% acceptance' },
  ],
  flags: [
    { icon: 'flag', label: 'All-Boys School', detail: 'Co-ed preferred' },
    { icon: 'flag', label: 'Tuition', detail: '$42.5k — above budget' },
  ],
};

const MOCK_FIT_SCORE = 92;

const MOCK_AI_INSIGHT = "UCC is an exceptionally strong academic fit for Ethan. The main trade-off is the all-boys environment — worth discussing as a family whether the programme strength outweighs that preference.";

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────

const ChevronIcon = ({ open }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: 'transform 0.25s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
    stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const FlagIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
    stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
    stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const BookIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
    stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
    stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.83a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const NsDiamond = ({ width = 20, height = 20 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40.54 38.56" width={width} height={height}>
    <path fill="#0d9488" d="M20.21,0h-11.7L0,8.48l7,10.78L0,30.05l8.52,8.52h12.76l19.26-19.3L21.28,0h-1.06ZM37.53,19.27l-16.26,16.29-.09-.09-5.7-5.7,6.06-9.34.75-1.16-.75-1.16-6.06-9.34,5.79-5.76.58.58,15.68,15.68Z"/>
    <polygon fill="white" points="15.48 8.77 21.54 18.11 22.29 19.26 21.54 20.42 15.48 29.76 21.18 35.46 21.28 35.56 37.53 19.27 21.85 3.59 21.27 3.01 15.48 8.77"/>
  </svg>
);

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const shimmerStyle = {
  background: 'linear-gradient(90deg, #f0ead8 25%, #faf5e8 50%, #f0ead8 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.4s infinite',
  borderRadius: 6,
};

function LoadingSkeleton() {
  return (
    <div style={{ padding: 24, background: '#fffdf5', maxWidth: 660, margin: '0 auto' }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      <div style={{ ...shimmerStyle, height: 28, width: '60%', marginBottom: 20 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[1,2,3,4,5,6].map(i => (
          <div key={i} style={{ ...shimmerStyle, flex: 1, height: 48, borderRadius: 8 }} />
        ))}
      </div>
      {[80, 60, 90, 50].map((w, i) => (
        <div key={i} style={{ ...shimmerStyle, height: 16, width: `${w}%`, marginBottom: 12 }} />
      ))}
      <div style={{ ...shimmerStyle, height: 80, marginTop: 16 }} />
    </div>
  );
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function CollapsibleSection({ icon, label, color, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid #e8dfc0', marginTop: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 20px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: '#3d3020' }}>
          <span style={{ color }}>{icon}</span>
          {label}
        </span>
        <span style={{ color: '#a89060' }}><ChevronIcon open={open} /></span>
      </button>
      {open && (
        <div style={{ padding: '0 20px 16px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const MOCK_KEY_DATES = [
  { type: 'event', label: 'Open House', date: '2025-11-14', isEstimated: false },
  { type: 'deadline', label: 'Application Deadline', date: '2026-01-15', isEstimated: false },
  { type: 'deadline', label: 'Entry Year', date: '2026-09-01', isEstimated: true },
];

function KeyDatesContent({ keyDates }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const source = keyDates || MOCK_KEY_DATES;

  const upcoming = source
    .filter(d => d.date && new Date(d.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (upcoming.length === 0) {
    return <div style={{ fontSize: 12.5, color: '#a89060', fontStyle: 'italic' }}>No upcoming dates on file.</div>;
  }

  return (
    <div style={{ fontSize: 12.5, color: '#5a4030', lineHeight: 1.6 }}>
      {upcoming.map((d, i) => {
        const dateObj = new Date(d.date);
        const daysUntil = Math.ceil((dateObj - today) / (1000 * 60 * 60 * 24));
        const badgeColor = daysUntil < 14 ? '#ef4444' : daysUntil < 30 ? '#d97706' : '#16a34a';
        const badgeText = daysUntil < 14 ? 'Urgent' : daysUntil < 30 ? 'Coming Soon' : null;
        const dateStr = dateObj.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
        const isLast = i === upcoming.length - 1;
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: isLast ? 'none' : '1px solid #f5edd4', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>{d.label}</span>
              {d.isEstimated && (
                <span style={{ fontSize: 10, color: '#a89060', fontStyle: 'italic', border: '1px solid #d4c9a8', borderRadius: 4, padding: '1px 5px' }}>est.</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {badgeText && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: badgeColor, borderRadius: 10, padding: '1px 7px' }}>{badgeText}</span>
              )}
              {!badgeText && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: badgeColor, display: 'inline-block' }} />
              )}
              <span style={{ color: '#a89060' }}>{dateStr}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PRIORITY_TAG_STYLE = {
  high:   { background: '#fee2e2', color: '#b91c1c' },
  medium: { background: '#fef3c7', color: '#b45309' },
  low:    { background: '#dcfce7', color: '#15803d' },
};

function VisitPrepKitContent({ visitPrepKit }) {
  if (!visitPrepKit) {
    // Fallback mock
    return (
      <div style={{ fontSize: 12.5, color: '#5a4030', lineHeight: 1.7 }}>
        <div style={{ marginBottom: 8, fontWeight: 600, color: '#6d28d9' }}>Questions to Ask</div>
        {['How is the transition from JK to Grade 1 supported?', 'What does a typical extracurricular week look like?', 'How does the school support learning differences?'].map((q, i) => (
          <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 5 }}>
            <span style={{ color: '#8b5cf6', fontWeight: 700, flexShrink: 0 }}>→</span>
            <span>{q}</span>
          </div>
        ))}
        <div style={{ marginTop: 12, marginBottom: 8, fontWeight: 600, color: '#6d28d9' }}>Things to Notice</div>
        {['Classroom size and energy', 'How students interact with staff', 'Hallway displays and student work'].map((n, i) => (
          <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 5 }}>
            <span style={{ color: '#8b5cf6', fontWeight: 700, flexShrink: 0 }}>•</span>
            <span>{n}</span>
          </div>
        ))}
      </div>
    );
  }

  const { visitQuestions = [], observations = [], redFlags = [], isLocked = false } = visitPrepKit;

  return (
    <div style={{ fontSize: 12.5, color: '#5a4030', lineHeight: 1.7 }}>
      {/* Questions to Ask */}
      {visitQuestions.length > 0 && (
        <>
          <div style={{ marginBottom: 8, fontWeight: 600, color: '#6d28d9' }}>Questions to Ask</div>
          {visitQuestions.map((q, i) => {
            const tag = q.priorityTag || 'medium';
            const tagStyle = PRIORITY_TAG_STYLE[tag] || PRIORITY_TAG_STYLE.medium;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 7 }}>
                <span style={{ color: '#8b5cf6', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>→</span>
                <span style={{ flex: 1 }}>{q.question}</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10, flexShrink: 0, ...tagStyle }}>{tag}</span>
              </div>
            );
          })}
        </>
      )}

      {/* Observations */}
      {(observations?.length > 0 || isLocked) && (
        <div style={{ marginTop: 12, position: 'relative' }}>
          <div style={{ marginBottom: 8, fontWeight: 600, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Things to Notice
          </div>
          <div style={{ filter: isLocked ? 'blur(4px)' : 'none', userSelect: isLocked ? 'none' : 'auto' }}>
            {(isLocked ? ['Notice how staff interact with students', 'Observe classroom atmosphere and energy', 'Look for signs of student wellbeing'] : observations).map((n, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 5 }}>
                <span style={{ color: '#8b5cf6', fontWeight: 700, flexShrink: 0 }}>•</span>
                <span>{n}</span>
              </div>
            ))}
          </div>
          {isLocked && <PremiumLockBadge />}
        </div>
      )}

      {/* Red Flags */}
      {(redFlags?.length > 0 || isLocked) && (
        <div style={{ marginTop: 12, position: 'relative' }}>
          <div style={{ marginBottom: 8, fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Red Flags to Watch For
          </div>
          <div style={{ filter: isLocked ? 'blur(4px)' : 'none', userSelect: isLocked ? 'none' : 'auto' }}>
            {(isLocked ? ['Watch for misalignment on key priorities', 'Note any concerns around class size'] : redFlags).map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 5 }}>
                <span style={{ color: '#dc2626', fontWeight: 700, flexShrink: 0 }}>!</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
          {isLocked && <PremiumLockBadge />}
        </div>
      )}
    </div>
  );
}

const STATUS_DOT = {
  pending:    '#f59e0b',
  new:        '#f59e0b',
  contacted:  '#0d9488',
  scheduled:  '#3b82f6',
  completed:  '#16a34a',
  responded:  '#16a34a',
  closed:     '#94a3b8',
};

function ContactLogContent({ contactLog }) {
  if (!contactLog || contactLog.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: '#a89060', fontStyle: 'italic' }}>
        No inquiries yet. Tour requests and messages to this school will appear here.
      </div>
    );
  }
  return (
    <div style={{ fontSize: 12.5, color: '#5a4030', lineHeight: 1.6 }}>
      {contactLog.map((entry, i) => {
        const dot = STATUS_DOT[entry.status] || '#cbd5e1';
        const isLast = i === contactLog.length - 1;
        return (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: isLast ? 'none' : '1px solid #f5edd4', alignItems: 'flex-start' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, marginTop: 4, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600 }}>{entry.type}</div>
              <div style={{ color: '#a89060', fontSize: 11 }}>
                {entry.date}{entry.status ? ` — ${entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}` : ''}
              </div>
              {entry.note && <div style={{ color: '#6b5c40', fontSize: 11, marginTop: 2 }}>{entry.note}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PremiumLockBadge() {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(255,253,245,0.6)',
    }}>
      <span style={{
        background: '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 700,
        padding: '3px 12px', borderRadius: 10, letterSpacing: 0.3,
      }}>
        🔒 Premium
      </span>
    </div>
  );
}

export default function ResearchNotepad({ loading = false, schoolData, fitScore, fitLabel, tradeOffs, chatBubbles, preferences, aiInsight, journeySteps, keyDates, visitPrepKit, contactLog, researchNotes, onNotesChange, onSaveNotes }) {
  const school = schoolData || MOCK_SCHOOL;
  const score = fitScore ?? MOCK_FIT_SCORE;
  const label = fitLabel || 'STRONG MATCH';
  const bubbles = chatBubbles || MOCK_CHAT_BUBBLES;
  const prefs = preferences || MOCK_PREFERENCES;
  const insight = aiInsight || MOCK_AI_INSIGHT;
  // Normalise journeySteps: accept {label,status} (live) or {label,status:'completed'|'active'|'pending'} (mock)
  const journey = journeySteps || MOCK_JOURNEY;
  const [open, setOpen] = useState(true);
  const [deepDiveOpen, setDeepDiveOpen] = useState(true);
  const [localNotes, setLocalNotes] = useState('');
  const [saved, setSaved] = useState(false);

  // Controlled vs uncontrolled: use props if provided, else local state
  const isControlled = onNotesChange != null;
  const noteValue = isControlled ? (researchNotes || '') : localNotes;
  const handleNotesChange = isControlled ? onNotesChange : setLocalNotes;

  if (loading) return <LoadingSkeleton />;

  const handleSave = () => {
    if (onSaveNotes) onSaveNotes();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Fit score circle
  const fitPct = score;
  const fitDeg = Math.round(fitPct * 3.6);

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <style>{`
        @keyframes ns-diamond-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0px rgba(13,148,136,0)); }
          50% { transform: scale(1.18); filter: drop-shadow(0 0 6px rgba(13,148,136,0.7)); }
        }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* Parchment wrapper */}
      <div style={{
        background: '#fffdf5',
        boxShadow: '0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Teal ribbon bookmark */}
        <div style={{
          position: 'absolute', top: -6, left: 18, width: 28, height: 52,
          background: 'linear-gradient(135deg, #0d9488, #14b8a6)',
          boxShadow: '0 2px 6px rgba(13,148,136,0.35)',
          zIndex: 5,
          clipPath: 'polygon(0 0, 100% 0, 100% 85%, 50% 100%, 0 85%)',
        }} />

        {/* Stitch border */}
        <div style={{
          position: 'absolute', inset: 6, borderRadius: 8, pointerEvents: 'none', zIndex: 1,
          border: '2px dashed transparent',
          backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 8px, #d4c9a8 8px, #d4c9a8 12px, transparent 12px, transparent 16px), repeating-linear-gradient(270deg, transparent, transparent 8px, #d4c9a8 8px, #d4c9a8 12px, transparent 12px, transparent 16px), repeating-linear-gradient(180deg, transparent, transparent 8px, #d4c9a8 8px, #d4c9a8 12px, transparent 12px, transparent 16px), repeating-linear-gradient(0deg, transparent, transparent 8px, #d4c9a8 8px, #d4c9a8 12px, transparent 12px, transparent 16px)`,
          backgroundSize: '16px 2px, 16px 2px, 2px 16px, 2px 16px',
          backgroundPosition: 'top, bottom, left, right',
          backgroundRepeat: 'repeat-x, repeat-x, repeat-y, repeat-y',
          opacity: 0.5,
        }} />

        {/* Gradient header / toggle */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 22px 16px 58px',
            background: 'linear-gradient(180deg, #f5edd4 0%, #fffdf5 100%)',
            border: 'none', borderBottom: open ? '1px solid #e8dfc0' : 'none',
            cursor: 'pointer', textAlign: 'left', borderRadius: 0,
            position: 'relative', zIndex: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#2d1e0e' }}>
              My Research on {school.name}
            </span>
            <span style={{
              background: '#d4a017', color: '#fff', fontSize: 11, fontWeight: 700,
              padding: '2px 9px', borderRadius: 10, letterSpacing: 0.3,
            }}>
              Deep Dive
            </span>
          </div>
          <span style={{ color: '#a89060' }}><ChevronIcon open={open} /></span>
        </button>

        {open && (
          <div style={{ position: 'relative', zIndex: 2 }}>

            {/* Journey Timeline */}
            <div style={{
              background: 'linear-gradient(180deg, #f5edd4 0%, #fffdf5 100%)',
              padding: '14px 22px 18px',
              borderBottom: '1px solid #e8dfc0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                {journey.map((step, i) => (
                  <React.Fragment key={i}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
                      {step.status === 'completed' ? (
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          background: '#dcfce7', border: '2px solid #16a34a',
                        }}>
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      ) : step.status === 'active' ? (
                        <div style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ animation: 'ns-diamond-pulse 1.8s ease-in-out infinite', display: 'flex' }}>
                            <NsDiamond width={30} height={30} />
                          </span>
                        </div>
                      ) : (
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                          background: '#f1f5f9', border: '2px solid #cbd5e1', color: '#94a3b8',
                        }}>
                          {i + 1}
                        </div>
                      )}
                      <span style={{
                        fontSize: 9.5, fontWeight: 600, textAlign: 'center', lineHeight: 1.2,
                        color: step.status === 'completed' ? '#16a34a' : step.status === 'active' ? '#0d9488' : '#94a3b8',
                      }}>
                        {step.label}
                      </span>
                    </div>
                    {i < journey.length - 1 && (
                      <div style={{
                        flex: 1, height: 2, marginBottom: 14, maxWidth: 28,
                        background: step.status === 'completed' ? '#86efac' : '#e2e8f0',
                      }} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* ── Deep Dive Findings ─────────────────────────────── */}
            <div>
              <button
                onClick={() => setDeepDiveOpen(o => !o)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 20px', background: 'none', border: 'none',
                  borderBottom: deepDiveOpen ? '1px solid #e8dfc0' : 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: '#3d3020' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  Deep Dive Findings
                </span>
                <span style={{ color: '#a89060' }}><ChevronIcon open={deepDiveOpen} /></span>
              </button>

              {deepDiveOpen && (
                <div style={{ padding: '18px 20px' }}>

                  {/* Fit Score + Chat Bubbles row */}
                  <div style={{ display: 'flex', gap: 18, marginBottom: 18, alignItems: 'flex-start' }}>

                    {/* Conic-gradient fit score circle */}
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <div style={{
                        width: 72, height: 72, borderRadius: '50%',
                        background: `conic-gradient(#0d9488 0deg ${fitDeg}deg, #e8dfc0 ${fitDeg}deg 360deg)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(13,148,136,0.2)',
                        position: 'relative',
                      }}>
                        <div style={{
                          width: 54, height: 54, borderRadius: '50%', background: '#fffdf5',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: 18, fontWeight: 800, color: '#0d9488', lineHeight: 1 }}>{fitPct}%</span>
                          <span style={{ fontSize: 8.5, color: '#a89060', fontWeight: 600 }}>FIT</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {label}
                      </span>
                    </div>

                    {/* NS chat bubbles */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {bubbles.map((text, i) => (
                        <div key={i} style={{
                          background: '#0d9488', color: '#fff', fontSize: 12, lineHeight: 1.5,
                          padding: '8px 12px', borderRadius: '12px 12px 12px 2px',
                          boxShadow: '0 1px 4px rgba(13,148,136,0.2)',
                        }}>
                          {text}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Two-column preference grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                    {/* Matches column */}
                    <div style={{
                      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                        ✓ Matches Your Priorities
                      </div>
                      {prefs.matches.map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 6 }}>
                          <span style={{ marginTop: 1, flexShrink: 0 }}><CheckIcon /></span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>{item.label}</div>
                            <div style={{ fontSize: 10.5, color: '#4ade80', fontWeight: 500 }}>{item.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Flags column */}
                    <div style={{
                      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                        ⚑ Things to Consider
                      </div>
                      {prefs.flags.map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 6 }}>
                          <span style={{ marginTop: 1, flexShrink: 0 }}><FlagIcon /></span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>{item.label}</div>
                            <div style={{ fontSize: 10.5, color: '#d97706', fontWeight: 500 }}>{item.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Insight box */}
                  <div style={{
                    background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8,
                    padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}>
                    <div style={{ flexShrink: 0, marginTop: 1 }}><NsDiamond /></div>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
                        AI Insight
                      </div>
                      <div style={{ fontSize: 12.5, color: '#134e4a', lineHeight: 1.55 }}>
                        {insight}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Key Dates ─────────────────────────────────────── */}
            <CollapsibleSection icon={<CalendarIcon />} label="Key Dates" color="#ef4444">
              <KeyDatesContent keyDates={keyDates} />
            </CollapsibleSection>

            {/* ── Visit Prep Kit ────────────────────────────────── */}
            <CollapsibleSection icon={<BookIcon />} label="Visit Prep Kit" color="#8b5cf6">
              <VisitPrepKitContent visitPrepKit={visitPrepKit} />
            </CollapsibleSection>

            {/* ── Contact Log ───────────────────────────────────── */}
            <CollapsibleSection icon={<PhoneIcon />} label="Contact Log" color="#64748b">
              <ContactLogContent contactLog={contactLog} />
            </CollapsibleSection>

            {/* ── My Notes ──────────────────────────────────────── */}
            <div style={{ borderTop: '1px solid #e8dfc0', padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#3d3020', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                My Notes
              </div>
              <textarea
                value={noteValue}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder="Jot down your thoughts about this school..."
                rows={4}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical',
                  border: '1px solid #d4c9a8', borderRadius: 8, padding: '10px 12px',
                  background: '#faf6ec', fontSize: 13, color: '#3d3020', fontFamily: 'inherit',
                  lineHeight: 1.55, outline: 'none',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 8 }}>
                {saved && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Saved!</span>}
                <button
                  onClick={handleSave}
                  style={{
                    background: '#0d9488', color: '#fff',
                    border: 'none', borderRadius: 7, padding: '8px 20px',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Save Notes
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}