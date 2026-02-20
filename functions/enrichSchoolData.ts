import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { schoolId } = await req.json();

    if (!schoolId) {
      return Response.json({ error: 'schoolId is required' }, { status: 400 });
    }

    const school = await base44.entities.School.get(schoolId);
    if (!school) {
      return Response.json({ error: 'School not found' }, { status: 404 });
    }
    if (!school.website) {
      return Response.json({ error: 'School website not available for enrichment' }, { status: 400 });
    }

    // Fetch website content
    let websiteContent = '';
    try {
      const response = await fetch(school.website, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (response.ok) {
        websiteContent = await response.text();
      }
    } catch (error) {
      console.error('Failed to fetch website:', error);
    }

    if (!websiteContent) {
      return Response.json({ error: 'Could not fetch website content' }, { status: 500 });
    }

    // Define extraction schema
    const extractionSchema = {
      type: "object",
      properties: {
        avgClassSize: { type: ["number", "null"], description: "Average class size" },
        studentTeacherRatio: { type: ["string", "null"], description: "Student-to-teacher ratio (e.g., '1:10')" },
        financialAidAvailable: { type: ["boolean", "null"], description: "True if financial aid available" },
        specialEdPrograms: { type: ["array", "null"], items: { type: "string" }, description: "Special education programs" },
        religiousAffiliation: { type: ["string", "null"], description: "Religious affiliation or 'None'" },
        applicationDeadline: { type: ["string", "null"], description: "Application deadline" },
        phone: { type: ["string", "null"], description: "School phone number" },
        email: { type: ["string", "null"], description: "School email" },
        genderPolicy: { type: ["string", "null"], enum: ["Co-ed", "All-Boys", "All-Girls", "Co-ed with single-gender classes", null] },
        artsPrograms: { type: ["array", "null"], items: { type: "string" } },
        sportsPrograms: { type: ["array", "null"], items: { type: "string" } },
        clubs: { type: ["array", "null"], items: { type: "string" } },
        languages: { type: ["array", "null"], items: { type: "string" } },
        teachingPhilosophy: { type: ["string", "null"] },
        highlights: { type: ["array", "null"], items: { type: "string" } },
        openHouseDates: { type: ["array", "null"], items: { type: "string" } },
        enrollment: { type: ["number", "null"] },
        founded: { type: ["number", "null"] },
        transportationOptions: { type: ["string", "null"] },
        beforeAfterCare: { type: ["string", "null"] },
        uniformRequired: { type: ["boolean", "null"] },
        campusFeel: { type: ["string", "null"], enum: ["Warm and nurturing", "Rigorous and structured", "Progressive and creative", "Traditional and formal", null] },
        entranceRequirements: { type: ["string", "null"] },
        accreditations: { type: ["array", "null"], items: { type: "string" } },
        facilities: { type: ["array", "null"], items: { type: "string" } }
      }
    };

    const prompt = `Extract school information from this website content. Only extract information that is explicitly stated or clearly inferable. For fields not found, return null. 
    
For "religiousAffiliation": if no religion is mentioned and the school appears secular, use "None".
For "financialAidAvailable": true only if financial aid, scholarships, or bursaries are explicitly mentioned.
For "uniformRequired": true only if uniform/dress code is explicitly mandatory.
For boolean fields, return null if unclear.
For arrays, return empty array if nothing found.

Website content (first 5000 chars):
${websiteContent.substring(0, 5000)}`;

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: extractionSchema
    });

    // Filter out nulls and fields already populated
    const updates = {};
    for (const [key, value] of Object.entries(aiResponse)) {
      const existingValue = school[key];
      
      // Only update if extracted value is not null and existing field is empty
      if (
        value !== null &&
        value !== undefined &&
        !(Array.isArray(value) && value.length === 0) &&
        (!existingValue || (Array.isArray(existingValue) && existingValue.length === 0) || existingValue === '')
      ) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length > 0) {
      await base44.asServiceRole.entities.School.update(schoolId, updates);
      return Response.json({ 
        status: 'success', 
        schoolId, 
        updatedFields: Object.keys(updates),
        count: Object.keys(updates).length
      });
    } else {
      return Response.json({ 
        status: 'success', 
        schoolId, 
        message: 'No new fields to enrich' 
      });
    }
  } catch (error) {
    console.error('Error enriching school:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});