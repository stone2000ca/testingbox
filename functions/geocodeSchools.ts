// Function: geocodeSchools
// Purpose: Batch geocode School records that have an address but are missing lat/lng values
// Entities: School
// Last Modified: 2026-03-14
// Dependencies: Google Maps Geocoding API

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    if (!apiKey) {
      return Response.json({ error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 500 });
    }

    // Parse request body for optional limit parameter
    let limit = 50;
    try {
      const body = await req.json();
      if (body.limit && typeof body.limit === 'number' && body.limit > 0) {
        limit = Math.min(body.limit, 100); // Cap at 100 to avoid excessive processing
      }
    } catch (_) {
      // No body or invalid JSON, use default limit
    }

    // Fetch schools with address but missing lat/lng
    console.log(`[geocodeSchools] Fetching schools with address but missing coordinates (limit: ${limit})`);
    const schools = await base44.asServiceRole.entities.School.filter({
      address: { $ne: null, $ne: '' },
      $or: [
        { lat: null },
        { lat: undefined },
        { lat: '' },
        { lng: null },
        { lng: undefined },
        { lng: '' }
      ]
    }, '-updated_date', limit);

    if (schools.length === 0) {
      console.log('[geocodeSchools] No schools found needing geocoding');
      return Response.json({ processed: 0, updated: 0, failed: 0, errors: [] });
    }

    console.log(`[geocodeSchools] Found ${schools.length} schools to geocode`);

    let processed = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];
    const batchSize = 10;
    const delayMs = 200;

    // Process in batches
    for (let i = 0; i < schools.length; i += batchSize) {
      const batch = schools.slice(i, i + batchSize);
      
      for (const school of batch) {
        try {
          // Construct geocoding query
          const parts = [
            school.address,
            school.city,
            school.provinceState,
            school.country
          ].filter(p => p && p.trim());
          
          const query = parts.join(', ');
          
          if (!query || query.trim().length === 0) {
            console.warn(`[geocodeSchools] School ${school.id} (${school.name}) has no valid address parts`);
            failed++;
            errors.push(`School ${school.id}: No valid address parts`);
            processed++;
            continue;
          }

          // Call Google Maps Geocoding API
          const encodedQuery = encodeURIComponent(query);
          const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedQuery}&key=${apiKey}`;
          
          const response = await fetch(url);
          const data = await response.json();

          if (data.status === 'OK' && data.results && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            const lat = location.lat;
            const lng = location.lng;

            // Update school with coordinates
            await base44.asServiceRole.entities.School.update(school.id, {
              lat,
              lng
            });

            console.log(`[geocodeSchools] Updated ${school.name} (${school.id}): lat=${lat}, lng=${lng}`);
            updated++;
          } else {
            const errorMsg = data.status === 'ZERO_RESULTS' 
              ? 'No results found for address'
              : data.error_message || data.status || 'Unknown error';
            
            console.warn(`[geocodeSchools] Geocoding failed for ${school.name} (${school.id}): ${errorMsg}`);
            failed++;
            errors.push(`School ${school.id} (${school.name}): ${errorMsg}`);
          }

          processed++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[geocodeSchools] Error processing school ${school.id}:`, errorMsg);
          failed++;
          errors.push(`School ${school.id}: ${errorMsg}`);
          processed++;
        }
      }

      // Add delay between batches to avoid rate limits
      if (i + batchSize < schools.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    console.log(`[geocodeSchools] Complete: processed=${processed}, updated=${updated}, failed=${failed}`);
    
    return Response.json({ processed, updated, failed, errors });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[geocodeSchools] Fatal error:', errorMsg);
    return Response.json({ error: errorMsg, processed: 0, updated: 0, failed: 0, errors: [errorMsg] }, { status: 500 });
  }
});