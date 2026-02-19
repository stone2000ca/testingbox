export default function ComparisonView({ schools, onBack }) {

export default function ComparisonView({ schools, onBack }) {
  if (!schools || schools.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">No schools to compare</p>
      </div>
    );
  }

  const rows = [
    { label: 'Location', key: (s) => `${s.city}, ${s.region}` },
    { label: 'Grades Served', key: (s) => `${s.lowestGrade}-${s.highestGrade}` },
    { label: 'Enrollment', key: (s) => s.enrollment?.toLocaleString() || 'N/A' },
    { label: 'Tuition', key: (s) => s.tuition ? `${s.currency} ${s.tuition.toLocaleString()}` : 'N/A' },
    { label: 'Curriculum', key: (s) => s.curriculumType || 'N/A' },
    { label: 'Class Size', key: (s) => s.avgClassSize || 'N/A' },
    { label: 'Student:Teacher', key: (s) => s.studentTeacherRatio || 'N/A' },
    { label: 'Specializations', key: (s) => s.specializations?.join(', ') || 'N/A' },
    { label: 'Boarding', key: (s) => s.boardingAvailable ? `Yes (${s.boardingType})` : 'No' },
    { label: 'Financial Aid', key: (s) => s.financialAidAvailable ? 'Available' : 'Not available' },
    { label: 'Founded', key: (s) => s.founded || 'N/A' }
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-slate-200 bg-white">
        <div>
          <h2 className="text-2xl font-bold">School Comparison</h2>
          <p className="text-sm text-slate-600">Comparing {schools.length} schools</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left p-4 font-semibold text-sm text-slate-700 sticky left-0 bg-slate-50 z-10">
                    Criteria
                  </th>
                  {schools.map((school) => (
                    <th key={school.id} className="text-left p-4 font-semibold text-sm text-slate-900 min-w-[200px]">
                      {school.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="p-4 font-medium text-sm text-slate-700 sticky left-0 bg-white z-10">
                      {row.label}
                    </td>
                    {schools.map((school) => (
                      <td key={school.id} className="p-4 text-sm text-slate-600">
                        {row.key(school)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}