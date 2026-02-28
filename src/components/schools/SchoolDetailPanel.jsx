import { Button } from "@/components/ui/button";
import { ArrowLeft, Heart, MapPin } from "lucide-react";

function gradeLabel(grade) {
  if (grade === null || grade === undefined) return '?';
  if (grade === -2) return 'PK';
  if (grade === -1) return 'JK';
  if (grade === 0) return 'K';
  return String(grade);
}

export default function SchoolDetailPanel({ 
  school, 
  onBack, 
  onToggleShortlist, 
  isShortlisted 
}) {
  if (!school) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Results
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{school.name}</h2>
            <p className="text-slate-600 flex items-center gap-1 mt-1">
              <MapPin className="h-4 w-4" />
              {school.city}, {school.provinceState}
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm text-slate-600">Grades</p>
              <p className="text-lg font-semibold">{school.lowestGrade}-{school.highestGrade}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm text-slate-600">Tuition</p>
              <p className="text-lg font-semibold">
                {school.tuition ? `$${school.tuition.toLocaleString()}` : 'Contact school'}
              </p>
            </div>
          </div>
          
          {school.curriculumType && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Curriculum</h3>
              <p className="text-slate-700">{school.curriculumType}</p>
            </div>
          )}
          
          {school.description && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">About</h3>
              <p className="text-slate-700 text-sm">{school.description}</p>
            </div>
          )}
          
          {school.specializations?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Specializations</h3>
              <div className="flex flex-wrap gap-2">
                {school.specializations.map((spec, idx) => (
                  <span key={idx} className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm">
                    {spec}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex gap-3">
            <Button
              onClick={() => onToggleShortlist(school.id)}
              variant={isShortlisted ? 'default' : 'outline'}
              className="flex-1"
            >
              <Heart className={`h-4 w-4 mr-2 ${isShortlisted ? 'fill-current' : ''}`} />
              {isShortlisted ? 'Shortlisted' : 'Add to Shortlist'}
            </Button>
            {school.website && (
              <Button
                variant="outline"
                onClick={() => window.open(school.website, '_blank')}
                className="flex-1"
              >
                Visit Website
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}