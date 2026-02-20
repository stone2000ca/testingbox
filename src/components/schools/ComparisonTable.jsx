import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ComparisonTable({ schools, onBack }) {
  if (!schools || schools.length === 0) return null;

  const attributes = [
    { label: 'School Name', key: 'name' },
    { label: 'Location', key: 'location' },
    { label: 'Grade Range', key: 'grades' },
    { label: 'Curriculum Type', key: 'curriculumType' },
    { label: 'Tuition', key: 'tuition' },
    { label: 'Student Count', key: 'enrollment' },
    { label: 'Specializations', key: 'specializations' },
    { label: 'Arts Programs', key: 'artsPrograms' },
    { label: 'Sports Programs', key: 'sportsPrograms' },
    { label: 'Languages', key: 'languages' },
    { label: 'Boarding', key: 'boarding' }
  ];

  const getLocationText = (school) => `${school.city}, ${school.provinceState || school.region}`;
  const getGradesText = (school) => `${school.lowestGrade || 'K'}-${school.highestGrade || '12'}`;
  const getTuitionText = (school) => {
    if (!school.tuition) return 'N/A';
    return `${school.currency || 'CAD'} ${school.tuition.toLocaleString()}`;
  };

  const getValue = (school, key) => {
    switch (key) {
      case 'location':
        return getLocationText(school);
      case 'grades':
        return getGradesText(school);
      case 'tuition':
        return getTuitionText(school);
      case 'specializations':
        return school.specializations?.join(', ') || 'N/A';
      case 'artsPrograms':
        return school.artsPrograms?.join(', ') || 'N/A';
      case 'sportsPrograms':
        return school.sportsPrograms?.join(', ') || 'N/A';
      case 'languages':
        return school.languages?.join(', ') || 'N/A';
      case 'boarding':
        return school.boardingAvailable ? `${school.boardingType || 'Yes'}` : 'No';
      default:
        return school[key] || 'N/A';
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">School Comparison</h2>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Results
        </Button>
      </div>

      {/* Comparison Table - FIX #3: All columns visible, no horizontal scroll */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '25%' }} />
            {schools.map((school) => (
              <col key={school.id} style={{ width: `${75 / schools.length}%` }} />
            ))}
          </colgroup>
          <tbody>
            {attributes.map((attr) => (
              <tr key={attr.key} className="border-b border-slate-200">
                <td className="bg-slate-50 p-2 font-semibold text-slate-900 align-top text-xs">
                  {attr.label}
                </td>
                {schools.map((school) => (
                  <td 
                    key={school.id} 
                    className="p-2 text-xs text-slate-700 border-l border-slate-200 align-top overflow-hidden"
                  >
                    <div className="break-words">
                      {getValue(school, attr.key)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}