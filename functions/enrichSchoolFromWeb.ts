// Function: enrichSchoolFromWeb
// Purpose: Scrape a school's website, extract structured data via LLM, and create EnrichmentDiff records for admin review
// Entities: School (read), EnrichmentDiff (write)
// Last Modified: 2026-03-05
// Dependencies: Base44 InvokeLLM integration (Core)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// =============================================================================
// Strip HTML to plain text — removes noisy tags then strips all remaining tags
// =============================================================================
function stripHtml(html) {
  // Remove script, style, nav, footer, header blocks and their content
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

// =============================================================================
// The enrichable School fields and their LLM response schema
// =============================================================================
const ENRICHABLE_FIELDS = [
  'name', 'description', 'dayTuition', 'boardingTuition', 'enrollment',
  'avgClassSize', 'studentTeacherRatio', 'curriculumType', 'address', 'city',
  'provinceState', 'country', 'phone', 'email', 'website', 'missionStatement',
  'teachingPhilosophy', 'specializations', 'artsPrograms', 'sportsPrograms',
  'clubs', 'languages', 'religiousAffiliation', 'genderPolicy', 'schoolType',
  'facilities', 'financialAidAvailable', 'financialAidDetails',
  'applicationDeadline', 'admissionRequirements', 'entranceRequirements',
  'lowestGrade', 'highestGrade'
];

// Builds the JSON schema for the LLM response — each field is { value, confidence }
function buildResponseSchema() {
  const fieldEntry = {
    type: 'object',
    properties: {
      value: {},         // any type — LLM fills in
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
    },
    required: ['value', 'confidence'],
    additionalProperties: false
  };

  const properties = {};
  for (const field of ENRICHABLE_FIELDS) {
    properties[field] = {
      type: ['object', 'null'],
      properties: fieldEntry.properties,
      required: fieldEntry.required,
      additionalProperties: false
    };
  }

  return {
    name: 'school_enrichment',
    schema: {
      type: 'object',
      properties,
      required: ENRICHABLE_FIELDS,
      additionalProperties: false
    }
  };
}

const CONFIDENCE_MAP = { high: 0.9, medium: 0.6, low: 0.3 };

// =============================================================================
// MAIN: Deno.serve — enrichSchoolFromWeb
// =============================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    const { schoolId, websiteUrl } = await req.json();
    if (!schoolId) {
      return Response.json({ error: 'schoolId is required' }, { status: 400 });
    }

    // Step 1: Load school
    const schools = await base44.asServiceRole.entities.School.filter({ id: schoolId });
    if (!schools || schools.length === 0) {
      return Response.json({ error: 'School not found' }, { status: 404 });
    }
    const school = schools[0];
    const targetUrl = websiteUrl || school.website;

    if (!targetUrl) {
      return Response.json({ success: false, error: 'No website URL' });
    }

    console.log(`[ENRICH] School: ${school.name} | URL: ${targetUrl}`);

    // Step 2: Fetch website with timeout + browser-like UA
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let html = '';
    try {
      const fetchRes = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });
      html = await fetchRes.text();
    } finally {
      clearTimeout(timeout);
    }

    // Step 3: Strip HTML and truncate
    let pageText = stripHtml(html);
    if (pageText.length > 15000) {
      pageText = pageText.substring(0, 15000);
    }
    console.log(`[ENRICH] Page text length after strip: ${pageText.length}`);

    // Step 4: LLM extraction
    const extracted = await callOpenRouter({
      systemPrompt: 'You are a school data extraction expert. Extract structured school information from the provided website text. For each field, return an object with "value" and "confidence" (high/medium/low). Return null for fields not found on the page.',
      userPrompt: `Extract school information from this website content for the school "${school.name}".\n\nFor each field, return { value: <extracted value or null>, confidence: "high"|"medium"|"low" }.\n\nWEBSITE TEXT:\n${pageText}`,
      responseSchema: buildResponseSchema(),
      maxTokens: 2000,
      temperature: 0.1
    });

    // Step 5: Compare and create EnrichmentDiff records
    const batchId = `${schoolId}_${Date.now()}`;
    let diffsCreated = 0;

    for (const field of ENRICHABLE_FIELDS) {
      const extraction = extracted[field];
      if (!extraction || extraction.value === null || extraction.value === undefined) continue;

      const proposedValue = extraction.value;
      const currentValue = school[field];

      // Normalize to string for comparison
      const proposedStr = Array.isArray(proposedValue)
        ? JSON.stringify(proposedValue)
        : String(proposedValue);
      const currentStr = (currentValue === null || currentValue === undefined)
        ? ''
        : Array.isArray(currentValue)
          ? JSON.stringify(currentValue)
          : String(currentValue);

      // Only create a diff if the proposed value differs from current
      if (proposedStr === currentStr) continue;

      await base44.asServiceRole.entities.EnrichmentDiff.create({
        schoolId,
        field,
        currentValue: currentStr,
        proposedValue: proposedStr,
        confidence: CONFIDENCE_MAP[extraction.confidence] ?? 0.3,
        source: 'school website',
        sourceUrl: targetUrl,
        status: 'pending',
        batchId,
        createdAt: new Date().toISOString()
      });
      diffsCreated++;
    }

    console.log(`[ENRICH] Done. batchId=${batchId} diffsCreated=${diffsCreated}`);

    return Response.json({
      success: true,
      batchId,
      diffsCreated,
      schoolName: school.name
    });

  } catch (error) {
    console.error('[ENRICH] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});