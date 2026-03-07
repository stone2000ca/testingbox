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
    
    // Load school and prior analysis (including deep_dive_analysis for fit re-evaluation)
    const [schoolResults, artifacts, deepDiveArtifacts] = await Promise.all([
      base44.entities.School.filter({ id: selectedSchoolId }),
      base44.entities.GeneratedArtifact.filter({ 
        conversationId: context.conversationId,
        schoolId: selectedSchoolId,
        artifactType: 'visit_prep'
      }),
      base44.entities.GeneratedArtifact.filter({ 
        conversationId: context.conversationId,
        schoolId: selectedSchoolId,
        artifactType: 'deep_dive_analysis'
      })
    ]);
    const school = schoolResults?.[0];
    const priorAnalysis = artifacts?.[0];
    const deepDiveAnalysis = deepDiveArtifacts?.[0];
    
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

    // E13a-WC3: Fit re-evaluation after debrief complete (non-blocking)
    if (isDebriefComplete && deepDiveAnalysis && context.userId) {
      try {
        console.log('[E13a-WC3] Debrief complete — initiating fit re-evaluation');
        
        // Load the visit_debrief artifact to get all Q&A pairs
        const debriefArtifacts = await base44.entities.GeneratedArtifact.filter({
          conversationId: context.conversationId,
          schoolId: selectedSchoolId,
          artifactType: 'visit_debrief'
        });
        const debriefArtifact = debriefArtifacts?.[0];
        
        if (!debriefArtifact?.content?.qaPairs || debriefArtifact.content.qaPairs.length === 0) {
          console.log('[E13a-WC3] No Q&A pairs found, skipping re-evaluation');
        } else {
          // E29-006: sync debrief to FamilyJourney (fire-and-forget)
          (async () => {
            try {
              const journey = context.journeyId
                ? (await base44.entities.FamilyJourney.filter({ id: context.journeyId }))?.[0]
                : (await base44.entities.FamilyJourney.filter({ userId: context.userId }))?.[0];

              if (!journey) return;

              const nowIso = new Date().toISOString();
              const currentPhase = journey.currentPhase;
              const schoolJourneys = Array.isArray(journey.schoolJourneys) ? [...journey.schoolJourneys] : [];
              let item = schoolJourneys.find((sj) => sj.schoolId === selectedSchoolId);

              if (item) {
                item.status = 'VISITED';
                item.visitedAt = nowIso;
                item.debriefCompletedAt = nowIso;
                if (Array.isArray(debriefArtifacts) && debriefArtifacts[0]?.id) {
                  item.debriefArtifactId = debriefArtifacts[0].id;
                }
              } else {
                schoolJourneys.push({
                  schoolId: selectedSchoolId,
                  schoolName: schoolName,
                  status: 'VISITED',
                  addedVia: 'DEBRIEF',
                  visitedAt: nowIso,
                  debriefCompletedAt: nowIso,
                  debriefArtifactId: Array.isArray(debriefArtifacts) && debriefArtifacts[0]?.id ? debriefArtifacts[0].id : undefined
                });
              }

              // Phase auto-advance: if all TOURING items are now VISITED and phase is EXPERIENCE -> DECIDE
              let nextPhase = null;
              const hasTouring = schoolJourneys.some((sj) => sj.status === 'TOURING');
              if (!hasTouring && currentPhase === 'EXPERIENCE') {
                nextPhase = 'DECIDE';
              }

              const updatePayload = { schoolJourneys };
              if (nextPhase) updatePayload.currentPhase = nextPhase;

              await base44.entities.FamilyJourney.update(journey.id, updatePayload);
              console.log('[E29-006] FamilyJourney debrief sync completed for school', selectedSchoolId);
            } catch (e) {
              console.error('[E29-006] FamilyJourney debrief sync failed:', e?.message || e);
            }
          })();

          const originalAnalysis = deepDiveAnalysis.content || {};
          const qaPairs = debriefArtifact.content.qaPairs;
          const priorities = conversationFamilyProfile?.priorities || [];
          
          // Build Q&A summary for prompt
          const qaContext = qaPairs.map((qa, idx) => `Q${idx + 1}: ${qa.question}\nA${idx + 1}: ${qa.answer}`).join('\n\n');
          
          const reevalSystemPrompt = `You are a school fit analyst. Given original school analysis and post-visit debrief responses, re-evaluate whether the school remains a good fit.

CRITICAL: Return ONLY valid JSON. Do NOT include any markdown code blocks, explanations, or text outside the JSON.`;

          const reevalUserPrompt = `ORIGINAL ANALYSIS:
- Fit Label: ${originalAnalysis.fitLabel || 'unknown'}
- Trade-offs: ${(originalAnalysis.tradeOffs || []).map(t => `${t.dimension}: ${t.concern || 'neutral'}`).join('; ') || 'none'}
- Strengths: ${(originalAnalysis.strengths || []).join(', ') || 'none noted'}

FAMILY PRIORITIES: ${priorities.join(', ') || 'not specified'}

POST-VISIT DEBRIEF Q&A:
${qaContext}

Based on what the family shared during their visit, provide a fit re-evaluation. Return JSON: { updatedFitLabel (enum: "strong_match", "good_match", "worth_exploring"), fitDirection (enum: "improved", "declined", "unchanged"), revisedStrengths (array of strings), revisedConcerns (array of strings), visitVerdict (string, 1-2 sentences) }`;

          let reevalResult = null;
          try {
            reevalResult = await callOpenRouter({
              systemPrompt: reevalSystemPrompt,
              userPrompt: reevalUserPrompt,
              maxTokens: 600,
              temperature: 0.5,
              responseSchema: {
                name: 'fit_reevaluation',
                schema: {
                  type: 'object',
                  properties: {
                    updatedFitLabel: { type: 'string', enum: ['strong_match', 'good_match', 'worth_exploring'] },
                    fitDirection: { type: 'string', enum: ['improved', 'declined', 'unchanged'] },
                    revisedStrengths: { type: 'array', items: { type: 'string' } },
                    revisedConcerns: { type: 'array', items: { type: 'string' } },
                    visitVerdict: { type: 'string' }
                  },
                  required: ['updatedFitLabel', 'fitDirection', 'revisedStrengths', 'revisedConcerns', 'visitVerdict'],
                  additionalProperties: false
                }
              }
            });
          } catch (openrouterError) {
            console.log('[E13a-WC3] OpenRouter failed, trying InvokeLLM fallback');
            try {
              const fallbackResult = await base44.integrations.Core.InvokeLLM({
                prompt: reevalSystemPrompt + '\n\n' + reevalUserPrompt
              });
              if (typeof fallbackResult === 'string') {
                reevalResult = JSON.parse(fallbackResult);
              } else {
                reevalResult = fallbackResult;
              }
            } catch (fallbackError) {
              console.error('[E13a-WC3] Both fit re-evaluation methods failed:', fallbackError.message);
              reevalResult = null;
            }
          }

          // Persist fit re-evaluation as new artifact (non-blocking)
          if (reevalResult) {
            try {
              const fitReevalContent = {
                ...reevalResult,
                originalFitLabel: originalAnalysis.fitLabel || 'unknown',
                debriefTimestamp: new Date().toISOString()
              };

              await base44.entities.GeneratedArtifact.create({
                userId: context.userId,
                conversationId: context.conversationId,
                schoolId: selectedSchoolId,
                artifactType: 'fit_reevaluation',
                title: 'Fit Re-evaluation - ' + schoolName,
                content: fitReevalContent,
                status: 'ready',
                isShared: false,
                pdfUrl: null,
                shareToken: null
              });

              // E29-006: patch FamilyJourney with fit re-evaluation details (fire-and-forget)
              (async () => {
                try {
                  const journey = context.journeyId
                    ? (await base44.entities.FamilyJourney.filter({ id: context.journeyId }))?.[0]
                    : (await base44.entities.FamilyJourney.filter({ userId: context.userId }))?.[0];
                  if (!journey) return;

                  const schoolJourneys = Array.isArray(journey.schoolJourneys) ? [...journey.schoolJourneys] : [];
                  const item = schoolJourneys.find((sj) => sj.schoolId === selectedSchoolId);
                  if (item) {
                    item.postVisitFitLabel = reevalResult.updatedFitLabel;
                    item.fitDirection = reevalResult.fitDirection;
                    item.visitVerdict = reevalResult.visitVerdict;
                    item.revisedStrengths = reevalResult.revisedStrengths;
                    item.revisedConcerns = reevalResult.revisedConcerns;
                  }

                  await base44.entities.FamilyJourney.update(journey.id, { schoolJourneys });
                  console.log('[E29-006] FamilyJourney re-eval sync completed for school', selectedSchoolId);
                } catch (e) {
                  console.error('[E29-006] FamilyJourney re-eval sync failed:', e?.message || e);
                }
              })();

              console.log('[E13a-WC3] Fit re-evaluation artifact created');
            } catch (createError) {
              console.error('[E13a-WC3] Failed to persist fit re-evaluation (non-blocking):', createError.message);
            }
          }
        }
      } catch (reevalError) {
        console.error('[E13a-WC3] Fit re-evaluation process failed (non-blocking):', reevalError.message);
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