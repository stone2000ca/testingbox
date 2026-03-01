// Component: SessionRestorer
// Purpose: Restore chat session from URL param for returning users
// Last Modified: 2026-03-01

import { STATES } from '@/pages/stateMachineConfig';

export async function restoreSessionFromParam(
  sessionIdParam,
  base44,
  isAuthenticated,
  user,
  setSelectedConsultant,
  setRestoredSessionData,
  setMessages,
  setFamilyProfile,
  setSchools,
  setCurrentView,
  setOnboardingPhase,
  setCurrentConversation,
  setSessionRestored,
  setRestoringSession,
  loadShortlist,
  isRestoringSessionRef,
  sessionParamProcessedRef,
  setDebugInfo
) {
  if (!sessionIdParam) return;
  
  // CRITICAL: Set flag FIRST to override isIntakePhase during restoration
  sessionParamProcessedRef.current = true;
  isRestoringSessionRef.current = true;
  setRestoringSession(true);
  try {
    // Fetch ChatSession
    console.log('[RESTORE] Attempting to fetch ChatSession with ID:', sessionIdParam);
    const chatSession = await base44.entities.ChatSession.get(sessionIdParam);
    console.log('[RESTORE] ChatSession fetched:', chatSession ? 'Success' : 'Not found');
    
    if (!chatSession) {
      console.error('[RESTORE] ChatSession not found with ID:', sessionIdParam);
      setSessionRestored(true);
      return;
    }

    // WC6: Store session data for returning user context
    setRestoredSessionData({
      sessionId: chatSession.id,
      profileName: chatSession.profileName,
      consultantName: chatSession.consultantSelected,
      matchedSchoolsCount: chatSession.matchedSchools ? JSON.parse(chatSession.matchedSchools).length : 0,
      createdDate: chatSession.created_date,
      updatedDate: chatSession.updated_date
    });

    // CRITICAL: Restore consultant selection FIRST so chat panel can render correctly
    if (chatSession.consultantSelected) {
      setSelectedConsultant(chatSession.consultantSelected);
    }

    // DIRECT SEARCH CALL - Match orchestrateConversation's pattern
    let restoredSchools = [];
    try {
      const locationArea = chatSession.locationArea;
      const searchParams = {
        limit: 50,
        minGrade: chatSession.childGrade,
        maxGrade: chatSession.childGrade,
        maxTuition: chatSession.maxTuition
      };

      if (locationArea) {
        const locationAreaLower = locationArea.toLowerCase().trim();
        const regionAliases = ['gta', 'greater toronto area', 'lower mainland', 'metro vancouver', 'greater vancouver'];
        if (regionAliases.includes(locationAreaLower)) {
          searchParams.region = locationArea;
        } else {
          const cityToProvinceMap = {
            'toronto': 'Ontario', 'vancouver': 'British Columbia', 'calgary': 'Alberta',
            'edmonton': 'Alberta', 'montreal': 'Quebec', 'ottawa': 'Ontario',
            'winnipeg': 'Manitoba', 'halifax': 'Nova Scotia', 'victoria': 'British Columbia',
            'quebec city': 'Quebec', 'saskatoon': 'Saskatchewan', 'regina': 'Saskatchewan'
          };
          const locationParts = locationArea.split(',').map(s => s.trim());
          if (locationParts.length >= 2) {
            searchParams.city = locationParts[0];
            searchParams.provinceState = locationParts[1];
          } else if (locationParts.length === 1) {
            searchParams.city = locationParts[0];
            const inferredProvince = cityToProvinceMap[locationParts[0].toLowerCase()];
            if (inferredProvince) {
              searchParams.provinceState = inferredProvince;
            }
          }
        }
      }

      const response = await base44.functions.invoke('searchSchools', searchParams);
      setDebugInfo('location=' + locationArea + ' | city=' + (searchParams.city || 'N/A') + ' grade=' + chatSession.childGrade + ' tuition=' + chatSession.maxTuition + ' | schools=' + (response?.data?.schools?.length || 0));
      restoredSchools = response?.data?.schools || [];
    } catch (err) {
      setDebugInfo('searchSchools ERROR: ' + err.message);
      console.error('RESTORE searchSchools error:', err);
    }

    // Fetch and restore ChatHistory messages and context
    let chatHistory = null;
    if (chatSession.chatHistoryId) {
      chatHistory = await base44.entities.ChatHistory.get(chatSession.chatHistoryId);
      if (chatHistory?.messages) {
        setMessages(chatHistory.messages);
      }
    }

    // Fetch and restore FamilyProfile
    let restoredProfile = null;
    if (chatSession.familyProfileId) {
      restoredProfile = await base44.entities.FamilyProfile.get(chatSession.familyProfileId);
      if (restoredProfile) {
        setFamilyProfile(restoredProfile);
      }
    } else {
      restoredProfile = {
        childName: chatSession.childName,
        childGrade: chatSession.childGrade,
        locationArea: chatSession.locationArea,
        maxTuition: chatSession.maxTuition,
        priorities: chatSession.priorities || [],
        learningDifferences: chatSession.learningDifferences || []
      };
      setFamilyProfile(restoredProfile);
    }

    // Set schools and conversation state
    console.log('[RESTORE] Setting RESULTS state with', restoredSchools.length, 'schools');
    setSchools(restoredSchools);
    setCurrentView('schools');
    setOnboardingPhase(STATES.RESULTS);
    
    if (chatHistory) {
      const restoredContext = {
        ...(chatHistory.conversationContext || {}),
        state: STATES.RESULTS,
        schools: restoredSchools
      };
      const restoredConversation = {
        ...chatHistory,
        conversationContext: restoredContext
      };
      setCurrentConversation(restoredConversation);
    } else {
      const restoredContext = {
        state: STATES.RESULTS,
        schools: restoredSchools
      };
      setCurrentConversation({
        conversationContext: restoredContext
      });
    }

    // Load shortlist from user if authenticated
    if (isAuthenticated && user) {
      await loadShortlist(user);
    }

    // Add welcome-back message
    const childName = chatSession.childName || 'your child';
    const welcomeMsg = {
      role: 'assistant',
      content: `Welcome back! I see we were exploring schools for ${childName}. Want to pick up where we left off or update anything?`,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, welcomeMsg]);

    setSessionRestored(true);
  } catch (error) {
    console.error('Failed to restore session:', error);
    setSessionRestored(true);
  } finally {
    isRestoringSessionRef.current = false;
    setRestoringSession(false);
  }
}