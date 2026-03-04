import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { schoolIds, familyProfileId } = await req.json();

    if (!schoolIds || schoolIds.length < 2 || schoolIds.length > 3) {
      return Response.json({ error: 'Provide 2-3 school IDs' }, { status: 400 });
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

    // Build comparison structure
    const comparison = {
      schools: schools.map(s => ({
        id: s.id,
        name: s.name,
        heroImage: s.heroImage,
        city: s.city,
        region: s.region
      })),
      categories: [
        {
          name: 'Basic Info',
          rows: [
            { label: 'Location', values: schools.map(s => `${s.city}, ${s.provinceState}`) },
            { label: 'Grades', values: schools.map(s => s.gradesServed) },
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

    const insights = await base44.integrations.Core.InvokeLLM({
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

    comparison.insights = insights.insights;

    // Build family-personalized comparisonMatrix
    const priorities = familyProfile?.priorities || [];
    const dealbreakers = familyProfile?.dealbreakers || [];
    const prioritySet = new Set(priorities.map(p => p.toLowerCase()));

    const comparisonMatrix = {
      schools: comparison.schools,
      dimensions: comparison.categories.flatMap(cat => cat.rows.map(row => ({
        category: cat.name,
        label: row.label,
        values: row.values,
        relevance: prioritySet.has(row.label.toLowerCase()) ? 'priority'
          : dealbreakers?.some(d => row.label.toLowerCase().includes(d.toLowerCase())) ? 'dealbreaker'
          : 'neutral'
      })))
    };

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
            insights: comparison.insights
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

    return Response.json({ ...comparison, comparisonMatrix });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});