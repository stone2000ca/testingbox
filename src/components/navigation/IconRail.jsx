import { MessageSquare, ClipboardList, Bookmark, Compass } from 'lucide-react';
import { STATES } from '@/pages/stateMachineConfig';

const RAIL_ITEMS = [
  { id: 'chat',   icon: MessageSquare, label: 'Chat' },
  { id: 'brief',  icon: ClipboardList,  label: 'Family Brief' },
  { id: 'shortlist', icon: Bookmark,   label: 'Shortlist',      disabled: true },
  { id: 'browse', icon: Compass,        label: 'Browse Schools', disabled: true },
];

export default function IconRail({ currentState, showFamilyBrief, onToggleBrief }) {
  const isWelcome = currentState === STATES.WELCOME;

  return (
    <nav
      className="flex flex-col items-center py-3 gap-1 flex-shrink-0 border-r border-white/10"
      style={{ width: 48, background: '#181826' }}
      aria-label="Navigation rail"
    >
      {RAIL_ITEMS.map(({ id, icon: Icon, label, disabled }) => {
        const isChat = id === 'chat';
        const isBrief = id === 'brief';
        const isNonChat = !isChat;

        // Opacity: welcome state → non-chat icons at 30%; disabled → 50%; active → 100%
        let opacity = 1;
        if (isWelcome && isNonChat) opacity = 0.3;
        else if (disabled) opacity = 0.5;

        const isActive = isChat || (isBrief && showFamilyBrief);
        const cursor = disabled || (isWelcome && isNonChat) ? 'not-allowed' : 'pointer';

        const handleClick = () => {
          if (disabled || (isWelcome && isNonChat)) return;
          if (isBrief) onToggleBrief();
        };

        return (
          <div key={id} className="relative group w-full flex justify-center">
            <button
              onClick={handleClick}
              aria-label={label}
              style={{ opacity, cursor }}
              className={`
                w-9 h-9 flex items-center justify-center rounded-lg transition-all
                ${isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10'}
              `}
            >
              <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
            </button>

            {/* Tooltip */}
            <div
              className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50
                         bg-[#2A2A3D] text-white text-xs px-2 py-1 rounded whitespace-nowrap
                         opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 shadow-lg"
            >
              {label}
              {disabled && <span className="ml-1 text-white/40">(coming soon)</span>}
            </div>
          </div>
        );
      })}
    </nav>
  );
}