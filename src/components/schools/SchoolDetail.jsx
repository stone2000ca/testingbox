import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Heart, MapPin, Users, DollarSign, Award } from "lucide-react";
import { createPageUrl } from "../../utils";

export default function SchoolDetail({ school, onClose, onToggleShortlist, isShortlisted }) {
  if (!school) return null;

  const getCurrencySymbol = (currency) => {
    const symbols = { CAD: 'CA$', USD: '$', EUR: '€', GBP: '£' };
    return symbols[currency] || '$';
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-xl font-bold truncate">{school.name}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Hero Image */}
      <div className="relative h-48 bg-slate-200">
        {school.heroImage ? (
          <img 
            src={school.heroImage} 
            alt={school.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-100 to-teal-200">
            <Users className="h-16 w-16 text-teal-300" />
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="p-4 border-b bg-slate-50">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-slate-600 mb-1">Location</div>
            <div className="font-medium flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {school.city}, {school.provinceState}
            </div>
          </div>
          <div>
            <div className="text-slate-600 mb-1">Grades</div>
            <div className="font-medium">{school.gradesServed}</div>
          </div>
          <div>
            <div className="text-slate-600 mb-1">Tuition</div>
            <div className="font-medium">
              {getCurrencySymbol(school.currency)}{school.tuition?.toLocaleString()}/yr
            </div>
          </div>
          <div>
            <div className="text-slate-600 mb-1">Class Size</div>
            <div className="font-medium">{school.avgClassSize} students</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="programs">Programs</TabsTrigger>
            <TabsTrigger value="admissions">Admissions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div>
              <h3 className="font-semibold mb-2">Mission</h3>
              <p className="text-sm text-slate-700 leading-relaxed">{school.missionStatement}</p>
            </div>
            
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
        </Tabs>
      </div>

      {/* Actions */}
      <div className="p-4 border-t space-y-2">
        <Button
          className={`w-full ${isShortlisted ? 'bg-teal-600 hover:bg-teal-700' : ''}`}
          variant={isShortlisted ? "default" : "outline"}
          onClick={() => onToggleShortlist(school.id)}
        >
          <Heart className={`h-4 w-4 mr-2 ${isShortlisted ? 'fill-current' : ''}`} />
          {isShortlisted ? 'Remove from Shortlist' : 'Add to Shortlist'}
        </Button>
        <Button 
          variant="outline" 
          className="w-full"
          onClick={() => window.open(createPageUrl('SchoolProfile') + '?id=' + school.id, '_blank')}
        >
          View Full Profile
        </Button>
      </div>
    </div>
  );
}