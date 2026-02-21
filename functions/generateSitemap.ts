import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Fetch all schools
    const schools = await base44.asServiceRole.entities.School.filter({ 
      status: 'active',
      claimStatus: 'claimed'
    });

    // Fetch all blog posts (if Blog entity exists)
    let blogs = [];
    try {
      blogs = await base44.asServiceRole.entities.Blog.filter({ 
        published: true 
      });
    } catch (e) {
      console.log('Blog entity not found, skipping blogs in sitemap');
    }

    const baseUrl = Deno.env.get('APP_URL') || 'https://nextschool.ca';
    const today = new Date().toISOString().split('T')[0];

    // Build sitemap XML
    let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Homepage
    sitemap += `  <url>
    <loc>${baseUrl}/Home</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>\n`;

    // Consultant page
    sitemap += `  <url>
    <loc>${baseUrl}/Consultant</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>\n`;

    // School Directory
    sitemap += `  <url>
    <loc>${baseUrl}/SchoolDirectory</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;

    // Static pages
    const staticPages = [
      { path: 'About', priority: '0.7', changefreq: 'monthly' },
      { path: 'Privacy', priority: '0.5', changefreq: 'yearly' },
      { path: 'Terms', priority: '0.5', changefreq: 'yearly' },
      { path: 'HowItWorks', priority: '0.7', changefreq: 'monthly' },
      { path: 'ForSchools', priority: '0.7', changefreq: 'monthly' },
      { path: 'Guides', priority: '0.6', changefreq: 'monthly' },
      { path: 'Pricing', priority: '0.7', changefreq: 'monthly' },
      { path: 'ClaimSchool', priority: '0.6', changefreq: 'monthly' }
    ];

    for (const page of staticPages) {
      sitemap += `  <url>
    <loc>${baseUrl}/${page.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>\n`;
    }

    // All school profiles
    for (const school of schools) {
      const lastMod = school.updated_date ? school.updated_date.split('T')[0] : today;
      sitemap += `  <url>
    <loc>${baseUrl}/SchoolProfile?id=${school.id}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
    }

    // All blog posts
    for (const blog of blogs) {
      const lastMod = blog.updated_date ? blog.updated_date.split('T')[0] : today;
      sitemap += `  <url>
    <loc>${baseUrl}/Blog/${blog.slug}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>\n`;
    }

    sitemap += '</urlset>';

    return new Response(sitemap, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=86400' // 24 hour cache
      }
    });
  } catch (error) {
    console.error('Sitemap generation failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});