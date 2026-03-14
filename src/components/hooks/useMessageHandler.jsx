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
  setDeepDiveAnalysis,
  setVisitPrepKit,
  setActionPlan,
  setFitReEvaluation,
  artifactCache,
  resetSort,
  loadShortlist,
  loadConversations,
  userLocation,
  setFeedbackPromptShown,
  feedbackPromptShown,
  isDevMode,
  setShowUpgradeModal,
  trackEvent,
  mapStateToView,
  hasAutoPopulatedShortlist,
  createPageUrl,
  activeJourney,
  setActiveJourney,
}, isPremiumParam = isPremium) => {
    // CRT-S109-F15: Message queue to prevent message loss during rapid input
    let isProcessing = false;
    const messageQueue = [];
    
    const processQueuedMessages = async () => {
      while (messageQueue.length > 0 && !isProcessing) {
        const { messageText, explicitSchoolId, displayText } = messageQueue.shift();
        await handleSendMessage(messageText, explicitSchoolId, displayText);
      }
    };

  const handleSendMessage = async (messageText, explicitSchoolId = null, displayText = null) => {
        // CRT-S109-F15: Queue messages if already processing
    if (isProcessing) {
      console.log('[CRT-S109] Queueing message: "' + messageText.substring(0, 30) + '..."');
      messageQueue.push({ messageText, explicitSchoolId, displayText });
      return;
    }
    isProcessing = true;
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
        conversationHistory: messages.slice(-10),
        conversationContext: currentConversation?.conversationContext || {},
        region: user?.profileRegion || 'Canada',
        userId: user?.id,
        consultantName: selectedConsultant,
        currentOnboardingPhase: onboardingPhase,
        currentSchools: isBriefConfirmingForResults ? [] : schools,
        userLocation: userLocation ? {
          lat: userLocation.lat,
          lng: userLocation.lng,
          address: userLocation.address
        } : null,
        selectedSchoolId: explicitSchoolId || selectedSchool?.id || null,
        conversationId: currentConversation?.id || null,
        returningUserContext,
        ...(activeJourney ? { journeyContext: activeJourney } : {})
      });

      // DEFENSIVE CHECK: Ensure response.data exists
      if (!response?.data) {
        throw new Error('Orchestration response contained no data');
      }

      // Clear schools when criteria are being edited so re-matching happens on next BRIEF->RESULTS transition
      if (response.data?.briefStatus === 'editing' || response.data?.conversationContext?.transitionReason === 'edit_criteria_from_results') {
        console.log('[P0-BUG-FIX] Clearing schools for edit-criteria intent');
        setSchools([]);
      }

      console.log('[CARD DEBUG]', Object.keys(response.data || {}), response.data?.deepDiveAnalysis, response.data?.visitPrepKit);

      // T043: Update familyProfile live from orchestration response — merge to accumulate multi-turn data
      if (response.data?.familyProfile) {
        setFamilyProfile(prev => ({ ...(prev || {}), ...response.data.familyProfile }));
      }

      // DEEPDIVE: Store structured analysis card data
      // Only update if a new one is returned; only clear when leaving DEEP_DIVE state entirely
      if (response.data?.deepDiveAnalysis) {
        setDeepDiveAnalysis(response.data.deepDiveAnalysis);
      } else if (response.data?.state === 'DEEP_DIVE' && response.data?.deepDiveAnalysis === null && artifactCache && selectedSchool?.id) {
        // WC6: Hydrate from cache if no new analysis in DEEP_DIVE state
        const cacheKey = `${selectedSchool.id}_deep_dive_analysis`;
        if (artifactCache[cacheKey]) {
          console.log('[WC6] Hydrating deepDiveAnalysis from cache');
          setDeepDiveAnalysis(artifactCache[cacheKey]);
        }
      } else if (response.data?.state !== 'DEEP_DIVE') {
        setDeepDiveAnalysis(null);
      }
      // do NOT clear deepDiveAnalysis when state stays DEEP_DIVE but no new analysis returned

      // Visit Prep Kit: same — only set when returned, only clear when leaving DEEP_DIVE
      if (response.data?.visitPrepKit) {
        if (!isPremium) {
          setVisitPrepKit({ __gated: true, schoolName: response.data.visitPrepKit.schoolName || 'this school' });
        } else {
          setVisitPrepKit(response.data.visitPrepKit);
        }
      } else if (response.data?.state === 'DEEP_DIVE' && response.data?.visitPrepKit === null && artifactCache && selectedSchool?.id) {
        // WC6: Hydrate from cache if no new visit prep kit in DEEP_DIVE state
        const cacheKey = `${selectedSchool.id}_visit_prep`;
        if (artifactCache[cacheKey]) {
          console.log('[WC6] Hydrating visitPrepKit from cache');
          if (!isPremium) {
            setVisitPrepKit({ __gated: true, schoolName: artifactCache[cacheKey].schoolName || selectedSchool?.name || 'this school' });
          } else {
            setVisitPrepKit(artifactCache[cacheKey]);
          }
        }
      } else if (response.data?.state !== 'DEEP_DIVE') {
        setVisitPrepKit(null);
      }

      // E28-S3 WC2: Action Plan capture
      if (response.data?.actionPlan) {
        setActionPlan(response.data.actionPlan);
      } else if (response.data?.state !== 'DEEP_DIVE') {
        setActionPlan(null);
      }

      // Fit Re-Evaluation: only set when returned, only clear when leaving DEEP_DIVE
      if (response.data?.fitReEvaluation) {
        if (!isPremium) {
          setFitReEvaluation({ __gated: true, schoolName: response.data.fitReEvaluation.schoolName || '' });
        } else {
          setFitReEvaluation(response.data.fitReEvaluation);
        }
      } else if (response.data?.state === 'DEEP_DIVE' && response.data?.fitReEvaluation === null && artifactCache && selectedSchool?.id) {
        // WC6: Hydrate from cache if no new fit re-evaluation in DEEP_DIVE state
        const cacheKey = `${selectedSchool.id}_fit_reevaluation`;
        if (artifactCache[cacheKey]) {
          console.log('[WC6] Hydrating fitReEvaluation from cache');
          if (!isPremium) {
            setFitReEvaluation({ __gated: true, schoolName: artifactCache[cacheKey].schoolName || selectedSchool?.name || '' });
          } else {
            setFitReEvaluation(artifactCache[cacheKey]);
          }
        }
      } else if (response.data?.state !== 'DEEP_DIVE') {
        setFitReEvaluation(null);
      }

      // Store extractedEntities from response for FamilyBrief fallback display — merge to accumulate multi-turn data
      if (response.data?.extractedEntities) {
        setExtractedEntitiesData(prev => ({ ...(prev || {}), ...response.data.extractedEntities }));
        console.log('[BUDGET FIX] Stored extractedEntities:', response.data.extractedEntities);
      }

      // T047: If matches were auto-refreshed, bump animation key to trigger fade/reorder
      if (response.data?.conversationContext?.autoRefreshed === true) {
        setSchoolsAnimKey(k => k + 1);
      }

      // CRITICAL: Update briefStatus from response immediately
      const newBriefStatus = response.data?.briefStatus || null;
      if (newBriefStatus) {
        setBriefStatus(newBriefStatus);
        console.log('[BRIEF STATUS] Updated to:', newBriefStatus);
      } else if (response.data?.state === STATES.RESULTS && briefStatus === 'confirmed') {
        // S151-P0: Clear briefStatus when transitioning to RESULTS - prevents LoadingOverlay re-triggering
        setBriefStatus(null);
        console.log('[BRIEF STATUS] Cleared on RESULTS transition');
      }

      // CRITICAL FIX: Merge backend's full context (including extractedEntities) with frontend state
      const updatedContext = {
        ...(currentConversation?.conversationContext || {}),
        ...(response.data?.conversationContext || {}),
        state: response.data?.state,
        briefStatus: newBriefStatus,
        schools: response.data?.schools || [],
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

      if (!isViewingSchoolDetail && response.data?.state) {
        // Only update view if NOT viewing a school detail
        // CRITICAL: Do NOT call setSelectedSchool(null) here - it defeats the single source of truth
        setCurrentView(mapStateToView(response.data?.state));
      } else if (!isViewingSchoolDetail && !response.data?.state) {
        console.warn('[WARN] Missing state from response:', response.data?.state);
      } else if (isViewingSchoolDetail) {
        console.log('[BUG-DD-001] Maintaining detail view - school selected:', selectedSchool?.name);
        // Keep view locked to detail as long as selectedSchool is set
      }

      // Use the same guard for schools display logic
      const isDeepDivingSchool = isViewingSchoolDetail;

      // FIX #3: First priority - if schools are returned, display them (ONLY if not in DEEP_DIVE)
      if ((response.data?.schools || []).length > 0 && !isDeepDivingSchool) {
        // Track schools shown
        trackEvent('schools_shown', { metadata: { schoolCount: (response.data?.schools || []).length } });

        // Show feedback prompt if not already shown
        if (!feedbackPromptShown && messages.length > 5) {
          setFeedbackPromptShown(true);
        }
        // Reorder schools to match the order mentioned in AI response
        const aiResponse = response.data?.message || '';
        const orderedSchools = [...(response.data?.schools || [])].filter(Boolean);

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
      if (response.data?.state === STATES.RESULTS) {
        try {
          const matchedSchoolIds = (response.data?.schools || []).map(s => s.id).filter(id => id != null);
          const profileForSession = response.data?.familyProfile || familyProfile;
          const profileName = profileForSession?.childName
            ? `${profileForSession.childName}'s School Search Profile`
            : 'School Search Profile';

          // Ensure a ChatHistory record exists for URL-based flow
          let chatHistoryRecord = null;
          if ((!currentConversation?.id) && isAuthenticated && user) {
            try {
              chatHistoryRecord = await base44.entities.ChatHistory.create({
                userId: user.id,
                title: profileName,
                messages: updatedMessages,
                conversationContext: updatedContext,
                isActive: true
              });
              setCurrentConversation(prev => ({ ...(prev || {}), ...chatHistoryRecord, conversationContext: updatedContext }));
              console.log('[SESSION] Created ChatHistory with id:', chatHistoryRecord.id);
            } catch (e) {
              console.error('Failed to create ChatHistory before ChatSession:', e);
            }
          }

          // BUG-LOCATION-EXTRACT-S97 FIX: Prefer extractedEntities.locationArea over profileForSession
          // to avoid stale/invalid values (e.g. 'Grade') stored on the profile before isInvalidLocation correction
          const safeLocationArea = response.data?.extractedEntities?.locationArea || extractedEntitiesData?.locationArea || profileForSession?.locationArea;

          // E29-003: Auto-create FamilyJourney at Brief confirmation
          ;(async () => {
            if (!user?.id) return;
            try {
              const existingJourneys = await base44.entities.FamilyJourney.filter({ userId: user.id });
              const activeJourneyList = existingJourneys.filter(j => !j.isArchived);
              if (activeJourneyList.length === 0) {
                const childName = profileForSession?.childName || 'My Child';
                const newJourney = await base44.entities.FamilyJourney.create({
                  userId: user.id,
                  childName: childName,
                  profileLabel: childName + "'s School Search",
                  currentPhase: 'MATCH',
                  phaseHistory: JSON.stringify([
                    { phase: 'UNDERSTAND', enteredAt: new Date().toISOString(), completedAt: new Date().toISOString() },
                    { phase: 'MATCH', enteredAt: new Date().toISOString() }
                  ]),
                  familyProfileId: familyProfile?.id || null,
                  briefSnapshot: JSON.stringify(profileForSession || {}),
                  consultantId: selectedConsultant || 'jackie',
                  totalSessions: 1,
                  isArchived: false,
                  lastActiveAt: new Date().toISOString(),
                });
                console.log('[E29-003] FamilyJourney created:', newJourney.id);
                if (typeof setActiveJourney === 'function') {
                  setActiveJourney(newJourney);
                }
                if (chatSession?.id && newJourney?.id) {
                  base44.entities.ChatSession.update(chatSession.id, { journeyId: newJourney.id }).catch(e => console.error('[E29-003] Failed to link ChatSession:', e));
                }
              } else {
                console.log('[E29-003] Active FamilyJourney already exists, skipping creation. Journey ID:', activeJourneyList[0].id);
                if (typeof setActiveJourney === 'function' && !activeJourney) {
                  setActiveJourney(activeJourneyList[0]);
                }
              }
            } catch (e) {
              console.error('[E29-003] FamilyJourney creation failed:', e.message);
            }
          })();

          const chatSession = await base44.entities.ChatSession.create({
            sessionToken: sessionId,
            userId: user?.id,
            familyProfileId: profileForSession?.id || null,
            chatHistoryId: chatHistoryRecord?.id || currentConversation?.id,
            status: 'active',
            consultantSelected: selectedConsultant,
            childName: profileForSession?.childName,
            childGrade: profileForSession?.childGrade,
            locationArea: safeLocationArea,
            maxTuition: profileForSession?.maxTuition,
            priorities: profileForSession?.priorities,
            matchedSchools: JSON.stringify(matchedSchoolIds),
            profileName,
            journeyId: null,
          });

          // Update URL with entity id (not sessionToken)
          if (chatSession?.id && typeof chatSession.id === 'string') {
            const newUrl = createPageUrl(`Consultant?sessionId=${chatSession.id}`);
            window.history.replaceState({}, document.title, newUrl);
            console.log('[SESSION] Created ChatSession with id:', chatSession.id);
          } else {
            console.warn('[WARN] Invalid chatSession id — skipping URL update:', chatSession?.id);
          }
        } catch (sessionError) {
          console.error('Failed to create ChatSession:', sessionError);
        }
      }

      // KI-52: Brief content validator — swap thin LLM brief for programmatic fallback
      // DOUBLE-BRIEF FIX: Only apply when the RESPONSE state is also BRIEF (not when transitioning to RESULTS)
      let aiMessageContent = response.data?.message || 'Here are your school matches based on your preferences.';
      if (response.data?.state === STATES.BRIEF) {
        const latestProfile = response.data?.familyProfile || familyProfile;
        const isEditingBrief = response.data?.briefStatus === 'editing' || response.data?.conversationContext?.briefStatus === 'editing';
        if (!isEditingBrief && !validateBriefContent(aiMessageContent)) {
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
        timestamp: new Date().toISOString(),
        deepDiveAnalysis: response.data?.deepDiveAnalysis ? { ...response.data.deepDiveAnalysis, schoolId: selectedSchool?.id } : null,
        visitPrepKit: response.data?.visitPrepKit
          ? { ...response.data.visitPrepKit, schoolId: selectedSchool?.id }
          : null,
        actionPlan: response.data?.actionPlan
          ? { ...response.data.actionPlan, schoolId: selectedSchool?.id }
          : null,
        fitReEvaluation: response.data?.fitReEvaluation
          ? { ...response.data.fitReEvaluation, schoolId: selectedSchool?.id }
          : null,
        actions: response.data?.actions || [],
      };

      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);
      setIsTyping(false);

      // Non-fatal bookkeeping — runs after user-facing response is delivered
      // Errors here are logged but never shown to the user
      (async () => {
        try {
          // Deduct 1 token and persist to database (skip for premium)
          if (isAuthenticated && user && !isPremium) {
            const newTokenBalance = Math.max(0, tokenBalance - 1);
            setTokenBalance(newTokenBalance);
            await base44.auth.updateMe({ tokenBalance: newTokenBalance });
          }

          // Save AI memories with deduplication and filtering
          if (isAuthenticated && user) {
            await extractAndSaveMemories(messageText, response.data?.message || '', user, base44);
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
                if (titleResult.data?.title) {
                  setCurrentConversation(prev => ({ ...prev, title: titleResult.data.title }));
                  await loadConversations(user.id);
                }
              } catch (titleError) {
                console.warn('[WARN] Failed to generate conversation title:', titleError);
              }
            }

            // Trigger summarization every 5 user messages
            if (userMessageCount % 5 === 0) {
              await base44.functions.invoke('summarizeConversation', {
                conversationId: currentConversation.id
              });
            }
          }
        } catch (err) {
          console.error('[BOOKKEEPING] Non-fatal error:', err);
        }
      })();

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
            finally {
      // CRT-S109-F15: Reset processing guard and process queued messages
      isProcessing = false;
      await processQueuedMessages();
           }
    
  };

  return { handleSendMessage };
};