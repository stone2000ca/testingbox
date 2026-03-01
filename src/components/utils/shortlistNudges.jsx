// T-SL-004: Shortlist nudge messages for different scenarios
export function getShortlistNudge({ 
  isRemoving, 
  newCount, 
  isJackie, 
  school, 
  familyProfile, 
  shortlistData, 
  schools 
}) {
  if (!isRemoving) {
    // --- ADDING ---
    if (newCount === 1) {
      return isJackie
        ? "Great pick — I'll keep that at the top for you. Keep browsing and save anything else that catches your eye."
        : "Noted. I've pinned that one for you. Keep going — save anything worth a closer look.";
    }
    
    if (newCount === 2) {
      return isJackie
        ? "You've got two saved now — want me to compare them side by side? Just say 'compare' and I'll walk you through the differences."
        : "Two shortlisted. Hit 'Compare These' in your shortlist, or ask me to break down the differences.";
    }
    
    if (newCount >= 3) {
      // Check: does this pick contradict the brief? (above budget)
      const budget = familyProfile?.maxTuition;
      const schoolTuition = school?.dayTuition ?? school?.tuition;
      
      if (budget && schoolTuition && schoolTuition > budget) {
        return isJackie
          ? `I noticed ${school.name} is above your stated budget — that's totally fine to explore, but want me to flag that when we compare?`
          : `Worth noting: ${school.name} is above your budget range. I can still work with it — just want you to have the full picture.`;
      }
      
      // Check similarity: all same curriculum or school type
      const curriculums = shortlistData.map(s => s.curriculumType).filter(Boolean);
      const allSameCurriculum = curriculums.length >= 2 && curriculums.every(c => c === curriculums[0]);
      const types = shortlistData.map(s => s.schoolType).filter(Boolean);
      const allSameType = types.length >= 2 && types.every(t => t === types[0]);
      
      if (allSameCurriculum || allSameType) {
        return isJackie
          ? "Your picks are looking quite similar in profile — want me to surface a school with a different approach as a contrast?"
          : "Your shortlist is fairly uniform so far. Want me to pull in a wildcard — something with a different structure or vibe?";
      }
      
      return isJackie
        ? "Strong shortlist forming. When you're ready, I can help you narrow it down or compare them in detail."
        : "Good shortlist. Say the word when you want to start narrowing — I can rank these against your priorities.";
    }
  } else {
    // --- REMOVING --- only nudge if list hits 0 after browsing results
    if (newCount === 0 && schools.length > 0) {
      return isJackie
        ? "Take your time — save anything that catches your eye and I'll keep track of them for you."
        : "No rush. Save any that stand out and I'll track them. I can always resurface something you passed on.";
    }
  }
  
  return null;
}