// Utility functions for deep dive analysis state management
// Purpose: Centralized helpers for querying deep dive data from messages
// Last Modified: 2026-03-14

export const hasDeepDive = (messages, schoolId) => messages.some(m => m.deepDiveAnalysis?.schoolId === schoolId);

export const getSchoolsWithDeepDive = (messages) => new Set(messages.filter(m => m.deepDiveAnalysis?.schoolId).map(m => m.deepDiveAnalysis.schoolId));

export const getLatestDeepDive = (messages, schoolId) => { for (let i = messages.length - 1; i >= 0; i--) { if (messages[i]?.deepDiveAnalysis?.schoolId === schoolId) return messages[i].deepDiveAnalysis; } return null; };