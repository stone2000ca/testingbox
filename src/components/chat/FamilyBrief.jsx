import { X, User, MapPin, Target, AlertTriangle } from 'lucide-react';

const EMPTY = 'Not yet discussed';

function formatGrade(grade) {
  if (grade === null || grade === undefined) return null;
  if (grade === -2) return 'Pre-K';
  if (grade === -1) return 'JK';
  if (grade === 0) return 'Kindergarten';
  return `Grade ${grade}`;
}

function formatBudget(val) {
  if (!val) return null;
  if (val === 'unlimited') return 'Flexible / No limit';
  const num = typeof val === 'number' ? val : parseInt(val);
  if (isNaN(num)) return String(val);
  return `$${num.toLocaleString()}/yr`;
}

function Field({ label, value }) {
  const isEmpty = !value;
  return (
    <div className="mb-2">
      <span className="text-[10px] uppercase tracking-widest text-white/40 block mb-0.5">{label}</span>
      <span className={isEmpty ? 'text-white/30 text-sm italic' : 'text-white/85 text-sm'}>
        {isEmpty ? EMPTY : value}
      </span>
    </div>
  );
}

function TagList({ label, items }) {
  const hasItems = items && items.length > 0;
  return (
    <div className="mb-2">
      <span className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">{label}</span>
      {hasItems ? (
        <div className="flex flex-wrap gap-1">
          {items.map((item, i) => (
            <span key={i} className="text-xs bg-white/10 text-white/75 rounded px-2 py-0.5">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-white/30 text-sm italic">{EMPTY}</span>
      )}
    </div>
  );
}

export default function FamilyBrief({ familyProfile, onClose, consultantName }) {
  const fp = familyProfile || {};

  // Learning Needs: consolidate three fields
  const learningParts = [
    ...(fp.academicStrengths || []),
    ...(fp.academicStruggles || []),
    ...(fp.learningDifferences || []),
  ];

  const accentColor = consultantName === 'Jackie' ? '#C27B8A' : '#6B9DAD';

  return (
    <div
      className="fixed top-0 right-0 h-full z-50 flex flex-col shadow-2xl overflow-hidden"
      style={{ width: '300px', background: '#1A1A2A', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10"
           style={{ background: '#1E1E2E' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: accentColor }} />
          <span className="text-sm font-semibold text-white/90">Family Brief</span>
        </div>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white/80 transition-colors"
          aria-label="Close Family Brief"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Section: Child Profile */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <User className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Child Profile</span>
          </div>
          <Field label="Name" value={fp.childName} />
          <Field label="Grade" value={formatGrade(fp.childGrade)} />
          <Field label="Gender" value={fp.gender} />
          <Field
            label="Learning Needs"
            value={learningParts.length > 0 ? learningParts.join(', ') : null}
          />
        </section>

        <div className="border-t border-white/8" />

        {/* Section: Priorities & Values */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Target className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Priorities & Values</span>
          </div>
          <TagList label="Priorities" items={fp.priorities} />
          <TagList label="Interests" items={fp.interests} />
        </section>

        <div className="border-t border-white/8" />

        {/* Section: Logistics */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <MapPin className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Logistics</span>
          </div>
          <Field label="Location" value={fp.locationArea} />
          <Field label="Budget" value={formatBudget(fp.maxTuition)} />
        </section>

        <div className="border-t border-white/8" />

        {/* Section: Dealbreakers */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Dealbreakers</span>
          </div>
          <TagList label="Dealbreakers" items={fp.dealbreakers} />
        </section>

      </div>

      {/* Footer note */}
      <div className="px-4 py-3 border-t border-white/10 text-[10px] text-white/25 text-center">
        Updates live as you chat
      </div>
    </div>
  );
}