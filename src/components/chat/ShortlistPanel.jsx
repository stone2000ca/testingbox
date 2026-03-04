import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Heart, ExternalLink, CalendarDays, ChevronDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { buildPriorityChecks } from '@/components/schools/SchoolCard';
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, formatEventDate } from '@/components/utils/eventConstants';
import ApplicationTimeline from '@/components/schools/ApplicationTimeline';

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
  const to = formatGrade(hi);
  if (!from && !to) return '';
  if (!from) return to;
  if (!to) return from;
  return `${from}–${to}`;
}

function StatusDot({ status }) {
  if (status === 'match') return <span className="inline-block w-2 h-2 rounded-full bg-teal-400 flex-shrink-0" />;
  if (status === 'mismatch') return <span className="inline-block w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-slate-500 flex-shrink-0" />;
}

export default function ShortlistPanel({ shortlist, onClose, onRemove, onViewSchool, familyProfile }) {
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(true);

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
            {shortlist.map((school) => {
              const checks = familyProfile ? buildPriorityChecks(school, familyProfile).slice(0, 4) : [];
              const tuition = school.dayTuition ?? school.tuition;

              return (
                <div
                  key={school.id}
                  className="rounded-lg p-3 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  {/* School name + remove */}
                  <div className="flex items-start justify-between mb-1 gap-2">
                    <h3 className="text-sm font-semibold text-white leading-snug">{school.name}</h3>
                    <button
                      onClick={() => onRemove(school.id)}
                      className="text-slate-500 hover:text-rose-400 transition-colors flex-shrink-0 mt-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Location + grades */}
                  <p className="text-xs text-slate-400 mb-1">
                    {school.city}{school.provinceState ? `, ${school.provinceState}` : ''}
                    {school.lowestGrade != null && ` · Gr ${formatGradeRange(school.lowestGrade, school.highestGrade)}`}
                  </p>

                  {/* Tuition */}
                  {tuition > 0 && (
                    <p className="text-xs text-slate-500 mb-2">
                      {school.currency || 'CAD'} {tuition.toLocaleString()}/yr
                    </p>
                  )}

                  {/* Priority checks */}
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
                </div>
              );
            })}
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
                  {(ev.registrationUrl || ev.virtualUrl) && (
                    <div>
                      <a
                        href={ev.registrationUrl || ev.virtualUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-teal-400 hover:underline"
                      >
                        {ev.registrationUrl ? 'Register' : 'Join'}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}