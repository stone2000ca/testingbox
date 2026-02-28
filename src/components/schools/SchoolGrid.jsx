import { useState, useEffect, useRef } from 'react';
import SchoolCard from './SchoolCard';

export default function SchoolGrid({ schools, onViewDetails, onToggleShortlist, shortlistedIds = [], familyProfile = null }) {
  const [displayedCount, setDisplayedCount] = useState(20);
  const [visible, setVisible] = useState(false);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    setDisplayedCount(20); // Reset when schools change
    // Trigger fade-in animation on mount / key change
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, [schools]);

  useEffect(() => {
    const container = scrollContainerRef.current?.parentElement;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop + clientHeight >= scrollHeight - 100 && displayedCount < schools.length) {
        setDisplayedCount(prev => Math.min(prev + 20, schools.length));
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [displayedCount, schools.length]);

  if (!schools || schools.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">No schools found matching your criteria.</p>
      </div>
    );
  }

  const visibleSchools = schools.slice(0, displayedCount);

  return (
    <div
      ref={scrollContainerRef}
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 350ms ease',
      }}
    >
      <div className="mb-4 text-sm text-slate-600">
        Showing {visibleSchools.length} of {schools.length} schools
      </div>
      <div className="flex flex-wrap gap-4">
        {visibleSchools.map((school, index) => (
          <div key={school.id} className="w-full sm:w-[250px] flex-shrink-0">
            <SchoolCard
              school={school}
              index={index}
              onViewDetails={() => onViewDetails(school.id)}
              onToggleShortlist={onToggleShortlist}
              isShortlisted={shortlistedIds.includes(school.id)}
            />
          </div>
        ))}
      </div>
      {displayedCount < schools.length && (
        <div className="text-center py-4">
          <div className="inline-block animate-pulse text-slate-400">Loading more...</div>
        </div>
      )}
    </div>
  );
}