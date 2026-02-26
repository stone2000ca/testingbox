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

    // KI-10: Build FAMILY DATA section - use structured childrenJson if available
    let familyDataSection;
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
        // Structured multi-child data available
        let childSections = '';
        parsedChildren.forEach((child, idx) => {
          const childNum = idx + 1;
          const childName = child.name || `Child ${childNum}`;
          const gradeDisplay = child.grade !== null && child.grade !== undefined 
            ? (child.grade === -1 ? 'JK' : child.grade === 0 ? 'SK' : `Grade ${child.grade}`) 
            : '(not specified)';
          const genderDisplay = child.gender || '(not specified)';
          const interestsDisplay = child.interests?.length > 0 ? child.interests.join(', ') : '(not specified)';
          const prioritiesDisplay = child.priorities?.length > 0 ? child.priorities.join(', ') : '(not specified)';
          const learningNeedsDisplay = child.learningNeeds?.length > 0 ? child.learningNeeds.join(', ') : '(not specified)';

          childSections += `\nCHILD ${childNum}: ${childName}
    - GRADE: ${gradeDisplay}
    - GENDER: ${genderDisplay}
    - INTERESTS: ${interestsDisplay}
    - PRIORITIES: ${prioritiesDisplay}
    - LEARNING NEEDS: ${learningNeedsDisplay}\n`;
        });

        familyDataSection = `MULTI-CHILD FAMILY DATA:${childSections}
    SHARED FAMILY FIELDS:
    - LOCATION: ${locationArea || '(not specified)'}
    - BUDGET: ${budgetDisplay}
    - CURRICULUM: ${curriculumStr || '(not specified)'}
    - DEALBREAKERS: ${dealbreakersStr || '(not specified)'}`;
      } else {
        // Fallback: tell AI to parse conversation
        familyDataSection = `MULTI-CHILD DETECTED: The parent has mentioned MULTIPLE children in the conversation. Do NOT use any single-child data fields. Instead, read the conversation carefully and create SEPARATE profile sections for EACH child mentioned. Each child must have their own: name/description, Grade, Location, Budget, Gender preference, Class size, Top priorities, Learning needs, Wellbeing needs, Program preferences, Interests, and Extracurriculars. Label them as Child 1 and Child 2.`;
      }
    } else {
      familyDataSection = `FAMILY DATA:
    - CHILD: ${briefChildDisplayName}
    - GRADE: ${childGrade !== null && childGrade !== undefined ? (childGrade === -1 ? 'JK' : childGrade === 0 ? 'SK' : 'Grade ' + childGrade) : '(not specified)'}
    - LOCATION: ${locationArea || '(not specified)'}
    - BUDGET: ${budgetDisplay}
    - GENDER PREFERENCE: ${genderPreference || '(not specified)'}
    - CLASS SIZE: ${classSize || '(not specified)'}
    - CURRICULUM: ${curriculumStr || '(not specified)'}
    - PROGRAM PREFERENCES: ${programPreferencesStr || '(not specified)'}
    - LEARNING NEEDS: ${learningNeedsStr || '(not specified)'}
    - WELLBEING NEEDS: ${wellbeingNeedsStr || '(not specified)'}
    - INTERESTS: ${interestsStr || '(not specified)'}
    - PRIORITIES: ${prioritiesStr || '(not specified)'}
    - DEALBREAKERS: ${dealbreakersStr || '(not specified)'}

    MULTI-CHILD CHECK: Review the conversation history. If the parent mentioned MORE THAN ONE child, you MUST create separate sections. Do NOT use the FAMILY DATA fields below (they only contain one child). Instead, extract each child's details directly from the conversation and present them as:

    Child 1: [name or description], [grade]
    - Location: [from conversation]
    - Budget: [from conversation]
    ... (all applicable fields)

    Child 2: [name or description], [grade]
    - Location: [from conversation]
    - Budget: [from conversation]
    ... (all applicable fields)

    ONLY use the FAMILY DATA fields below if there is exactly ONE child mentioned in the conversation.`;
    }

    const briefPrompt = consultantName === 'Jackie'
     ? `[STATE: BRIEF] Generate a factual brief summary using the structured format below. Use ONLY what was explicitly stated by the parent.

    CRITICAL RULES - DO NOT VIOLATE (FIX 11):
    - Do NOT invent personality traits, motivations, or character descriptions that were not explicitly stated by the parent.
    - If the parent said the child is struggling or has ADHD/learning differences, acknowledge that plainly and respectfully. Do NOT romanticize it.
    - If no personality was described, skip that section entirely.
    - Never use phrases like "bright and curious", "eager to explore the world", "joyful inquisitiveness" unless the parent used those exact words.
    - Never call any budget "generous", "modest", "tight", or "comfortable". Use neutral factual language. (FIX 15)
    - If parent mentions ADHD, ASD, ESL, or learning differences, name them explicitly in the Brief. Do NOT euphemize as "unique learning style".

    MULTI-CHILD SUPPORT (KI-10 P0):
    - If parent mentioned MULTIPLE children with different grades/needs, you MUST present SEPARATE profiles for each child.
    - Example: "Child 1: Emma, Grade 9 - STEM focus, robotics, AP courses" followed by "Child 2: Noah, Grade 3 - dyslexia support, small classes, Montessori"
    - Do NOT merge multiple children into one profile. Each child gets their own bullet section with their specific grade, needs, and priorities.
    - If only one child was mentioned, use the standard single-child format.

    ${familyDataSection}

    UNIFIED FORMAT (FIX 14) - Use this exact structure:
   [REQUIRED warm, conversational intro - Jackie tone. Sound like you're reflecting back what you heard, NOT generating a report. Examples: "If I'm understanding correctly...", "Let me make sure I've got this right...", "Based on everything you've shared...". Be genuine and empathetic.]

   **IF MULTIPLE CHILDREN DETECTED IN CONVERSATION: Repeat the bullet list below for EACH child with their own header (e.g., "Child 1:" and "Child 2:") and their specific details.**

   • Student: ${briefChildDisplayName}, ${childGrade !== null && childGrade !== undefined ? (childGrade === -1 ? 'JK' : childGrade === 0 ? 'SK' : 'Grade ' + childGrade) : '(not specified)'}
   • Location: ${locationArea || '(not specified)'}
   • Budget: ${budgetDisplay}
   ${genderPreference ? '• Gender preference: ' + genderPreference + '\n' : ''}${classSize ? '• Class size: ' + classSize + '\n' : ''}${prioritiesStr ? '• Top priorities: ' + prioritiesStr + '\n' : ''}${learningNeedsStr ? '• Learning needs: ' + learningNeedsStr + '\n' : ''}${wellbeingNeedsStr ? '• Wellbeing needs: ' + wellbeingNeedsStr + '\n' : ''}${programPreferencesStr ? '• Program preferences: ' + programPreferencesStr + '\n' : ''}${dealbreakersStr ? '• Dealbreakers: ' + dealbreakersStr + '\n' : ''}${curriculumStr ? '• Curriculum: ' + curriculumStr + '\n' : ''}${interestsStr ? '• Interests: ' + interestsStr + '\n' : ''}
   Does that capture it? Anything to adjust?

   YOU ARE JACKIE - Warm intro, structured data.`
      : `[STATE: BRIEF] Generate a factual brief summary using the structured format below. Use ONLY what was explicitly stated by the parent.

   CRITICAL RULES - DO NOT VIOLATE (FIX 11):
   - Do NOT invent personality traits, motivations, or character descriptions that were not explicitly stated by the parent.
   - If the parent said the child is struggling or has ADHD/learning differences, acknowledge that plainly and respectfully. Do NOT romanticize it.
   - If no personality was described, skip that section entirely.
   - Never use phrases like "bright and curious", "eager to explore the world", "joyful inquisitiveness" unless the parent used those exact words.
   - Never call any budget "generous", "modest", "tight", or "comfortable". Use neutral factual language. (FIX 15)
   - If parent mentions ADHD, ASD, ESL, or learning differences, name them explicitly in the Brief. Do NOT euphemize as "unique learning style".
   
   MULTI-CHILD SUPPORT (KI-10 P0):
   - If parent mentioned MULTIPLE children with different grades/needs, you MUST present SEPARATE profiles for each child.
   - Example: "Child 1: Emma, Grade 9 - STEM focus, robotics, AP courses" followed by "Child 2: Noah, Grade 3 - dyslexia support, small classes, Montessori"
   - Do NOT merge multiple children into one profile. Each child gets their own bullet section with their specific grade, needs, and priorities.
   - If only one child was mentioned, use the standard single-child format.

   ${familyDataSection}

   UNIFIED FORMAT (FIX 14) - Use this exact structure:
   [REQUIRED direct, conversational intro - Liam tone. Sound like you're confirming what you heard, NOT generating a report. Examples: "Let me make sure I've got this right...", "Based on what you've told me...", "Here's what I'm hearing...". Be natural and straightforward.]
   
   **IF MULTIPLE CHILDREN DETECTED IN CONVERSATION: Repeat the bullet list below for EACH child with their own header (e.g., "Child 1:" and "Child 2:") and their specific details.**
   
   • Student: ${briefChildDisplayName}, Grade ${childGrade || '(not specified)'}
   • Location: ${locationArea || '(not specified)'}
   • Budget: ${budgetDisplay}
   ${genderPreference ? '• Gender preference: ' + genderPreference + '\n' : ''}${classSize ? '• Class size: ' + classSize + '\n' : ''}${prioritiesStr ? '• Top priorities: ' + prioritiesStr + '\n' : ''}${learningNeedsStr ? '• Learning needs: ' + learningNeedsStr + '\n' : ''}${programPreferencesStr ? '• Program preferences: ' + programPreferencesStr + '\n' : ''}${dealbreakersStr ? '• Dealbreakers: ' + dealbreakersStr + '\n' : ''}${curriculumStr ? '• Curriculum: ' + curriculumStr + '\n' : ''}${interestsStr ? '• Interests: ' + interestsStr + '\n' : ''}
   Sound right?

   YOU ARE LIAM - Direct intro, structured data.`;

    let briefMessageText = 'Let me summarize what you\'ve shared.';
    try {
      console.log('[BRIEF] Generating brief with callOpenRouter, prompt length:', briefPrompt.length);
      const briefResult = await callOpenRouter({
        systemPrompt: briefPrompt.split('\n\n')[0],
        userPrompt: briefPrompt.split('\n\n').slice(1).join('\n\n'),
        maxTokens: 800,
        temperature: 0.5
      });
      briefMessageText = briefResult || 'Let me summarize what you\'ve shared.';
      console.log('[BRIEF] OpenRouter returned result, length:', briefMessageText?.length, 'starts with:', briefMessageText?.substring(0, 50));
      console.log('[OPENROUTER] BRIEF generation');
    } catch (openrouterError) {
      console.error('[ERROR] OpenRouter BRIEF failed:', openrouterError.message);
      console.log('[OPENROUTER FALLBACK] BRIEF generation falling back to InvokeLLM');
      try {
        const briefResult = await base44.integrations.Core.InvokeLLM({
          prompt: briefPrompt,
          add_context_from_internet: false
        });
        briefMessageText = briefResult?.response || briefResult || 'Let me summarize what you\'ve shared.';
      } catch (fallbackError) {
        console.error('[ERROR] InvokeLLM BRIEF fallback failed:', fallbackError.message);
      }
    }

    // INLINE PROGRAMMATIC FALLBACK: If both LLM calls failed silently,
    // briefMessageText is still the generic default. Build a brief from extracted entities.
    if (briefMessageText === 'Let me summarize what you\'ve shared.') {
      console.log('[BRIEF] Both LLM calls failed, using programmatic fallback');
      const fallbackBrief = [];
      if (conversationFamilyProfile.childName) fallbackBrief.push('Student: ' + conversationFamilyProfile.childName);
      if (context.extractedEntities?.childGrade) {
        const gradeDisplay = context.extractedEntities.childGrade === -1 ? 'JK' : context.extractedEntities.childGrade === 0 ? 'SK' : 'Grade ' + context.extractedEntities.childGrade;
        fallbackBrief.push('Grade: ' + gradeDisplay);
      }
      if (context.extractedEntities?.locationArea) fallbackBrief.push('Location: ' + context.extractedEntities.locationArea);
      if (conversationFamilyProfile.maxTuition) fallbackBrief.push('Budget: $' + conversationFamilyProfile.maxTuition.toLocaleString());
      if (conversationFamilyProfile.priorities?.length) fallbackBrief.push('Priorities: ' + conversationFamilyProfile.priorities.join(', '));
      if (conversationFamilyProfile.interests?.length) fallbackBrief.push('Interests: ' + conversationFamilyProfile.interests.join(', '));
      if (conversationFamilyProfile.learning_needs?.length) fallbackBrief.push('Learning needs: ' + conversationFamilyProfile.learning_needs.join(', '));
      if (context.extractedEntities?.genderPreference) fallbackBrief.push('Gender preference: ' + context.extractedEntities.genderPreference);
      if (context.extractedEntities?.boardingPreference) fallbackBrief.push('Boarding: Yes');
      if (context.extractedEntities?.religiousPreference) fallbackBrief.push('Religious preference: ' + context.extractedEntities.religiousPreference);
      
      const briefContent = fallbackBrief.length > 0
        ? fallbackBrief.map(b => '\u2022 ' + b).join('\n')
        : 'I captured your preferences but could not format them.';
      briefMessageText = 'Here\'s what I\'ve captured so far:\n\n' + briefContent + '\n\nDoes that look right? Feel free to adjust anything.';
    }

    // Post-processing safety net: replace any remaining [Child] or [child] placeholders
    briefMessageText = briefMessageText.replace(/\[Child\]/gi, briefChildDisplayName);
    briefMessageText = briefMessageText.replace(/\[child's name\]/gi, briefChildDisplayName);
    briefMessageText = briefMessageText.replace(/\[child\]/gi, briefChildDisplayName);
    briefMessage = briefMessageText;
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