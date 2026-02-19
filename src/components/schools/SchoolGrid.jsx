import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import SchoolCard from './SchoolCard';

export default function SchoolGrid({ schools, onViewDetails, onToggleShortlist, shortlistedIds = [] }) {
  const [displayedCount, setDisplayedCount] = useState(20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observerTarget = useRef(null);

  // Reset to 20 when schools change
  useEffect(() => {
    setDisplayedCount(20);
  }, [schools?.length]);

  const displayedSchools = schools?.slice(0, displayedCount) || [];
  const hasMore = displayedCount < (schools?.length || 0);
  const totalSchools = schools?.length || 0;

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) {
      setIsLoadingMore(true);
      // Simulate loading delay for UX
      setTimeout(() => {
        setDisplayedCount(prev => Math.min(prev + 20, totalSchools));
        setIsLoadingMore(false);
      }, 300);
    }
  }, [hasMore, isLoadingMore, totalSchools]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  if (!schools || schools.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">No schools found matching your criteria.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-slate-500 px-1">
        Showing {displayedSchools.length} of {totalSchools} schools
      </div>
      
      <div className="flex flex-wrap gap-4">
        {displayedSchools.map((school, index) => (
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

      {hasMore && (
        <div ref={observerTarget} className="flex justify-center py-8">
          {isLoadingMore && (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading more schools...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}