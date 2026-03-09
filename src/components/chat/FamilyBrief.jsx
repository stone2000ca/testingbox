import { X, User, MapPin, Target, AlertTriangle, BookOpen, Heart } from 'lucide-react';

const EMPTY = 'Not yet discussed';

// Known acronyms that should stay uppercase
const ACRONYMS = new Set(['IB', 'AP', 'STEM', 'ADHD', 'ESL', 'ELL', 'SSAT', 'SAT', 'ACT', 'ISEE', 'UK', 'US', 'CA', 'JK', 'SK']);

function toTitleCase(str) {
  if (!str) return str;
  return String(str)
    .split(/(\s+|,\s*|-\s*)/)
    .map(part => {
      const trimmed = part.trim().replace(/,+$/, '');
      if (!trimmed) return part;
      if (ACRONYMS.has(trimmed.toUpperCase())) return part.replace(trimmed, trimmed.toUpperCase());
      return part.replace(trimmed, trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase());
    })
    .join('');
}

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
  if (isNaN(num)) return toTitleCase(String(val));
  return `$${num.toLocaleString()}/yr`;
}

function formatSchoolType(type) {
  if (!type) return null;
  const map = { 'co-ed': 'Co-Ed', 'all-boys': 'All-Boys', 'all-girls': 'All-Girls' };
  return map[type.toLowerCase()] || toTitleCase(type);
}

function Field({ label, value }) {
  const display = value ? toTitleCase(String(value)) : null;
  return (
    <div className="mb-2">
      <span className="text-[10px] uppercase tracking-widest text-white/40 block mb-0.5">{label}</span>
      <span className={!display ? 'text-white/30 text-sm italic' : 'text-white/85 text-sm'}>
        {display || EMPTY}
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
              {toTitleCase(item)}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-white/30 text-sm italic">{EMPTY}</span>
      )}
    </div>
  );
}

export default function FamilyBrief({ familyProfile, onClose, consultantName, extractedEntities = {} }) {
  const fp = familyProfile || {};

  const learningParts = [
    ...(fp.academicStrengths || []),
    ...(fp.academicStruggles || []),
    ...(fp.learningDifferences || []),
  ];

  const accentColor = consultantName === 'Jackie' ? '#C27B8A' : '#6B9DAD';

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ width: 320, background: '#1A1A2A', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0"
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

        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <User className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Child Profile</span>
          </div>
          <Field
            label="Child"
            value={fp.childName || (fp.gender === 'male' ? 'Your son' : fp.gender === 'female' ? 'Your daughter' : 'Your child')}
          />
          {fp.childName && <Field label="Name" value={fp.childName} />}
          <Field label="Grade" value={formatGrade(fp.childGrade)} />
          <Field label="Gender" value={fp.gender} />
          <Field label="Learning Needs" value={learningParts.length > 0 ? learningParts.join(', ') : null} />
        </section>

        <div className="border-t border-white/8" />

        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <MapPin className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Logistics</span>
          </div>
          {fp.locationArea && <Field label="Location" value={fp.locationArea} />}
          <Field label="Budget" value={formatBudget(fp.maxTuition || extractedEntities?.maxTuition)} />
          {fp.schoolType && <Field label="School Type" value={formatSchoolType(fp.schoolType)} />}
        </section>

        <div className="border-t border-white/8" />

        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <BookOpen className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Curriculum</span>
          </div>
          {fp.curriculumPreference && fp.curriculumPreference.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {fp.curriculumPreference.map((item, i) => (
                <span key={i} className="text-xs bg-white/10 text-white/75 rounded px-2 py-0.5">
                  {toTitleCase(item)}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-white/30 text-sm italic">No preference yet</span>
          )}
        </section>

        <div className="border-t border-white/8" />

        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Target className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Priorities & Values</span>
          </div>
          <TagList label="Priorities" items={fp.priorities} />
        </section>

        <div className="border-t border-white/8" />

        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Heart className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Interests</span>
          </div>
          {fp.interests && fp.interests.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {fp.interests.map((item, i) => (
                <span key={i} className="text-xs bg-white/10 text-white/75 rounded px-2 py-0.5">
                  {toTitleCase(item)}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-white/30 text-sm italic">None captured yet</span>
          )}
        </section>

        <div className="border-t border-white/8" />

        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Dealbreakers</span>
          </div>
          {fp.dealbreakers && fp.dealbreakers.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {fp.dealbreakers.map((item, i) => (
                <span key={i} className="text-xs bg-white/10 text-white/75 rounded px-2 py-0.5">
                  {toTitleCase(item)}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-white/30 text-sm italic">None specified</span>
          )}
        </section>

      </div>

      <div className="px-4 py-3 border-t border-white/10 text-[10px] text-white/25 text-center flex-shrink-0">
        Updates live as you chat
      </div>
    </div>
  );
}