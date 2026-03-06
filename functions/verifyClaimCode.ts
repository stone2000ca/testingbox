// Function: verifyClaimCode
// Purpose: Server-side verification of email claim codes — compares submitted code against stored value, enforces expiry and rate limiting, and on success promotes claim to verified + creates SchoolAdmin + updates School
// Entities: SchoolClaim (read, update), SchoolAdmin (create), School (update)
// Last Modified: 2026-03-06
// Dependencies: none

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Require authenticated user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { claimId, code } = await req.json();

    if (!claimId || !code) {
      return Response.json({ success: false, error: 'claimId and code are required' }, { status: 400 });
    }

    // Fetch the claim server-side — never trust client
    const claims = await base44.asServiceRole.entities.SchoolClaim.filter({ id: claimId });
    if (!claims || claims.length === 0) {
      return Response.json({ success: false, error: 'Claim not found' }, { status: 404 });
    }
    const claim = claims[0];

    // Ensure the claim belongs to the requesting user
    if (claim.userId !== user.id) {
      return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Check if already verified
    if (claim.status === 'verified') {
      return Response.json({ success: false, error: 'This claim has already been verified.' });
    }

    // Check lock
    if (claim.lockedAt) {
      return Response.json({
        success: false,
        error: 'Too many failed attempts. This claim has been locked. Please contact support@nextschool.ca.'
      });
    }

    // Check attempt count
    const attemptCount = claim.attemptCount ?? 0;
    if (attemptCount >= MAX_ATTEMPTS) {
      // Lock the claim
      await base44.asServiceRole.entities.SchoolClaim.update(claimId, {
        lockedAt: new Date().toISOString()
      });
      return Response.json({
        success: false,
        error: 'Too many failed attempts. This claim has been locked. Please contact support@nextschool.ca.'
      });
    }

    // Check expiry
    if (!claim.codeExpiresAt || new Date() > new Date(claim.codeExpiresAt)) {
      return Response.json({ success: false, error: 'Verification code has expired. Please request a new one.' });
    }

    // Compare code (constant-time-ish string comparison)
    if (String(code).trim() !== String(claim.verificationCode).trim()) {
      const newAttemptCount = attemptCount + 1;
      const updatePayload = { attemptCount: newAttemptCount };
      if (newAttemptCount >= MAX_ATTEMPTS) {
        updatePayload.lockedAt = new Date().toISOString();
      }
      await base44.asServiceRole.entities.SchoolClaim.update(claimId, updatePayload);

      const remaining = MAX_ATTEMPTS - newAttemptCount;
      if (remaining <= 0) {
        return Response.json({
          success: false,
          error: 'Too many failed attempts. This claim has been locked. Please contact support@nextschool.ca.'
        });
      }
      return Response.json({
        success: false,
        error: `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      });
    }

    // --- Code is correct — promote claim ---

    // Step 1: Update SchoolClaim to verified
    await base44.asServiceRole.entities.SchoolClaim.update(claimId, {
      status: 'verified',
      verifiedAt: new Date().toISOString(),
      attemptCount: attemptCount + 1  // record this final successful attempt
    });

    // Step 2: Create SchoolAdmin record (revert claim on failure)
    try {
      await base44.asServiceRole.entities.SchoolAdmin.create({
        schoolId: claim.schoolId,
        userId: claim.userId,
        claimId: claimId,
        role: 'owner',
        isActive: true
      });
    } catch (adminErr) {
      // Revert SchoolClaim status
      console.error('SchoolAdmin.create failed, reverting SchoolClaim:', adminErr.message);
      await base44.asServiceRole.entities.SchoolClaim.update(claimId, {
        status: 'pending_email',
        verifiedAt: null
      });
      return Response.json({ success: false, error: 'Verification failed during account setup. Please try again.' }, { status: 500 });
    }

    // Step 3: Update School (least critical — log if fails but don't revert)
    try {
      await base44.asServiceRole.entities.School.update(claim.schoolId, {
        claimStatus: 'claimed',
        schoolTier: 'free'
      });
    } catch (schoolErr) {
      console.error('School.update failed after successful claim (non-fatal):', schoolErr.message);
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('verifyClaimCode error:', error.message);
    return Response.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
});