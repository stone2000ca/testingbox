import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { callOpenRouter } from './callOpenRouter.ts';
import { handleDeepDive } from './handleDeepDive.ts';
import { handleResults } from './handleResults.ts';
import { handleBrief } from './handleBrief.ts';
import { handleDiscovery } from './handleDiscovery.ts';
import { extractEntities } from './extractEntities.ts';
// BUG-DD-002 fix: selectedSchoolId destructured
// deploy-trigger-v5

Deno.serve(async (req) => {
  const TIMEOUT_MS = 25000;
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  );

  const processRequest = async () => {
    var classificationResult;
    var currentState;
    var briefStatus;
    
    try {
      const base44 = createClientFromRequest(req);
      const { message, conversationHistory, conversationContext, region, userId, consultantName, currentSchools, userNotes, shortlistedSchools, userLocation, selectedSchoolId } = await req.json();

    console.log('ORCH START', { 
      messageLength: message?.length, 
      hasConversationHistory: !!conversationHistory,
      conversationHistoryLength: conversationHistory?.length,
      hasConversationContext: !!conversationContext, 
      consultant: consultantName,
      userId: userId,
      hasUserLocation: !!userLocation
    });

    const context = conversationContext || {};
    const msgLower = message.toLowerCase();
    
    // STATE MACHINE: 5 states (strictly deterministic)
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
    
    // KI-12 FIX PART B: City coordinates lookup table
    const CITY_COORDS = {
      'vancouver': { lat: 49.2827, lng: -123.1207 },
      'toronto': { lat: 43.6532, lng: -79.3832 },
      'montreal': { lat: 45.5017, lng: -73.5673 },
      'ottawa': { lat: 45.4215, lng: -75.6972 },
      'calgary': { lat: 51.0447, lng: -114.0719 },
      'edmonton': { lat: 53.5461, lng: -113.4938 },
      'victoria': { lat: 48.4284, lng: -123.3656 },
      'winnipeg': { lat: 49.8951, lng: -97.1384 },
      'halifax': { lat: 44.6488, lng: -63.5752 },
      'new york': { lat: 40.7128, lng: -74.0060 },
      'los angeles': { lat: 34.0522, lng: -118.2437 },
      'chicago': { lat: 41.8781, lng: -87.6298 },
      'boston': { lat: 42.3601, lng: -71.0589 },
      'san francisco': { lat: 37.7749, lng: -122.4194 },
      'london': { lat: 51.5074, lng: -0.1278 },
      'mississauga': { lat: 43.5890, lng: -79.6441 },
      'hamilton': { lat: 43.2557, lng: -79.8711 },
      'kingston': { lat: 44.2312, lng: -76.4860 },
      'kelowna': { lat: 49.8880, lng: -119.4960 },
      'surrey': { lat: 49.1913, lng: -122.8490 },
      'burnaby': { lat: 49.2488, lng: -122.9805 },
      'oakville': { lat: 43.4675, lng: -79.6877 },
      'richmond hill': { lat: 43.8828, lng: -79.4403 },
      'markham': { lat: 43.8561, lng: -79.3370 },
      'north vancouver': { lat: 49.3200, lng: -123.0724 },
      'west vancouver': { lat: 49.3272, lng: -123.1601 }
    };
    
    let briefEditCount = context.briefEditCount || 0;
    const MAX_BRIEF_EDITS = 3;
    
    const conversationId = context.conversationId;
    
    // STEP 0: Initialize/retrieve FamilyProfile
    let conversationFamilyProfile = null;
    
    if (userId && conversationId) {
      try {
        const profiles = await base44.entities.FamilyProfile.filter({
          userId,
          conversationId: conversationId
        });
        conversationFamilyProfile = profiles.length > 0 ? profiles[0] : null;
        
        if (!conversationFamilyProfile) {
          conversationFamilyProfile = await base44.entities.FamilyProfile.create({
            userId,
            conversationId: conversationId
          });
          console.log('Created new FamilyProfile:', conversationFamilyProfile.id);
        }
      } catch (e) {
        console.error('FamilyProfile error:', e);
      }
    } else {
      conversationFamilyProfile = {
        childName: null,
        childGrade: null,
        locationArea: null,
        maxTuition: null,
        interests: [],
        priorities: [],
        dealbreakers: [],
        academicStrengths: []
      };
    }
    
    // STEP 1: ENTITY EXTRACTION (runs on EVERY message)
    const { extractedEntities, updatedFamilyProfile, updatedContext, intentSignal } = await extractEntities({ base44, message, conversationFamilyProfile, context, conversationHistory });
    // Apply results
    Object.assign(conversationFamilyProfile, updatedFamilyProfile);
    Object.assign(context, updatedContext);
    
    // STEP 2: CALL CLASSIFYSTATE FOR STATE DETERMINATION
    try {
      const classifyResponse = await base44.functions.invoke('classifyState', {
        message,
        conversationHistory,
        conversationContext: context,
        selectedSchoolId,
        currentSchools
      });
      classificationResult = classifyResponse.data;
      console.log('[CLASSIFY RESULT]', classificationResult);
    } catch (e) {
      console.error('[CLASSIFY ERROR]', e);
      // Fallback to current state if classifyState fails
      classificationResult = {
        state: context.state || STATES.WELCOME,
        briefStatus: context.briefStatus || null,
        dataSufficiency: 'thin',
        transitionReason: 'natural'
      };
    }
    
    currentState = classificationResult.state;
    briefStatus = classificationResult.briefStatus;
    
    // Update context with classified state
    context.state = currentState;
    context.briefStatus = briefStatus;
    
    // Store classification metadata in context
    context.dataSufficiency = classificationResult.dataSufficiency;
    context.transitionReason = classificationResult.transitionReason;

    console.log(`[STATE] ${currentState} | briefStatus: ${briefStatus} | dataSufficiency: ${context.dataSufficiency} | transitionReason: ${context.transitionReason}`);

    // STEP 3: STATE-SPECIFIC RESPONSE GENERATION
    if (currentState === STATES.WELCOME) {
      return Response.json({
        message: "I'm your NextSchool education consultant. I help families find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you?",
        state: STATES.WELCOME,
        briefStatus: null,
        conversationContext: context,
        schools: []
      });
    }
    
    if (currentState === STATES.DISCOVERY) {
      return handleDiscovery({ base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId });
    }
    
    if (currentState === STATES.BRIEF) {
      return handleBrief({ base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId });
    }
    
    // STEP 4: School search only in RESULTS/DEEP_DIVE states (auto-transition from BRIEF)
    if (currentState === STATES.BRIEF && briefStatus === BRIEF_STATUS.CONFIRMED) {
      // Auto-transition to RESULTS when brief is confirmed
      currentState = STATES.RESULTS;
      context.state = currentState;
    }

    if (currentState === STATES.RESULTS) {
      return handleResults({ base44, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, selectedSchoolId, userLocation, region, conversationId, userId });
    }

    if (currentState === STATES.DEEP_DIVE) {
      return handleDeepDive({ base44, selectedSchoolId, message, conversationFamilyProfile, context, conversationHistory, consultantName, currentState, briefStatus, currentSchools, conversationId, userId });
    }

      // Fallback
      return Response.json({
       message: 'I encountered an unexpected state. Please try again.',
       state: currentState,
       briefStatus: briefStatus,
       schools: [],
       familyProfile: conversationFamilyProfile,
       conversationContext: context
      });

    } catch (error) {
      console.error('orchestrateConversation FATAL:', error);
      return Response.json({ error: error.message || String(error) }, { status: 500 });
    }
  };

  try {
    return await Promise.race([processRequest(), timeoutPromise]);
  } catch (error) {
    if (error.message === 'TIMEOUT') {
      return Response.json({ 
        error: 'Request timeout',
        status: 408 
      }, { status: 408 });
    }
    return Response.json({ 
      error: 'Something went wrong. Please try again.',
      status: 500 
    }, { status: 500 });
  }
});