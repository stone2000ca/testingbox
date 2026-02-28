import { useState, useRef } from 'react';
import SchoolCard from './SchoolCard';
import ShortlistComparisonModal from './ShortlistComparisonModal';
import { ChevronDown, ChevronUp, Pin, GitCompareArrows } from 'lucide-react';

// =============================================================================
// T-RES-003: Tiered SchoolGrid
// Renders three tiers: Top Matches, Also Worth Exploring, See All Matches
// =============================================================================

function TierSection({ title, subtitle, schools, onViewDetails, onToggleShortlist, shortlistedIds, familyProfile, accentColor, priorityOverrides, onPriorityToggle }) {
  if (!schools || schools.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        {schools.map((school, index) => (
          <div key={school.id} className="w-full sm:w-[240px] flex-shrink-0">
            <SchoolCard
              school={school}
              index={index}
              onViewDetails={() => onViewDetails(school.id)}
              onToggleShortlist={onToggleShortlist}
              isShortlisted={shortlistedIds.includes(school.id)}
              familyProfile={familyProfile}
              accentColor={accentColor}
              priorityOverrides={priorityOverrides}
              onPriorityToggle={onPriorityToggle}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// T-SL-001 + T-SL-003: Pinned Shortlist Section with Compare button
// =============================================================================
function PinnedShortlistSection({ shortlistedSchools, onViewDetails, onToggleShortlist, familyProfile, accentColor, priorityOverrides, onPriorityToggle, onNarrateComparison }) {
  const [showComparison, setShowComparison] = useState(false);

  if (!shortlistedSchools || shortlistedSchools.length === 0) return null;
  const canCompare = shortlistedSchools.length >= 2;

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-center gap-2 mb-3">
        <Pin className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-amber-900">Your Shortlist</h3>
        <span className="ml-1 text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
          {shortlistedSchools.length} {shortlistedSchools.length === 1 ? 'school' : 'schools'}
        </span>
        {canCompare && (
          <button
            onClick={() => setShowComparison(true)}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-full transition-colors"
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
            Compare These
          </button>
        )}
      </div>
      {/* Mobile: horizontal scroll; desktop: wrap */}
      <div className="flex gap-3 overflow-x-auto sm:flex-wrap pb-1 sm:pb-0 -mx-1 px-1">
        {shortlistedSchools.map((school, index) => (
          <div key={school.id} className="w-[200px] sm:w-[240px] flex-shrink-0">
            <SchoolCard
              school={school}
              index={index}
              onViewDetails={() => onViewDetails(school.id)}
              onToggleShortlist={onToggleShortlist}
              isShortlisted={true}
              familyProfile={familyProfile}
              accentColor={accentColor}
              priorityOverrides={priorityOverrides}
              onPriorityToggle={onPriorityToggle}
            />
          </div>
        ))}
      </div>
      {showComparison && (
        <ShortlistComparisonModal
          schools={shortlistedSchools}
          familyProfile={familyProfile}
          onClose={() => setShowComparison(false)}
        />
      )}
    </div>
  );
}

// =============================================================================
// T-SL-002: Animated backfill tier card
// =============================================================================
function AnimatedCard({ school, isNew, ...props }) {
  return (
    <div
      key={school.id}
      className="w-full sm:w-[240px] flex-shrink-0"
      style={isNew ? { animation: 'slideInCard 0.35s ease-out both' } : undefined}
    >
      <style>{`
        @keyframes slideInCard {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <SchoolCard school={school} {...props} />
    </div>
  );
}

export default function SchoolGrid({
  schools,
  onViewDetails,
  onToggleShortlist,
  shortlistedIds = [],
  shortlistedSchools = [],
  familyProfile = null,
  accentColor = "#0D9488",
  tieredSchools = null,
  priorityOverrides = {},
  onPriorityToggle = null,
}) {
  const [tier3Expanded, setTier3Expanded] = useState(false);
  // T-SL-002: track newly backfilled IDs to animate them in
  const prevShortlistedRef = useRef(shortlistedIds);
  const [newlyBackfilledIds, setNewlyBackfilledIds] = useState(new Set());

  // Detect shortlist changes and mark backfill candidates
  const prevIds = prevShortlistedRef.current;
  if (prevIds !== shortlistedIds) {
    const added = shortlistedIds.filter(id => !prevIds.includes(id));
    const removed = prevIds.filter(id => !shortlistedIds.includes(id));
    if (added.length > 0 || removed.length > 0) {
      // After a state change, any card that wasn't visible before is "new"
      setTimeout(() => setNewlyBackfilledIds(new Set()), 600);
    }
    prevShortlistedRef.current = shortlistedIds;
  }

  const sharedShortlistProps = { shortlistedSchools, onViewDetails, onToggleShortlist, familyProfile, accentColor, priorityOverrides, onPriorityToggle };

  // If tieredSchools prop is provided, use tiered mode
  if (tieredSchools) {
    const { topMatches = [], alsoWorthExploring = [], seeAll = [] } = tieredSchools;

    // T-SL-002: Filter out shortlisted schools from tiers, backfill from deeper pools
    const shortlistedSet = new Set(shortlistedIds);

    // Build the full ordered pool: t1 → t2 → seeAll
    const allPoolOrdered = [...topMatches, ...alsoWorthExploring, ...seeAll];
    const nonShortlisted = allPoolOrdered.filter(s => !shortlistedSet.has(s.id));

    // Maintain original tier sizes
    const t1Size = topMatches.length;
    const t2Size = alsoWorthExploring.length;

    const displayedT1 = nonShortlisted.slice(0, t1Size);
    const displayedT2 = nonShortlisted.slice(t1Size, t1Size + t2Size);
    const displayedSeeAll = nonShortlisted.slice(t1Size + t2Size);

    // Track which IDs are newly backfilled (weren't in their original tier)
    const origT1Ids = new Set(topMatches.map(s => s.id));
    const origT2Ids = new Set(alsoWorthExploring.map(s => s.id));
    const backfilledT1 = displayedT1.filter(s => !origT1Ids.has(s.id)).map(s => s.id);
    const backfilledT2 = displayedT2.filter(s => !origT2Ids.has(s.id)).map(s => s.id);
    const allBackfilledIds = new Set([...backfilledT1, ...backfilledT2]);

    const totalVisible = displayedT1.length + displayedT2.length;
    const tier3Count = displayedSeeAll.length;

    const sharedCardProps = (school, isShortlisted) => ({
      school,
      onViewDetails: () => onViewDetails(school.id),
      onToggleShortlist,
      isShortlisted,
      familyProfile,
      accentColor,
      priorityOverrides,
      onPriorityToggle,
    });

    return (
      <div>
        <PinnedShortlistSection {...sharedShortlistProps} />

        {/* Tier 1: Top Matches */}
        {displayedT1.length > 0 && (
          <div className="mb-6">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-800">⭐ Top Matches</h3>
              <p className="text-xs text-slate-500 mt-0.5">Best fit for your family based on your priorities</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {displayedT1.map((school, index) => (
                <AnimatedCard
                  key={school.id}
                  isNew={allBackfilledIds.has(school.id)}
                  index={index}
                  {...sharedCardProps(school, shortlistedIds.includes(school.id))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tier 2: Also Worth Exploring */}
        {displayedT2.length > 0 && (
          <div className="mb-6">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Also Worth Exploring</h3>
              <p className="text-xs text-slate-500 mt-0.5">Other strong options from the matching pool</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {displayedT2.map((school, index) => (
                <AnimatedCard
                  key={school.id}
                  isNew={allBackfilledIds.has(school.id)}
                  index={index}
                  {...sharedCardProps(school, shortlistedIds.includes(school.id))}
                />
              ))}
            </div>
          </div>
        )}

        {tier3Count > 0 && (
          <div>
            <button
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 text-sm text-slate-600 font-medium transition-colors mb-4"
              onClick={() => setTier3Expanded(e => !e)}
            >
              {tier3Expanded ? (
                <><ChevronUp className="h-4 w-4" /> Hide extended matches</>
              ) : (
                <><ChevronDown className="h-4 w-4" /> Show all {tier3Count} more matches</>
              )}
            </button>
            {tier3Expanded && (
              <TierSection
                title="See All Matches"
                subtitle="Sorted by distance"
                schools={displayedSeeAll}
                onViewDetails={onViewDetails}
                onToggleShortlist={onToggleShortlist}
                shortlistedIds={shortlistedIds}
                familyProfile={familyProfile}
                accentColor={accentColor}
                priorityOverrides={priorityOverrides}
                onPriorityToggle={onPriorityToggle}
              />
            )}
          </div>
        )}
        <div className="text-xs text-slate-400 mt-2">
          Showing {totalVisible} of {totalVisible + tier3Count} schools
          {tier3Count > 0 && !tier3Expanded && ` · ${tier3Count} more available`}
        </div>
      </div>
    );
  }

  // Flat fallback (non-tiered mode — for backwards compat)
  if (!schools || schools.length === 0) {
    return (
      <div>
        <PinnedShortlistSection {...sharedShortlistProps} />
        <div className="text-center py-12">
          <p className="text-slate-500">No schools found matching your criteria.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PinnedShortlistSection {...sharedShortlistProps} />
      <div className="mb-4 text-sm text-slate-600">
        Showing {schools.length} schools
      </div>
      <div className="flex flex-wrap gap-3">
        {schools.map((school, index) => (
          <div key={school.id} className="w-full sm:w-[240px] flex-shrink-0">
            <SchoolCard
              school={school}
              index={index}
              onViewDetails={() => onViewDetails(school.id)}
              onToggleShortlist={onToggleShortlist}
              isShortlisted={shortlistedIds.includes(school.id)}
              familyProfile={familyProfile}
              accentColor={accentColor}
            />
          </div>
        ))}
      </div>
    </div>
  );
}