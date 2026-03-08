// Function: generateComparison
// Purpose: Generate AI-powered school comparison matrix and insights, with premium content gating
// Entities: School, FamilyProfile, GeneratedArtifact, User
// Last Modified: 2026-03-06
// Dependencies: Base44 InvokeLLM

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { schoolIds, familyProfileId, userId } = await req.json();

    if (!schoolIds || schoolIds.length < 2 || schoolIds.length > 3) {
      return Response.json({ error: 'Provide 2-3 school IDs' }, { status: 400 });
    }

    // E24-S3-WC1: Resolve user tier for premium content gating
    let isPremiumUser = false;
    if (userId) {
      try {
        const userRecords = await base44.asServiceRole.entities.User.filter({ id: userId });
        const userTier = userRecords?.[0]?.tier || 'free';
        isPremiumUser = userTier === 'premium';
        console.log('[E24-S3-WC1] userId:', userId, 'tier:', userTier, 'isPremium:', isPremiumUser);
      } catch (tierErr) {
        console.warn('[E24-S3-WC1] Failed to fetch user tier (defaulting to free):', tierErr.message);
      }
    }

    // Fetch schools
    const schools = await Promise.all(
      schoolIds.map(id => base44.entities.School.filter({ id }).then(arr => arr[0]))
    );

    // Fetch FamilyProfile if provided
    let familyProfile = null;
    if (familyProfileId) {
      try {
        const profiles = await base44.entities.FamilyProfile.filter({ id: familyProfileId });
        familyProfile = profiles?.[0] || null;
      } catch (e) { console.warn('[COMPARISON] FamilyProfile fetch failed:', e.message); }
    }

    // E29-016: Fetch active FamilyJourney for journey insights
    let activeJourney = null;
    let schoolJourneys = [];
    if (userId) {
      try {
        const journeys = await base44.entities.FamilyJourney.filter({ userId });
        activeJourney = journeys?.find(j => !j.isArchived) || null;
        if (activeJourney?.schoolJourneys) {
          schoolJourneys = Array.isArray(activeJourney.schoolJourneys) ? activeJourney.schoolJourneys : JSON.parse(activeJourney.schoolJourneys);
        }
        console.log('[E29-016] FamilyJourney fetched:', activeJourney?.id, 'schoolJourneys count:', schoolJourneys.length);
      } catch (journeyErr) {
        console.warn('[E29-016] FamilyJourney fetch failed:', journeyErr.message);
      }
    }

    // Build comparison structure
    const comparison = {
      schools: schools.map(s => ({
        id: s.id,
        name: s.name,
        heroImage: s.headerPhotoUrl || s.heroImage || null,
        city: s.city,
        region: s.region
      })),
      categories: [
        {
          name: 'Basic Info',
          rows: [
            { label: 'Location', values: schools.map(s => `${s.city}, ${s.provinceState}`) },
            { label: 'Grades', values: schools.map(s => s.gradesServed || (s.lowestGrade && s.highestGrade ? s.lowestGrade + '-' + s.highestGrade : 'N/A')) },
            { label: 'Enrollment', values: schools.map(s => s.enrollment?.toLocaleString()) },
            { label: 'Founded', values: schools.map(s => s.founded) },
            { label: 'Curriculum', values: schools.map(s => s.curriculumType) }
          ]
        },
        {
          name: 'Academics',
          rows: [
            { label: 'Avg Class Size', values: schools.map(s => s.avgClassSize) },
            { label: 'Student:Teacher', values: schools.map(s => s.studentTeacherRatio) },
            { label: 'Specializations', values: schools.map(s => s.specializations?.join(', ') || 'None') }
          ]
        },
        {
          name: 'Cost',
          rows: [
            { 
              label: 'Annual Tuition', 
              values: schools.map(s => `${s.currency} ${s.tuition?.toLocaleString()}`) 
            },
            { 
              label: 'Financial Aid', 
              values: schools.map(s => s.financialAidAvailable ? 'Available' : 'Not available') 
            }
          ]
        },
        {
          name: 'Programs',
          rows: [
            { label: 'Arts', values: schools.map(s => s.artsPrograms?.slice(0, 3).join(', ') || 'None') },
            { label: 'Sports', values: schools.map(s => s.sportsPrograms?.slice(0, 3).join(', ') || 'None') },
            { label: 'Languages', values: schools.map(s => s.languages?.join(', ') || 'None') }
          ]
        }
      ]
    };

    // E29-016: Add Journey Insights category for premium users (only if journey data exists)
    if (isPremiumUser && activeJourney && schoolJourneys.length > 0) {
      const journeyRows = [
        {
          label: 'Post-Visit Fit',
          values: schools.map(s => {
            const sj = schoolJourneys.find(j => j.schoolId === s.id);
            return sj?.postVisitFitLabel || 'Not yet visited';
          })
        },
        {
          label: 'Visit Verdict',
          values: schools.map(s => {
            const sj = schoolJourneys.find(j => j.schoolId === s.id);
            return sj?.visitVerdict || 'Pending';
          })
        },
        {
          label: 'Fit Direction',
          values: schools.map(s => {
            const sj = schoolJourneys.find(j => j.schoolId === s.id);
            return sj?.fitDirection || '-';
          })
        },
        {
          label: 'Key Strengths',
          values: schools.map(s => {
            const sj = schoolJourneys.find(j => j.schoolId === s.id);
            return (sj?.revisedStrengths || []).join(', ') || 'TBD';
          })
        },
        {
          label: 'Open Concerns',
          values: schools.map(s => {
            const sj = schoolJourneys.find(j => j.schoolId === s.id);
            return (sj?.revisedConcerns || []).join(', ') || 'None';
          })
        },
        {
          label: 'Status',
          values: schools.map(s => {
            const sj = schoolJourneys.find(j => j.schoolId === s.id);
            return sj?.status || 'MATCHED';
          })
        }
      ];
      comparison.categories.push({
        name: 'Journey Insights',
        rows: journeyRows
      });
      console.log('[E29-016] Journey Insights category added for premium user');
    }

    // Generate AI insights
    const insightsPrompt = `Compare these schools and provide 3-4 key insights for parents:

${schools.map((s, i) => `
School ${i + 1}: ${s.name}
- Location: ${s.city}, ${s.region}
- Tuition: ${s.currency} ${s.tuition}
- Curriculum: ${s.curriculumType}
- Class size: ${s.avgClassSize}
- Specializations: ${s.specializations?.join(', ')}
- Programs: Arts (${s.artsPrograms?.length}), Sports (${s.sportsPrograms?.length})
`).join('\n')}

Return JSON with array of insights (each 1-2 sentences highlighting key differences):`;

    let insights = { insights: [] };
    try {
      insights = await base44.integrations.Core.InvokeLLM({
        prompt: insightsPrompt,
        model: 'gpt-5',
        response_json_schema: {
          type: "object",
          properties: {
            insights: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      });
    } catch (llmError) {
      console.warn('[E25-S5] InvokeLLM for insights failed (returning empty insights):', llmError.message);
    }

    // Build family-personalized comparisonMatrix
    const priorities = familyProfile?.priorities || [];
    const dealbreakers = familyProfile?.dealbreakers || [];
    const prioritySet = new Set(priorities.map(p => p.toLowerCase()));

    const comparisonMatrix = {
      schools: comparison.schools,
      dimensions: comparison.categories.flatMap(cat => {
        // Journey Insights category doesn't get relevance scoring
        if (cat.name === 'Journey Insights') {
          return cat.rows.map(row => ({
            category: cat.name,
            label: row.label,
            values: row.values
          }));
        }
        // Other categories get relevance scoring
        return cat.rows.map(row => ({
          category: cat.name,
          label: row.label,
          values: row.values,
          relevance: (() => { const label = row.label.toLowerCase(); const isP = [...prioritySet].some(p => label.includes(p) || p.includes(label) || label.split(' ').some(w => p.includes(w))); return isP ? 'priority' : null; })()
            || (dealbreakers?.some(d => { const label = row.label.toLowerCase(); const db = d.toLowerCase(); return label.includes(db) || db.includes(label) || db.split(' ').some(w => w.length > 3 && label.includes(w)); }) ? 'dealbreaker' : 'neutral')
        }));
      })
    };

    // E24-S3-WC1: Gate premium content for non-premium users
    let finalInsights = insights.insights;
    let isLocked = false;

    if (!isPremiumUser) {
      finalInsights = null;
      // Strip relevance tags so priority/dealbreaker highlighting is premium-only
      comparisonMatrix.dimensions = comparisonMatrix.dimensions.map(({ relevance, ...rest }) => rest);
      isLocked = true;
      console.log('[E24-S3-WC1] Comparison insights and relevance tags gated for non-premium user');
    }

    comparison.insights = finalInsights;

    // Persist to GeneratedArtifact (non-blocking)
    if (familyProfileId) {
      try {
        const artifactKey = [...schoolIds].sort().join('_');
        const existing = await base44.entities.GeneratedArtifact.filter({
          familyProfileId,
          artifactType: 'comparison'
        });
        const found = existing?.find(a => a.artifactKey === artifactKey);

        const artifactData = {
          familyProfileId,
          artifactType: 'comparison',
          artifactKey,
          content: {
            comparisonMatrix,
            insights: finalInsights,
            isLocked,
            tradeoffNarration
          },
          generatedAt: new Date().toISOString()
        };

        if (found) {
          await base44.entities.GeneratedArtifact.update(found.id, artifactData);
          console.log('[COMPARISON] GeneratedArtifact updated:', found.id);
        } else {
          const created = await base44.entities.GeneratedArtifact.create(artifactData);
          console.log('[COMPARISON] GeneratedArtifact created:', created.id);
        }
      } catch (persistError) {
        console.error('[COMPARISON] GeneratedArtifact persistence failed (non-blocking):', persistError.message);
      }
    }

    return Response.json({ 
      ...comparison, 
      comparisonMatrix, 
      isLocked,
      journeyPhase: activeJourney?.currentPhase || null,
      tradeoffNarration
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});