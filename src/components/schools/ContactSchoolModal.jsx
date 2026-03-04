import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { X, Send, CheckCircle2, ExternalLink } from 'lucide-react';
import { sendSchoolEmail } from '@/components/utils/sendSchoolEmail';

export default function ContactSchoolModal({ school, onClose }) {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    parentName: '',
    email: '',
    childGrade: '',
    message: ''
  });
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      setFormData({
        parentName: userData.full_name || '',
        email: userData.email || '',
        childGrade: '',
        message: ''
      });
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);

    try {
      const inquiry = await base44.entities.SchoolInquiry.create({
        parentUserId: user.id,
        schoolId: school.id,
        message: `Parent: ${formData.parentName}\nEmail: ${formData.email}\nChild's Grade: ${formData.childGrade}\n\nMessage:\n${formData.message}`,
        status: 'pending'
      });

      // WC4: Send email notification via sendSchoolEmail wrapper
      const emailBody = `
<p>Hi,</p>
<p>A parent has submitted an inquiry for <strong>${school.name}</strong> via NextSchool.</p>
<table style="border-collapse:collapse;width:100%;max-width:500px;font-family:sans-serif;font-size:14px;">
  <tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap;">Parent Name</td><td style="padding:6px 0;font-weight:600;">${formData.parentName}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Email</td><td style="padding:6px 0;">${formData.email}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Child's Grade</td><td style="padding:6px 0;">${formData.childGrade}</td></tr>
</table>
<div style="background:#f8fafc;border-left:4px solid #0d9488;padding:16px;margin:24px 0;">
  <p style="color:#1e293b;font-weight:600;margin:0 0 8px 0;">Message:</p>
  <p style="color:#475569;margin:0;white-space:pre-wrap;">${formData.message}</p>
</div>
<p style="margin-top:24px;">
  <a href="https://nextschool.ca/SchoolAdmin" style="background:#0d9488;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View in School Portal → Inquiries</a>
</p>
<p style="color:#94a3b8;font-size:12px;margin-top:24px;">This notification was sent by NextSchool. Do not reply to this email — use the portal to manage your inquiries.</p>
      `.trim();

      if (school.email) {
        sendSchoolEmail({
          type: 'contact',
          school,
          to: school.email,
          subject: `New Parent Inquiry from ${formData.parentName} — NextSchool`,
          body: emailBody,
          userId: user.id,
          inquiryId: inquiry.id,
        }).catch(() => {}); // non-blocking, silent failure
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Failed to send inquiry:', error);
    } finally {
      setSending(false);
    }
  };

  // Unclaimed school — show website redirect instead of form
  if (school.claimStatus !== 'claimed') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-8 text-center">
          <button onClick={onClose} className="absolute top-4 right-4 h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <X className="h-5 w-5 text-slate-600" />
          </button>
          <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <ExternalLink className="h-6 w-6 text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Contact {school.name}</h3>
          <p className="text-slate-600 text-sm mb-6">
            This school hasn't claimed their NextSchool profile yet. Visit their website directly to get in touch.
          </p>
          {school.website && (
            <a
              href={school.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Visit {school.name}'s Website
            </a>
          )}
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-8 text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2">Inquiry Sent!</h3>
          <p className="text-slate-600">
            Your inquiry has been sent to {school.name}. The school will respond within 2-3 business days.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Contact {school.name}</h3>
            <p className="text-sm text-slate-600">{school.city}, {school.region}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Your Name *</Label>
              <Input
                value={formData.parentName}
                onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Your Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <Label>Child's Current/Entering Grade *</Label>
            <Input
              value={formData.childGrade}
              onChange={(e) => setFormData({ ...formData, childGrade: e.target.value })}
              placeholder="e.g., Grade 3, Kindergarten"
              required
            />
          </div>

          <div>
            <Label>Message *</Label>
            <Textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Tell the school about your interests, questions, or what you're looking for..."
              rows={6}
              required
            />
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 text-sm text-teal-900">
            <strong>What happens next?</strong>
            <ul className="mt-2 space-y-1 text-teal-800">
              <li>• Your inquiry is sent directly to the school's admissions office</li>
              <li>• They'll review your message and respond within 2-3 business days</li>
              <li>• You'll receive their response via email</li>
            </ul>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={sending}
              className="flex-1 bg-teal-600 hover:bg-teal-700"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Sending...' : 'Send Inquiry'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}