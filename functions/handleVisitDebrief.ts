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
    
    // Load school and prior analysis
    const [schoolResults, artifacts] = await Promise.all([
      base44.entities.School.filter({ id: selectedSchoolId }),
      base44.entities.GeneratedArtifact.filter({ 
        conversationId: context.conversationId,
        schoolId: selectedSchoolId,
        artifactType: 'visit_prep'
      })
    ]);
    const school = schoolResults?.[0];
    const priorAnalysis = artifacts?.[0];
    
    if (!school) return null;
    
    const schoolName = school.name;
    const childName = conversationFamilyProfile?.childName || 'your child';
    const priorVisitQuestions = priorAnalysis?.content?.visitQuestions || [];
    const priorTradeOffs = priorAnalysis?.content?.tradeOffs || [];
    
    // WC9: Initialize or refresh debrief question queue if switching schools
    const isNewDebrief = context.debriefSchoolId !== selectedSchoolId;
    let debriefQuestionQueue = context.debriefQuestionQueue || [];
    let debriefQuestionsAsked = context.debriefQuestionsAsked || [];
    
    if (isNewDebrief || debriefQuestionQueue.length === 0) {
      console.log('[E13a] Generating debrief question queue');
      debriefQuestionQueue = [];
      debriefQuestionsAsked = [];
      
      // Slot 0: Persona-generated opener
      const openerQ = consultantName === 'Jackie'
        ? 'How did it feel walking through the halls and seeing the spaces? What emotions came up?'
        : 'Did anything surprise you compared to what they advertise on their website or what you expected?';
      debriefQuestionQueue.push(openerQ);
      
      // Slots 1-2: Pull from VisitPrepKit or generate from priorities
      if (priorVisitQuestions.length > 0) {
        const q1 = typeof priorVisitQuestions[0] === 'string' ? priorVisitQuestions[0] : priorVisitQuestions[0]?.question;
        const q2 = priorVisitQuestions.length > 1 ? (typeof priorVisitQuestions[1] === 'string' ? priorVisitQuestions[1] : priorVisitQuestions[1]?.question) : null;
        if (q1) debriefQuestionQueue.push(q1);
        if (q2) debriefQuestionQueue.push(q2);
      } else {
        const priorities = conversationFamilyProfile?.priorities || [];
        if (priorities.length > 0) {
          debriefQuestionQueue.push(`How did they handle ${priorities[0]}? Did you see that reflected in the school?`);
        }
        if (priorities.length > 1) {
          debriefQuestionQueue.push(`What was your impression of their approach to ${priorities[1]}?`);
        }
      }
      
      // Ensure we always have 3 questions
      while (debriefQuestionQueue.length < 3) {
        debriefQuestionQueue.push('What was your overall impression?');
      }
    }
    
    // Pop next question if queue isn't empty
    let nextQuestion = '';
    if (debriefQuestionQueue.length > 0) {
      nextQuestion = debriefQuestionQueue.shift();
      debriefQuestionsAsked.push(nextQuestion);
    }
    
    const isDebriefComplete = debriefQuestionQueue.length === 0 && debriefQuestionsAsked.length >= 3;
    const debriefQuestionsContext = `${nextQuestion ? `Next focus: "${nextQuestion}"` : 'Wrap up naturally — you've asked your key questions.'}\n\nQuestions asked so far: ${debriefQuestionsAsked.length}/3`;
    
    // Build debrief prompt with persona-specific framing
    const basePrompt = `${returningUserContextBlock ? returningUserContextBlock + '\n\n' : ''}You are ${consultantName}, an education consultant. The family just returned from visiting ${schoolName}.

${debriefQuestionsContext}`;

    const debriefSystemPrompt = consultantName === 'Jackie'
      ? `${basePrompt}

JACKIE TONE: Warm, empathetic, encouraging. Acknowledge their feelings and experiences before asking next question. Validate emotional responses. Help them feel heard.`
      : `${basePrompt}

LIAM TONE: Direct, analytical, practical. Acknowledge their observations factually before asking next question. Compare to expectations and data. Focus on fit assessment.`;

    const debriefUserPrompt = `Family just said: "${processMessage}"

${isDebriefComplete ? 'They\'ve shared their impressions. Wrap up warmly, validate their insights, and summarize what you heard.' : `Ask them: "${nextQuestion}"\n\nBe natural — don't sound robotic.`}`;

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

    // WC9: Persist debrief Q&A pair (non-blocking)
    if (nextQuestion && context.userId) {
      try {
        const newQAPair = {
          question: nextQuestion,
          answer: processMessage,
          timestamp: new Date().toISOString()
        };

        const existingArtifacts = await base44.entities.GeneratedArtifact.filter({
          conversationId: context.conversationId,
          schoolId: selectedSchoolId,
          artifactType: 'visit_debrief'
        });

        if (existingArtifacts && existingArtifacts.length > 0) {
          const artifact = existingArtifacts[0];
          const updatedQAPairs = (artifact.content?.qaPairs || []).concat([newQAPair]);
          await base44.entities.GeneratedArtifact.update(artifact.id, {
            content: { ...artifact.content, qaPairs: updatedQAPairs }
          });
          console.log('[E13a] Debrief Q&A appended to artifact:', artifact.id);
        } else {
          const created = await base44.entities.GeneratedArtifact.create({
            userId: context.userId,
            conversationId: context.conversationId,
            schoolId: selectedSchoolId,
            artifactType: 'visit_debrief',
            title: 'Visit Debrief - ' + schoolName,
            content: { qaPairs: [newQAPair], schoolName: schoolName },
            status: 'ready',
            isShared: false,
            pdfUrl: null,
            shareToken: null
          });
          console.log('[E13a] Debrief artifact created:', created.id);
        }
      } catch (persistError) {
        console.error('[E13a] Debrief persistence failed (non-blocking):', persistError.message);
      }
    }

    return {
      message: debriefMessage,
      deepDiveMode: 'debrief',
      visitPrepKit: priorAnalysis?.content || null,
      updatedContext: {
        debriefQuestionQueue,
        debriefQuestionsAsked,
        debriefSchoolId: selectedSchoolId
      }
    };
  } catch (e) {
    console.error('[E13a] Debrief handling failed:', e.message);
    return null;
  }
}