// Function: deleteSchoolsFromCsv
// Purpose: Reads a CSV file containing school IDs and removes matching School records from database
// Entities: School
// Last Modified: 2026-03-03
// Dependencies: Papa Parse

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Papa from 'npm:papaparse';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Only admins can delete schools
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { fileUrl } = await req.json();
    
    if (!fileUrl) {
      return Response.json({ error: 'fileUrl is required' }, { status: 400 });
    }

    console.log('[DELETE] Fetching CSV from:', fileUrl);
    
    // Fetch the CSV file
    const csvResponse = await fetch(fileUrl);
    if (!csvResponse.ok) {
      throw new Error(`Failed to fetch CSV: ${csvResponse.status}`);
    }
    
    const csvText = await csvResponse.text();
    
    // Parse CSV
    const result = Papa.parse(csvText, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      delimiter: ','
    });
    
    if (result.errors.length > 0) {
      console.error('[DELETE] CSV parse errors:', result.errors);
      return Response.json({ 
        error: 'CSV parse error', 
        details: result.errors 
      }, { status: 400 });
    }

    const data = result.data;
    console.log('[DELETE] Parsed', data.length, 'rows from CSV');

    // Extract IDs from CSV (filter empty/invalid IDs)
    const idsToDelete = data
      .map((row) => row.id?.trim())
      .filter((id) => id && id !== '');

    console.log('[DELETE] Found', idsToDelete.length, 'valid IDs to delete');

    if (idsToDelete.length === 0) {
      return Response.json({
        success: true,
        deleted: 0,
        skipped: 0,
        errors: []
      });
    }

    // Delete schools in batches (max 50 per request to avoid rate limits)
    let deleted = 0;
    let notFound = 0;
    let errors = [];
    const batchSize = 50;

    for (let i = 0; i < idsToDelete.length; i += batchSize) {
      const batch = idsToDelete.slice(i, i + batchSize);
      
      for (const id of batch) {
        try {
          // Throttle requests (100ms between each)
          await new Promise(resolve => setTimeout(resolve, 100));

          // Check if school exists
          const existing = await base44.entities.School.filter({ id });
          
          if (existing.length > 0) {
            await base44.entities.School.delete(id);
            deleted++;
            console.log('[DELETE] Deleted school:', id);
          } else {
            notFound++;
            console.log('[DELETE] School not found:', id);
          }
        } catch (e) {
          console.error('[DELETE ERROR]', id, e.message);
          errors.push({ id, error: e.message });
        }
      }
    }

    console.log('[DELETE COMPLETE]', { deleted, notFound, errors: errors.length });

    return Response.json({
      success: true,
      deleted,
      notFound,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    console.error('[DELETE FATAL]', error);
    return Response.json({ 
      error: error.message || 'Delete failed' 
    }, { status: 500 });
  }
});