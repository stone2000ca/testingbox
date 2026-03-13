import { ClipboardList, Heart, Search, CalendarDays } from 'lucide-react';
import { STATES } from '@/pages/stateMachineConfig';

// T046 Owner Override: Right-side rail, 3 icons, Family Brief as primary
export default function IconRail({ currentState, activePanel, onTogglePanel }) {
  const isWelcome = currentState === STATES.WELCOME;
  const isDiscoveryOrBrief = [STATES.DISCOVERY, STATES.BRIEF].includes(currentState);
  const isResults = [STATES.RESULTS, STATES.DEEP_DIVE].includes(currentState);

  const accentColor = '#0D9488'; // brand teal

  // Brief: disabled only in WELCOME
  const briefEnabled = !isWelcome;
  const briefOpacity = briefEnabled ? 1 : 0.4;
  const briefActive = activePanel === 'brief';

  // Shortlist: enabled only in RESULTS/DEEPDIVE
  const shortlistEnabled = isResults;
  const shortlistOpacity = shortlistEnabled ? 1 : 0.35;
  const shortlistActive = activePanel === 'shortlist';

  // Add School: enabled only in RESULTS/DEEPDIVE
  const addSchoolEnabled = isResults;
  const addSchoolActive = activePanel === 'addSchool';

  // Timeline: enabled only in RESULTS/DEEPDIVE
  const timelineEnabled = isResults;
  const timelineActive = activePanel === 'timeline';

  return (
    <nav
      className="hidden lg:flex flex-col items-center pt-4 gap-3 flex-shrink-0 border-l border-white/10"
      style={{ width: 48, background: '#181826' }}
      aria-label="Navigation rail"
    >
      {/* --- Family Brief (PRIMARY) --- */}
      <div className="relative group flex flex-col items-center gap-0.5">
        <button
          onClick={() => briefEnabled && onTogglePanel('brief')}
          disabled={!briefEnabled}
          aria-label="Family Brief"
          style={{ opacity: briefOpacity, cursor: briefEnabled ? 'pointer' : 'not-allowed' }}
          className="relative flex items-center justify-center rounded-full transition-all"
          css-width="32px"
          css-height="32px"
          style={{
            opacity: briefOpacity,
            cursor: briefEnabled ? 'pointer' : 'not-allowed',
            width: 32,
            height: 32,
            borderRadius: 9999,
            background: briefActive ? accentColor : accentColor + 'CC',
            boxShadow: briefActive
              ? `0 0 0 3px rgba(13,148,136,0.35), inset 0 0 0 0 transparent`
              : 'none',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (briefEnabled && !briefActive) e.currentTarget.style.background = accentColor;
          }}
          onMouseLeave={e => {
            if (briefEnabled && !briefActive) e.currentTarget.style.background = accentColor + 'CC';
          }}
        >
          {/* Left-edge active bar */}
          {briefActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
              style={{ width: 3, height: 18, background: '#fff', marginLeft: -16 }}
            />
          )}
          <ClipboardList style={{ width: 16, height: 16, color: '#fff' }} />
        </button>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 1, userSelect: 'none' }}>
          Brief
        </span>
        {/* Tooltip */}
        <div className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 z-50
                        bg-[#2A2A3D] text-white text-xs px-2 py-1 rounded whitespace-nowrap
                        opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 shadow-lg">
          Family Brief
        </div>
      </div>

      {/* --- Shortlist --- */}
      <RailIcon
        icon={Heart}
        label="Shortlist"
        enabled={shortlistEnabled}
        active={shortlistActive}
        onClick={() => shortlistEnabled && onTogglePanel('shortlist')}
        disabledTip="Available after finding schools"
        shortlistCount={0}
      />
      <RailIcon
        icon={Search}
        label="+ School"
        enabled={addSchoolEnabled}
        active={addSchoolActive}
        onClick={() => addSchoolEnabled && onTogglePanel('addSchool')}
        disabledTip="Available after finding schools"
      />
    </nav>
  );
}

function RailIcon({ icon: Icon, label, enabled, active, onClick, disabledTip, shortlistCount }) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        aria-label={label}
        style={{
          opacity: enabled ? 1 : 0.35,
          cursor: enabled ? 'pointer' : 'not-allowed',
          width: 32,
          height: 32,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
          color: active ? '#fff' : 'rgba(255,255,255,0.55)',
          transition: 'all 0.15s ease',
          position: 'relative',
        }}
        onMouseEnter={e => {
          if (enabled && !active) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
        }}
        onMouseLeave={e => {
          if (enabled && !active) e.currentTarget.style.background = 'transparent';
        }}
      >
        <Icon style={{ width: 17, height: 17 }} />
        {shortlistCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 text-xs font-bold text-white bg-teal-500 rounded-full"
          >
            {shortlistCount}
          </span>
        )}
      </button>
      {/* Tooltip */}
      <div className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 z-50
                      bg-[#2A2A3D] text-white text-xs px-2 py-1 rounded whitespace-nowrap
                      opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 shadow-lg">
        {label}
        {shortlistCount > 0 && <span className="text-teal-300"> ({shortlistCount})</span>}
        {!enabled && disabledTip && <span className="ml-1 text-white/40">({disabledTip})</span>}
      </div>
    </div>
  );
}