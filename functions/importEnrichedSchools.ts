// Function: importEnrichedSchools
// Purpose: Import enriched school data from CSV file and upsert into School entity
// Entities: School
// Last Modified: 2026-03-03
// Dependencies: PapaParse for CSV parsing

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Papa from 'npm:papaparse';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { fileUrl } = body;
    
    if (!fileUrl) {
      return Response.json({ error: 'fileUrl is required' }, { status: 400 });
    }

    // Fetch CSV file
    const csvResponse = await fetch(fileUrl);
    if (!csvResponse.ok) {
      throw new Error(`Failed to fetch CSV: ${csvResponse.status}`);
    }
    
    const csvText = await csvResponse.text();
    
    // Parse CSV
    const result = Papa.parse(csvText, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true
    });
    
    if (result.errors.length > 0) {
      return Response.json({ 
        error: 'CSV parsing failed', 
        details: result.errors 
      }, { status: 400 });
    }

    const rows = result.data || [];
    let created = 0;
    let updated = 0;
    const errors = [];

    for (const row of rows) {
      try {
        if (!row.name || !row.slug) {
          errors.push({ row: rows.indexOf(row), error: 'Missing required fields: name, slug' });
          continue;
        }

        // Find school by slug
        const existing = await base44.entities.School.filter({ slug: row.slug });

        if (existing.length > 0) {
          // Update existing school
          await base44.entities.School.update(existing[0].id, row);
          updated++;
        } else {
          // Create new school
          await base44.entities.School.create(row);
          created++;
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 50));
      } catch (err) {
        errors.push({ 
          row: rows.indexOf(row), 
          slug: row.slug, 
          error: err.message 
        });
      }
    }

    return Response.json({
      success: true,
      created,
      updated,
      total: rows.length,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    return Response.json({ 
      error: error.message || 'Import failed' 
    }, { status: 500 });
  }
});