import { base44 } from '@/api/base44Client';
import { BRIEF_STATUS } from '@/pages/stateMachineConfig';

// Helper: callOrchestration
// Purpose: Pure function wrapping orchestrateConversation API call
// Returns: Promise<response> from orchestrateConversation function
export async function callOrchestration({
  messageText,
  messages,
  currentConversation,
  user,
  selectedConsultant,
  onboardingPhase,
  briefStatus,
  schools,
  userLocation,
  selectedSchool,
  isAuthenticated,
  shortlistData,
  restoredSessionData,
  familyProfile,
  userNotes = [],
  shortlistedSchools = [],
}) {
  // Determine if we're confirming brief for fresh search
  const isBriefConfirmation =
    messageText === '__CONFIRM_BRIEF__' ||
    messageText.toLowerCase().includes("that's right") ||
    messageText.toLowerCase().includes("let's see the schools") ||
    messageText.toLowerCase().includes("see the schools") ||
    messageText.toLowerCase().includes("that looks right") ||
    messageText.toLowerCase().includes("show me schools");

  const isBriefConfirmingForResults =
    isBriefConfirmation ||
    (briefStatus === BRIEF_STATUS.PENDING_REVIEW &&
      (messageText.toLowerCase().includes('show') ||
        messageText.toLowerCase().includes('right')));

  // Build returning user context if session was restored
  let returningUserContext = null;
  if (restoredSessionData && familyProfile) {
    const shortlistedSchoolNames = shortlistData.map(s => s.name).slice(0, 5);
    const lastActive = restoredSessionData.updatedDate
      ? new Date(restoredSessionData.updatedDate).toLocaleDateString()
      : null;

    returningUserContext = {
      isReturningUser: true,
      childName: familyProfile.childName,
      childGrade: familyProfile.childGrade,
      location: familyProfile.locationArea,
      budget: familyProfile.maxTuition
        ? `$${familyProfile.maxTuition.toLocaleString()}`
        : null,
      priorities: familyProfile.priorities?.join(', ') || null,
      matchedSchoolsCount: restoredSessionData.matchedSchoolsCount || 0,
      shortlistedSchools: shortlistedSchoolNames,
      lastActive: lastActive,
      profileName: restoredSessionData.profileName,
      consultantName: restoredSessionData.consultantName,
    };
  }

  // Call orchestrateConversation
  const response = await base44.functions.invoke('orchestrateConversation', {
    message: messageText,
    conversationHistory: messages,
    conversationContext: currentConversation?.conversationContext || {},
    region: user?.profileRegion || 'Canada',
    userId: user?.id,
    consultantName: selectedConsultant,
    currentOnboardingPhase: onboardingPhase,
    currentSchools: isBriefConfirmingForResults ? [] : schools,
    userNotes,
    shortlistedSchools,
    userLocation: userLocation
      ? {
          lat: userLocation.lat,
          lng: userLocation.lng,
          address: userLocation.address,
        }
      : null,
    selectedSchoolId: selectedSchool?.id || null,
    returningUserContext,
  });

  return response;
}