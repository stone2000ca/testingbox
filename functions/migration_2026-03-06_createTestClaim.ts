// MIGRATION — DELETE AFTER RUNNING — Purpose: Create a single QA test SchoolClaim record for Crescent School
// Function: migration_2026-03-06_createTestClaim
// Purpose: One-time QA test data creation — creates a SchoolClaim record for Gerald Wayne at Crescent School
// Entities: SchoolClaim
// Last Modified: 2026-03-06
// Dependencies: none

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const claim = await base44.asServiceRole.entities.SchoolClaim.create({
      schoolId: '699df56c52c61c01916abda1',
      claimantName: 'Gerald Wayne',
      claimantRole: 'Head of School',
      claimantEmail: 'geraldwoffice@gmail.com',
      verificationMethod: 'email_domain',
      status: 'pending',
    });

    return Response.json({ success: true, claim });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});