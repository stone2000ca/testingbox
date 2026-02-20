import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function tryFetchOgImage(url, timeout = 5000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const html = await response.text();
      const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      if (ogImageMatch && ogImageMatch[1]) {
        return ogImageMatch[1];
      }
    }
  } catch (e) {
    // Timeout or error
  }
  return null;
}

function generatePossibleDomains(name, slug) {
  const domains = [];
  const variants = [name.toLowerCase().replace(/\s+/g, '-'), slug];
  const extensions = ['.ca', '.com', '.org', '.edu', '.co.uk'];
  
  for (const variant of variants) {
    for (const ext of extensions) {
      domains.push(`https://www.${variant}${ext}`);
      domains.push(`https://${variant}${ext}`);
    }
  }
  
  return [...new Set(domains)]; // Remove duplicates
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { schoolIds, batchSize = 5 } = await req.json();

    // Fetch schools to update
    let schools = [];
    if (schoolIds && schoolIds.length > 0) {
      schools = await Promise.all(
        schoolIds.map(id => base44.asServiceRole.entities.School.get(id))
      );
    } else {
      schools = await base44.asServiceRole.entities.School.filter({});
      schools = schools.filter(s => !s.headerPhotoUrl).slice(0, batchSize);
    }

    const updated = [];
    
    for (const school of schools) {
      let headerPhotoUrl = null;
      let websiteUrl = school.website;

      // Step 1: Try to fetch og:image from known website
      if (websiteUrl) {
        headerPhotoUrl = await tryFetchOgImage(websiteUrl);
      }

      // Step 2: If no website or og:image, try possible domain patterns
      if (!headerPhotoUrl) {
        const slug = school.slug || school.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const possibleDomains = generatePossibleDomains(school.name, slug);
        
        for (const domain of possibleDomains) {
          headerPhotoUrl = await tryFetchOgImage(domain);
          if (headerPhotoUrl) {
            websiteUrl = domain;
            break;
          }
        }
      }

      // Step 3: Try Clearbit logo as last resort for real image
      if (!headerPhotoUrl && websiteUrl) {
        try {
          const domain = new URL(websiteUrl).hostname;
          const clearbitUrl = `https://logo.clearbit.com/${domain}`;
          const response = await fetch(clearbitUrl, { redirect: 'follow' });
          if (response.ok && response.status === 200) {
            headerPhotoUrl = clearbitUrl;
          }
        } catch (e) {
          // Clearbit fetch failed
        }
      }

      // Step 4: Update school only if we found a real image
      if (headerPhotoUrl) {
        try {
          await base44.asServiceRole.entities.School.update(school.id, {
            headerPhotoUrl,
            website: websiteUrl || school.website
          });
          
          updated.push({
            name: school.name,
            source: headerPhotoUrl.includes('clearbit') ? 'clearbit' : 'og:image'
          });
        } catch (e) {
          console.error(`Update failed for ${school.name}`);
        }
      }
    }

    return Response.json({ 
      success: true,
      updated: updated.length,
      schools: updated
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});