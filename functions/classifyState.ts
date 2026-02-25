import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const {
      message,
      conversationHistory,
      conversationContext,
      selectedSchoolId,
      currentSchools
    } = await req.json();

    const context = conversationContext || {};
    const msgLower = message?.toLowerCase() || '';
    let currentState = context.state || 'WELCOME';
    const briefStatus = context.briefStatus || null;
    const extractedEntities = context.extractedEntities || {};
    const editCount = context.briefEditCount || 0;
    const histLen = conversationHistory?.length || 0;
    const userMessageCount = conversationHistory?.filter(m => m.role === 'user').length || 0;

    console.log('[CLASSIFY] Input:', { currentState, briefStatus, histLen, userMessageCount, selectedSchoolId });

    // RULE 1: WELCOME STATE
    if (histLen <= 1 && !selectedSchoolId) {
      console.log('[CLASSIFY] Rule 1: WELCOME state');
      return Response.json({
        state: 'WELCOME',
        briefStatus: null,
        dataSufficiency: 'thin',
        transitionReason: 'reset'
      });
    }

    // RULE 1b: Force DISCOVERY if currently WELCOME but we have conversation history
    if (currentState === 'WELCOME' && histLen > 1) {
      console.log('[CLASSIFY] Rule 1b: WELCOME->DISCOVERY (conversation has started)');
      // Don't return yet - fall through to check other rules with currentState as DISCOVERY
      currentState = 'DISCOVERY';
    }

    // RULE 2: DEEP_DIVE OVERRIDE
    if (selectedSchoolId) {
      const previousSchoolId = context.previousSchoolId || null;
      const transitionReason = selectedSchoolId !== previousSchoolId ? 'natural' : 'natural';
      console.log('[CLASSIFY] Rule 2: DEEP_DIVE override', { selectedSchoolId, previousSchoolId });
      return Response.json({
        state: 'DEEP_DIVE',
        briefStatus: briefStatus,
        dataSufficiency: calculateDataSufficiency(extractedEntities),
        transitionReason
      });
    }

    // Check data availability
    const hasLocation = !!(extractedEntities.locationArea || extractedEntities.city);
    const hasGrade = extractedEntities.childGrade !== null && extractedEntities.childGrade !== undefined;
    const hasMinimumData = hasLocation && hasGrade;

    // RULE 3: INTENT OVERRIDE (highest priority after DEEP_DIVE)
    const explicitDemands = /\b(show me schools|show me the schools|show me the brief|show me results|let me see|just show me|i want to see schools|find me schools|show matches|give me results|give me schools|i'm done|that's everything|what do you recommend|show me options|what schools)\b/i.test(msgLower);
    
    if (explicitDemands && currentState === 'DISCOVERY') {
      if (hasMinimumData) {
        console.log('[CLASSIFY] Rule 3: Intent override -> BRIEF (has minimum data)');
        return Response.json({
          state: 'BRIEF',
          briefStatus: 'generating',
          dataSufficiency: calculateDataSufficiency(extractedEntities),
          transitionReason: 'explicit_demand'
        });
      } else {
        console.log('[CLASSIFY] Rule 3: Intent detected but missing data, stay DISCOVERY');
        return Response.json({
          state: 'DISCOVERY',
          briefStatus: null,
          dataSufficiency: calculateDataSufficiency(extractedEntities),
          transitionReason: 'fast_collect'
        });
      }
    }

    // RULE 4: BACKWARD TRANSITIONS
    if (currentState === 'DEEP_DIVE') {
      const backKeywords = /\b(back|other schools|show me others|more options|different school)\b/i.test(msgLower);
      if (backKeywords) {
        console.log('[CLASSIFY] Rule 4: DEEP_DIVE -> RESULTS (backward)');
        return Response.json({
          state: 'RESULTS',
          briefStatus: 'confirmed',
          dataSufficiency: calculateDataSufficiency(extractedEntities),
          transitionReason: 'backward'
        });
      }
    }

    if (currentState === 'RESULTS') {
      const reviseKeywords = /\b(change criteria|revise|update brief|different criteria|start over|redo brief)\b/i.test(msgLower);
      const freshStartKeywords = /\b(start fresh|completely new search|new search)\b/i.test(msgLower);
      
      if (freshStartKeywords) {
        console.log('[CLASSIFY] Rule 4: RESULTS -> DISCOVERY (fresh start)');
        return Response.json({
          state: 'DISCOVERY',
          briefStatus: null,
          dataSufficiency: 'thin',
          transitionReason: 'reset'
        });
      }
      
      if (reviseKeywords) {
        console.log('[CLASSIFY] Rule 4: RESULTS -> BRIEF (revise)');
        return Response.json({
          state: 'BRIEF',
          briefStatus: 'editing',
          dataSufficiency: calculateDataSufficiency(extractedEntities),
          transitionReason: 'backward'
        });
      }
    }

    // RULE 5: BRIEF SUBSTATES
    if (currentState === 'BRIEF') {
      if (briefStatus === 'pending_review') {
        const confirmationKeywords = /\b(looks good|yes|yeah|yep|that works|perfect|find my matches|show me schools|sounds right|correct|great|go ahead)\b/i.test(msgLower);
        const elementReference = /\b(budget|location|grade|name|boarding|program|curriculum|priority|priorities|interest|dealbreaker)\b/i.test(msgLower);
        const ambiguityKeywords = /\b(hmm|maybe|i don't know|not sure|uncertain)\b/i.test(msgLower);
        
        if (confirmationKeywords) {
          console.log('[CLASSIFY] Rule 5: BRIEF pending_review -> RESULTS (confirmed)');
          return Response.json({
            state: 'RESULTS',
            briefStatus: 'confirmed',
            dataSufficiency: calculateDataSufficiency(extractedEntities),
            transitionReason: 'natural'
          });
        }
        
        if (elementReference) {
          console.log('[CLASSIFY] Rule 5: BRIEF pending_review -> editing (element reference)');
          return Response.json({
            state: 'BRIEF',
            briefStatus: 'editing',
            dataSufficiency: calculateDataSufficiency(extractedEntities),
            transitionReason: 'natural'
          });
        }
        
        if (ambiguityKeywords) {
          console.log('[CLASSIFY] Rule 5: BRIEF stay pending_review (ambiguity)');
          return Response.json({
            state: 'BRIEF',
            briefStatus: 'pending_review',
            dataSufficiency: calculateDataSufficiency(extractedEntities),
            transitionReason: 'natural'
          });
        }
      }
      
      if (briefStatus === 'editing') {
        if (editCount >= 3) {
          console.log('[CLASSIFY] Rule 5: BRIEF editing -> RESULTS (edit cap reached)');
          return Response.json({
            state: 'RESULTS',
            briefStatus: 'confirmed',
            dataSufficiency: calculateDataSufficiency(extractedEntities),
            transitionReason: 'auto_threshold'
          });
        }
        
        console.log('[CLASSIFY] Rule 5: BRIEF stay editing (under edit cap)');
        return Response.json({
          state: 'BRIEF',
          briefStatus: 'editing',
          dataSufficiency: calculateDataSufficiency(extractedEntities),
          transitionReason: 'natural'
        });
      }
      
      if (briefStatus === 'generating') {
        console.log('[CLASSIFY] Rule 5: BRIEF generating -> pending_review');
        return Response.json({
          state: 'BRIEF',
          briefStatus: 'pending_review',
          dataSufficiency: calculateDataSufficiency(extractedEntities),
          transitionReason: 'natural'
        });
      }
    }

    // RULE 8: FRUSTRATION DETECTION in DISCOVERY
    if (currentState === 'DISCOVERY') {
      const wordCount = message.trim().split(/\s+/).length;
      const hasAllCaps = /[A-Z]{4,}/.test(message);
      const frustrationPhrases = /\b(i already told you|i said|just do it|you already asked|i mentioned|like i said|again|stop asking)\b/i.test(msgLower);
      const isFrustrated = (wordCount < 5 && hasAllCaps) || frustrationPhrases;
      
      if (isFrustrated && hasMinimumData) {
        console.log('[CLASSIFY] Rule 8: Frustration detected -> BRIEF');
        return Response.json({
          state: 'BRIEF',
          briefStatus: 'generating',
          dataSufficiency: calculateDataSufficiency(extractedEntities),
          transitionReason: 'frustration'
        });
      }
    }

    // RULE 7: QUESTION HOLDBACK
    const isQuestion = message.trim().endsWith('?');

    // RULE 6: AUTO-TRANSITION in DISCOVERY
    if (currentState === 'DISCOVERY') {
      const dataSufficiency = calculateDataSufficiency(extractedEntities);
      
      // Hard cap at 8 exchanges
      if (userMessageCount >= 8 && hasMinimumData) {
        console.log('[CLASSIFY] Rule 6: 8+ exchanges, force BRIEF');
        return Response.json({
          state: 'BRIEF',
          briefStatus: 'generating',
          dataSufficiency,
          transitionReason: 'auto_threshold'
        });
      }
      
      // 6+ exchanges: should offer BRIEF
      if (userMessageCount >= 6 && hasMinimumData && !isQuestion) {
        console.log('[CLASSIFY] Rule 6: 6+ exchanges, suggest BRIEF');
        return Response.json({
          state: 'BRIEF',
          briefStatus: 'generating',
          dataSufficiency,
          transitionReason: 'auto_threshold'
        });
      }
      
      // 4+ exchanges + minimum data
      if (userMessageCount >= 4 && hasMinimumData && !isQuestion) {
        console.log('[CLASSIFY] Rule 6: 4+ exchanges + minimum data, transition BRIEF');
        return Response.json({
          state: 'BRIEF',
          briefStatus: 'generating',
          dataSufficiency,
          transitionReason: 'auto_threshold'
        });
      }
      
      // Question holdback
      if (isQuestion) {
        console.log('[CLASSIFY] Rule 7: Question holdback, stay DISCOVERY');
        return Response.json({
          state: 'DISCOVERY',
          briefStatus: null,
          dataSufficiency,
          transitionReason: 'natural'
        });
      }
      
      // Default: stay in DISCOVERY
      console.log('[CLASSIFY] DISCOVERY default: stay collecting');
      return Response.json({
        state: 'DISCOVERY',
        briefStatus: null,
        dataSufficiency,
        transitionReason: 'natural'
      });
    }

    // DEFAULT: maintain current state
    console.log('[CLASSIFY] Default: maintain current state');
    return Response.json({
      state: currentState,
      briefStatus,
      dataSufficiency: calculateDataSufficiency(extractedEntities),
      transitionReason: 'natural'
    });

  } catch (error) {
    console.error('[CLASSIFY ERROR]', error);
    return Response.json({ 
      error: error.message || String(error),
      state: 'DISCOVERY',
      briefStatus: null,
      dataSufficiency: 'thin',
      transitionReason: 'natural'
    }, { status: 500 });
  }
});

// RULE 9: DATA SUFFICIENCY CALCULATION
function calculateDataSufficiency(extractedEntities) {
  const hasLocation = !!(extractedEntities.locationArea || extractedEntities.city);
  const hasGrade = extractedEntities.childGrade !== null && extractedEntities.childGrade !== undefined;
  
  if (!hasLocation || !hasGrade) {
    return 'thin';
  }
  
  const richFields = [
    extractedEntities.priorities?.length > 0,
    extractedEntities.interests?.length > 0,
    extractedEntities.budgetSingle || extractedEntities.maxTuition || extractedEntities.budgetMax,
    extractedEntities.learning_needs?.length > 0
  ].filter(Boolean).length;
  
  if (richFields >= 2) {
    return 'rich';
  }
  
  return 'minimum';
}