import { useState } from 'react';
import SchoolCard from './SchoolCard';
import { ChevronDown, ChevronUp, Pin } from 'lucide-react';

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
// T-SL-001: Pinned Shortlist Section
// =============================================================================
function PinnedShortlistSection({ shortlistedSchools, onViewDetails, onToggleShortlist, familyProfile, accentColor, priorityOverrides, onPriorityToggle }) {
  if (!shortlistedSchools || shortlistedSchools.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-center gap-2 mb-3">
        <Pin className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-amber-900">Your Shortlist</h3>
        <span className="ml-1 text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
          {shortlistedSchools.length} {shortlistedSchools.length === 1 ? 'school' : 'schools'}
        </span>
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

  const sharedShortlistProps = { shortlistedSchools, onViewDetails, onToggleShortlist, familyProfile, accentColor, priorityOverrides, onPriorityToggle };

  // If tieredSchools prop is provided, use tiered mode
  if (tieredSchools) {
    const { topMatches = [], alsoWorthExploring = [], seeAll = [] } = tieredSchools;
    const totalVisible = topMatches.length + alsoWorthExploring.length;
    const tier3Count = seeAll.length;

    return (
      <div>
        <PinnedShortlistSection {...sharedShortlistProps} />
        <TierSection
          title="⭐ Top Matches"
          subtitle="Best fit for your family based on your priorities"
          schools={topMatches}
          onViewDetails={onViewDetails}
          onToggleShortlist={onToggleShortlist}
          shortlistedIds={shortlistedIds}
          familyProfile={familyProfile}
          accentColor={accentColor}
          priorityOverrides={priorityOverrides}
          onPriorityToggle={onPriorityToggle}
        />
        <TierSection
          title="Also Worth Exploring"
          subtitle="Other strong options from the matching pool"
          schools={alsoWorthExploring}
          onViewDetails={onViewDetails}
          onToggleShortlist={onToggleShortlist}
          shortlistedIds={shortlistedIds}
          familyProfile={familyProfile}
          accentColor={accentColor}
          priorityOverrides={priorityOverrides}
          onPriorityToggle={onPriorityToggle}
        />
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
                schools={seeAll}
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