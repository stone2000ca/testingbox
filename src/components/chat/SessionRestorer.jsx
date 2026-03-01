// Helper function to restore guest session after login
export async function restoreGuestSession(isAuthenticated, user, currentConversation, setMessages, setSelectedConsultant, setCurrentConversation, base44) {
  if (!isAuthenticated || !user) return;
  
  const guestData = localStorage.getItem('guestConversationData');
  if (!guestData) return;

  try {
    const { 
      messages: guestMessages, 
      consultant, 
      conversationContext, 
      familyProfile: cachedFamilyProfile
    } = JSON.parse(guestData);
    
    // Restore the conversation
    if (guestMessages && guestMessages.length > 0) {
      setMessages(guestMessages);
      setSelectedConsultant(consultant);
      if (conversationContext) {
        setCurrentConversation({ 
          ...currentConversation, 
          conversationContext 
        });
      }
    }

    // Create ChatSession if we have the necessary data
    if (cachedFamilyProfile && currentConversation?.id) {
      try {
        const sessionToken = crypto.randomUUID();
        const profileName = cachedFamilyProfile.childName 
          ? `${cachedFamilyProfile.childName}'s School Search Profile`
          : "School Search Profile";
        
        await base44.entities.ChatSession.create({
          sessionToken,
          userId: user.id,
          familyProfileId: cachedFamilyProfile.id || null,
          chatHistoryId: currentConversation.id,
          status: 'active',
          consultantSelected: consultant,
          aiNarrative: null,
          matchedSchools: JSON.stringify([]),
          profileName
        });
        
        console.log('[CHAT SESSION] Created session:', sessionToken);
      } catch (sessionError) {
        console.error('Failed to create ChatSession:', sessionError);
        // Continue anyway - user is authenticated, don't block flow
      }
    }
    
    // Clear guest data
    localStorage.removeItem('guestConversationData');
  } catch (e) {
    console.error('Failed to restore guest session:', e);
  }
}