import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { message, userId, conversationHistory, familyProfileData } = await req.json();

    // If no profile exists, create one
    let profile = familyProfileData;
    if (!profile) {
      profile = {
        userId,
        onboardingPhase: 'open_warm',
        onboardingComplete: false,
        academicStrengths: [],
        academicStruggles: [],
        learningDifferences: [],
        interests: [],
        personalityTraits: [],
        priorities: [],
        dealbreakers: [],
        curriculumPreference: []
      };
      const created = await base44.entities.FamilyProfile.create(profile);
      profile = created;
    }

    const currentPhase = profile.onboardingPhase;
    
    // Extract structured data for current phase
    const extractedData = await extractPhaseData(base44, message, currentPhase, profile);
    
    // Merge extracted data into profile
    profile = { ...profile, ...extractedData };

    // Check if required fields for phase are filled
    const requiredFieldsMet = checkRequiredFields(currentPhase, profile);
    
    // Determine next phase
    let nextPhase = currentPhase;
    const phaseSequence = ['open_warm', 'child_profile', 'family_logistics', 'priorities', 'confirm_brief', 'complete'];
    
    if (requiredFieldsMet && currentPhase !== 'confirm_brief' && currentPhase !== 'complete') {
      nextPhase = phaseSequence[phaseSequence.indexOf(currentPhase) + 1];
    }

    // Generate AI response
    let aiMessage = '';
    let onboardingComplete = false;

    if (currentPhase === 'confirm_brief' && requiredFieldsMet) {
      // All intake complete - generate The Brief and move to confirm_brief phase
      // (orchestrateConversation will detect confirm_brief and handle confirmation)
      onboardingComplete = false; // NOT complete until they confirm The Brief
      nextPhase = 'confirm_brief'; // Stay in confirm_brief so orchestrateConversation can detect it
      
      // Generate The Brief using generateResponse
      try {
        const briefResult = await base44.functions.invoke('generateResponse', {
          message: 'generate_brief',
          intent: 'GENERATE_BRIEF',
          familyProfileData: profile,
          conversationHistory: conversationHistory || []
        });
        aiMessage = briefResult.data.message;
        console.log('✅ Brief generated successfully');
      } catch (briefError) {
        console.error('Failed to generate brief:', briefError);
        aiMessage = `Based on everything you've shared, here's what I'm understanding about ${profile.childName} and your family's needs. Does this capture it?`;
      }
    } else {
      // Generate response for current phase
      aiMessage = await generatePhaseResponse(base44, message, nextPhase, profile, requiredFieldsMet);
    }

    // Update profile in database
    const updatedProfile = await base44.entities.FamilyProfile.update(profile.id, {
      ...profile,
      onboardingPhase: nextPhase,
      onboardingComplete: onboardingComplete,
      familyBrief: currentPhase === 'confirm_brief' && requiredFieldsMet ? aiMessage : profile.familyBrief // Store The Brief
    });

    return Response.json({
      aiMessage,
      shouldShowSchools: false,
      schools: [],
      onboardingPhase: nextPhase,
      familyProfile: updatedProfile,
      onboardingComplete: onboardingComplete
    });
  } catch (error) {
    console.error('onboardUser error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function extractPhaseData(base44, message, currentPhase, profile) {
  // CRITICAL: Extract from the CURRENT message only, not profile history
  // Fresh extraction replaces old data - no merging
  
  const schemas = {
    open_warm: {
      type: 'object',
      properties: {
        childName: { type: 'string' },
        childGrade: { type: 'number' },
        childAge: { type: 'number' },
        currentSchoolType: { type: 'string' },
        currentSituation: { type: 'string' }
      }
    },
    child_profile: {
      type: 'object',
      properties: {
        interests: { type: 'array', items: { type: 'string' } },
        academicStrengths: { type: 'array', items: { type: 'string' } },
        academicStruggles: { type: 'array', items: { type: 'string' } },
        learningDifferences: { type: 'array', items: { type: 'string' } },
        personalityTraits: { type: 'array', items: { type: 'string' } },
        learningStyle: { type: 'string' }
      }
    },
    family_logistics: {
      type: 'object',
      properties: {
        locationArea: { type: 'string' },
        locationLat: { type: 'number' },
        locationLng: { type: 'number' },
        commuteToleranceMinutes: { type: 'number' },
        budgetRange: { type: 'string' },
        maxTuition: { type: 'number' },
        boardingPreference: { type: 'string' },
        hasSiblings: { type: 'boolean' },
        siblingDetails: { type: 'string' },
        timeline: { type: 'string' }
      }
    },
    priorities: {
      type: 'object',
      properties: {
        priorities: { type: 'array', items: { type: 'string' } },
        dealbreakers: { type: 'array', items: { type: 'string' } },
        curriculumPreference: { type: 'array', items: { type: 'string' } },
        triggerReason: { type: 'string' },
        previousSchoolLikes: { type: 'string' },
        previousSchoolDislikes: { type: 'string' }
      }
    }
  };

  const phasePrompts = {
    open_warm: `Extract information about the child and current school situation from this message. 
CRITICAL: Use the EXACT words and phrases from the parent's message - do NOT normalize, expand, or interpret.
Child name is most important. Grade is also critical. Also capture what's not working with current school if mentioned.
Return any fields found, others can be null.`,
    
    child_profile: `Extract information about the child's academic profile, interests, personality, and learning style.
CRITICAL RULE: Use the EXACT interests/strengths the parent mentioned. Do NOT substitute or expand.
- If parent said "art and drama" - return ["art and drama"] - NOT ["arts", "performance"]
- If parent said "good at math" - return ["math"] - do NOT add "STEM" or "science"
- Extract exactly what was said, preserve the parent's own language.
Look for strengths, struggles, learning differences, interests, personality traits, and learning style preference.
Return any fields found. Can be null if not mentioned.`,
    
    family_logistics: `Extract practical logistics about location, budget, and timing.
CRITICAL: Use the EXACT location/budget words from parent's message:
- If parent said "Leaside" - store "Leaside" EXACTLY - do NOT expand to "downtown Toronto" or other areas
- If parent said "$28K" - store "$28K" EXACTLY - do NOT round to "$20-25K" or interpret as range
- Location: city/neighborhood area (use their exact words). Budget: extract as range (under_20k, 20k_35k, 35k_plus, flexible) and/or exact max tuition number.
Also check for boarding preference, siblings, timeline.
Return any fields found.`,
    
    priorities: `Extract the family's priorities, dealbreakers, and curriculum preferences.
CRITICAL: Use the EXACT phrases the parent used. Do NOT substitute or interpret.
Priorities might include: academics/rigor, class size, arts programs, athletics, university prep, diversity, French/bilingual, special needs support, community feel, religious values, sports.
Dealbreakers might be: co-ed vs single-gender, religious affiliation, uniform, etc.
Curriculum: IB, AP, Traditional, Montessori, Waldorf, Progressive.
Return arrays with EXACT parent words. Also capture what triggered the search and what they liked/disliked about previous schools.`
  };

  const schema = schemas[currentPhase] || {};
  const prompt = phasePrompts[currentPhase] || '';

  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `${prompt}\n\nMessage: "${message}"\n\nCurrent profile data: ${JSON.stringify(profile)}`,
      response_json_schema: schema
    });

    // LATEST INFORMATION WINS: Overwrite all fields (including arrays) with extracted data
    // Don't merge - new information replaces old information
    return result;
  } catch (error) {
    console.error('Extract phase data error:', error);
    return {};
  }
}

function checkRequiredFields(phase, profile) {
  const requirements = {
    open_warm: () => profile.childName && profile.childGrade !== undefined && profile.childGrade !== null,
    child_profile: () => (profile.interests?.length > 0) || (profile.academicStrengths?.length > 0) || (profile.personalityTraits?.length > 0),
    family_logistics: () => profile.locationArea && profile.budgetRange,
    priorities: () => profile.priorities?.length > 0,
    confirm_brief: () => profile.familyBrief,
    complete: () => true
  };

  return (requirements[phase] || (() => true))();
}

async function generatePhaseResponse(base44, message, nextPhase, profile, requiredFieldsMet) {
  const childName = profile.childName ? `${profile.childName}` : 'your child';
  
  const prompts = {
    open_warm: `You are a warm, experienced education consultant meeting with a family for the first time.
The parent just shared: "${message}"
${profile.childName ? `You now know the child's name is ${profile.childName}.` : ''}

Acknowledge warmly what they shared. Then ask the next set of questions naturally (not as a list).
If you have their child's name and grade, transition to learning about the child's strengths, interests, and personality.
If you don't have name/grade yet, gently ask for those first.
Keep it conversational and warm. Reference the child by name if you have it.
One or two questions max.`,

    child_profile: `You are a warm education consultant. The parent has given you some info about ${childName}.
Previous messages context: ${message}
Current profile so far: ${JSON.stringify(profile)}

Acknowledge what they shared about ${childName}. Ask naturally about their academic profile, interests, and learning style.
Maybe ask: "What are ${childName}'s main strengths in school?" or "What subjects or activities light them up?"
Or: "How does ${childName} learn best - do they prefer structure or more freedom?"
Keep it conversational. One or two questions, not a list.`,

    family_logistics: `You are an education consultant. Now you're learning about the family's practical needs.
Parent message: "${message}"
Child: ${profile.childName || 'their child'}
Profile so far: ${JSON.stringify(profile)}

Acknowledge what they shared. Ask about location and budget.
For location: "Where are you located, and how far would you be willing to travel for school?"
For budget: "What tuition range works for your family? Are you thinking under $20K, $20-35K, or is budget flexible?"
Also ask about timing: "When are you looking to make a move - next September, mid-year, or just exploring options?"
Keep it warm and natural. Two questions max.`,

    priorities: `You are an education consultant. Now you're getting into what matters most.
Parent message: "${message}"
Child: ${profile.childName}
Profile: ${JSON.stringify(profile)}

Acknowledge what they shared. Ask about priorities and dealbreakers.
Say something like: "What matters most to you in a school? Things like academic rigor, small class sizes, strong arts programs, athletics, university prep, diversity, French/bilingual, special needs support, or the community feel?"
Also: "Are there any must-haves or deal-breakers? Like co-ed vs single-gender, religious values, that kind of thing?"
One or two natural questions, not a list.`,

    confirm_brief: `You are an education consultant creating a family brief to confirm understanding.
Profile data: ${JSON.stringify(profile)}

Create a warm, concise paragraph (2-3 sentences) that reflects back everything you understand:
- Child's name, grade, and key characteristics
- Their strengths or learning needs
- Location and budget
- Top priorities
- Any important context

Make it feel like "I really understand your family" not like a form. Then ask: "Does that capture it, or would you like to adjust anything?"
End with a question asking for confirmation.`
  };

  try {
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: prompts[nextPhase] || prompts.open_warm
    });

    return response;
  } catch (error) {
    console.error('Generate response error:', error);
    return `I'd love to learn more about ${childName} and your family's needs. Could you tell me a bit more?`;
  }
}

async function generateFamilyBrief(base44, profile) {
  const prompt = `Create a warm, concise 2-3 sentence paragraph that summarizes this family's school search brief.
Include the child's name and key characteristics, their strengths/needs, location and budget, and top priorities.
Make it feel like an education consultant who really understands them, not a form.

Profile:
${JSON.stringify(profile, null, 2)}`;

  try {
    const brief = await base44.integrations.Core.InvokeLLM({
      prompt
    });
    return brief;
  } catch (error) {
    console.error('Generate brief error:', error);
    return `I understand ${profile.childName} and your family's needs around location, budget, and school fit.`;
  }
}