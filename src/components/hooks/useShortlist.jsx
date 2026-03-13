import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { getShortlistNudge } from '@/components/utils/shortlistNudges';
import { STATES } from '@/pages/stateMachineConfig';

export function useShortlist({
  user, setUser, isAuthenticated, schools, currentState,
  selectedConsultant, familyProfile, setMessages, trackEvent, setShowLoginGate, base44,
  onConfirmDeepDive,
}) {
  const [shortlistData, setShortlistData] = useState([]);
  const [removedSchoolIds, setRemovedSchoolIds] = useState([]);
  const [expandedCardCount, setExpandedCardCount] = useState(0);
  const [autoExpandSchoolId, setAutoExpandSchoolId] = useState(null);
  const [pendingDeepDiveSchoolIds, setPendingDeepDiveSchoolIds] = useState(new Set());
  const hasAutoPopulatedShortlist = useRef(false);

  const loadShortlist = async (userDataOrId) => {
    try {
      const userData = typeof userDataOrId === 'object' && userDataOrId !== null ? userDataOrId : user;
      const shortlistIds = userData?.shortlist || [];
      if (shortlistIds.length > 0) {
        const shortlistSchools = await base44.entities.School.filter({ id: { $in: shortlistIds } });
        setShortlistData(shortlistSchools);
      } else {
        setShortlistData([]);
      }
    } catch (error) {
      console.error('Failed to load shortlist:', error);
      setShortlistData([]);
    }
  };

  const injectShortlistNudge = (nudgeText) => {
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: nudgeText,
      timestamp: new Date().toISOString(),
      isNudge: true,
    }]);
  };

  const handleToggleShortlist = async (schoolId, options = {}) => {
    const { silent = false } = options;
    if (!isAuthenticated) {
      setShowLoginGate(true);
      return;
    }
    if (!user) return;

    try {
      const currentShortlist = user.shortlist || [];
      let updatedShortlist;
      let school = schools.find(s => s.id === schoolId) || shortlistData.find(s => s.id === schoolId) || extraSchools?.find(s => s.id === schoolId);
      const isRemoving = currentShortlist.includes(schoolId);
      if (!school && !isRemoving) {
        try {
          const fetched = await base44.entities.School.filter({ id: schoolId });
          school = fetched?.[0] || null;
        } catch (e) {
          console.error('[SHORTLIST] Failed to fetch school for toggle:', e.message);
        }
      }

      if (isRemoving) {
        updatedShortlist = currentShortlist.filter(id => id !== schoolId);
        setShortlistData(prev => prev.filter(s => s.id !== schoolId));
        setRemovedSchoolIds(prev => [...prev, schoolId]);
      } else {
        updatedShortlist = [...currentShortlist, schoolId];
        trackEvent('shortlisted', { metadata: { schoolName: school?.name } });
        if (school) setShortlistData(prev => [...prev, school]);
      }

      await base44.auth.updateMe({ shortlist: updatedShortlist });
      setUser({ ...user, shortlist: updatedShortlist });

      // E29-004: Sync shortlist to SchoolJourney entity
      ;(async () => {
        try {
          const freshUser = await base44.auth.me();
          if (!freshUser?.id) return;

          const journeys = await base44.entities.FamilyJourney.filter(
            { userId: freshUser.id }, '-updated_date', 1
          );
          const familyJourney = journeys[0];
          if (!familyJourney) return;

          if (isRemoving) {
            const existing = await base44.entities.SchoolJourney.filter({
              familyJourneyId: familyJourney.id,
              schoolId: schoolId,
            });
            if (existing.length > 0) {
              await base44.entities.SchoolJourney.update(existing[0].id, { status: 'removed' });
            }
          } else {
            await base44.entities.SchoolJourney.create({
              familyJourneyId: familyJourney.id,
              schoolId: school?.id || schoolId,
              schoolName: school?.name || '',
              status: 'shortlisted',
              addedAt: new Date().toISOString(),
            });
          }

          // E29-015: Phase auto-advancement MATCH → EVALUATE on first shortlist add
          if (!isRemoving && familyJourney.currentPhase === 'MATCH') {
            try {
              const currentHistory = Array.isArray(familyJourney.phaseHistory) ? familyJourney.phaseHistory : [];
              await base44.entities.FamilyJourney.update(familyJourney.id, {
                currentPhase: 'EVALUATE',
                phaseHistory: [...currentHistory, { phase: 'EVALUATE', enteredAt: new Date().toISOString() }],
              });
              console.log('[E29-015] FamilyJourney advanced MATCH → EVALUATE');
            } catch (phaseErr) {
              console.error('[E29-015] Phase advance MATCH→EVALUATE failed:', phaseErr?.message);
            }
          }
        } catch (e) {
          console.error('[E29-004] SchoolJourney sync failed:', e.message, e);
        }
      })();

      // T-SL-004: Inject nudge (only in RESULTS state, only when not silent)
      if (!silent && currentState === STATES.RESULTS) {
        const nudge = getShortlistNudge({
          isRemoving,
          newCount: updatedShortlist.length,
          isJackie: selectedConsultant === 'Jackie',
          school,
          familyProfile,
          shortlistData: shortlistData.filter(s => updatedShortlist.includes(s.id)),
          schools,
        });
        if (nudge) injectShortlistNudge(nudge);
      }
    } catch (error) {
      console.error('Failed to toggle shortlist:', error);
    }
  };

  // E29-012: Hydrate shortlistData from SchoolJourney entity on auth load
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    (async () => {
      try {
        const journeys = await base44.entities.FamilyJourney.filter({ userId: user.id });
        const activeJourneyRecord = journeys.find(j => !j.isArchived);
        if (!activeJourneyRecord) return;

        const schoolJourneys = await base44.entities.SchoolJourney.filter({
          familyJourneyId: activeJourneyRecord.id,
          status: 'shortlisted',
        });
        if (schoolJourneys.length === 0) return;

        const schoolIds = schoolJourneys.map(sj => sj.schoolId).filter(Boolean);
        const fetchedSchools = await base44.entities.School.filter({ id: { $in: schoolIds } });

        setShortlistData(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const newSchools = fetchedSchools.filter(s => !existingIds.has(s.id));
          return newSchools.length > 0 ? [...prev, ...newSchools] : prev;
        });
      } catch (e) {
        console.error('[E29-012] SchoolJourney shortlist hydration failed:', e.message);
      }
    })();
  }, [isAuthenticated, user?.id]);

  // E30-006
  const handleDossierExpandChange = (isExpanding) =>
    setExpandedCardCount(prev => isExpanding ? prev + 1 : Math.max(0, prev - 1));

  // E30-008
  const handleDeepDiveFromDossier = (school) => {
    setPendingDeepDiveSchoolIds(prev => new Set([...prev, school.id]));
    onConfirmDeepDive?.(school);
  };

  return {
    shortlistData, setShortlistData,
    removedSchoolIds, setRemovedSchoolIds,
    expandedCardCount, setExpandedCardCount,
    autoExpandSchoolId, setAutoExpandSchoolId,
    pendingDeepDiveSchoolIds, setPendingDeepDiveSchoolIds,
    hasAutoPopulatedShortlist,
    loadShortlist,
    handleToggleShortlist,
    injectShortlistNudge,
    handleDossierExpandChange,
    handleDeepDiveFromDossier,
  };
}