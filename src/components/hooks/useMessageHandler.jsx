import { STATES, BRIEF_STATUS } from '@/pages/stateMachineConfig';
import { validateBriefContent, generateProgrammaticBrief } from '@/components/utils/briefUtils';
import { extractAndSaveMemories } from '@/components/utils/memoryManager';
import { base44 } from '@/api/base44Client';

export const useMessageHandler = ({
  messages,
  setMessages,
  selectedConsultant,
  sessionId,
  isAuthenticated,
  setShowLoginGate,
  currentConversation,
  familyProfile,
  briefStatus,
  setBriefStatus,
  extractedEntitiesData,
  setExtractedEntitiesData,
  isPremium,
  tokenBalance,
  setTokenBalance,
  user,
  setUser,
  shortlistData,
  schools,
  setSchools,
  selectedSchool,
  setCurrentView,
  onboardingPhase,
  restoredSessionData,
  setCurrentConversation,
  setIsTyping,
  setShowResponseChips,
  setLastTypingTime,
  setFamilyProfile,
  setSchoolsAnimKey,
  resetSort,
  loadShortlist,
  loadConversations,
  userLocation,
  setFeedbackPromptShown,
  feedbackPromptShown,
  isDevMode,
  setShowUpgradeModal,
  trackEvent,
  stateToView,
  hasAutoPopulatedShortlist,
  createPageUrl,
}) => {
  const handleSendMessage = async (messageText, explicitSchoolId = null, displayText = null) => {
    // Track message sent
    base44.functions.invoke('trackSessionEvent', {
      eventType: 'message_sent',
      consultantName: selectedConsultant,
      sessionId
    }).catch(err => console.error('Failed to track:', err));
    
    // SOFT LOGIN GATE: Check if user is confirming the Brief without being logged in
    const isBriefConfirmation = messageText === '__CONFIRM_BRIEF__' ||
                                 messageText.toLowerCase().includes("that's right") || 
                                 messageText.toLowerCase().includes("let's see the schools") ||
                                 messageText.toLowerCase().includes("see the schools") ||
                                 messageText.toLowerCase().includes("that looks right") ||
                                 messageText.toLowerCase().includes("show me schools");

    // BUG-BRIEF-DUPE: Immediately lock briefStatus to confirmed so chips disappear before response arrives
    if (messageText === '__CONFIRM_BRIEF__') {
      setBriefStatus('confirmed');
    }
    
    if (isBriefConfirmation && !isAuthenticated && !isDevMode) {
      // Save current conversation data to localStorage before showing gate
      localStorage.setItem('guestConversationData', JSON.stringify({
        messages,
        consultant: selectedConsultant,
        conversationContext: currentConversation?.conversationContext || {},
        familyProfile: familyProfile || {},
        briefStatus: briefStatus || null,
        extractedEntitiesData: extractedEntitiesData || {},
        sessionId
      }));
      
      setShowLoginGate(true);
      return;
    }

    // Check if user has tokens (skip for premium)
    if (!isPremium && tokenBalance <= 0) {
      setShowUpgradeModal(true);
      return;
    }

    // Add user message
    const userMessage = {
      role: 'user',
      content: displayText || messageText,
      timestamp: new Date().toISOString()
    };
    
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsTyping(true);
    setShowResponseChips(false);
    setLastTypingTime(Date.now());

    try {
      // Fetch user notes and shortlist for AI context
      let userNotes = [];
      let shortlistedSchools = [];
      if (isAuthenticated && user) {
        try {
          const notes = await base44.entities.Notes.filter({ userId: user.id });
          userNotes = notes.map(n => n.content);
          
          shortlistedSchools = shortlistData.map(s => s.name);
        } catch (e) {
          console.error('Failed to fetch notes/shortlist:', e);
        }
      }

      // CRITICAL FIX: When confirming brief, pass empty array to force fresh search
      const isBriefConfirmingForResults = isBriefConfirmation || 
                                          (briefStatus === BRIEF_STATUS.PENDING_REVIEW && 
                                           (messageText.toLowerCase().includes('show') || 
                                            messageText.toLowerCase().includes('right')));
      
      // WC6: Build returning user context if session was restored
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
          budget: familyProfile.maxTuition ? `$${familyProfile.maxTuition.toLocaleString()}` : null,
          priorities: familyProfile.priorities?.join(', ') || null,
          matchedSchoolsCount: restoredSessionData.matchedSchoolsCount || 0,
          shortlistedSchools: shortlistedSchoolNames,
          lastActive: lastActive,
          profileName: restoredSessionData.profileName,
          consultantName: restoredSessionData.consultantName
        };
      }

      // Call orchestrateConversation with current schools context and user location
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
        userLocation: userLocation ? {
          lat: userLocation.lat,
          lng: userLocation.lng,
          address: userLocation.address
        } : null,
        selectedSchoolId: explicitSchoolId || selectedSchool?.id || null,
        returningUserContext
      });

      // T043: Update familyProfile live from orchestration response
      if (response.data.familyProfile) {
        setFamilyProfile(response.data.familyProfile);
      }

      // Store extractedEntities from response for FamilyBrief fallback display
      if (response.data.extractedEntities) {
        setExtractedEntitiesData(response.data.extractedEntities);
        console.log('[BUDGET FIX] Stored extractedEntities:', response.data.extractedEntities);
      }

      // T047: If matches were auto-refreshed, bump animation key to trigger fade/reorder
      if (response.data.conversationContext?.autoRefreshed === true) {
        setSchoolsAnimKey(k => k + 1);
      }

      // CRITICAL: Update briefStatus from response immediately
      const newBriefStatus = response.data.briefStatus || null;
      if (newBriefStatus) {
        setBriefStatus(newBriefStatus);
        console.log('[BRIEF STATUS] Updated to:', newBriefStatus);
      }
      
      // CRITICAL FIX: Merge backend's full context (including extractedEntities) with frontend state
      const updatedContext = { 
        ...(currentConversation?.conversationContext || {}), 
        ...(response.data.conversationContext || {}),
        state: response.data.state,
        briefStatus: newBriefStatus,
        schools: response.data.schools || [],
        conversationId: currentConversation?.id || null
      };
      
      if (currentConversation) {
        setCurrentConversation({ ...currentConversation, conversationContext: updatedContext });
      } else {
        // For guests without a conversation object, create a temporary one
        setCurrentConversation({ 
          id: null, 
          conversationContext: updatedContext,
          messages: []
        });
      }

      // BUG-DD-001 FIX: selectedSchool is SINGLE SOURCE OF TRUTH - NEVER clear it based on AI state
      const isViewingSchoolDetail = selectedSchool !== null;
      
      if (!isViewingSchoolDetail && response.data.state) {
        // Only update view if NOT viewing a school detail
        // CRITICAL: Do NOT call setSelectedSchool(null) here - it defeats the single source of truth
        setCurrentView(stateToView(response.data.state));
      } else if (isViewingSchoolDetail) {
        console.log('[BUG-DD-001] Maintaining detail view - school selected:', selectedSchool?.name);
        // Keep view locked to detail as long as selectedSchool is set
      }
      
      // Use the same guard for schools display logic
      const isDeepDivingSchool = isViewingSchoolDetail;
      
      // FIX #3: First priority - if schools are returned, display them (ONLY if not in DEEP_DIVE)
      if (response.data.schools && response.data.schools.length > 0 && !isDeepDivingSchool) {
        // Track schools shown
        trackEvent('schools_shown', { metadata: { schoolCount: response.data.schools.length } });

        // Show feedback prompt if not already shown
        if (!feedbackPromptShown && messages.length > 5) {
          setFeedbackPromptShown(true);
        }
        // Reorder schools to match the order mentioned in AI response
        const aiResponse = response.data.message;
        const orderedSchools = [...response.data.schools];

        const mentionedSchools = [];
        const remainingSchools = [];

        for (const school of orderedSchools) {
          const schoolNameIndex = aiResponse.indexOf(school.name);
          if (schoolNameIndex !== -1) {
            mentionedSchools.push({ school, index: schoolNameIndex });
          } else {
            remainingSchools.push(school);
          }
        }

        mentionedSchools.sort((a, b) => a.index - b.index);

        const finalOrderedSchools = [
          ...mentionedSchools.map(ms => ms.school),
          ...remainingSchools
        ];

        setSchools(finalOrderedSchools);
        // Reset sort to relevance when new schools arrive
        resetSort();

        // Auto-populate shortlist for new users with no saved favorites
        if (isAuthenticated && user && !hasAutoPopulatedShortlist.current) {
          const currentShortlist = user.shortlist || [];
          if (currentShortlist.length === 0) {
            const topIds = finalOrderedSchools.slice(0, 5).map(s => s.id);
            if (topIds.length > 0) {
              hasAutoPopulatedShortlist.current = true;
              await base44.auth.updateMe({ shortlist: topIds });
              setUser(prev => ({ ...prev, shortlist: topIds }));
              await loadShortlist({ ...user, shortlist: topIds });
            }
          }
        }
        // BUG-DD-001 FIX: View switching handled in state mapping logic above
      }

      // Create ChatSession when brief is confirmed and transitioning to RESULTS
      if (response.data.state === STATES.RESULTS) {
        try {
          const matchedSchoolIds = response.data.schools ? response.data.schools.map(s => s.id) : [];
          const profileForSession = response.data.familyProfile || familyProfile;
          const profileName = profileForSession?.childName 
            ? `${profileForSession.childName}'s School Search Profile`
            : 'School Search Profile';
          
          const chatSession = await base44.entities.ChatSession.create({
            sessionToken: sessionId,
            userId: user?.id,
            familyProfileId: profileForSession?.id || null,
            chatHistoryId: currentConversation?.id,
            status: 'active',
            consultantSelected: selectedConsultant,
            childName: profileForSession?.childName,
            childGrade: profileForSession?.childGrade,
            locationArea: profileForSession?.locationArea,
            maxTuition: profileForSession?.maxTuition,
            priorities: profileForSession?.priorities,
            matchedSchools: JSON.stringify(matchedSchoolIds),
            profileName
          });
          
          // Update URL with entity id (not sessionToken)
          if (chatSession?.id) {
            const newUrl = createPageUrl(`Consultant?sessionId=${chatSession.id}`);
            window.history.replaceState({}, document.title, newUrl);
            console.log('[SESSION] Created ChatSession with id:', chatSession.id);
          }
        } catch (sessionError) {
          console.error('Failed to create ChatSession:', sessionError);
        }
      }

      // KI-52: Brief content validator — swap thin LLM brief for programmatic fallback
      // DOUBLE-BRIEF FIX: Only apply when the RESPONSE state is also BRIEF (not when transitioning to RESULTS)
      let aiMessageContent = response.data.message;
      if (response.data.state === STATES.BRIEF) {
        const latestProfile = response.data.familyProfile || familyProfile;
        if (!validateBriefContent(aiMessageContent)) {
          const fallback = generateProgrammaticBrief(latestProfile);
          if (fallback) {
            console.warn('[KI-52] Brief failed validation — using programmatic fallback');
            aiMessageContent = fallback;
          }
        }
      }

      const aiMessage = {
        role: 'assistant',
        content: aiMessageContent,
        timestamp: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);
      
      setIsTyping(false);

       // Deduct 1 token and persist to database (skip for premium)
       if (isAuthenticated && user && !isPremium) {
         const newTokenBalance = Math.max(0, tokenBalance - 1);
         setTokenBalance(newTokenBalance);
         await base44.auth.updateMe({ tokenBalance: newTokenBalance });
       }

       // Save AI memories with deduplication and filtering
       if (isAuthenticated && user) {
         await extractAndSaveMemories(messageText, response.data.message, user, base44);
       }

       // Update conversation if authenticated
       if (isAuthenticated && currentConversation && currentConversation.id) {
         await base44.entities.ChatHistory.update(currentConversation.id, {
           messages: finalMessages,
           conversationContext: updatedContext
         });

         // Count user messages to determine when to generate title
         const userMessageCount = finalMessages.filter(m => m.role === 'user').length;
         
         // Generate title after first user message
         if (userMessageCount === 1 && currentConversation.title === 'New Conversation') {
           try {
             const titleResult = await base44.functions.invoke('generateConversationTitle', {
               conversationId: currentConversation.id
             });
             
             // Update the conversation in state with new title
             if (titleResult.data?.title) {
               const updatedConvo = { ...currentConversation, title: titleResult.data.title };
               setCurrentConversation(updatedConvo);
               
               // Reload conversations to refresh sidebar
               await loadConversations(user.id);
             }
           } catch (titleError) {
             console.error('Failed to generate title:', titleError);
           }
         }

         // Trigger summarization if more than 5 messages
         if (finalMessages.filter(m => m.role === 'user').length % 5 === 0) {
           try {
             await base44.functions.invoke('summarizeConversation', {
               conversationId: currentConversation.id
             });
           } catch (summarizeError) {
             console.error('Failed to summarize conversation:', summarizeError);
           }
         }
       }
    } catch (error) {
      console.error('Error sending message:', error);
      setIsTyping(false);
      
      // Add error message to chat
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages([...updatedMessages, errorMessage]);
    }
  };

  return { handleSendMessage };
};