import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Heart, DollarSign, Users } from "lucide-react";

export default function SchoolCard({ school, onViewDetails, onToggleShortlist, isShortlisted }) {
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

  const badge = getRegionBadge(school.region);

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group">
      <div onClick={onViewDetails}>
        {/* Image */}
        <div className="relative h-48 bg-slate-200 overflow-hidden">
          {school.heroImage ? (
            <img 
              src={school.heroImage} 
              alt={school.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-100 to-teal-200">
              <Users className="h-16 w-16 text-teal-400" />
            </div>
          )}
          {/* Region Badge */}
          <div className={`absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
            {badge.emoji} {school.region}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-bold text-lg mb-1 line-clamp-1">{school.name}</h3>
          <div className="flex items-center gap-1 text-sm text-slate-600 mb-3">
            <MapPin className="h-3 w-3" />
            <span className="line-clamp-1">{school.city}, {school.provinceState}</span>
            {school.distanceKm && (
              <span className="text-xs text-slate-500">• {school.distanceKm.toFixed(1)} km</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-3 text-xs">
            <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md">
              {school.gradesServed}
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
            <div className="flex items-center gap-1 text-slate-900 font-semibold">
              <DollarSign className="h-4 w-4" />
              {getCurrencySymbol(school.currency)}{school.tuition?.toLocaleString() || 'N/A'}
              <span className="text-xs text-slate-500 font-normal">/year</span>
            </div>
          </div>
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