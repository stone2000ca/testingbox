/**
 * State Machine Configuration
 * Pure data and functions for managing conversation state and discovery progress
 */

import { useState, useCallback } from 'react';

export const STATES = {
  WELCOME: 'WELCOME',
  DISCOVERY: 'DISCOVERY',
  BRIEF: 'BRIEF',
  RESULTS: 'RESULTS',
  DEEP_DIVE: 'DEEP_DIVE'
};

export const BRIEF_STATUS = {
  GENERATING: 'generating',
  PENDING_REVIEW: 'pending_review',
  EDITING: 'editing',
  CONFIRMED: 'confirmed'
};

export const TRANSITIONS = {
  [STATES.WELCOME]: { 
    USER_SENT_MESSAGE: STATES.DISCOVERY 
  },
  [STATES.DISCOVERY]: { 
    TIER1_MET: STATES.BRIEF 
  },
  [STATES.BRIEF]: { 
    USER_CONFIRMED: STATES.RESULTS, 
    USER_WANTS_REVISE_BRIEF: STATES.BRIEF 
  },
  [STATES.RESULTS]: { 
    SCHOOL_SELECTED: STATES.DEEP_DIVE, 
    USER_WANTS_REVISE_BRIEF: STATES.BRIEF 
  },
  [STATES.DEEP_DIVE]: { 
    BACK_TO_RESULTS: STATES.RESULTS, 
    USER_WANTS_REVISE_BRIEF: STATES.BRIEF 
  }
};

export const PROGRESS_WEIGHTS = {
  childName: 0.05,
  grade: 0.20,
  location: 0.25,
  budget: 0.15,
  curriculumOrType: 0.15,
  priorities: 0.10,
  dealbreakers: 0.10
};

/**
 * Check if tier 1 data (minimum required) is met
 * @param {Object} entities - Family profile entities
 * @returns {boolean}
 */
export const checkTier1 = (entities) => {
  if (!entities) return false;
  
  const hasLocation = !!entities.locationArea;
  const hasGradeOrCurriculum = !!entities.childGrade || 
                               entities.curriculumPreference?.length > 0 || 
                               !!entities.schoolType;
  
  return hasLocation && hasGradeOrCurriculum;
};

/**
 * Calculate weighted discovery progress (0 to 1)
 * @param {Object} entities - Family profile entities
 * @returns {number} Progress value between 0 and 1
 */
export const getProgress = (entities) => {
  if (!entities) return 0;
  
  let progress = 0;
  
  // Child name
  if (entities.childName) {
    progress += PROGRESS_WEIGHTS.childName;
  }
  
  // Grade
  if (entities.childGrade !== null && entities.childGrade !== undefined) {
    progress += PROGRESS_WEIGHTS.grade;
  }
  
  // Location
  if (entities.locationArea) {
    progress += PROGRESS_WEIGHTS.location;
  }
  
  // Budget
  if (entities.maxTuition || entities.budgetRange) {
    progress += PROGRESS_WEIGHTS.budget;
  }
  
  // Curriculum or school type
  if (entities.curriculumPreference?.length > 0 || entities.schoolType) {
    progress += PROGRESS_WEIGHTS.curriculumOrType;
  }
  
  // Priorities
  if (entities.priorities?.length > 0) {
    progress += PROGRESS_WEIGHTS.priorities;
  }
  
  // Dealbreakers
  if (entities.dealbreakers?.length > 0) {
    progress += PROGRESS_WEIGHTS.dealbreakers;
  }
  
  // Cap at 1.0
  return Math.min(progress, 1.0);
};

/**
 * Get human-readable progress label based on progress percentage
 * @param {number} progress - Progress value between 0 and 1
 * @returns {string} Progress label
 */
export const getProgressLabel = (progress) => {
  if (progress <= 0.30) {
    return 'Getting to know your family...';
  } else if (progress <= 0.60) {
    return 'Understanding your priorities...';
  } else if (progress <= 0.89) {
    return 'Almost ready to find schools...';
  } else {
    return 'Ready to build your Family Brief';
  }
};

/**
 * Handle state machine transitions
 * @param {string} currentState
 * @param {string} event
 * @returns {Object} { state, changed }
 */
export const transitionState = (currentState, event) => {
  const allowedTransitions = TRANSITIONS[currentState];
  if (!allowedTransitions || !allowedTransitions[event]) {
    console.warn(`Invalid transition: ${currentState} + ${event}. Ignoring.`);
    return { state: currentState, changed: false };
  }
  return { state: allowedTransitions[event], changed: true };
};

/**
 * Get system prompt based on conversation state
 * @param {string} state
 * @param {string} briefStatus
 * @param {Object} entities
 * @param {string} consultantName
 * @returns {string}
 */
export const getSystemPrompt = (state, briefStatus, entities = {}, consultantName = 'Jackie') => {
  switch (state) {
    case STATES.WELCOME:
      return `You are ${consultantName}, a warm and knowledgeable education consultant at NextSchool. Greet the family warmly and ask ONE open-ended question: "Tell me about your child and what kind of school you're looking for." Do NOT mention any specific school names. Do NOT ask multiple questions at once. Keep it conversational and reassuring.`;

    case STATES.DISCOVERY:
       return `You are ${consultantName}, continuing to learn about this family. START by asking for the child's first name if not yet provided. Then ask ONE question at a time to understand their needs. Extract: child name, grade, location/area, budget range, curriculum preferences, priorities, and dealbreakers. Do NOT mention specific school names. If the user asks about a specific school, say: "I'd love to tell you about that school — let me first understand what you're looking for so I can give you the best perspective." Current known data: ${JSON.stringify(entities)}`;

    case STATES.BRIEF:
       if (briefStatus === BRIEF_STATUS.GENERATING) {
         const childRef = entities.childName
           ? entities.childName
           : (entities.gender === 'male' ? 'Your son' : entities.gender === 'female' ? 'Your daughter' : 'Your child');
         return `Generate a Family Brief summarizing everything learned.

    ⚠️ MANDATORY RULE — NO EXCEPTIONS: NEVER use the word "Child" or "Student" as a label in the brief. The child label MUST be "${childRef}". Example format: "${childRef}: Grade 7 | Location: Toronto | Budget: $30,000/yr". If you write "Child:" or "Student:" anywhere, you have violated this rule.

    Format the brief clearly with these fields: ${childRef} (name/grade), Location, Budget, Priorities (ranked), Dealbreakers, and any other relevant details. End with: "Does this capture what you're looking for, or would you like to adjust anything?" Do NOT mention specific schools yet.`;
       } else if (briefStatus === BRIEF_STATUS.PENDING_REVIEW) {
         return `The Family Brief is displayed above. Wait for the user to confirm or request changes. Do NOT ask new intake questions. Do NOT mention or recommend any schools. 

    KEY BEHAVIOR RULE: If the user says words like "adjust", "change", "update", "modify", "different", or "not quite" — directly ask WHAT they want to change. Do NOT regenerate the entire brief. Example: "What would you like to adjust?" or "What needs to change?"

    If they confirm (e.g. "that looks right", "perfect", "yes"), acknowledge and prepare to show school matches.`;
       } else if (briefStatus === BRIEF_STATUS.EDITING) {
         return `The user wants to change their Family Brief. Ask ONE targeted question about what they want to adjust. Do NOT start over with the full intake. You are on edit cycle ${entities.editCount || 1}/3. If editCount reaches 3, say: "I want to make sure we get this right — let's go with this version and we can always adjust after you see some schools."`;
       }
      break;

    case STATES.RESULTS:
      return `Present the matched schools. For each school, explain WHY it matches based on the family's specific priorities and needs. Highlight strengths and note any trade-offs honestly. Do NOT ask intake questions — you already have this information. Focus on helping them compare and narrow down options.`;

    case STATES.DEEP_DIVE:
      return `Discuss ${entities.selectedSchool || 'the selected school'} in detail. Cover its strengths, potential concerns relative to this family's needs, admissions process, and how it compares to other options. Be honest about trade-offs. Offer to compare with other schools from the results.`;

    default:
      return `You are ${consultantName}, an education consultant at NextSchool.`;
  }
};

/**
 * Hook to manage conversation state machine
 * @param {string} initialState
 * @returns {Object}
 */
export const useStateMachine = (initialState = STATES.WELCOME) => {
  const [currentState, setCurrentState] = useState(initialState);
  const [briefStatus, setBriefStatus] = useState(null);
  const [editCount, setEditCount] = useState(0);

  const transition = useCallback((event) => {
    const result = transitionState(currentState, event);
    if (result.changed) setCurrentState(result.state);
    return result;
  }, [currentState]);

  const canTransition = useCallback((event) => {
    const allowed = TRANSITIONS[currentState];
    return !!(allowed && allowed[event]);
  }, [currentState]);

  const getPrompt = useCallback((entities, consultantName = 'Jackie') => {
    return getSystemPrompt(currentState, briefStatus, entities, consultantName);
  }, [currentState, briefStatus]);

  const incrementEditCount = useCallback(() => {
    setEditCount(prev => prev + 1);
  }, []);

  return { 
    currentState, 
    briefStatus, 
    editCount, 
    transition, 
    setBriefStatus, 
    incrementEditCount, 
    getPrompt, 
    canTransition, 
    setCurrentState 
  };
};

export default {
  STATES,
  BRIEF_STATUS,
  TRANSITIONS,
  PROGRESS_WEIGHTS,
  checkTier1,
  getProgress,
  getProgressLabel,
  transitionState,
  getSystemPrompt,
  useStateMachine
};