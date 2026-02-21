/**
 * State Machine Configuration
 * Pure data and functions for managing conversation state and discovery progress
 */

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