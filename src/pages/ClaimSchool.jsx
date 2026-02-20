import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, AlertTriangle, Upload, Loader2 } from 'lucide-react';
import Navbar from '@/components/navigation/Navbar';
import Footer from '@/components/navigation/Footer';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function ClaimSchool() {
  const location = useLocation();
  const schoolId = new URLSearchParams(location.search).get('schoolId');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    email: ''
  });
  const [verificationCode, setVerificationCode] = useState('');
  const [documentFile, setDocumentFile] = useState(null);
  const [claimId, setClaimId] = useState(null);
  const [emailDomainMatch, setEmailDomainMatch] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadSchool();
  }, [schoolId]);

  const loadSchool = async () => {
    try {
      const schools = await base44.entities.School.filter({ id: schoolId });
      if (schools && schools.length > 0) {
        setSchool(schools[0]);
      }
    } catch (error) {
      console.error('Failed to load school:', error);
    } finally {
      setLoading(false);
    }
  };

  const extractDomain = (url) => {
    if (!url) return null;
    try {
      let cleanUrl = url;
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
      }
      const domain = new URL(cleanUrl).hostname;
      return domain.replace('www.', '');
    } catch {
      return null;
    }
  };

  const checkEmailDomain = (email) => {
    if (!email || !school?.website) {
      setEmailDomainMatch(null);
      return;
    }

    const emailDomain = email.split('@')[1]?.toLowerCase();
    const schoolDomain = extractDomain(school.website)?.toLowerCase();

    if (emailDomain && schoolDomain && emailDomain === schoolDomain) {
      setEmailDomainMatch(true);
    } else {
      setEmailDomainMatch(false);
    }
  };

  const handleEmailChange = (e) => {
    const email = e.target.value;
    setFormData({ ...formData, email });
    checkEmailDomain(email);
  };

  const handleStep2Submit = async () => {
    if (!formData.name || !formData.role || !formData.email) {
      alert('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

      // Determine verification method and initial status
      let method = 'email_domain';
      let status = 'pending_email';

      if (!emailDomainMatch) {
        method = 'document_upload';
        status = 'pending_review';
      }

      // Create SchoolClaim record
      const claim = await base44.entities.SchoolClaim.create({
        schoolId,
        claimantName: formData.name,
        claimantRole: formData.role,
        claimantEmail: formData.email,
        verificationMethod: method,
        verificationCode,
        codeExpiresAt: expiresAt,
        status
      });

      setClaimId(claim.id);

      // If domain matches, go to code verification step
      if (emailDomainMatch) {
        setStep(3);
        // TODO: Send verification code to email
      } else {
        // If no match, go to document upload step
        setStep(3.5); // Using 3.5 to indicate document upload variant
      }
    } catch (error) {
      console.error('Failed to create claim:', error);
      alert('Failed to create claim. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCodeSubmit = async () => {
    setCodeError('');
    setIsVerifying(true);

    try {
      const claim = await base44.entities.SchoolClaim.get(claimId);

      if (verificationCode !== claim.verificationCode) {
        setCodeError('Invalid code. Please try again.');
        setIsVerifying(false);
        return;
      }

      // Code is correct - verify the claim
      const now = new Date();
      const expiresAt = new Date(claim.codeExpiresAt);

      if (now > expiresAt) {
        setCodeError('Code has expired. Please start again.');
        setIsVerifying(false);
        return;
      }

      // Update claim to verified
      await base44.entities.SchoolClaim.update(claimId, {
        status: 'verified',
        verifiedAt: new Date().toISOString()
      });

      // Create SchoolAdmin record
      await base44.entities.SchoolAdmin.create({
        schoolId,
        claimId,
        role: 'owner',
        isActive: true
      });

      // Update School claim status and membership tier
      await base44.entities.School.update(schoolId, {
        claimStatus: 'claimed',
        membershipTier: 'basic'
      });

      // Go to success step
      setStep(4);
    } catch (error) {
      console.error('Verification failed:', error);
      setCodeError('An error occurred. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDocumentSubmit = async () => {
    if (!documentFile) {
      alert('Please upload a document');
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload document
      const uploadResult = await base44.integrations.Core.UploadFile({ file: documentFile });
      const documentUrl = uploadResult.file_url;

      // Update claim with document and pending_review status
      await base44.entities.SchoolClaim.update(claimId, {
        documentUrl,
        status: 'pending_review'
      });

      // Update School claim status to pending
      await base44.entities.School.update(schoolId, {
        claimStatus: 'pending'
      });

      // Go to success step
      setStep(4);
    } catch (error) {
      console.error('Document upload failed:', error);
      alert('Failed to upload document. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!school) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">School Not Found</h1>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Step 1: Intro */}
        {step === 1 && (
          <Card className="p-8">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-slate-900 mb-4">Claim {school.name}</h1>
              <p className="text-slate-600 mb-8 text-lg">Manage your school's profile on NextSchool</p>
              <p className="text-slate-600 mb-8">
                Verified school admins can update school information, manage inquiries, and access analytics.
              </p>
              <Button
                onClick={() => setStep(2)}
                className="bg-teal-600 hover:bg-teal-700 px-8 py-2"
              >
                Continue
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Claim Information */}
        {step === 2 && (
          <Card className="p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Verify Your Identity</h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Your Role at School</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="">Select your role</option>
                  <option value="Head of School">Head of School</option>
                  <option value="Director of Admissions">Director of Admissions</option>
                  <option value="Registrar">Registrar</option>
                  <option value="Marketing/Communications">Marketing/Communications</option>
                  <option value="Administrative Staff">Administrative Staff</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">School Email</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={handleEmailChange}
                  placeholder="your.name@school.edu"
                />
                {emailDomainMatch !== null && (
                  <div className={`mt-2 flex items-center gap-2 text-sm ${emailDomainMatch ? 'text-green-600' : 'text-amber-600'}`}>
                    {emailDomainMatch ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Email domain matches school website
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4" />
                        Email domain doesn't match. You'll verify with a document instead.
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <Button
                onClick={() => setStep(1)}
                variant="outline"
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleStep2Submit}
                disabled={isSubmitting}
                className="flex-1 bg-teal-600 hover:bg-teal-700"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Continue
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Email Verification Code */}
        {step === 3 && (
          <Card className="p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Enter Verification Code</h2>
            <p className="text-slate-600 mb-6">We sent a 6-digit code to {formData.email}</p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Verification Code</label>
              <input
                type="text"
                maxLength="6"
                value={verificationCode}
                onChange={(e) => {
                  setVerificationCode(e.target.value.replace(/\D/g, ''));
                  setCodeError('');
                }}
                placeholder="000000"
                className="w-full px-4 py-3 border-2 rounded-lg text-2xl text-center tracking-widest font-mono"
              />
              {codeError && (
                <p className="text-red-600 text-sm mt-2">{codeError}</p>
              )}
            </div>

            <Button
              onClick={handleCodeSubmit}
              disabled={isVerifying || verificationCode.length !== 6}
              className="w-full bg-teal-600 hover:bg-teal-700"
            >
              {isVerifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Verify Code
            </Button>
          </Card>
        )}

        {/* Step 3.5: Document Upload */}
        {step === 3.5 && (
          <Card className="p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Verify with Document</h2>
            <p className="text-slate-600 mb-6">
              Since your email domain doesn't match, please upload a verification document (staff ID, business card, or letterhead).
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload Document
              </label>
              <input
                type="file"
                onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                accept=".pdf,.jpg,.jpeg,.png"
                className="w-full px-4 py-2 border rounded-lg"
              />
              <p className="text-xs text-slate-500 mt-2">PDF, JPG, or PNG • Max 5MB</p>
              {documentFile && (
                <p className="text-sm text-green-600 mt-2">✓ {documentFile.name}</p>
              )}
            </div>

            <div className="flex gap-4">
              <Button
                onClick={() => setStep(2)}
                variant="outline"
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleDocumentSubmit}
                disabled={isSubmitting || !documentFile}
                className="flex-1 bg-teal-600 hover:bg-teal-700"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Submit Document
              </Button>
            </div>
          </Card>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <Card className="p-8">
            <div className="text-center">
              <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                {emailDomainMatch ? 'School Claimed!' : 'Verification Submitted'}
              </h2>
              <p className="text-slate-600 mb-8">
                {emailDomainMatch
                  ? 'You can now manage your school profile and access the admin dashboard.'
                  : 'Your verification document has been submitted. Our team will review it within 24-48 hours.'}
              </p>
              <Link to={createPageUrl('SchoolAdmin')}>
                <Button className="bg-teal-600 hover:bg-teal-700 px-8">
                  Go to Admin Dashboard
                </Button>
              </Link>
            </div>
          </Card>
        )}
      </div>

      <Footer />
    </div>
  );
}