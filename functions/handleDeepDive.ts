import { callOpenRouter } from './callOpenRouter.ts';

export async function handleDeepDive(params) {
  const { base44, selectedSchoolId, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId } = params;
  
  console.log('DEEPDIVE_START', selectedSchoolId);
  console.log('[DEEPDIVE] Handler entered. selectedSchoolId:', selectedSchoolId, 'currentState:', currentState);
  let aiMessage = '';
  let selectedSchool = null;
  
  try {
    // BUG-DD-002 FIX #2: Load full school profile when selectedSchoolId provided
    if (selectedSchoolId) {
      try {
        console.log('[DEEPDIVE] Fetching school with ID:', selectedSchoolId);
        const schoolResults = await base44.entities.School.filter({ id: selectedSchoolId });
        console.log('[DEEPDIVE] School fetch results:', schoolResults.length);
        if (schoolResults.length > 0) {
          selectedSchool = schoolResults[0];
          console.log('[DEEPDIVE] Loaded school:', selectedSchool.name);
        } else {
          console.error('[DEEPDIVE ERROR] School not found for ID:', selectedSchoolId);
        }
      } catch (e) {
        console.error('[DEEPDIVE ERROR] Failed to load selected school:', e.message, e.stack);
      }
    } else {
      console.error('[DEEPDIVE ERROR] No selectedSchoolId provided');
    }
    
    // BUG-DD-002 FIX #4: Fallback - if InvokeLLM fails, return structured school data
    if (!selectedSchool) {
      console.error('[BUG-DD-002] No school loaded, cannot generate Deep Dive');
      return Response.json({
        message: "I couldn't load that school's details. Please try selecting it again.",
        state: currentState,
        briefStatus: briefStatus,
        schools: currentSchools || [],
        familyProfile: conversationFamilyProfile,
        conversationContext: context
      });
    }
    
    // FIX 1: Smart child name resolution with proper fallback chain
    let childDisplayName = 'your child';
    
    if (conversationFamilyProfile?.childName) {
      childDisplayName = conversationFamilyProfile.childName;
    } else if (context.extractedEntities?.childName) {
      childDisplayName = context.extractedEntities.childName;
    } else {
      // Fallback to gender-based pronouns if available
      const childGender = conversationFamilyProfile?.childGender || context.extractedEntities?.childGender;
      if (childGender === 'male') {
        childDisplayName = 'your son';
      } else if (childGender === 'female') {
        childDisplayName = 'your daughter';
      }
    }
    
    // AGGRESSIVE FALLBACK: Extract maxTuition from multiple sources
    let resolvedMaxTuition = null;
    
    // Fallback 1: conversationFamilyProfile.maxTuition
    if (conversationFamilyProfile?.maxTuition) {
      resolvedMaxTuition = typeof conversationFamilyProfile.maxTuition === 'number' ? conversationFamilyProfile.maxTuition : parseInt(conversationFamilyProfile.maxTuition);
      if (isNaN(resolvedMaxTuition)) { resolvedMaxTuition = null; }
      console.log('[DEEPDIVE BUDGET FALLBACK 1] conversationFamilyProfile.maxTuition:', conversationFamilyProfile.maxTuition, '→ resolvedMaxTuition:', resolvedMaxTuition);
    }
    
    // Fallback 2: context.extractedEntities?.budgetSingle
    if (resolvedMaxTuition === null && context.extractedEntities?.budgetSingle) {
      resolvedMaxTuition = parseInt(context.extractedEntities.budgetSingle);
      if (isNaN(resolvedMaxTuition)) { resolvedMaxTuition = null; }
      console.log('[DEEPDIVE BUDGET FALLBACK 2] context.extractedEntities.budgetSingle:', context.extractedEntities.budgetSingle, '→ resolvedMaxTuition:', resolvedMaxTuition);
    }
    
    // Fallback 3: context.extractedEntities?.budgetMax
    if (resolvedMaxTuition === null && context.extractedEntities?.budgetMax) {
      resolvedMaxTuition = parseInt(context.extractedEntities.budgetMax);
      if (isNaN(resolvedMaxTuition)) { resolvedMaxTuition = null; }
      console.log('[DEEPDIVE BUDGET FALLBACK 3] context.extractedEntities.budgetMax:', context.extractedEntities.budgetMax, '→ resolvedMaxTuition:', resolvedMaxTuition);
    }
    
    // Fallback 4: Parse Brief text for budget
    if (resolvedMaxTuition === null && conversationHistory) {
      const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Budget:/i.test(m.content));
      if (briefMsg) {
        const budgetMatch = briefMsg.content.match(/•\s*Budget:.*?\$?([\d,]+)(?:,000|K)?/i);
        if (budgetMatch) {
          let extracted = budgetMatch[1].replace(/,/g, '');
          if (/K$/i.test(budgetMatch[0])) {
            extracted = parseInt(extracted) * 1000;
          } else if (!/,000/.test(budgetMatch[0]) && extracted.length <= 2) {
            extracted = parseInt(extracted) * 1000;
          } else {
            extracted = parseInt(extracted);
          }
          resolvedMaxTuition = extracted;
          console.log('[DEEPDIVE BUDGET FALLBACK 4] Parsed from Brief text:', budgetMatch[0], '→ resolvedMaxTuition:', resolvedMaxTuition);
        }
      }
    }
    
    // Fallback 5: context.conversationContext?.familyProfile?.maxTuition
    if (resolvedMaxTuition === null && context.conversationContext?.familyProfile?.maxTuition) {
      resolvedMaxTuition = parseInt(context.conversationContext.familyProfile.maxTuition);
      if (isNaN(resolvedMaxTuition)) { resolvedMaxTuition = null; }
      console.log('[DEEPDIVE BUDGET FALLBACK 5] context.conversationContext.familyProfile.maxTuition:', context.conversationContext.familyProfile.maxTuition, '→ resolvedMaxTuition:', resolvedMaxTuition);
    }
    
    console.log('[DEEPDIVE BUDGET FINAL] resolvedMaxTuition:', resolvedMaxTuition);
    
    // AGGRESSIVE FALLBACK: Extract priorities from multiple sources
    let resolvedPriorities = null;
    
    // Fallback 1: conversationFamilyProfile.priorities
    if (conversationFamilyProfile?.priorities && Array.isArray(conversationFamilyProfile.priorities) && conversationFamilyProfile.priorities.length > 0) {
      resolvedPriorities = conversationFamilyProfile.priorities;
      console.log('[DEEPDIVE PRIORITIES FALLBACK 1] conversationFamilyProfile.priorities:', resolvedPriorities);
    }
    
    // Fallback 2: context.extractedEntities.priorities
    if ((!resolvedPriorities || resolvedPriorities.length === 0) && context.extractedEntities?.priorities && Array.isArray(context.extractedEntities.priorities) && context.extractedEntities.priorities.length > 0) {
      resolvedPriorities = context.extractedEntities.priorities;
      console.log('[DEEPDIVE PRIORITIES FALLBACK 2] context.extractedEntities.priorities:', resolvedPriorities);
    }
    
    // Fallback 3: Parse Brief text from conversation history
    if ((!resolvedPriorities || resolvedPriorities.length === 0) && conversationHistory) {
      const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*(?:Top )?priorities:/i.test(m.content));
      if (briefMsg) {
        const prioritiesMatch = briefMsg.content.match(/•\s*(?:Top )?priorities:\s*([^\n•]+)/i);
        if (prioritiesMatch && prioritiesMatch[1]) {
          const extractedPriorities = prioritiesMatch[1].trim();
          if (!/not specified|none/i.test(extractedPriorities)) {
            resolvedPriorities = extractedPriorities.split(',').map(s => s.trim()).filter(Boolean);
            console.log('[DEEPDIVE PRIORITIES FALLBACK 3] Parsed from Brief text:', resolvedPriorities);
          }
        }
      }
    }
    
    // Fallback 4: context.conversationContext?.familyProfile?.priorities
    if ((!resolvedPriorities || resolvedPriorities.length === 0) && context.conversationContext?.familyProfile?.priorities && Array.isArray(context.conversationContext.familyProfile.priorities) && context.conversationContext.familyProfile.priorities.length > 0) {
      resolvedPriorities = context.conversationContext.familyProfile.priorities;
      console.log('[DEEPDIVE PRIORITIES FALLBACK 4] context.conversationContext.familyProfile.priorities:', resolvedPriorities);
    }
    
    console.log('[DEEPDIVE PRIORITIES FINAL] resolvedPriorities:', resolvedPriorities);
    
    // AGGRESSIVE FALLBACK: Extract interests from multiple sources
    let resolvedInterests = null;
    
    // Fallback 1: conversationFamilyProfile.interests
    if (conversationFamilyProfile?.interests && Array.isArray(conversationFamilyProfile.interests) && conversationFamilyProfile.interests.length > 0) {
      resolvedInterests = conversationFamilyProfile.interests;
      console.log('[DEEPDIVE INTERESTS FALLBACK 1] conversationFamilyProfile.interests:', resolvedInterests);
    }
    
    // Fallback 2: context.extractedEntities.interests
    if ((!resolvedInterests || resolvedInterests.length === 0) && context.extractedEntities?.interests && Array.isArray(context.extractedEntities.interests) && context.extractedEntities.interests.length > 0) {
      resolvedInterests = context.extractedEntities.interests;
      console.log('[DEEPDIVE INTERESTS FALLBACK 2] context.extractedEntities.interests:', resolvedInterests);
    }
    
    // Fallback 3: Parse Brief text from conversation history
    if ((!resolvedInterests || resolvedInterests.length === 0) && conversationHistory) {
      const briefMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant' && /•\s*Interests:/i.test(m.content));
      if (briefMsg) {
        const interestsMatch = briefMsg.content.match(/•\s*Interests:\s*([^\n•]+)/i);
        if (interestsMatch && interestsMatch[1]) {
          const extractedInterests = interestsMatch[1].trim();
          if (!/not specified|none/i.test(extractedInterests)) {
            resolvedInterests = extractedInterests.split(',').map(s => s.trim()).filter(Boolean);
            console.log('[DEEPDIVE INTERESTS FALLBACK 3] Parsed from Brief text:', resolvedInterests);
          }
        }
      }
    }
    
    // Fallback 4: context.conversationContext?.familyProfile?.interests
    if ((!resolvedInterests || resolvedInterests.length === 0) && context.conversationContext?.familyProfile?.interests && Array.isArray(context.conversationContext.familyProfile.interests) && context.conversationContext.familyProfile.interests.length > 0) {
      resolvedInterests = context.conversationContext.familyProfile.interests;
      console.log('[DEEPDIVE INTERESTS FALLBACK 4] context.conversationContext.familyProfile.interests:', resolvedInterests);
    }
    
    console.log('[DEEPDIVE INTERESTS FINAL] resolvedInterests:', resolvedInterests);
    
    // STEP 1: COMPRESS SCHOOL DATA PAYLOAD
    const compressedSchoolData = {
      name: selectedSchool.name,
      gradesOffered: `${selectedSchool.lowestGrade}-${selectedSchool.highestGrade}`,
      tuitionFee: selectedSchool.tuition || selectedSchool.dayTuition || 'Not specified',
      programTags: [
        ...(selectedSchool.curriculum || []),
        ...(selectedSchool.specializations || []),
        selectedSchool.curriculumType
      ].filter(Boolean),
      location: `${selectedSchool.city}, ${selectedSchool.provinceState || selectedSchool.country}`,
      genderPolicy: selectedSchool.genderPolicy || 'Co-ed',
      religiousAffiliation: selectedSchool.religiousAffiliation || 'Non-denominational',
      description: selectedSchool.description ? selectedSchool.description.substring(0, 150) : 'No description available'
    };
    
    // STEP 2: BUILD SPLIT PROMPT STRUCTURE
    const systemPrompt = `You are ${consultantName}, an education consultant helping Canadian families find the right private school.

${consultantName === 'Jackie' 
  ? "JACKIE PERSONA: Warm, empathetic, supportive. Uses phrases like 'I love that...', 'What a great fit...'. Speaks like a knowledgeable friend." 
  : "LIAM PERSONA: Direct, strategic, no-BS. Leads with data and fit logic. Speaks like a trusted advisor."}

OUTPUT FORMAT - DEEPDIVE Card with 6 areas:
1. Fit Label - 2-4 word label using FIRST NAME ONLY from childDisplayName (e.g., 'Strong Fit for Emma' not 'Strong Fit for Emma Johnson'). If childDisplayName is null/undefined/empty, use 'your child' instead (e.g., 'Strong Fit for your child').
2. Why This School - In the Why section, you MUST name each of the family's stated priorities and evaluate whether this school meets, partially meets, or does not meet each one. If the school's listed programs do not include a family priority, say so directly. Example: 'Sophia wants IB and arts/theatre. Lakeside offers full IB diploma, but arts and theatre are not listed as program specializations - ask whether they offer these as IB electives.' Never assume a school offers something that isn't in the provided data.
3. What to Know - 2-3 honest bullets including one genuine limitation or thing to ask about. CRITICAL: If the school's genderPolicy is null, undefined, or empty string, do NOT include any bullet about gender policy. Simply omit it entirely. Never show "Gender policy: Not specified" or similar text.
4. Cost Reality - Compare school tuition to family budget. If BOTH school tuition AND family maxTuition are known numbers: calculate the difference and format as "Tuition: $XX,XXX/yr - within your $YYK budget" or "Tuition: $XX,XXX/yr - $XK over your $YYK budget" or "Tuition: $XX,XXX/yr - right at your $YYK budget". If family budget (maxTuition) is NOT known: simply show "Tuition: $XX,XXX/yr" with no comparison. Never use the word "stated" when referring to budget.
5. Dealbreaker Check - explicitly confirm no dealbreakers are violated (especially religious, grade)
6. Tone Bridge - one sentence inviting the parent to explore more or ask questions

HONESTY PATTERN: Always include at least one genuine tradeoff or limitation. Never write marketing copy. If data is missing, say so.

DEALBREAKER ELEVATION: If the family has dealbreakers (religious, grade, budget), explicitly state that this school does NOT violate them.

PERSONA TONE BRIDGE EXAMPLES:
${consultantName === 'Jackie'
  ? "- Jackie: 'I'd love to tell you more about their [strongest fit area] — want me to dig in?'"
  : "- Liam: 'The [strongest fit area] stands out here. Want the details?'"}

EXACT FORMAT TO USE:
**[Fit Label]**

**Why ${compressedSchoolData.name} for ${childDisplayName}**
[2-3 sentences]

**What to Know**
• [Positive point]
• [Honest limitation or unknown]
• [Another consideration]

**Cost Reality**
[Dollar comparison with actual math]

**Dealbreaker Check**
[Explicitly confirm no violations]

[Tone bridge question]`;

    const userPrompt = `FAMILY BRIEF:
- Child: ${childDisplayName}
- Grade: ${conversationFamilyProfile?.childGrade !== null && conversationFamilyProfile?.childGrade !== undefined ? conversationFamilyProfile.childGrade : 'Not specified'}
- Location: ${conversationFamilyProfile?.locationArea || 'Not specified'}
- Budget: ${resolvedMaxTuition ? '$' + resolvedMaxTuition : 'Not specified'}
- Interests: ${resolvedInterests?.join(', ') || 'Not specified'}
- Priorities: ${resolvedPriorities?.join(', ') || 'Not specified'}
- Dealbreakers: ${conversationFamilyProfile?.dealbreakers?.join(', ') || 'None specified'}

SCHOOL DATA:
${JSON.stringify(compressedSchoolData, null, 2)}

Generate the 6-area DEEPDIVE card for this family-school match.`;

    // STEP 3 & 4: TRY AI GENERATION
    console.log('[DEEPDIVE] Attempting AI-generated card');
    let aiGeneratedCard = null;

    try {
      const aiResponse = await callOpenRouter({
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
        maxTokens: 2000,
        temperature: 0.6
      });
      aiGeneratedCard = aiResponse || null;

      if (aiGeneratedCard) {
        console.log('[OPENROUTER] DEEPDIVE card generation');
        console.log('[DEEPDIVE] AI card generated successfully, length:', aiGeneratedCard.length);
        aiMessage = aiGeneratedCard;
      }
    } catch (llmError) {
      console.log('[OPENROUTER FALLBACK] DEEPDIVE falling back to programmatic card');
      console.error('[DEEPDIVE] OpenRouter failed:', llmError.message);
      aiGeneratedCard = null;
    }
    
    // PROGRAMMATIC FALLBACK - Only if AI generation failed
    if (!aiGeneratedCard) {
      console.log('[DEEPDIVE] Building programmatic fallback card');
    
      // Function to determine fit label
      const determineFitLabel = (school, brief) => {
        const dealbreakers = brief?.dealbreakers || [];
        const priorities = brief?.priorities || [];
        
        // Check if any dealbreaker maps to null/unknown
        let hasMissingDealbreaker = false;
        for (const db of dealbreakers) {
          const dbLower = db.toLowerCase();
          if (dbLower.includes('single-sex') && !school.genderPolicy) hasMissingDealbreaker = true;
          if (dbLower.includes('religious') && !school.religiousAffiliation) hasMissingDealbreaker = true;
          if (dbLower.includes('boarding') && school.boardingAvailable === null) hasMissingDealbreaker = true;
        }
        
        if (hasMissingDealbreaker) return 'Worth a Closer Look';
        
        // Count priority matches
        let priorityMatches = 0;
        for (const priority of priorities) {
          const pLower = priority.toLowerCase();
          if (pLower.includes('arts') && school.artsPrograms?.length > 0) priorityMatches++;
          if (pLower.includes('stem') && school.specializations?.includes('STEM')) priorityMatches++;
          if (pLower.includes('sports') && school.sportsPrograms?.length > 0) priorityMatches++;
          if (pLower.includes('language') && school.languages?.length > 1) priorityMatches++;
        }
        
        const priorityMatchRate = priorities.length > 0 ? priorityMatches / priorities.length : 0.5;
        
        if (priorityMatchRate >= 0.7) return `Great Fit for ${childDisplayName}`;
        if (priorityMatchRate >= 0.4) return `Solid Option for ${childDisplayName}`;
        return 'Worth a Closer Look';
      };
      
      const fitLabel = determineFitLabel(selectedSchool, conversationFamilyProfile);
      
      // FIX 2: Build Cost Reality with actual budget comparison
      const schoolTuition = selectedSchool.tuition || selectedSchool.dayTuition;
      const familyBudget = conversationFamilyProfile?.maxTuition || conversationFamilyProfile?.budgetMax || context.extractedEntities?.maxTuition || context.extractedEntities?.budgetSingle;
      let costRealityText = '';
      
      if (schoolTuition && familyBudget && familyBudget !== 'unlimited') {
        const tuitionNum = typeof schoolTuition === 'number' ? schoolTuition : parseFloat(schoolTuition);
        const budgetNum = typeof familyBudget === 'number' ? familyBudget : parseFloat(familyBudget);
        
        if (tuitionNum <= budgetNum) {
          const difference = budgetNum - tuitionNum;
          costRealityText = `$${tuitionNum.toLocaleString()}/year — Under your $${budgetNum.toLocaleString()} budget by $${difference.toLocaleString()}`;
        } else {
          const difference = tuitionNum - budgetNum;
          costRealityText = `$${tuitionNum.toLocaleString()}/year — Above your $${budgetNum.toLocaleString()} budget by $${difference.toLocaleString()}`;
        }
      } else if (schoolTuition) {
        costRealityText = `$${(typeof schoolTuition === 'number' ? schoolTuition : parseFloat(schoolTuition)).toLocaleString()}/year`;
      } else {
        costRealityText = 'Tuition not specified';
      }
      
      // Build "Why [School] for [Child]" section
      const interests = conversationFamilyProfile?.interests || [];
      const priorities = conversationFamilyProfile?.priorities || [];
      let whySection = `**Why ${selectedSchool.name} for ${childDisplayName}**\n`;
      
      // Generate personalized why text based on matches
      const matchReasons = [];
      if (priorities.includes('Arts') && selectedSchool.artsPrograms?.length > 0) {
        matchReasons.push(`strong arts programs including ${selectedSchool.artsPrograms.slice(0, 2).join(' and ')}`);
      }
      if (priorities.includes('STEM') && selectedSchool.specializations?.includes('STEM')) {
        matchReasons.push('STEM specialization');
      }
      if (priorities.includes('Sports') && selectedSchool.sportsPrograms?.length > 0) {
        matchReasons.push(`athletics with ${selectedSchool.sportsPrograms.slice(0, 2).join(' and ')}`);
      }
      if (selectedSchool.avgClassSize && selectedSchool.avgClassSize <= 15) {
        matchReasons.push(`small class sizes (average ${selectedSchool.avgClassSize} students)`);
      }
      
      if (matchReasons.length > 0) {
        whySection += `${selectedSchool.name} stands out with ${matchReasons.join(', ')}. `;
      } else {
        whySection += `${selectedSchool.name} offers a ${selectedSchool.curriculumType || 'traditional'} curriculum. `;
      }
      
      if (selectedSchool.description) {
        whySection += selectedSchool.description.substring(0, 150) + '...';
      }
      whySection += '\n\n';
      
      // Build "What to Know" bullets
      let whatToKnowSection = '**What to Know**\n';
      const bullets = [];
      
      // Positive bullet
      if (selectedSchool.enrollment) {
        bullets.push(`• Community of ${selectedSchool.enrollment} students across grades ${selectedSchool.lowestGrade}-${selectedSchool.highestGrade}`);
      }
      
      // Curriculum bullet
      if (selectedSchool.curriculum?.length > 0) {
        bullets.push(`• Offers ${selectedSchool.curriculum.join(', ')} curriculum`);
      }
      
      // FIX 3: Gender policy bullet with null check
      if (selectedSchool.genderPolicy && selectedSchool.genderPolicy !== 'Co-ed' && !conversationFamilyProfile?.genderPreference) {
        bullets.push(`• This is a ${selectedSchool.genderPolicy} school`);
      }
      
      // Unknown data bullet
      if (!selectedSchool.facilities || selectedSchool.facilities.length === 0) {
        bullets.push(`• Facility details not listed — worth asking on a visit`);
      }
      
      whatToKnowSection += bullets.join('\n') + '\n\n';
      
      // Build Cost Reality section
      const costSection = `**Cost Reality**\n${costRealityText}\n\n`;
      
      // Closing bridge
      const bridge = consultantName === 'Jackie' 
        ? `What stands out to you about ${selectedSchool.name}?`
        : `Want me to dig into any specific aspect?`;
      
      // Combine all sections
      aiMessage = `**${fitLabel}**\n\n${whySection}${whatToKnowSection}${costSection}${bridge}`;
      console.log('[DEEPDIVE] Programmatic fallback card built successfully');
    }
  } catch (e) {
    console.error('[DEEPDIVE ERROR] Card builder failed:', e.message, 'Stack:', e.stack);
    aiMessage = "I'm having trouble loading that school's details right now. Could you try selecting it again?";
  }
  
  // BUG-DD-002 FIX #2: Return ONLY selectedSchool in schools array
  console.log('[DEEPDIVE] Returning aiMessage length:', aiMessage?.length, 'starts with:', aiMessage?.substring(0, 50));
  console.log('[DEEPDIVE] selectedSchool:', selectedSchool?.name, 'state:', currentState);
  return Response.json({
    message: aiMessage,
    state: currentState,
    briefStatus: briefStatus,
    schools: selectedSchool ? [selectedSchool] : [],
    familyProfile: conversationFamilyProfile,
    conversationContext: context
  });
}