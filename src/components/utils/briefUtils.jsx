// KI-52: Brief Content Validator + Programmatic Fallback
export function validateBriefContent(text) {
  if (!text) return false;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 50) return false;
  const lower = text.toLowerCase();
  const hits = [
    /\bgrade\b|\byr\s*\d|\byear\s*\d|\bgrade\s*\d/i.test(lower),
    /\blocation\b|\bcity\b|\btown\b|\barea\b|\bontario\b|\bbc\b|\balberta\b|\bquebec\b|\btoronto\b|\bvancouver\b|\bcalgary\b|\bottawa\b/i.test(lower),
    /\bbudget\b|\btuition\b|\bcost\b|\$\d|\baffordabl/i.test(lower),
  ].filter(Boolean).length;
  return hits >= 2;
}

export function generateProgrammaticBrief(profile) {
  if (!profile) return null;

  const lines = [];

  // Child
  const gradeStr = profile.childGrade != null ? (Number(profile.childGrade) <= 0 ? 'Kindergarten' : `Grade ${profile.childGrade}`) : null;
  const childParts = [profile.childName, gradeStr].filter(Boolean);
  if (childParts.length) lines.push(`**Child:** ${childParts.join(', ')}`);

  // Location
  if (profile.locationArea) lines.push(`**Location:** ${profile.locationArea}`);

  // Budget
  if (profile.maxTuition) lines.push(`**Budget:** Up to $${Number(profile.maxTuition).toLocaleString()}`);
  else if (profile.budgetRange) lines.push(`**Budget:** ${profile.budgetRange.replace(/_/g, ' ')}`);

  // Priorities
  if (profile.priorities?.length) lines.push(`**Priorities:** ${profile.priorities.join(', ')}`);

  // Dealbreakers
  if (profile.dealbreakers?.length) lines.push(`**Dealbreakers:** ${profile.dealbreakers.join(', ')}`);

  // Curriculum
  if (profile.curriculumPreference?.length) lines.push(`**Curriculum:** ${profile.curriculumPreference.join(', ')}`);

  // Boarding
  if (profile.boardingPreference && profile.boardingPreference !== 'day_only') {
    lines.push(`**Boarding:** ${profile.boardingPreference.replace(/_/g, ' ')}`);
  }

  if (lines.length < 2) return null; // Not enough data for a meaningful brief

  return `Here's what I've put together so far:\n\n${lines.join('\n')}\n\nDoes this look right, or is there anything you'd like to adjust?`;
}