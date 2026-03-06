/**
 * E11b Phase 1: AI-narrated comparison synthesis with structured matrix
 * Separated from Consultant.jsx due to file size constraints
 * @param {Array} comparedSchools - Schools being compared
 * @param {Object} familyProfile - Family profile with priorities
 * @param {Set} visitedSchoolIds - Set of school IDs that have been visited
 * @param {string} selectedConsultant - Consultant name ('Jackie' or 'Liam')
 * @param {Function} setMessages - setState for chat messages
 * @param {Function} setComparisonMatrix - setState for comparison matrix
 * @param {Object} base44 - Base44 SDK instance
 */
export async function handleNarrateComparison({
  comparedSchools,
  familyProfile,
  visitedSchoolIds,
  selectedConsultant,
  setMessages,
  setComparisonMatrix,
  base44
}) {
  const isJackie = selectedConsultant === 'Jackie';
  const persona = isJackie
    ? 'You are Jackie, a warm and empathetic private school consultant. Speak naturally, like a trusted advisor.'
    : 'You are Liam, a direct and analytical private school consultant. Speak concisely and clearly.';

  const briefSummary = familyProfile ? [
    familyProfile.priorities?.length ? `Priorities: ${familyProfile.priorities.join(', ')}` : '',
    familyProfile.maxTuition ? `Budget: up to $${familyProfile.maxTuition.toLocaleString()}` : '',
    familyProfile.locationArea ? `Location: ${familyProfile.locationArea}` : '',
    familyProfile.learningDifferences?.length ? `Learning needs: ${familyProfile.learningDifferences.join(', ')}` : '',
    familyProfile.boardingPreference ? `Boarding preference: ${familyProfile.boardingPreference}` : '',
  ].filter(Boolean).join('. ') : '';

  // E11b: Build detailed school data for LLM evaluation
  const schoolDataForMatrix = comparedSchools.map(s => {
    const tuition = s.dayTuition ?? s.tuition;
    const isVisited = visitedSchoolIds.has(s.id);
    return {
      id: s.id,
      name: s.name,
      city: s.city,
      distanceKm: s.distanceKm,
      tuition,
      currency: s.currency,
      curriculumType: s.curriculumType,
      genderPolicy: s.genderPolicy,
      boardingAvailable: s.boardingAvailable,
      avgClassSize: s.avgClassSize,
      enrollment: s.enrollment,
      studentTeacherRatio: s.studentTeacherRatio,
      artsPrograms: s.artsPrograms,
      sportsPrograms: s.sportsPrograms,
      universityPlacements: s.universityPlacements,
      specializations: s.specializations,
      highlights: s.highlights,
      isVisited
    };
  });

  const schoolSummaries = schoolDataForMatrix.map(s => {
    return [
      `School: ${s.name}`,
      s.city ? `City: ${s.city}` : '',
      s.distanceKm != null ? `Distance: ${s.distanceKm.toFixed(1)} km` : '',
      s.tuition ? `Tuition: $${s.tuition.toLocaleString()} ${s.currency || ''}` : '',
      s.curriculumType ? `Curriculum: ${s.curriculumType}` : '',
      s.genderPolicy ? `Gender: ${s.genderPolicy}` : '',
      s.boardingAvailable != null ? `Boarding: ${s.boardingAvailable ? 'Yes' : 'No'}` : '',
      s.avgClassSize ? `Avg class size: ${s.avgClassSize}` : '',
      s.enrollment ? `Enrollment: ${s.enrollment}` : '',
      s.studentTeacherRatio ? `Student-teacher ratio: ${s.studentTeacherRatio}` : '',
      s.artsPrograms?.length ? `Arts: ${s.artsPrograms.join(', ')}` : '',
      s.sportsPrograms?.length ? `Sports: ${s.sportsPrograms.join(', ')}` : '',
      s.universityPlacements ? `University placements: ${s.universityPlacements}` : '',
      s.specializations?.length ? `Specializations: ${s.specializations.join(', ')}` : '',
      s.highlights?.length ? `Highlights: ${s.highlights.join('; ')}` : '',
    ].filter(Boolean).join(', ');
  }).join('\n');

  // E11b: Build dimensions from family priorities + standard dimensions
  const standardDimensions = [
    { key: 'budget', label: 'Budget Fit' },
    { key: 'commute', label: 'Commute' },
    { key: 'classSize', label: 'Class Size' }
  ];
  const priorityDimensions = (familyProfile?.priorities || []).map(p => ({
    key: p.toLowerCase().replace(/\s+/g, '_'),
    label: p,
    source: 'family_priority'
  }));
  const allDimensions = [...standardDimensions, ...priorityDimensions];

  // E11b: Response JSON schema for structured output
  const response_json_schema = {
    type: 'object',
    properties: {
      narrative: {
        type: 'string',
        description: 'Short (3-5 sentence) synthesis paragraph comparing the schools'
      },
      comparisonMatrix: {
        type: 'object',
        properties: {
          schools: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                isVisited: { type: 'boolean' }
              }
            }
          },
          dimensions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                label: { type: 'string' },
                source: { type: 'string', enum: ['standard', 'family_priority'] }
              }
            }
          },
          cells: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['match', 'unknown', 'mismatch'] },
                  value: { type: 'string' },
                  commentary: { type: 'string' }
                }
              }
            }
          },
          tradeOffs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                schoolId: { type: 'string' },
                text: { type: 'string' }
              }
            }
          }
        }
      }
    },
    required: ['narrative', 'comparisonMatrix']
  };

  const prompt = `${persona}

A parent is comparing these ${comparedSchools.length} schools:
${schoolSummaries}

Family brief context: ${briefSummary || 'Not provided'}

Family Priorities (use as dimensions for evaluation): ${familyProfile?.priorities?.join(', ') || 'Not specified'}

**Task 1: Write Narrative**
Write a SHORT (3–5 sentence) synthesis paragraph comparing these schools for this specific family. 
- Highlight the most meaningful differences
- Call out tradeoffs relevant to their priorities/budget
- End with a practical suggestion or question
- Do NOT use bullet points. Write as flowing conversational prose.
- Do NOT repeat the school names in a list. Weave them naturally into the narrative.

**Task 2: Generate Comparison Matrix**
For each school and each dimension listed below, determine:
- status: 'match' (data confirms the priority/need is met), 'unknown' (insufficient data to evaluate), or 'mismatch' (data shows it does not meet the need)
- value: brief factual data point (e.g. "$45,000", "25 min drive", "avg 12 students")
- commentary: 1-sentence interpretation in context of family brief

Dimensions to evaluate:
${allDimensions.map(d => `- ${d.label} (${d.source})`).join('\n')}

Standard dimensions context:
- Budget Fit: Compare tuition to family's max budget
- Commute: Evaluate distance against location preference
- Class Size: Compare avgClassSize to typical preferences

For each school, identify 1-2 key trade-offs worth mentioning (e.g., "Higher cost but stronger program").`;

  // Inject a loading placeholder first
  const loadingMsg = {
    role: 'assistant',
    content: '...',
    timestamp: new Date().toISOString(),
    isNudge: true,
  };
  setMessages(prev => [...prev, loadingMsg]);

  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema
    });

    // result is now a parsed object with { narrative, comparisonMatrix }
    const narrativeText = result?.narrative || 'Unable to generate comparison.';
    
    // E11b: Store structured matrix for later use
    if (result?.comparisonMatrix) {
      setComparisonMatrix(result.comparisonMatrix);
    }

    setMessages(prev => {
      const updated = [...prev];
      // Replace the last loading message with the narrative
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].content === '...') {
          updated[i] = { ...updated[i], content: narrativeText };
          break;
        }
      }
      return updated;
    });

    // E11b Phase 2: Persist comparison matrix as GeneratedArtifact (fire-and-forget)
    if (result?.comparisonMatrix && familyProfile?.id) {
      (async () => {
        try {
          const schoolIds = comparedSchools.map(s => s.id).filter(Boolean);
          await base44.entities.GeneratedArtifact.create({
            artifactType: 'comparison',
            familyProfileId: familyProfile.id,
            content: JSON.stringify({ matrix: result.comparisonMatrix, narrative: narrativeText }),
            schoolIds,
            createdAt: new Date().toISOString()
          });
        } catch (artifactError) {
          console.warn('[E11b] Failed to persist comparison artifact (non-blocking):', artifactError.message);
        }
      })();
    }
  } catch (e) {
    console.error('Comparison synthesis failed:', e);
    setMessages(prev => prev.filter(m => m.content !== '...'));
  }
}