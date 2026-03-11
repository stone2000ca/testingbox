import { useState, useCallback } from 'react';
import { calculateHaversineDistance, applyReligiousFilter } from '../utils/filterUtils';

/**
 * Hook for school filtering and distance calculation.
 *
 * @param {Array} schools - Current school list
 * @param {Object} conversationContext - Current conversation context (for profile-based filtering)
 * @returns {Object} { filteredSchools, showDistances, applyDistances, resetSort }
 */
export function useSchoolFiltering(schools, conversationContext) {
  const [showDistances, setShowDistances] = useState(false);

  const getFilteredSchools = useCallback(() => {
    try {
      if (!schools || schools.length === 0) return schools || [];

      let filtered = [...schools];

      // Profile-based filtering
      try {
        const profile = conversationContext?.familyProfile;

        // Grade Filter
        const childGrade = profile?.childGrade;
        if (childGrade !== null && childGrade !== undefined) {
          const gradeNum = typeof childGrade === 'number' ? childGrade : parseInt(String(childGrade));
          if (!isNaN(gradeNum)) {
            filtered = filtered.filter(school => {
              if (!school?.highestGrade && school?.highestGrade !== 0) return true;
              return school.highestGrade >= gradeNum;
            });
            console.log('[FILTER] Grade:', gradeNum, 'Schools:', filtered.length);
          }
        }

        // Budget Filter
        const maxBudget = profile?.maxTuition;
        if (maxBudget && maxBudget !== 'unlimited') {
          const budgetNum = typeof maxBudget === 'number' ? maxBudget : parseInt(String(maxBudget));
          if (!isNaN(budgetNum)) {
            filtered = filtered.filter(school => {
              const tuition = school?.tuition || school?.dayTuition;
              if (!tuition) return true;
              return tuition <= budgetNum;
            });
            console.log('[FILTER] Budget:', budgetNum, 'Schools:', filtered.length);
          }
        }

        // Religious Dealbreaker Filter
        try {
          const dealbreakers = profile?.dealbreakers || [];
          const hasReligiousDealbreaker = Array.isArray(dealbreakers) && dealbreakers.some(d => typeof d === 'string' && d.toLowerCase().includes('religious'));

          if (hasReligiousDealbreaker) {
            const beforeCount = filtered.length;
            filtered = filtered.filter(school => {
              const name = (school?.name || '').toLowerCase();
              const affiliation = (school?.religiousAffiliation || '').toLowerCase();

              if (affiliation && affiliation !== 'none' && affiliation !== 'secular' && affiliation !== 'non-denominational') {
                console.log('[RELIGIOUS FILTER] Excluded by affiliation:', school.name, '(' + school.religiousAffiliation + ')');
                return false;
              }

              const religiousKeywords = ['christian', 'catholic', 'islamic', 'jewish', 'lutheran', 'baptist', 'adventist', 'anglican', 'hebrew', 'saint'];
              if (religiousKeywords.some(kw => name.includes(kw))) {
                console.log('[RELIGIOUS FILTER] Excluded by name keyword:', school.name);
                return false;
              }

              return true;
            });
            console.log('[FILTER] Religious dealbreaker: filtered from', beforeCount, 'to', filtered.length, 'schools');
          }
        } catch (religiousFilterError) {
          console.error('[RELIGIOUS FILTER] Error, skipping religious filter:', religiousFilterError);
        }
      } catch (filterError) {
        console.error('[FILTER] Error applying filters, showing all schools:', filterError);
        filtered = [...schools];
      }

      return filtered;

    } catch (error) {
      console.error('[FILTER] Critical error, returning all schools:', error);
      return schools || [];
    }
  }, [schools, conversationContext]);

  /**
   * Calculate and apply distances from a user location to all schools.
   * Returns the sorted-by-distance school list (caller should setSchools with the result).
   */
  const applyDistances = useCallback((location, schoolList) => {
    const schoolsWithDistance = schoolList.map(school => {
      if (school.lat && school.lng) {
        const distance = calculateHaversineDistance(
          location.lat,
          location.lng,
          school.lat,
          school.lng
        );
        return { ...school, distanceKm: distance };
      }
      return school;
    });

    const sorted = schoolsWithDistance.sort((a, b) =>
      (a.distanceKm || Infinity) - (b.distanceKm || Infinity)
    );

    setShowDistances(true);
    return sorted;
  }, []);

  /**
   * Stable no-op — sort has been removed; kept for call-site compatibility.
   */
  const resetSort = useCallback(() => {}, []);

  return {
    filteredSchools: getFilteredSchools(),
    showDistances,
    applyDistances,
    resetSort,
  };
}