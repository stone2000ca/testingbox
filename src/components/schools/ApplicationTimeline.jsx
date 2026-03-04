import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { CalendarDays, Bell, BellRing } from 'lucide-react';
import { EVENT_TYPE_LABELS } from '@/components/utils/eventConstants';

/**
 * ApplicationTimeline
 * Renders a vertical timeline of upcoming events from shortlisted schools,
 * grouped by month with color-coded event type badges.
 */
export default function ApplicationTimeline({ shortlist }) {
   const [events, setEvents] = useState([]);
   const [loading, setLoading] = useState(true);
   const [remindedEvents, setRemindedEvents] = useState(new Set());

   // E16a-019: Load reminded events from localStorage on mount
   useEffect(() => {
     try {
       const stored = localStorage.getItem('ns_event_reminders');
       if (stored) {
         const reminders = JSON.parse(stored);
         setRemindedEvents(new Set(reminders.map(r => r.eventId)));
       }
     } catch (err) {
       console.error('[E16a-019] Failed to load reminders:', err);
     }
   }, []);

  useEffect(() => {
    async function fetchEvents() {
      if (shortlist.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const today = new Date().toISOString();
      try {
        const results = await Promise.all(
          shortlist.map(school =>
            base44.entities.SchoolEvent.filter({ schoolId: school.id, isActive: true })
              .then(evs =>
                evs
                  .filter(e => e.date && e.date >= today)
                  .map(e => ({
                    ...e,
                    schoolName: school.name,
                    schoolId: school.id
                  }))
              )
              .catch(() => [])
          )
        );
        const merged = results.flat().sort((a, b) => new Date(a.date) - new Date(b.date));
        setEvents(merged);
      } catch (err) {
        console.error('[ApplicationTimeline] Failed to fetch events:', err);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, [shortlist.map(s => s.id).join(',')]);

  // E16a-019: Handle reminder toggle for event
  const handleToggleReminder = (event) => {
    try {
      let stored = [];
      const existing = localStorage.getItem('ns_event_reminders');
      if (existing) {
        stored = JSON.parse(existing);
      }

      const isReminded = remindedEvents.has(event.id);
      if (isReminded) {
        // Remove reminder
        stored = stored.filter(r => r.eventId !== event.id);
      } else {
        // Add reminder
        stored.push({
          eventId: event.id,
          schoolName: event.schoolName,
          eventTitle: event.title,
          eventDate: event.date,
          savedAt: new Date().toISOString()
        });
      }

      localStorage.setItem('ns_event_reminders', JSON.stringify(stored));
      setRemindedEvents(new Set(stored.map(r => r.eventId)));
    } catch (err) {
      console.error('[E16a-019] Failed to toggle reminder:', err);
    }
  };;

  // Group events by month
  const groupedByMonth = {};
  events.forEach(ev => {
    const date = new Date(ev.date);
    const month = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groupedByMonth[month]) {
      groupedByMonth[month] = [];
    }
    groupedByMonth[month].push(ev);
  });

  const eventTypeColors = {
    open_house: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    campus_tour: 'bg-green-500/20 text-green-300 border border-green-500/30',
    info_session: 'bg-green-500/20 text-green-300 border border-green-500/30',
    shadow_day: 'bg-green-500/20 text-green-300 border border-green-500/30',
    virtual_tour: 'bg-green-500/20 text-green-300 border border-green-500/30',
    deadline: 'bg-red-500/20 text-red-300 border border-red-500/30',
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="animate-spin h-4 w-4 border-2 border-teal-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-slate-500 text-center py-4">
        No upcoming events for your shortlisted schools.
      </p>
    );
  }

  const months = Object.keys(groupedByMonth);

  return (
    <div className="space-y-6">
      {months.map(month => (
        <div key={month}>
          {/* Month divider */}
          <div className="flex items-center justify-center mb-4">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="px-3 text-xs font-semibold text-slate-400">— {month} —</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          {/* Events in this month */}
          <div className="space-y-4">
            {groupedByMonth[month].map((ev, idx) => {
              const evDate = new Date(ev.date);
              const dayLabel = evDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: '2-digit',
                day: '2-digit'
              });

              const colorClass = eventTypeColors[ev.eventType] || 'bg-slate-700/20 text-slate-400 border border-slate-700/30';

              return (
                <div key={ev.id} className="flex gap-4 items-start">
                  {/* Left: Date label */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs font-semibold text-slate-300 whitespace-nowrap">
                      {dayLabel}
                    </p>
                  </div>

                  {/* Center: Vertical line + dot */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0"
                      style={{ marginTop: '3px' }}
                    />
                    {idx !== groupedByMonth[month].length - 1 && (
                      <div className="w-px h-12 bg-slate-600 mt-2" />
                    )}
                  </div>

                  {/* Right: Event pill */}
                  <div
                    className="flex-1 rounded-lg p-3 space-y-1.5"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{ev.title}</p>
                        <p className="text-xs text-slate-400">{ev.schoolName}</p>
                        <span className={`inline-block text-[10px] font-semibold px-2 py-1 rounded ${colorClass}`}>
                          {EVENT_TYPE_LABELS[ev.eventType] || ev.eventType}
                        </span>
                      </div>
                      <button
                        onClick={() => handleToggleReminder(ev)}
                        className="p-1.5 rounded flex-shrink-0 transition-colors"
                        style={{
                          color: remindedEvents.has(ev.id) ? '#F5A623' : '#8888A0',
                          background: 'transparent'
                        }}
                        title="Remind me (in-app)"
                      >
                        {remindedEvents.has(ev.id) ? (
                          <BellRing className="w-4 h-4" />
                        ) : (
                          <Bell className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}