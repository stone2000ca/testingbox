import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function constructDomainFromName(schoolName) {
  // Remove common suffixes and clean up
  let clean = schoolName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  // Try common TLDs for Canadian schools
  return `${clean}.ca`;
}

function getDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

function getClearbitUrl(domain) {
  return `https://logo.clearbit.com/${domain}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Fetch all schools without headerPhotoUrl
    const allSchools = await base44.asServiceRole.entities.School.list('-updated_date', 1000);
    const missingPhotos = allSchools.filter(s => !s.headerPhotoUrl);
    
    console.log(`Found ${missingPhotos.length} schools without headerPhotoUrl`);
    
    const updates = [];
    const failed = [];
    
    for (const school of missingPhotos) {
      let domain = null;
      
      // Try to get domain from website
      if (school.website) {
        domain = getDomainFromUrl(school.website);
      }
      
      // If no website or failed to parse, construct from name
      if (!domain) {
        domain = constructDomainFromName(school.name);
      }
      
      const headerPhotoUrl = getClearbitUrl(domain);
      
      try {
        await base44.asServiceRole.entities.School.update(school.id, {
          headerPhotoUrl
        });
        
        updates.push({
          id: school.id,
          name: school.name,
          domain,
          headerPhotoUrl
        });
      } catch (e) {
        failed.push({
          id: school.id,
          name: school.name,
          error: e.message
        });
      }
    }
    
    return Response.json({
      totalMissing: missingPhotos.length,
      updated: updates.length,
      failed: failed.length,
      schools: missingPhotos.map(s => s.name)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});