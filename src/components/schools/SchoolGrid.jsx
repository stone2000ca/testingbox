import { useState, useRef, useEffect } from 'react';
import SchoolCard from './SchoolCard';
import { ChevronDown, ChevronUp, Pin, GitCompareArrows, Share2, Check, Copy, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// =============================================================================
// T-RES-003: Tiered SchoolGrid
// Renders three tiers: Top Matches, Also Worth Exploring, See All Matches
// =============================================================================

function TierSection({ title, subtitle, schools, onViewDetails, onToggleShortlist, shortlistedIds, familyProfile, accentColor, priorityOverrides, onPriorityToggle, visitedSchoolIds = new Set() }) {
  if (!schools || schools.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', alignItems: 'stretch' }}>
        {schools.map((school, index) => (
          <div key={school.id} className="flex">
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
              isVisited={visitedSchoolIds.has(school.id)}
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
function ShareModal({ shareUrl, onClose }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">Share Your Shortlist</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">Send this link to your partner so they can view your shortlisted schools.</p>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <span className="text-xs text-slate-700 flex-1 truncate">{shareUrl}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-md transition-colors flex-shrink-0"
          >
            {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function PinnedShortlistSection({ shortlistedSchools, onViewDetails, onToggleShortlist, familyProfile, accentColor, priorityOverrides, onPriorityToggle, onNarrateComparison, onOpenComparison }) {
  const [shareLoading, setShareLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);

  const handleShare = async () => {
    setShareLoading(true);
    try {
      const schoolIds = shortlistedSchools.map(s => s.id);
      const familyProfileId = familyProfile?.id || null;
      const result = await base44.functions.invoke('generateSharedShortlistLink', { familyProfileId, schoolIds });
      const url = result.data?.shareUrl;
      if (url) setShareUrl(url);
    } catch (e) {
      console.error('Share failed:', e);
    } finally {
      setShareLoading(false);
    }
  };

  if (!shortlistedSchools || shortlistedSchools.length === 0) return null;
  const canCompare = shortlistedSchools.length >= 2;

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-center gap-2 mb-3 flex-wrap border-l-4 border-teal-400 pl-3 py-1 bg-teal-900/10 rounded-sm">
        <Pin className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
        <h3 className="text-lg font-bold text-amber-900">Your Shortlist</h3>
        <span className="ml-1 text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
          {shortlistedSchools.length} {shortlistedSchools.length === 1 ? 'school' : 'schools'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {/* Share with Partner button */}
          <button
            onClick={handleShare}
            disabled={shareLoading}
            className="flex items-center gap-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-full transition-colors disabled:opacity-60"
          >
            {shareLoading ? (
              <><div className="h-3.5 w-3.5 border border-white/40 border-t-white rounded-full animate-spin" /> Sharing…</>
            ) : (
              <><Share2 className="h-3.5 w-3.5" /> Share with Partner</>
            )}
          </button>
          {shareUrl && <ShareModal shareUrl={shareUrl} onClose={() => setShareUrl(null)} />}
          {canCompare && (
            <button
              onClick={() => onOpenComparison && onOpenComparison(shortlistedSchools)}
              className="flex items-center gap-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-full transition-colors"
            >
              <GitCompareArrows className="h-3.5 w-3.5" />
              Compare These
            </button>
          )}
        </div>
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

// =============================================================================
// T-SL-002: Animated backfill tier card
// =============================================================================
function AnimatedCard({ school, isNew, ...props }) {
  return (
    <div
      key={school.id}
      className="w-full flex"
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
  onNarrateComparison = null,
  onOpenComparison = null,
  visitedSchoolIds = new Set(),
}) {
  // Guard: ensure schools is always an array
  if (!schools || !Array.isArray(schools)) {
    schools = [];
  }
  const [tier3Expanded, setTier3Expanded] = useState(false);

  // E16b-005: Bulk fetch upcoming events for all visible schools
  const [schoolsWithEvents, setSchoolsWithEvents] = useState(new Set());
  const allSchoolIds = [
    ...(tieredSchools ? [
      ...(tieredSchools.topMatches || []),
      ...(tieredSchools.alsoWorthExploring || []),
      ...(tieredSchools.seeAll || []),
    ] : schools),
    ...shortlistedSchools,
  ].map(s => s.id);
  const allSchoolIdsKey = [...new Set(allSchoolIds)].sort().join(',');

  useEffect(() => {
    if (!allSchoolIdsKey) return;
    const today = new Date().toISOString();
    base44.entities.SchoolEvent.filter({ isActive: true })
      .then(events => {
        const upcoming = new Set(
          events.filter(e => e.date && e.date >= today).map(e => e.schoolId)
        );
        setSchoolsWithEvents(upcoming);
      })
      .catch(() => {});
  }, [allSchoolIdsKey]);
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

  const sharedShortlistProps = { shortlistedSchools, onViewDetails, onToggleShortlist, familyProfile, accentColor, priorityOverrides, onPriorityToggle, onNarrateComparison, onOpenComparison };

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
      isVisited: visitedSchoolIds.has(school.id),
      hasUpcomingEvent: schoolsWithEvents.has(school.id),
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
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', alignItems: 'stretch' }}>
              {displayedT1.map((school, index) => (
                <div
                  key={school.id}
                  className="w-full"
                  style={{ animation: `cardFadeIn 350ms cubic-bezier(0.22,1,0.36,1) ${index * 60}ms both` }}
                >
                  <AnimatedCard
                    isNew={allBackfilledIds.has(school.id)}
                    index={index}
                    {...sharedCardProps(school, shortlistedIds.includes(school.id))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tier 2: Also Worth Exploring — only shown if has schools */}
        {displayedT2.length > 0 && (
          <div className="mb-6">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Also Worth Exploring</h3>
              <p className="text-xs text-slate-500 mt-0.5">Other strong options from the matching pool</p>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', alignItems: 'stretch' }}>
              {displayedT2.map((school, index) => (
                <div
                  key={school.id}
                  className="w-full"
                  style={{ animation: `cardFadeIn 350ms cubic-bezier(0.22,1,0.36,1) ${(displayedT1.length + index) * 60}ms both` }}
                >
                  <AnimatedCard
                    isNew={allBackfilledIds.has(school.id)}
                    index={index}
                    {...sharedCardProps(school, shortlistedIds.includes(school.id))}
                  />
                </div>
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
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', alignItems: 'stretch' }}>
        {schools.map((school, index) => (
          <div key={school.id} className="flex">
            <SchoolCard
              school={school}
              index={index}
              onViewDetails={() => onViewDetails(school.id)}
              onToggleShortlist={onToggleShortlist}
              isShortlisted={shortlistedIds.includes(school.id)}
              familyProfile={familyProfile}
              accentColor={accentColor}
              hasUpcomingEvent={schoolsWithEvents.has(school.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}