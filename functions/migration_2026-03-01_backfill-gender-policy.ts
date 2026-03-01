// MIGRATION — DELETE AFTER RUNNING
// Function: migration_2026-03-01_backfill-gender-policy
// Purpose: Set genderPolicy = 'Co-ed' on all active School records where genderPolicy is null
// Entities: School
// Last Modified: 2026-03-01
// Dependencies: none

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const schools = await base44.asServiceRole.entities.School.filter({}, '-created_date', 2000);
  
  const toUpdate = schools.filter(s => 
    s.status === 'active' && 
    (s.genderPolicy === null || s.genderPolicy === undefined || s.genderPolicy === '') &&
    s.schoolType !== 'All-Boys' &&
    s.schoolType !== 'All-Girls'
  );

  console.log(`[MIGRATION] Found ${toUpdate.length} schools to backfill with Co-ed`);

  let updated = 0;
  let failed = 0;
  for (const school of toUpdate) {
    try {
      await base44.asServiceRole.entities.School.update(school.id, { genderPolicy: 'Co-ed' });
      updated++;
    } catch (e) {
      console.error(`Failed to update ${school.name}:`, e.message);
      failed++;
    }
  }

  return Response.json({ 
    total: toUpdate.length, 
    updated, 
    failed,
    message: `Backfilled ${updated} schools with genderPolicy=Co-ed`
  });
});