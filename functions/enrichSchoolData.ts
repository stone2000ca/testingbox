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

    let school = await base44.entities.School.get(schoolId);
    if (!school) {
      return Response.json({ error: 'School not found' }, { status: 404 });
    }

    // Step 1: Intelligently find the correct school website using AI
    let schoolWebsite = school.website;
    if (!schoolWebsite) {
      console.log(`Discovering website for ${school.name} in ${school.city}, ${school.country}`);
      
      try {
        const websiteDiscoveryResult = await base44.integrations.Core.InvokeLLM({
          prompt: `Find the official website URL for the school: ${school.name}, located in ${school.city}, ${school.country || school.provinceState}. 
          
Return ONLY the official school website URL. If you cannot find a reliable URL, return null.
Make sure the URL starts with http:// or https://.`,
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: {
              website_url: { type: ["string", "null"], description: "The official school website URL" }
            }
          }
        });

        if (websiteDiscoveryResult.website_url) {
          schoolWebsite = websiteDiscoveryResult.website_url;
          console.log(`Found website: ${schoolWebsite}`);
          // Update the school record with the discovered website
          await base44.asServiceRole.entities.School.update(schoolId, { website: schoolWebsite });
          school.website = schoolWebsite;
        }
      } catch (error) {
        console.error('Failed to discover website:', error);
      }
    }

    if (!schoolWebsite) {
      return Response.json({ error: 'School website not available for enrichment', status: 'no_website' }, { status: 400 });
    }

    // Step 2: Fetch website content
    let websiteContent = '';
    try {
      // Ensure URL starts with http:// or https://
      let urlToFetch = schoolWebsite;
      if (!urlToFetch.startsWith('http://') && !urlToFetch.startsWith('https://')) {
        urlToFetch = 'https://' + urlToFetch;
      }

      const response = await fetch(urlToFetch, {
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

    // Step 3: If no website content, use AI general knowledge
    if (!websiteContent) {
      console.log('No website content available, will use AI general knowledge');
    }

    // Step 4: Define comprehensive extraction schema
    const extractionSchema = {
      type: "object",
      properties: {
        missionStatement: { type: ["string", "null"], description: "School's mission statement" },
        description: { type: ["string", "null"], description: "School description" },
        teachingPhilosophy: { type: ["string", "null"], description: "Teaching philosophy and approach" },
        genderPolicy: { type: ["string", "null"], enum: ["Co-ed", "All-Boys", "All-Girls", "Co-ed with single-gender classes", null], description: "Gender policy" },
        transportationOptions: { type: ["string", "null"], description: "Bus routes, shuttle, or transit information" },
        beforeAfterCare: { type: ["string", "null"], description: "Before and after school care hours" },
        uniformRequired: { type: ["boolean", "null"], description: "Whether uniform is required" },
        campusFeel: { type: ["string", "null"], enum: ["Warm and nurturing", "Rigorous and structured", "Progressive and creative", "Traditional and formal", null], description: "Overall campus atmosphere" },
        entranceRequirements: { type: ["string", "null"], description: "Entrance requirements (SSAT, interviews, etc.)" },
        avgClassSize: { type: ["number", "null"], description: "Average class size" },
        studentTeacherRatio: { type: ["string", "null"], description: "Student-to-teacher ratio (e.g., '1:10')" },
        financialAidAvailable: { type: ["boolean", "null"], description: "True if financial aid available" },
        specialEdPrograms: { type: ["array", "null"], items: { type: "string" }, description: "Special education programs" },
        religiousAffiliation: { type: ["string", "null"], description: "Religious affiliation or 'None'" },
        applicationDeadline: { type: ["string", "null"], description: "Application deadline" },
        phone: { type: ["string", "null"], description: "School phone number" },
        email: { type: ["string", "null"], description: "School email" },
        artsPrograms: { type: ["array", "null"], items: { type: "string" }, description: "Arts and music programs" },
        sportsPrograms: { type: ["array", "null"], items: { type: "string" }, description: "Sports and athletic programs" },
        clubs: { type: ["array", "null"], items: { type: "string" }, description: "Student clubs and organizations" },
        languages: { type: ["array", "null"], items: { type: "string" }, description: "Languages offered" },
        highlights: { type: ["array", "null"], items: { type: "string" }, description: "3 short highlight sentences about the school" },
        openHouseDates: { type: ["array", "null"], items: { type: "string" }, description: "Open house dates" },
        enrollment: { type: ["number", "null"], description: "Total student enrollment" },
        founded: { type: ["number", "null"], description: "Year school was founded" },
        accreditations: { type: ["array", "null"], items: { type: "string" }, description: "Accreditations and certifications" },
        facilities: { type: ["array", "null"], items: { type: "string" }, description: "Facilities (gym, library, labs, etc.)" }
      }
    };

    // Step 5: Extract data using AI - combining website content if available with AI's general knowledge
    const extractionPrompt = websiteContent 
      ? `Extract school information from this website content. Prioritize information from the website, but supplement with your general knowledge about the school if available.
      
Only extract information that is explicitly stated or clearly inferable. For fields not found, return null.

Instructions:
- For "religiousAffiliation": if no religion is mentioned and the school appears secular, use "None".
- For "financialAidAvailable": true only if financial aid, scholarships, or bursaries are explicitly mentioned.
- For "uniformRequired": true only if uniform/dress code is explicitly mandatory.
- For boolean fields, return null if unclear.
- For arrays, return empty array if nothing found.
- For "genderPolicy" and "campusFeel": only use the exact enum values provided, return null otherwise.

Website content:
${websiteContent.substring(0, 8000)}`
      : `Based on your knowledge of the school "${school.name}" in ${school.city}, ${school.country || school.provinceState}, extract the following information. 
      
For fields you're confident about, provide the information. For uncertain fields, return null.

Instructions:
- For "religiousAffiliation": if no religion is associated, use "None".
- For "financialAidAvailable": true only if the school is known to offer financial aid.
- For "uniformRequired": true only if the school is known to require uniforms.
- For boolean fields, return null if uncertain.
- For arrays, return empty array if nothing found.
- For "genderPolicy" and "campusFeel": only use the exact enum values provided, return null otherwise.`;

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: extractionPrompt,
      add_context_from_internet: !websiteContent, // Use internet context if we don't have website content
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