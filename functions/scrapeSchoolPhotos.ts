// Function: scrapeSchoolPhotos
// Purpose: Crawl a school's website across known paths, extract image candidates, and store PhotoCandidate records for admin review
// Entities: School (read), PhotoCandidate (write)
// Last Modified: 2026-03-05
// Dependencies: Base44 SDK (entities), school website (external HTTP)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CRAWL_PATHS = ['', '/about', '/gallery', '/photos', '/campus', '/our-school', '/admissions', '/campus-life'];

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SKIP_EXTENSIONS = /\.(svg|gif|ico)(\?|$)/i;
const SKIP_PATTERNS = /\/(icon|logo|favicon|sprite|pixel|tracking|analytics|1x1|2x2)\b/i;
const DATA_URI = /^data:/i;

// Infer photo type from URL path, alt text, and page path
function inferType(imageUrl: string, altText: string, pageUrl: string): string {
  const combined = `${imageUrl} ${altText} ${pageUrl}`.toLowerCase();

  if (/hero|banner|header|landing|home|main[-_]image/.test(combined)) return 'hero';
  if (/classroom|learning|teaching|lesson|students[-_]in[-_]class/.test(combined)) return 'classroom';
  if (/sport|gym|field|court|pool|athlete|soccer|hockey|basketball|tennis|track/.test(combined)) return 'sports';
  if (/campus|building|facility|exterior|grounds|aerial|architecture/.test(combined)) return 'campus';
  return 'general';
}

// Resolve a potentially relative URL against a base
function resolveUrl(src: string, base: string): string | null {
  try {
    if (DATA_URI.test(src)) return null;
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

// Normalise base URL (strip trailing slash, ensure https where ambiguous)
function normaliseBase(url: string): string {
  let u = url.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

// Fetch page HTML with timeout and browser UA
async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// HEAD request to get file size; returns null if unavailable or < threshold
async function getFileSize(url: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': BROWSER_UA },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const len = res.headers.get('content-length');
    return len ? parseInt(len, 10) : null;
  } catch {
    return null;
  }
}

// Extract all image candidates from raw HTML + page URL
function extractImages(html: string, pageUrl: string, base: string): Array<{
  imageUrl: string;
  altText: string;
  widthAttr: number | null;
  heightAttr: number | null;
  pageUrl: string;
}> {
  const results: Array<{
    imageUrl: string;
    altText: string;
    widthAttr: number | null;
    heightAttr: number | null;
    pageUrl: string;
  }> = [];

  // Extract og:image
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch) {
    const resolved = resolveUrl(ogMatch[1], base);
    if (resolved) {
      results.push({ imageUrl: resolved, altText: 'og:image', widthAttr: null, heightAttr: null, pageUrl });
    }
  }

  // Extract <img> tags
  const imgRegex = /<img\b([^>]*?)(?:\/>|>)/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[1];

    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) continue;

    const src = srcMatch[1].trim();
    const resolved = resolveUrl(src, base);
    if (!resolved) continue;

    const altMatch = tag.match(/\balt=["']([^"']*)["']/i);
    const altText = altMatch ? altMatch[1].trim() : '';

    const widthMatch = tag.match(/\bwidth=["']?(\d+)["']?/i);
    const heightMatch = tag.match(/\bheight=["']?(\d+)["']?/i);
    const widthAttr = widthMatch ? parseInt(widthMatch[1], 10) : null;
    const heightAttr = heightMatch ? parseInt(heightMatch[1], 10) : null;

    results.push({ imageUrl: resolved, altText, widthAttr, heightAttr, pageUrl });
  }

  return results;
}

// Core filter logic
function shouldSkip(candidate: { imageUrl: string; widthAttr: number | null; heightAttr: number | null }): boolean {
  const url = candidate.imageUrl;

  if (DATA_URI.test(url)) return true;
  if (SKIP_EXTENSIONS.test(url)) return true;
  if (SKIP_PATTERNS.test(url)) return true;

  // Skip tracking pixel patterns in URL query strings
  if (/[?&](w=1|h=1|width=1|height=1)/.test(url)) return true;

  // Dimension filter: only apply if both attrs present and clearly too small
  if (candidate.widthAttr !== null && candidate.widthAttr < 400) return true;
  if (candidate.heightAttr !== null && candidate.heightAttr < 300) return true;

  // Skip 1x1 / 2x2 known patterns
  if (/[_\-/](1x1|2x2|pixel)[_\-./]/.test(url)) return true;

  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { schoolId, websiteUrl: inputWebsiteUrl } = body;

    if (!schoolId) {
      return Response.json({ error: 'schoolId is required' }, { status: 400 });
    }

    // Load school record
    const schools = await base44.entities.School.filter({ id: schoolId });
    if (!schools || schools.length === 0) {
      return Response.json({ error: 'School not found' }, { status: 404 });
    }
    const school = schools[0];

    const rawBase = inputWebsiteUrl || school.website;
    if (!rawBase) {
      return Response.json({ error: 'No website URL available for this school' }, { status: 400 });
    }

    const base = normaliseBase(rawBase);
    const batchId = `${schoolId}_${Date.now()}`;
    const seen = new Set<string>();
    const allCandidates: Array<{
      imageUrl: string;
      altText: string;
      widthAttr: number | null;
      heightAttr: number | null;
      pageUrl: string;
    }> = [];

    // Crawl each path sequentially to avoid hammering the server
    for (const path of CRAWL_PATHS) {
      const pageUrl = `${base}${path}`;
      const html = await fetchPage(pageUrl);
      if (!html) continue;

      const images = extractImages(html, pageUrl, base);
      for (const img of images) {
        if (!seen.has(img.imageUrl)) {
          seen.add(img.imageUrl);
          allCandidates.push(img);
        }
      }
      await new Promise(r => setTimeout(r, 500));
    }

    // Filter, HEAD-check, and build records
    const now = new Date().toISOString();
    const records = [];

    for (const candidate of allCandidates) {
      if (shouldSkip(candidate)) continue;

      // Skip non-image content types by checking extension (allow jpg/jpeg/png/webp already implicitly — we just blocked SVG/GIF/ICO above)
      // Require jpg/jpeg/png explicitly to avoid random document URLs
      if (!/\.(jpe?g|png|webp)(\?|$)/i.test(candidate.imageUrl)) continue;

      const fileSize = await getFileSize(candidate.imageUrl);
      if (fileSize !== null && fileSize < 20480) continue; // < 20KB

      records.push({
        schoolId,
        schoolName: school.name,
        imageUrl: candidate.imageUrl,
        pageUrl: candidate.pageUrl,
        source: 'website',
        altText: candidate.altText || '',
        inferredType: inferType(candidate.imageUrl, candidate.altText || '', candidate.pageUrl),
        widthAttr: candidate.widthAttr,
        heightAttr: candidate.heightAttr,
        fileSizeBytes: fileSize,
        status: 'pending',
        batchId,
        createdDate: now,
      });
    }

    // Bulk insert in chunks of 20
    const CHUNK = 20;
    for (let i = 0; i < records.length; i += CHUNK) {
      await base44.entities.PhotoCandidate.bulkCreate(records.slice(i, i + CHUNK));
    }

    return Response.json({
      success: true,
      batchId,
      candidatesCreated: records.length,
      schoolName: school.name,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});