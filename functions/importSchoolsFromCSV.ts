import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { csvUrl, importBatchId, deleteExisting = false } = await req.json();

    if (!csvUrl) {
      return Response.json({ error: 'csvUrl required' }, { status: 400 });
    }

    if (!importBatchId) {
      return Response.json({ error: 'importBatchId required' }, { status: 400 });
    }

    console.log('Fetching CSV from URL:', csvUrl);

    // Fetch the CSV file
    const csvResponse = await fetch(csvUrl);
    if (!csvResponse.ok) {
      return Response.json({ error: 'Failed to fetch CSV file' }, { status: 400 });
    }

    const csvText = await csvResponse.text();
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    console.log(`CSV has ${lines.length - 1} rows and ${headers.length} columns`);

    // Parse CSV manually
    const schools = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Simple CSV parser (handles quoted values)
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      // Map CSV row to school object
      const school = {};
      headers.forEach((header, idx) => {
        let value = values[idx] || '';
        
        // Remove surrounding quotes
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }

        // Skip empty values
        if (!value || value === '' || value === 'NULL' || value === 'null') {
          return;
        }

        // Parse JSON arrays or objects - these need special handling
        if ((value.startsWith('[') && value.endsWith(']')) || (value.startsWith('{') && value.endsWith('}'))) {
          try {
            // Handle CSV-escaped quotes (double quotes)
            let cleanValue = value.replace(/""/g, '"');
            
            // Try to parse as JSON
            school[header] = JSON.parse(cleanValue);
          } catch (e) {
            // If JSON parsing fails, try as a simple comma-separated list for arrays
            if (value.startsWith('[') && value.endsWith(']')) {
              const inner = value.slice(1, -1).trim();
              if (inner) {
                school[header] = inner.split(',').map(item => item.trim());
              } else {
                school[header] = [];
              }
            }
            // For objects, if parsing fails, convert to JSON string
            else {
              school[header] = value;
            }
          }
        }
        // Parse booleans
        else if (value === 'TRUE' || value === 'true') {
          school[header] = true;
        } else if (value === 'FALSE' || value === 'false') {
          school[header] = false;
        }
        // Parse numbers
        else if (!isNaN(value) && value !== '') {
          school[header] = Number(value);
        }
        // Keep as string
        else {
          school[header] = value;
        }
      });

      schools.push(school);
    }

    console.log(`Parsed ${schools.length} schools from CSV`);

    // Delete existing schools if requested
    if (deleteExisting) {
      console.log('Deleting all existing schools...');
      const existingSchools = await base44.asServiceRole.entities.School.filter({}, '-created_date', 10000);
      console.log(`Found ${existingSchools.length} existing schools to delete`);
      
      for (const school of existingSchools) {
        await base44.asServiceRole.entities.School.delete(school.id);
      }
      console.log('Deletion complete');
    }

    // Helper function to generate slug
    const generateSlug = (name) => {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    };

    // Enrich schools with defaults and importBatchId
    const enrichedSchools = schools.map(school => ({
      ...school,
      slug: school.slug || generateSlug(school.name),
      status: school.status || 'active',
      verified: school.verified ?? false,
      claimStatus: school.claimStatus || 'unclaimed',
      membershipTier: school.membershipTier || 'basic',
      subscriptionTier: school.subscriptionTier || 'free',
      importBatchId,
      is_sample: false
    }));

    // Import schools in batches of 50
    const batchSize = 50;
    let imported = 0;
    let errors = [];

    for (let i = 0; i < enrichedSchools.length; i += batchSize) {
      const batch = enrichedSchools.slice(i, i + batchSize);
      console.log(`Importing batch ${Math.floor(i / batchSize) + 1} (${batch.length} schools)...`);

      try {
        await base44.asServiceRole.entities.School.bulkCreate(batch);
        imported += batch.length;
        console.log(`Batch ${Math.floor(i / batchSize) + 1} imported successfully`);
      } catch (error) {
        console.error(`Error importing batch ${Math.floor(i / batchSize) + 1}:`, error.message);
        errors.push({
          batch: Math.floor(i / batchSize) + 1,
          error: error.message
        });
      }
    }

    return Response.json({
      success: true,
      totalSchools: schools.length,
      imported,
      errors: errors.length > 0 ? errors : undefined,
      deletedExisting: deleteExisting
    });

  } catch (error) {
    console.error('Import error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});