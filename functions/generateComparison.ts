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

    return Response.json(comparison);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});