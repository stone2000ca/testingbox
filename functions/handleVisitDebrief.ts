// Function: handleVisitDebrief
// Purpose: Handle visit debrief conversation flow after school tour
// Entities: GeneratedArtifact, School
// Last Modified: 2026-03-02
// Dependencies: callOpenRouter (inlined from orchestrateConversation)

// Note: This is a helper function that should be called from orchestrateConversation
// It handles the debrief conversation after a family visits a school

async function handleVisitDebrief(base44, selectedSchoolId, processMessage, conversationFamilyProfile, context, consultantName, returningUserContextBlock, callOpenRouter) {
  if (!selectedSchoolId || !context?.conversationId) return null;
  
  try {
    console.log('[E13a] Debrief mode active for school:', selectedSchoolId);
    
    // Load prior analysis from GeneratedArtifacts
    const artifacts = await base44.entities.GeneratedArtifact.filter({ 
      conversationId: context.conversationId,
      schoolId: selectedSchoolId,
      artifactType: 'visit_prep'
    });
    const priorAnalysis = artifacts?.[0];
    
    // Load the school for context
    const schoolResults = await base44.entities.School.filter({ id: selectedSchoolId });
    const school = schoolResults?.[0];
    
    if (!school) {
      return null;
    }
    
    const schoolName = school.name;
    const childName = conversationFamilyProfile?.childName || 'your child';
    const priorVisitQuestions = priorAnalysis?.content?.visitQuestions || [];
    const priorTradeOffs = priorAnalysis?.content?.tradeOffs || [];
    
    // Build debrief prompt
    const debriefSystemPrompt = `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}You are ${consultantName}, an education consultant. The family just returned from visiting ${schoolName}. 

Your role is to help them process the visit and assess whether this school still fits, based on:
1. What they saw and experienced during the visit
2. How it compares to their prior expectations (from the visit prep kit)
3. Any new concerns or positive surprises

Ask thoughtful follow-up questions that help them synthesize their experience. Reference specific things from the visit prep kit if they mention them. Be conversational and supportive.

${consultantName === 'Jackie' ? 'JACKIE TONE: Warm, empathetic, encouraging.' : 'LIAM TONE: Direct, analytical, practical.'}`;

    const debriefUserPrompt = `Family just visited ${schoolName}. They said: "${processMessage}"

Prior visit prep included these focus areas: ${priorVisitQuestions.slice(0, 3).map(q => typeof q === 'string' ? q : q.question).join('; ') || 'None'}

Trade-offs we flagged before: ${priorTradeOffs.slice(0, 2).map(t => t.dimension).join(', ') || 'None'}

Help them process this visit experience. Ask 1-2 follow-up questions that help them evaluate fit.`;

    let debriefMessage = "Tell me about your visit experience.";
    try {
      const debriefResponse = await callOpenRouter({
        systemPrompt: debriefSystemPrompt,
        userPrompt: debriefUserPrompt,
        maxTokens: 500,
        temperature: 0.7
      });
      debriefMessage = debriefResponse || "Tell me about your visit experience.";
    } catch (openrouterError) {
      try {
        const fallbackResponse = await base44.integrations.Core.InvokeLLM({
          prompt: debriefSystemPrompt + '\n\n' + debriefUserPrompt
        });
        debriefMessage = fallbackResponse?.response || fallbackResponse || "Tell me about your visit experience.";
      } catch (fallbackError) {
        console.error('[E13a] Debrief response failed:', fallbackError.message);
      }
    }

    return {
      message: debriefMessage,
      deepDiveMode: 'debrief'
    };
  } catch (e) {
    console.error('[E13a] Debrief handling failed:', e.message);
    return null;
  }
}