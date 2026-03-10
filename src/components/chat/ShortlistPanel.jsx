import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Heart, ExternalLink, CalendarDays, ChevronDown, Bell, BellRing } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, formatEventDate } from '@/components/utils/eventConstants';
import ApplicationTimeline from '@/components/schools/ApplicationTimeline';
import SchoolDossierCard from '@/components/chat/SchoolDossierCard';

export default function ShortlistPanel({ shortlist, onClose, onRemove, onViewSchool, familyProfile, schoolAnalyses, artifactCache, consultantName, onSendMessage, isPremiumUser, onDossierExpandChange }) {
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(true);
  // E16a-019: Reminded events loaded from localStorage
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
        setUpcomingEvents([]);
        setEventsLoaded(true);
        return;
      }
      setEventsLoaded(false);
      const today = new Date().toISOString();
      try {
        const results = await Promise.all(
          shortlist.map(school =>
            base44.entities.SchoolEvent.filter({ schoolId: school.id, isActive: true })
              .then(evs => evs
                .filter(e => e.date && e.date >= today)
                .map(e => ({ ...e, schoolName: school.name }))
              )
          )
        );
        const merged = results.flat().sort((a, b) => new Date(a.date) - new Date(b.date));
        setUpcomingEvents(merged);
      } catch (err) {
        console.error('[ShortlistPanel] Failed to fetch events:', err);
        setUpcomingEvents([]);
      } finally {
        setEventsLoaded(true);
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
  };

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
              />
            ))}
          </div>
        )}

        {/* E13b: Application Timeline — 2+ schools only */}
        {shortlist.length >= 2 && (
          <div className="p-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setTimelineExpanded(!timelineExpanded)}
              className="flex items-center gap-2 w-full mb-3 transition-colors hover:opacity-80"
            >
              <CalendarDays className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <h3 className="text-sm font-semibold text-white">Application Timeline</h3>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 ml-auto transition-transform flex-shrink-0 ${
                  timelineExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
            {timelineExpanded && (
              <div className="mb-4">
                <ApplicationTimeline shortlist={shortlist} />
              </div>
            )}
          </div>
        )}

        {/* E16b-004: Upcoming Events feed */}
        <div className="p-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-teal-400" />
            <h3 className="text-sm font-semibold text-white">Upcoming Events</h3>
          </div>
          {!eventsLoaded ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin h-4 w-4 border-2 border-teal-400 border-t-transparent rounded-full" />
            </div>
          ) : upcomingEvents.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">
              No upcoming events for your shortlisted schools.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map(ev => (
                <div
                  key={ev.id}
                  className="rounded-lg p-3 space-y-1.5"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <p className="text-[11px] text-slate-400 flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    {formatEventDate(ev.date)}
                  </p>
                  <p className="text-sm font-semibold text-white leading-snug">{ev.title}</p>
                  <p className="text-xs text-slate-400">{ev.schoolName}</p>
                  <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${EVENT_TYPE_COLORS[ev.eventType] || 'bg-slate-700 text-slate-300'}`}>
                    {EVENT_TYPE_LABELS[ev.eventType] || ev.eventType}
                  </span>
                  {/* E16a-019: Register link + Remind Me bell button */}
                  <div className="flex items-center justify-between gap-2">
                    {(ev.registrationUrl || ev.virtualUrl) ? (
                      <a
                        href={ev.registrationUrl || ev.virtualUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-teal-400 hover:underline"
                      >
                        {ev.registrationUrl ? 'Register' : 'Join'}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : null}
                    <button
                      onClick={() => handleToggleReminder(ev)}
                      className="p-1 text-slate-400 hover:text-white transition-colors rounded flex-shrink-0"
                      title={remindedEvents.has(ev.id) ? 'Reminder set' : 'Remind me'}
                    >
                      {remindedEvents.has(ev.id) ? (
                        <BellRing className="w-4 h-4" style={{ color: '#F5A623' }} />
                      ) : (
                        <Bell className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}