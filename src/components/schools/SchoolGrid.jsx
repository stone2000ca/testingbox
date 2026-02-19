import SchoolCard from './SchoolCard';

export default function SchoolGrid({ schools, onViewDetails, onToggleShortlist, shortlistedIds = [] }) {
  if (!schools || schools.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">No schools found matching your criteria.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {schools.map((school, index) => (
        <SchoolCard
          key={school.id}
          school={school}
          index={index}
          onViewDetails={() => onViewDetails(school.id)}
          onToggleShortlist={onToggleShortlist}
          isShortlisted={shortlistedIds.includes(school.id)}
        />
      ))}
    </div>
  );
}