import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { emailType, claimData, schoolData, test_mode = false, test_scenario = null } = await req.json();

    let subject, body;
    const baseStyles = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0D9488 0%, #0F766E 100%); padding: 32px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">NextSchool</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Your Trusted School Search Partner</p>
        </div>
        <div style="padding: 32px;">
    `;
    const baseFooter = `
        </div>
        <div style="background: #F8FAFC; padding: 24px; border-top: 1px solid #E2E8F0; text-align: center;">
          <p style="color: #64748B; font-size: 12px; margin: 0 0 8px 0;">
            Questions? Contact us at <a href="mailto:support@nextschool.ca" style="color: #0D9488;">support@nextschool.ca</a>
          </p>
          <p style="color: #94A3B8; font-size: 11px; margin: 0;">
            © 2026 NextSchool. All rights reserved.
          </p>
        </div>
      </div>
    `;

    // For VERIFICATION_CODE: generate code server-side, write to SchoolClaim, never trust client-supplied code
    let generatedCode = null;
    if (emailType === 'VERIFICATION_CODE') {
      if (!schoolData.claimId) {
        return Response.json({ error: 'claimId is required for VERIFICATION_CODE type' }, { status: 400 });
      }
      generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
      await base44.asServiceRole.entities.SchoolClaim.update(schoolData.claimId, {
        verificationCode: generatedCode,
        codeExpiresAt: expiresAt,
        attemptCount: 0,
        lockedAt: null,
      });
      // Inject generated values so the email template below can use them
      claimData = { ...claimData, verificationCode: generatedCode, codeExpiresAt: expiresAt };
    }

    switch (emailType) {
      case 'VERIFICATION_CODE':
        subject = `Verify your NextSchool school claim - ${schoolData.name}`;
        body = `${baseStyles}
          <h2 style="color: #1E293B; margin: 0 0 16px 0; font-size: 24px;">Verify Your School Claim</h2>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
            Hello ${claimData.claimantName},
          </p>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
            You've initiated a claim for <strong>${schoolData.name}</strong>. Please use the verification code below to complete the process:
          </p>
          <div style="background: #F0FDFA; border: 2px solid #0D9488; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <p style="color: #64748B; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Verification Code</p>
            <p style="color: #0D9488; font-size: 48px; font-weight: 700; letter-spacing: 8px; margin: 0; font-family: 'Courier New', monospace;">
              ${claimData.verificationCode}
            </p>
          </div>
          <p style="color: #475569; line-height: 1.6; margin: 24px 0 0 0;">
            <strong>This code expires in 15 minutes.</strong>
          </p>
          <p style="color: #64748B; font-size: 14px; line-height: 1.6; margin: 16px 0 0 0;">
            If you didn't request this, please ignore this email or contact support.
          </p>
        ${baseFooter}`;
        break;

      case 'DOCUMENT_RECEIVED':
        subject = `We received your verification documents - ${schoolData.name}`;
        body = `${baseStyles}
          <h2 style="color: #1E293B; margin: 0 0 16px 0; font-size: 24px;">Document Received</h2>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Hello ${claimData.claimantName},
          </p>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Thank you for submitting verification documents for <strong>${schoolData.name}</strong>.
          </p>
          <div style="background: #F0F9FF; border-left: 4px solid #0D9488; padding: 16px; margin: 24px 0;">
            <p style="color: #0F766E; font-weight: 600; margin: 0 0 8px 0;">What happens next?</p>
            <p style="color: #475569; font-size: 14px; margin: 0;">
              Our verification team will review your documents within <strong>2-3 business days</strong>. We'll email you once the review is complete.
            </p>
          </div>
          <p style="color: #64748B; font-size: 14px; margin: 16px 0 0 0;">
            Questions? Reply to this email or contact support@nextschool.ca
          </p>
        ${baseFooter}`;
        break;

      case 'CLAIM_APPROVED':
        subject = `Your school profile is now live! - ${schoolData.name}`;
        body = `${baseStyles}
          <h2 style="color: #1E293B; margin: 0 0 16px 0; font-size: 24px;">🎉 Your School Profile is Live!</h2>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Congratulations ${claimData.claimantName}!
          </p>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
            Your claim for <strong>${schoolData.name}</strong> has been approved. Your school profile is now live and visible to families searching on NextSchool.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${Deno.env.get('APP_URL') || 'https://app.nextschool.ca'}/school-admin" 
               style="display: inline-block; background: #0D9488; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Go to Admin Dashboard
            </a>
          </div>
          <div style="background: #F0FDFA; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="color: #0F766E; font-weight: 600; margin: 0 0 12px 0;">Next Steps:</p>
            <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Complete your profile with photos, programs, and admissions info</li>
              <li>Review and respond to parent inquiries</li>
              <li>Upgrade to Enhanced for analytics and priority placement</li>
            </ul>
          </div>
        ${baseFooter}`;
        break;

      case 'CLAIM_REJECTED':
        subject = `Update on your school claim - ${schoolData.name}`;
        body = `${baseStyles}
          <h2 style="color: #1E293B; margin: 0 0 16px 0; font-size: 24px;">School Claim Update</h2>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Hello ${claimData.claimantName},
          </p>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
            We were unable to verify your claim for <strong>${schoolData.name}</strong>.
          </p>
          <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 16px; margin: 24px 0;">
            <p style="color: #92400E; font-weight: 600; margin: 0 0 8px 0;">Reason:</p>
            <p style="color: #78350F; margin: 0;">
              ${claimData.rejectionReason || 'The verification documents provided were insufficient to confirm your role at the school.'}
            </p>
          </div>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            <strong>How to re-apply:</strong>
          </p>
          <ul style="color: #475569; margin: 0 0 24px 0; padding-left: 20px; line-height: 1.8;">
            <li>Ensure you're using an email address with the school's domain</li>
            <li>Upload clear documentation (staff ID, business card, or letterhead)</li>
            <li>Contact our support team for manual verification</li>
          </ul>
          <p style="color: #64748B; font-size: 14px; margin: 0;">
            Need help? Contact <a href="mailto:support@nextschool.ca" style="color: #0D9488;">support@nextschool.ca</a>
          </p>
        ${baseFooter}`;
        break;

      case 'DUPLICATE_CLAIM':
        subject = `School claim notice - ${schoolData.name}`;
        body = `${baseStyles}
          <h2 style="color: #1E293B; margin: 0 0 16px 0; font-size: 24px;">School Already Claimed</h2>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Hello ${claimData.claimantName},
          </p>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
            We received a claim request for <strong>${schoolData.name}</strong>, but this school has already been claimed and verified by another administrator.
          </p>
          <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 16px; margin: 24px 0;">
            <p style="color: #92400E; font-weight: 600; margin: 0 0 8px 0;">If this is unauthorized:</p>
            <p style="color: #78350F; margin: 0;">
              If you believe someone has claimed your school without authorization, please contact our support team immediately with documentation proving your role.
            </p>
          </div>
          <p style="color: #64748B; font-size: 14px; margin: 0;">
            Contact: <a href="mailto:support@nextschool.ca" style="color: #0D9488;">support@nextschool.ca</a>
          </p>
        ${baseFooter}`;
        break;

      case 'CLAIM_EXPIRED':
        subject = `Your school claim has expired - ${schoolData.name}`;
        body = `${baseStyles}
          <h2 style="color: #1E293B; margin: 0 0 16px 0; font-size: 24px;">Verification Code Expired</h2>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Hello ${claimData.claimantName},
          </p>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
            Your verification code for <strong>${schoolData.name}</strong> has expired. Verification codes are valid for 24 hours for security purposes.
          </p>
          <div style="background: #F0FDFA; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="color: #0F766E; font-weight: 600; margin: 0 0 12px 0;">To restart the claim process:</p>
            <ol style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Visit the school's profile page</li>
              <li>Click "Claim This School"</li>
              <li>Complete the verification within 24 hours</li>
            </ol>
          </div>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${Deno.env.get('APP_URL') || 'https://app.nextschool.ca'}/claim-school?schoolId=${schoolData.id}" 
               style="display: inline-block; background: #0D9488; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Restart Claim Process
            </a>
          </div>
        ${baseFooter}`;
        break;

      default:
        return Response.json({ error: 'Invalid email type' }, { status: 400 });
    }

    // E18b-002: Test mode check - block email and log as test_blocked
    if (test_mode) {
      try {
        await base44.asServiceRole.entities.EmailLog.create({
          type: emailType === 'CLAIM_EXPIRED' ? 'claim_expiry' : 'claim_verification',
          to: claimData.claimantEmail,
          fromName: 'NextSchool',
          subject,
          schoolId: schoolData.id,
          claimStatus: schoolData.claimStatus,
          status: 'blocked_test',
          is_test: true,
          test_scenario,
        });
      } catch (logErr) {
        console.error('Failed to log test-blocked email:', logErr);
      }
      return Response.json({ success: true, reason: 'test_blocked' });
    }

    // Send email
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        from_name: 'NextSchool',
        to: claimData.claimantEmail,
        subject,
        body
      });

      // WC4: Log email as sent
      try {
        await base44.asServiceRole.entities.EmailLog.create({
          type: emailType === 'CLAIM_EXPIRED' ? 'claim_expiry' : 'claim_verification',
          to: claimData.claimantEmail,
          fromName: 'NextSchool',
          subject,
          schoolId: schoolData.id,
          claimStatus: schoolData.claimStatus,
          status: 'sent',
          is_test: false,
          test_scenario: null,
        });
      } catch (logErr) {
        console.error('Failed to log email:', logErr);
      }

      return Response.json({ success: true });
    } catch (emailErr) {
      // WC4: Log email as failed
      try {
        await base44.asServiceRole.entities.EmailLog.create({
          type: emailType === 'CLAIM_EXPIRED' ? 'claim_expiry' : 'claim_verification',
          to: claimData.claimantEmail,
          fromName: 'NextSchool',
          subject,
          schoolId: schoolData.id,
          claimStatus: schoolData.claimStatus,
          status: 'failed',
          errorMessage: emailErr.message,
          is_test: false,
          test_scenario: null,
        });
      } catch (logErr) {
        console.error('Failed to log email error:', logErr);
      }

      throw emailErr;
    }
  } catch (error) {
    console.error('Email send failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});