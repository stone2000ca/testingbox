import { useState, useEffect, useCallback } from 'react';

export function useDataLoader({ user, currentConversation, isAuthenticated, base44, setShortlistData }) {
  const [familyProfile, setFamilyProfile] = useState(null);
  const [artifactCache, setArtifactCache] = useState(null);
  const [schoolAnalyses, setSchoolAnalyses] = useState({});
  const [visitedSchoolIds, setVisitedSchoolIds] = useState(new Set());
  const [activeJourney, setActiveJourney] = useState(null);
  const [extractedEntitiesData, setExtractedEntitiesData] = useState({});
  const [restoredSessionData, setRestoredSessionData] = useState(null);

  const loadPreviousArtifacts = useCallback(async (conversationId) => {
    if (!conversationId) return;

    try {
      const [artifacts, analyses] = await Promise.all([
        base44.entities.GeneratedArtifact.filter({ conversationId }),
        user?.id ? base44.entities.SchoolAnalysis.filter({ userId: user.id }) : Promise.resolve([])
      ]);

      // Build indexed map keyed by schoolId_artifactType
      const TYPE_REMAP = {
        deep_dive_recommendation: 'deep_dive_analysis',
        visit_prep_kit: 'visit_prep',
      };
      const map = {};
      for (const artifact of artifacts) {
        const schoolIds = artifact.schoolIds || [];
        for (const schoolId of schoolIds) {
          const remappedType = TYPE_REMAP[artifact.artifactType] || artifact.artifactType;
          const key = `${schoolId}_${remappedType}`;
          map[key] = artifact.content;
        }
      }

      // E30-007: Build schoolAnalyses map with full record (excluding internal metadata)
      const analysesMap = {};
      const METADATA_KEYS = new Set(['id', 'created_date', 'updated_date', 'created_by']);
      for (const analysis of analyses) {
        if (analysis.schoolId) {
          const entry = {};
          for (const [k, v] of Object.entries(analysis)) {
            if (!METADATA_KEYS.has(k)) entry[k] = v;
          }
          analysesMap[analysis.schoolId] = entry;
        }
      }
      setSchoolAnalyses(analysesMap);
      setArtifactCache(map);
      console.log('[WC6] Artifact cache loaded:', Object.keys(map).length, 'entries', '| SchoolAnalyses:', Object.keys(analysesMap).length);
    } catch (error) {
      console.error('[WC6] Failed to load artifacts:', error);
    }
  }, [user?.id, base44]);

  const loadFamilyProfile = useCallback(async () => {
    if (!user?.id || !currentConversation?.id) return;

    // Guard: if familyProfile already has meaningful data from orchestrateConversation, skip DB fetch
    const METADATA_KEYS = ['id', 'userId', 'conversationId', 'created_date', 'updated_date', 'created_by'];
    const hasRealData = familyProfile && Object.entries(familyProfile).some(
      ([k, v]) => !METADATA_KEYS.includes(k) && v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
    );
    if (hasRealData) {
      console.log('[loadFamilyProfile] Skipping DB fetch — meaningful data already in state');
      await loadPreviousArtifacts(currentConversation.id);
      return;
    }

    try {
      const profiles = await base44.entities.FamilyProfile.filter({
        userId: user.id,
        conversationId: currentConversation.id
      });

      if (profiles.length > 0) {
        setFamilyProfile(profiles[0]);
        // WC6: Load previous artifacts after family profile succeeds
        await loadPreviousArtifacts(currentConversation.id);
      }
    } catch (error) {
      console.error('Failed to load family profile:', error);
    }
  }, [user?.id, currentConversation?.id, familyProfile, loadPreviousArtifacts, base44]);

  // Load family profile + artifacts when user + conversation are ready
  useEffect(() => {
    if (user?.id && currentConversation?.id) {
      loadFamilyProfile();
    }
  }, [user?.id, currentConversation?.id]);

  // E29-007: Detect active journey on auth
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    (async () => {
      try {
        const journeys = await base44.entities.FamilyJourney.filter({ userId: user.id, isArchived: false });
        if (journeys.length === 0) return;

        const journey = journeys.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
        const schoolJourneys = await base44.entities.SchoolJourney.filter({ familyJourneyId: journey.id });

        setActiveJourney({
          journeyId: journey.id,
          currentPhase: journey.currentPhase,
          nextAction: journey.nextAction,
          lastSessionSummary: journey.lastSessionSummary,
          consultantId: journey.consultantId,
          isResuming: false,
          schoolsSummary: schoolJourneys.map(sj => ({
            schoolId: sj.schoolId,
            schoolName: sj.schoolName,
            status: sj.status,
          })),
        });
        console.log('[E29-007] Active journey detected:', journey.id);
      } catch (e) {
        console.error('[E29-007] Journey detection failed:', e.message);
      }
    })();
  }, [isAuthenticated, user?.id]);

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

  return {
    familyProfile, setFamilyProfile,
    artifactCache, setArtifactCache,
    schoolAnalyses, setSchoolAnalyses,
    visitedSchoolIds, setVisitedSchoolIds,
    activeJourney, setActiveJourney,
    extractedEntitiesData, setExtractedEntitiesData,
    restoredSessionData, setRestoredSessionData,
    loadFamilyProfile,
    loadPreviousArtifacts,
  };
}