import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Heart, MapPin, Award, Mail, Phone, Globe2, ExternalLink, CalendarDays } from "lucide-react";
import { createPageUrl } from "../../utils";
import ContactSchoolModal from './ContactSchoolModal';
import TourRequestModal from './TourRequestModal';
import { HeaderPhotoDisplay, LogoDisplay, isClearbitUrl } from './HeaderPhotoHelper';

import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, formatEventDate } from '@/components/utils/eventConstants';

export default function SchoolDetail({ school, onClose, onToggleShortlist, isShortlisted }) {
  const [showContactModal, setShowContactModal] = useState(false);
  const [showTourModal, setShowTourModal] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const isPremium = school?.schoolTier === 'pro';
  useEffect(() => {
    if (!school?.id) return;
    base44.entities.SchoolEvent.filter({ schoolId: school.id, isActive: true })
      .then(data => {
        const upcoming = data
          .filter(e => !e.date || new Date(e.date) >= new Date())
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        setEvents(upcoming);
      })
      .catch(() => {})
      .finally(() => setEventsLoaded(true));
  }, [school?.id]);

  if (!school) return null;

  function formatGrade(grade) {
    if (grade === null || grade === undefined) return '';
    const num = Number(grade);
    if (num <= -2) return 'PK';
    if (num === -1) return 'JK';
    if (num === 0) return 'K';
    return String(num);
  }

  function formatGradeRange(gradeFrom, gradeTo) {
    const from = formatGrade(gradeFrom);
    const to = formatGrade(gradeTo);
    if (!from && !to) return '';
    if (!from) return to;
    if (!to) return from;
    return `${from}-${to}`;
  }

  const getCurrencySymbol = (currency) => {
    const symbols = { CAD: 'CA$', USD: '$', EUR: '€', GBP: '£' };
    return symbols[currency] || '$';
  };

  return (
    <>
      <div className="h-full flex flex-col bg-white">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b">
          <h2 className="text-base sm:text-xl font-bold truncate flex-1 min-w-0">{school.name}</h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              onClick={() => setShowContactModal(true)}
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 hidden sm:flex"
            >
              <Mail className="h-4 w-4 mr-2" />
              Send Inquiry
            </Button>
            <Button
              onClick={() => setShowContactModal(true)}
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 sm:hidden"
              aria-label="Send inquiry to school"
            >
              <Mail className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => onToggleShortlist(school.id)}
              variant={isShortlisted ? "default" : "outline"}
              size="sm"
              aria-label={isShortlisted ? "Remove from shortlist" : "Add to shortlist"}
            >
              <Heart className={`h-4 w-4 ${isShortlisted ? 'fill-current' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close school details">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

      {/* Hero Image */}
      <div className="relative h-40 sm:h-48 bg-slate-200">
        <img 
          src={school.headerPhotoUrl || school.heroImage || `https://via.placeholder.com/1200x675/e2e8f0/64748b?text=${encodeURIComponent(school.name)}`}
          alt={`${school.name} campus`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      {/* Quick Stats */}
      <div className="p-3 sm:p-4 border-b bg-slate-50">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
          <div>
            <div className="text-slate-600 mb-1">Location</div>
            <div className="font-medium flex items-center gap-1">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{school.city}, {school.provinceState}</span>
            </div>
          </div>
          <div>
            <div className="text-slate-600 mb-1">Grades</div>
            <div className="font-medium">{formatGradeRange(school.lowestGrade, school.highestGrade)}</div>
          </div>
          <div>
            <div className="text-slate-600 mb-1">Tuition</div>
            <div className="font-medium truncate">
              {getCurrencySymbol(school.currency)}{school.tuition?.toLocaleString()}/yr
            </div>
          </div>
          <div>
            <div className="text-slate-600 mb-1">Class Size</div>
            <div className="font-medium">
              {school.avgClassSize && school.avgClassSize > 0 ? `${school.avgClassSize} students` : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="programs" className="text-xs sm:text-sm">Programs</TabsTrigger>
            <TabsTrigger value="admissions" className="text-xs sm:text-sm">Admissions</TabsTrigger>
            <TabsTrigger value="events" className="text-xs sm:text-sm flex items-center gap-1">
              Events{events.length > 0 && <span className="ml-0.5 bg-teal-600 text-white text-[10px] rounded-full px-1.5">{events.length}</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {school.missionStatement && (
              <div>
                <h3 className="font-semibold mb-2">Mission</h3>
                <p className="text-sm text-slate-700 leading-relaxed">{school.missionStatement}</p>
              </div>
            )}
            
            {(school.phone || school.email || school.website) && (
              <div>
                <h3 className="font-semibold mb-2">Contact Information</h3>
                <div className="space-y-2">
                  {school.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span>{school.phone}</span>
                    </div>
                  )}
                  {school.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <a href={`mailto:${school.email}`} className="text-teal-600 hover:underline">
                        {school.email}
                      </a>
                    </div>
                  )}
                  {school.website && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe2 className="h-4 w-4 text-slate-400" />
                      <a 
                        href={`https://${school.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 hover:underline flex items-center gap-1"
                      >
                        Visit Website
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {school.curriculumType && (
              <div>
                <h3 className="font-semibold mb-2">Curriculum</h3>
                <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm">
                  {school.curriculumType}
                </span>
              </div>
            )}

            {school.specializations && school.specializations.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Specializations</h3>
                <div className="flex flex-wrap gap-2">
                  {school.specializations.map((spec, idx) => (
                    <span key={idx} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                      {spec}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {school.verified && (
              <div className="flex items-center gap-2 text-sm">
                <Award className="h-4 w-4 text-teal-600" />
                <span className="text-teal-600 font-medium">Verified School</span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="programs" className="space-y-4 mt-4">
            {school.artsPrograms && school.artsPrograms.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Arts</h3>
                <div className="flex flex-wrap gap-2">
                  {school.artsPrograms.map((program, idx) => (
                    <span key={idx} className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">
                      {program}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {school.sportsPrograms && school.sportsPrograms.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Sports</h3>
                <div className="flex flex-wrap gap-2">
                  {school.sportsPrograms.map((program, idx) => (
                    <span key={idx} className="px-2 py-1 bg-teal-100 text-teal-700 rounded text-xs">
                      {program}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {school.languages && school.languages.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Languages</h3>
                <div className="flex flex-wrap gap-2">
                  {school.languages.map((lang, idx) => (
                    <span key={idx} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="admissions" className="space-y-4 mt-4">
            {school.applicationDeadline && (
              <div>
                <h3 className="font-semibold mb-2">Application Deadline</h3>
                <p className="text-sm text-slate-700">{school.applicationDeadline}</p>
              </div>
            )}

            {school.financialAidAvailable && (
              <div>
                <h3 className="font-semibold mb-2">Financial Aid</h3>
                <p className="text-sm text-teal-600">Available</p>
              </div>
            )}

            {school.acceptanceRate && (
              <div>
                <h3 className="font-semibold mb-2">Acceptance Rate</h3>
                <p className="text-sm text-slate-700">{school.acceptanceRate}%</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="events" className="mt-4">
            {!eventsLoaded ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-5 w-5 border-4 border-teal-600 border-t-transparent rounded-full" />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <CalendarDays className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium text-sm">No upcoming events</p>
                <p className="text-xs mt-1 text-slate-400">Check the school's website for the latest events.</p>
                {school.website && (
                  <a href={`https://${school.website}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="mt-3 gap-1 text-xs">
                      <ExternalLink className="h-3 w-3" /> Visit Website
                    </Button>
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {isPremium && (
                  <Button
                    onClick={() => setShowTourModal(true)}
                    className="w-full bg-teal-600 hover:bg-teal-700 gap-2"
                    size="sm"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Request a Tour
                  </Button>
                )}
                {!isPremium && school.email && (
                  <a href={`mailto:${school.email}`} className="block w-full">
                    <Button variant="outline" className="w-full gap-2 text-sm" size="sm">
                      <Mail className="h-4 w-4" />
                      Contact School Directly
                    </Button>
                  </a>
                )}
                {events.map(ev => (
                  <div key={ev.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${EVENT_TYPE_COLORS[ev.eventType] || 'bg-slate-100 text-slate-600'}`}>
                        {EVENT_TYPE_LABELS[ev.eventType] || ev.eventType}
                      </span>
                      {!ev.isConfirmed && (
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Unconfirmed</span>
                      )}
                    </div>
                    <p className="font-semibold text-sm text-slate-900">{ev.title}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {formatEventDate(ev.date)}
                      {ev.endDate ? ` – ${formatEventDate(ev.endDate)}` : ''}
                    </p>
                    {ev.description && (
                      <p className="text-xs text-slate-600 line-clamp-2">{ev.description}</p>
                    )}
                    {(ev.registrationUrl || ev.virtualUrl) && (
                      <a
                        href={ev.registrationUrl || ev.virtualUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline"
                      >
                        {ev.registrationUrl ? 'Register' : 'Learn More'}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Actions */}
      <div className="p-3 sm:p-4 border-t space-y-2">
        <Button 
          variant="outline" 
          className="w-full text-sm"
          onClick={() => window.open(createPageUrl('SchoolProfile') + '?id=' + school.id, '_blank')}
        >
          View Full Profile
        </Button>
      </div>
    </div>

      {showContactModal && (
        <ContactSchoolModal
          school={school}
          onClose={() => setShowContactModal(false)}
        />
      )}
      {showTourModal && (
        <TourRequestModal
          school={school}
          onClose={() => setShowTourModal(false)}
          upcomingEvents={events}
        />
      )}
    </>
  );
}