import { callOpenRouter } from './callOpenRouter.ts';

export async function handleBrief(params) {
  const { base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId } = params;

  const STATES = {
    WELCOME: 'WELCOME',
    DISCOVERY: 'DISCOVERY',
    BRIEF: 'BRIEF',
    RESULTS: 'RESULTS',
    DEEP_DIVE: 'DEEP_DIVE'
  };

  const BRIEF_STATUS = {
    GENERATING: 'generating',
    PENDING_REVIEW: 'pending_review',
    EDITING: 'editing',
    CONFIRMED: 'confirmed'
  };

  let msgLower = message.toLowerCase();
  let updatedBriefStatus = briefStatus;
  let briefMessage;
  
  // BUG FIX: Handle adjust flow properly
  const isInitialAdjustRequest = /\b(change|adjust|edit|actually|wait|hold on|no|not right|different|let me|redo)\b/i.test(msgLower) && 
                                  !/budget|grade|location|school|curriculum|priority/i.test(msgLower);
  
  if (updatedBriefStatus === BRIEF_STATUS.EDITING && isInitialAdjustRequest) {
    // First adjustment request - ask what to change
    const adjustSystemPrompt = consultantName === 'Jackie'
      ? `You are Jackie, a warm and encouraging education consultant. The parent wants to adjust something in their brief. Ask them a warm, open-ended question about what they'd like to change. Max 50 words. Be encouraging.`
      : `You are Liam, a direct and strategic education consultant. The parent wants to adjust their brief. Ask them directly what needs to change. Max 50 words.`;

    const adjustUserPrompt = `The parent message was: "${message}"

  Ask what needs adjustment in their brief.`;

    let adjustMessage = "What would you like to adjust?";
    try {
      const adjustResponse = await callOpenRouter({
        systemPrompt: adjustSystemPrompt,
        userPrompt: adjustUserPrompt,
        maxTokens: 300,
        temperature: 0.5
      });
      adjustMessage = adjustResponse || "What would you like to adjust?";
      console.log('[OPENROUTER] BRIEF adjustment');
    } catch (openrouterError) {
      console.log('[OPENROUTER FALLBACK] BRIEF adjustment falling back to InvokeLLM');
      try {
        const adjustPrompt = consultantName === 'Jackie'
          ? `The parent wants to adjust something in their brief. Ask them a warm, open-ended question about what they'd like to change. Max 50 words. Be encouraging.`
          : `The parent wants to adjust their brief. Ask them directly what needs to change. Max 50 words.`;

        const fallbackResponse = await base44.integrations.Core.InvokeLLM({
          prompt: adjustPrompt
        });
        adjustMessage = fallbackResponse?.response || fallbackResponse || "What would you like to adjust?";
      } catch (fallbackError) {
        console.error('[FALLBACK ERROR] BRIEF adjustment failed:', fallbackError.message);
      }
    }
    
    return Response.json({
      message: adjustMessage,
      state: STATES.BRIEF,
      briefStatus: BRIEF_STATUS.EDITING,
      familyProfile: conversationFamilyProfile,
      conversationContext: context,
      schools: []
    });
  } else if (updatedBriefStatus === BRIEF_STATUS.EDITING && !isInitialAdjustRequest) {
    // User provided specific changes - update entities and regenerate brief
    // Entity extraction already ran at STEP 1, so conversationFamilyProfile is already updated
    // Now regenerate the brief - set to GENERATING so it becomes PENDING_REVIEW after generation
    updatedBriefStatus = BRIEF_STATUS.GENERATING;
    context.briefStatus = updatedBriefStatus;
  }
  
  // CRITICAL FIX: Sync conversationFamilyProfile with context.extractedEntities before generating brief
  // This ensures ALL accumulated data across ALL messages is present, not just the latest extraction
  if (context.extractedEntities) {
    for (const [key, value] of Object.entries(context.extractedEntities)) {
      if (value !== null && value !== undefined) {
        // Only update if conversationFamilyProfile doesn't have this data yet
        if (conversationFamilyProfile[key] === null || conversationFamilyProfile[key] === undefined || 
            (Array.isArray(conversationFamilyProfile[key]) && conversationFamilyProfile[key].length === 0)) {
          conversationFamilyProfile[key] = value;
        }
      }
    }
  }
  
  // Only generate brief if not in editing mode
  try {
    const { childName, childGrade, childGender, locationArea, budgetRange, budgetMin, budgetMax, maxTuition, interests, priorities, dealbreakers, currentSituation, academicStrengths, genderPreference, classSize, programPreferences, wellbeing_needs } = conversationFamilyProfile;
    const interestsStr = interests?.length > 0 ? interests.join(', ') : '';
    const prioritiesStr = priorities?.length > 0 ? priorities.join(', ') : '';
    const strengthsStr = academicStrengths?.length > 0 ? academicStrengths.join(', ') : '';
    const dealbreakersStr = dealbreakers?.length > 0 ? dealbreakers.join(', ') : '';
    const programPreferencesStr = programPreferences?.length > 0 ? programPreferences.join(', ') : '';
    const wellbeingNeedsStr = wellbeing_needs?.length > 0 ? wellbeing_needs.join(', ') : '';

    // KI-15: Fix budget display - single value OR range
    let budgetDisplay = budgetRange || '(not specified)';
    if (maxTuition === 'unlimited') {
      budgetDisplay = 'Budget is flexible';
    } else if (budgetMin && budgetMax && budgetMin !== budgetMax) {
      budgetDisplay = `$${budgetMin.toLocaleString()}-$${budgetMax.toLocaleString()}/year`;
    } else if (budgetMin && budgetMax && budgetMin === budgetMax) {
      // KI-15: Don't show duplicate range like "$25,000-$25,000"
      budgetDisplay = `$${budgetMin.toLocaleString()}/year`;
    } else if (budgetMax) {
      budgetDisplay = `Up to $${budgetMax.toLocaleString()}/year`;
    } else if (maxTuition && typeof maxTuition === 'number') {
      budgetDisplay = `$${maxTuition.toLocaleString()}/year`;
    }

    // KI-16: Smart child name display with gender (used in BRIEF state)
    // NOTE: Declare both briefChildDisplayName AND childDisplayName to prevent
    // ReferenceError if Base44 live code references either variable name.
    let briefChildDisplayName = childName ? childName : 'your child';
    if (!childName && childGender === 'male') {
      briefChildDisplayName = 'your son';
    } else if (!childName && childGender === 'female') {
      briefChildDisplayName = 'your daughter';
    }
    const childDisplayName = briefChildDisplayName;

    // KI-10: MULTI-CHILD DETECTION at code level
    const conversationText = conversationHistory?.map(m => m.content).join(' ') || '';
    const multiChildPatterns = /\b(two kids|two children|both kids|both children|my son and daughter|my daughter and son|older one and younger|younger one and older|first child|second child|one child.*another child|siblings|each child|each of them)\b/i;
    const isMultiChild = multiChildPatterns.test(conversationText);
    console.log('[KI-10 MULTI-CHILD CHECK]', {isMultiChild, conversationSnippet: conversationText.substring(0, 200)});

    // FIX #6: UNIFIED BRIEF FORMAT + FIX #2: STOP FABRICATING PERSONALITY
    const learningNeeds = conversationFamilyProfile.learning_needs || conversationFamilyProfile.specialNeeds || [];
    const learningNeedsStr = learningNeeds.length > 0 ? learningNeeds.join(', ') : '';
    const curriculumStr = conversationFamilyProfile.curriculumPreference?.length > 0 ? conversationFamilyProfile.curriculumPreference.join(', ') : '';

    // familyDataSection removed — was dead code after LLM prompt removal

    // NOTE: LLM brief prompt removed (KI-52 fix). Programmatic builder below is the sole brief generation path.

    // KI-52 FIX: Programmatic brief generation — NO LLM call.
    // This is the SOLE code path for generating brief text.
    console.log('[BRIEF] Using programmatic brief generation (no LLM call)');
    console.log('[BRIEF] Data available:', {
      childName: childName || null,
      childGrade: childGrade ?? context.extractedEntities?.childGrade ?? null,
      location: locationArea || context.extractedEntities?.locationArea || null,
      budget: budgetDisplay,
      prioritiesCount: priorities?.length || 0,
      interestsCount: interests?.length || 0,
      isMultiChild
    });

    // Resolve grade from profile OR extractedEntities (whichever has data)
    const resolvedGrade = childGrade ?? context.extractedEntities?.childGrade;
    const gradeStr = resolvedGrade !== null && resolvedGrade !== undefined
      ? (resolvedGrade === -1 ? 'JK' : resolvedGrade === 0 ? 'SK' : 'Grade ' + resolvedGrade)
      : null;

    // Resolve location from profile OR extractedEntities
    const resolvedLocation = locationArea || context.extractedEntities?.locationArea;

    // KI-10: Multi-child brief builder
    let briefContent;
    if (isMultiChild) {
      let parsedChildren = null;
      try {
        if (context.extractedEntities?.childrenJson) {
          parsedChildren = JSON.parse(context.extractedEntities.childrenJson);
        }
      } catch (e) {
        console.error('[KI-10] Failed to parse childrenJson:', e);
      }

      if (parsedChildren && Array.isArray(parsedChildren) && parsedChildren.length >= 2) {
        const childBullets = parsedChildren.map((child, idx) => {
          const num = idx + 1;
          const name = child.name || 'Child ' + num;
          const grade = child.grade !== null && child.grade !== undefined
            ? (child.grade === -1 ? 'JK' : child.grade === 0 ? 'SK' : 'Grade ' + child.grade)
            : '(not specified)';
          let section = 'Child ' + num + ': ' + name + '\n';
          section += '  • Grade: ' + grade;
          if (child.interests?.length) section += '\n  • Interests: ' + child.interests.join(', ');
          if (child.priorities?.length) section += '\n  • Priorities: ' + child.priorities.join(', ');
          if (child.learningNeeds?.length) section += '\n  • Learning needs: ' + child.learningNeeds.join(', ');
          return section;
        }).join('\n\n');

        const sharedBullets = [];
        if (resolvedLocation) sharedBullets.push('• Location: ' + resolvedLocation);
        if (budgetDisplay && budgetDisplay !== '(not specified)') sharedBullets.push('• Budget: ' + budgetDisplay);
        if (curriculumStr) sharedBullets.push('• Curriculum: ' + curriculumStr);
        if (dealbreakersStr) sharedBullets.push('• Dealbreakers: ' + dealbreakersStr);

        briefContent = childBullets;
        if (sharedBullets.length > 0) {
          briefContent += '\n\nShared family preferences:\n' + sharedBullets.join('\n');
        }
      } else {
        // Multi-child detected but no structured data — fall through to single-child
        briefContent = null;
      }
    }

    // Single-child brief builder (also used as fallback for multi-child without structured data)
    if (!briefContent) {
      const bullets = [];
      // Student line: combine name + grade
      if (childName && gradeStr) {
        bullets.push('Student: ' + childDisplayName + ', ' + gradeStr);
      } else if (childName) {
        bullets.push('Student: ' + childDisplayName);
      } else if (gradeStr) {
        bullets.push('Grade: ' + gradeStr);
      }
      if (resolvedLocation) bullets.push('Location: ' + resolvedLocation);
      if (budgetDisplay && budgetDisplay !== '(not specified)') bullets.push('Budget: ' + budgetDisplay);
      if (genderPreference) bullets.push('Gender preference: ' + genderPreference);
      if (classSize || context.extractedEntities?.classSize) bullets.push('Class size: ' + (classSize || context.extractedEntities.classSize));
      if (curriculumStr) bullets.push('Curriculum: ' + curriculumStr);
      if (programPreferencesStr) bullets.push('Program preferences: ' + programPreferencesStr);
      if (prioritiesStr) bullets.push('Top priorities: ' + prioritiesStr);
      if (learningNeedsStr) bullets.push('Learning needs: ' + learningNeedsStr);
      if (wellbeingNeedsStr) bullets.push('Wellbeing needs: ' + wellbeingNeedsStr);
      if (interestsStr) bullets.push('Interests: ' + interestsStr);
      if (strengthsStr) bullets.push('Academic strengths: ' + strengthsStr);
      if (dealbreakersStr) bullets.push('Dealbreakers: ' + dealbreakersStr);
      if (context.extractedEntities?.boardingPreference) bullets.push('Boarding: Yes');
      if (context.extractedEntities?.religiousPreference) bullets.push('Religious preference: ' + context.extractedEntities.religiousPreference);
      if (currentSituation) bullets.push('Current situation: ' + currentSituation);

      briefContent = bullets.length > 0
        ? bullets.map(b => '• ' + b).join('\n')
        : 'I captured your preferences but could not format them.';
    }
    
    // Consultant-specific intro
    const intro = consultantName === 'Jackie' 
      ? "Let me make sure I've got this right:\n\n"
      : "Here's what I'm hearing:\n\n";
    
    let briefMessageText = intro + briefContent + "\n\nDoes that capture everything? Anything you'd like to adjust?";

    // Post-processing safety net: replace any remaining [Child] or [child] placeholders
    briefMessageText = briefMessageText.replace(/\[Child\]/gi, briefChildDisplayName);
    briefMessageText = briefMessageText.replace(/\[child's name\]/gi, briefChildDisplayName);
    briefMessageText = briefMessageText.replace(/\[child\]/gi, briefChildDisplayName);
    briefMessage = briefMessageText;
    console.log('[BRIEF] Programmatic brief generated, length:', briefMessage?.length, 'preview:', briefMessage?.substring(0, 120));
  } catch (e) {
    console.error('[ERROR] All BRIEF generation failed:', e.message);
    
    // PROGRAMMATIC FALLBACK: Build brief from extracted entities
    const fallbackBrief = [];
    if (conversationFamilyProfile.childName) fallbackBrief.push(`Student: ${conversationFamilyProfile.childName}`);
    if (context.extractedEntities?.childGrade) {
      const gradeDisplay = context.extractedEntities.childGrade === -1 ? 'JK' : context.extractedEntities.childGrade === 0 ? 'SK' : `Grade ${context.extractedEntities.childGrade}`;
      fallbackBrief.push(`Grade: ${gradeDisplay}`);
    }
    if (context.extractedEntities?.locationArea) fallbackBrief.push(`Location: ${context.extractedEntities.locationArea}`);
    if (conversationFamilyProfile.maxTuition) fallbackBrief.push(`Budget: $${conversationFamilyProfile.maxTuition.toLocaleString()}`);
    if (conversationFamilyProfile.priorities?.length) fallbackBrief.push(`Priorities: ${conversationFamilyProfile.priorities.join(', ')}`);
    if (conversationFamilyProfile.interests?.length) fallbackBrief.push(`Interests: ${conversationFamilyProfile.interests.join(', ')}`);
    if (conversationFamilyProfile.learning_needs?.length) fallbackBrief.push(`Learning needs: ${conversationFamilyProfile.learning_needs.join(', ')}`);
    if (context.extractedEntities?.genderPreference) fallbackBrief.push(`Gender preference: ${context.extractedEntities.genderPreference}`);
    if (context.extractedEntities?.boardingPreference) fallbackBrief.push('Boarding: Yes');
    if (context.extractedEntities?.religiousPreference) fallbackBrief.push(`Religious preference: ${context.extractedEntities.religiousPreference}`);
    
    const briefContent = fallbackBrief.length > 0 ? fallbackBrief.map(b => `• ${b}`).join('\n') : 'I captured your preferences but could not format them.';
    briefMessage = `Here's what I've captured so far:\n\n${briefContent}\n\nDoes that look right? Feel free to adjust anything.`;
  }

  // Response validator: strip school names during DISCOVERY
  if (currentState === STATES.DISCOVERY && currentSchools?.length > 0) {
    currentSchools.forEach(school => {
      const escapedName = school.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<!\\[)\\b${escapedName}\\b(?!\\])`, 'gi');
      briefMessage = briefMessage.replace(regex, '');
    });
  }

  // Set briefStatus to pending_review after generating
  if (updatedBriefStatus === BRIEF_STATUS.GENERATING) {
    updatedBriefStatus = BRIEF_STATUS.PENDING_REVIEW;
    context.briefStatus = updatedBriefStatus;
    console.log('[BRIEF GENERATED] Set briefStatus to pending_review');
  }

  return Response.json({
    message: briefMessage,
    state: STATES.BRIEF,
    briefStatus: updatedBriefStatus,
    familyProfile: conversationFamilyProfile,
    conversationContext: context,
    schools: []
  });
}