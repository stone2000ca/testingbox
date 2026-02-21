import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Heart, DollarSign, Users, Navigation, Check, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HeaderPhotoDisplay, LogoDisplay, isClearbitUrl } from '@/components/schools/HeaderPhotoHelper';

export default function SchoolCard({ school, onViewDetails, onToggleShortlist, isShortlisted, index = 0 }) {
  const getCurrencySymbol = (currency) => {
    const symbols = { CAD: 'CA$', USD: '$', EUR: '€', GBP: '£' };
    return symbols[currency] || '$';
  };

  const getRegionBadge = (region) => {
    const badges = {
      Canada: { emoji: '🍁', color: 'bg-red-50 text-red-700' },
      US: { emoji: '🇺🇸', color: 'bg-blue-50 text-blue-700' },
      Europe: { emoji: '🇪🇺', color: 'bg-indigo-50 text-indigo-700' }
    };
    return badges[region] || { emoji: '🌍', color: 'bg-slate-50 text-slate-700' };
  };

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

  const badge = getRegionBadge(school.region);

  return (
    <Card 
      className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group school-card h-full flex flex-col"
      style={{
        animation: 'fadeSlideUp 0.4s ease-out',
        animationDelay: `${index * 0.1}s`,
        animationFillMode: 'backwards'
      }}
    >
      <style jsx>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div onClick={onViewDetails} className="flex-1 flex flex-col">
        {/* Image */}
        <div className="relative h-48 bg-slate-200 overflow-hidden group-hover:scale-105 transition-transform duration-300">
          <div className="absolute inset-0">
            <HeaderPhotoDisplay 
              headerPhotoUrl={school.headerPhotoUrl}
              heroImage={school.heroImage}
              schoolName={school.name}
              height="h-48"
            />
          </div>
          {/* Region Badge */}
          <div className={`absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
            {badge.emoji} {school.region}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <LogoDisplay logoUrl={school.logoUrl} schoolName={school.name} schoolWebsite={school.website} size="h-5 w-5" />
            <h3 className="font-bold text-lg line-clamp-1">{school.name}</h3>
          </div>
          <div className="flex items-center gap-1 text-sm text-slate-600 mb-3">
            <MapPin className="h-3 w-3" />
            <span className="line-clamp-1">{school.city}, {school.provinceState}</span>
          </div>
          
          {school.distanceKm && (
            <div className="mb-3">
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-700 rounded-md text-xs font-medium">
                <Navigation className="h-3 w-3" />
                {school.distanceKm.toFixed(1)} km away
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-3 text-xs">
            <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md">
              {formatGradeRange(school.lowestGrade, school.highestGrade)}
            </span>
            <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md">
              {school.curriculumType}
            </span>
            {school.enrollment && (
              <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md">
                {school.enrollment} students
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-slate-900 font-semibold text-sm">
              <DollarSign className="h-4 w-4" />
              {school.dayTuition && school.boardingTuition ? (
                <span className="text-xs">
                  from {getCurrencySymbol(school.currency)}{school.dayTuition.toLocaleString()} (day) / {getCurrencySymbol(school.currency)}{school.boardingTuition.toLocaleString()} (boarding)
                </span>
              ) : school.dayTuition ? (
                <>
                  {getCurrencySymbol(school.currency)}{school.dayTuition.toLocaleString()}
                  <span className="text-xs text-slate-500 font-normal">/year (day)</span>
                </>
              ) : school.boardingTuition ? (
                <>
                  {getCurrencySymbol(school.currency)}{school.boardingTuition.toLocaleString()}
                  <span className="text-xs text-slate-500 font-normal">/year (boarding)</span>
                </>
              ) : (
                <>
                  {getCurrencySymbol(school.currency)}{school.tuition?.toLocaleString() || 'N/A'}
                  <span className="text-xs text-slate-500 font-normal">/year</span>
                </>
              )}
            </div>
          </div>

          {/* Match Explanations */}
          {school.matchExplanations && school.matchExplanations.length > 0 && (
            <>
              <div className="my-3 border-t border-slate-200" />
              <div className="space-y-2 text-xs">
                {school.matchExplanations.map((match, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    {match.type === 'positive' ? (
                      <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    )}
                    <span className={match.type === 'positive' ? 'text-slate-700' : 'text-slate-600'}>
                      {match.text}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4">
        <Button
          variant={isShortlisted ? "default" : "outline"}
          size="sm"
          className={`w-full ${isShortlisted ? 'bg-teal-600 hover:bg-teal-700' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleShortlist(school.id);
          }}
        >
          <Heart className={`h-4 w-4 mr-2 ${isShortlisted ? 'fill-current' : ''}`} />
          {isShortlisted ? 'Shortlisted' : 'Add to Shortlist'}
        </Button>
      </div>
    </Card>
  );
}