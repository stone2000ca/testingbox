// Shared constants and utilities for NextSchool backend functions
// Single source of truth — imported by orchestrateConversation, handleResults, handleDeepDive, etc.

export const STATES = {
  WELCOME: 'WELCOME',
  DISCOVERY: 'DISCOVERY',
  BRIEF: 'BRIEF',
  RESULTS: 'RESULTS',
  DEEP_DIVE: 'DEEP_DIVE'
} as const;

export const BRIEF_STATUS = {
  GENERATING: 'generating',
  PENDING_REVIEW: 'pending_review',
  EDITING: 'editing',
  CONFIRMED: 'confirmed'
} as const;

// KI-12 FIX PART B: City coordinates lookup table (single source)
export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
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

// ─── FIELD RESOLVER UTILITIES ──────────────────────────────────────────
// Shared aggressive fallback logic used by handleResults and handleDeepDive.
// Each resolver follows the chain: profile → extractedEntities → Brief text → nested context.

/**
 * Parse a grade value to a number. Returns null if unparseable.
 */
export function parseGrade(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const cleaned = raw.toLowerCase().trim();
    if (cleaned === 'jk' || cleaned === 'junior kindergarten') return -1;
    if (cleaned === 'k' || cleaned === 'kindergarten') return 0;
    if (cleaned === 'sk' || cleaned === 'senior kindergarten') return 0;
    if (cleaned.startsWith('grade ')) return parseInt(cleaned.replace('grade ', '')) || null;
    if (cleaned.startsWith('gr')) return parseInt(cleaned.replace(/^gr\.?\s*/, '')) || null;
    const n = parseInt(cleaned);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Resolve grade from multiple fallback sources.
 */
export function resolveGrade(profile: any, context: any, conversationHistory?: any[]): number | null {
  // Fallback 1: profile.childGrade
  let grade = parseGrade(profile?.childGrade);
  if (grade !== null) return grade;

  // Fallback 2: context.extractedEntities.childGrade
  grade = parseGrade(context?.extractedEntities?.childGrade);
  if (grade !== null) return grade;

  // Fallback 3: Parse Brief text
  if (conversationHistory) {
    const briefMsg = conversationHistory.slice().reverse()
      .find(m => m.role === 'assistant' && /•\s*Student:/i.test(m.content));
    if (briefMsg) {
      const gradeMatch = briefMsg.content.match(/•\s*Student:.*?\b(?:Grade\s+(\d+)|JK|SK|Kindergarten|K)\b/i);
      if (gradeMatch) {
        if (/JK/i.test(gradeMatch[0])) return -1;
        if (/SK|Kindergarten|(?<!\d)K(?!\w)/i.test(gradeMatch[0])) return 0;
        if (gradeMatch[1]) return parseInt(gradeMatch[1]);
      }
    }
  }

  // Fallback 4: nested context
  grade = parseGrade(context?.conversationContext?.familyProfile?.childGrade);
  return grade;
}

/**
 * Resolve budget/maxTuition from multiple fallback sources.
 */
export function resolveBudget(profile: any, context: any, conversationHistory?: any[]): number | null {
  // Fallback 1: profile.maxTuition
  if (profile?.maxTuition) {
    const v = typeof profile.maxTuition === 'number' ? profile.maxTuition : parseInt(profile.maxTuition);
    if (!isNaN(v)) return v;
  }

  // Fallback 2: extractedEntities.budgetSingle
  if (context?.extractedEntities?.budgetSingle) {
    const v = parseInt(context.extractedEntities.budgetSingle);
    if (!isNaN(v)) return v;
  }

  // Fallback 3: extractedEntities.budgetMax
  if (context?.extractedEntities?.budgetMax) {
    const v = parseInt(context.extractedEntities.budgetMax);
    if (!isNaN(v)) return v;
  }

  // Fallback 4: Parse Brief text
  if (conversationHistory) {
    const briefMsg = conversationHistory.slice().reverse()
      .find(m => m.role === 'assistant' && /•\s*Budget:/i.test(m.content));
    if (briefMsg) {
      const budgetMatch = briefMsg.content.match(/•\s*Budget:.*?\$?([\d,]+)(?:,000|K)?/i);
      if (budgetMatch) {
        let extracted = budgetMatch[1].replace(/,/g, '');
        if (/K$/i.test(budgetMatch[0])) {
          return parseInt(extracted) * 1000;
        } else if (!/,000/.test(budgetMatch[0]) && extracted.length <= 2) {
          return parseInt(extracted) * 1000;
        }
        return parseInt(extracted);
      }
    }
  }

  // Fallback 5: nested context
  if (context?.conversationContext?.familyProfile?.maxTuition) {
    const v = parseInt(context.conversationContext.familyProfile.maxTuition);
    if (!isNaN(v)) return v;
  }

  return null;
}

/**
 * Resolve an array field (priorities, interests, dealbreakers) from multiple fallback sources.
 */
export function resolveArrayField(
  fieldName: string,
  profile: any,
  context: any,
  conversationHistory?: any[],
  briefLabel?: string // e.g. "Top priorities", "Interests", "Dealbreakers"
): string[] | null {
  // Fallback 1: profile[fieldName]
  const profileVal = profile?.[fieldName];
  if (Array.isArray(profileVal) && profileVal.length > 0) return profileVal;

  // Fallback 2: context.extractedEntities[fieldName]
  const extractedVal = context?.extractedEntities?.[fieldName];
  if (Array.isArray(extractedVal) && extractedVal.length > 0) return extractedVal;

  // Fallback 3: Parse Brief text
  if (briefLabel && conversationHistory) {
    const regex = new RegExp(`•\\s*(?:${briefLabel}):\\s*([^\\n•]+)`, 'i');
    const briefMsg = conversationHistory.slice().reverse()
      .find(m => m.role === 'assistant' && regex.test(m.content));
    if (briefMsg) {
      const match = briefMsg.content.match(regex);
      if (match && match[1]) {
        const text = match[1].trim();
        if (!/not specified|none/i.test(text)) {
          return text.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
    }
  }

  // Fallback 4: nested context
  const nestedVal = context?.conversationContext?.familyProfile?.[fieldName];
  if (Array.isArray(nestedVal) && nestedVal.length > 0) return nestedVal;

  return null;
}
