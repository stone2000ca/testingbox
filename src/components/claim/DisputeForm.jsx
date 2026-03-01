import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function DisputeForm({ schoolId, schoolName, onCancel }) {
  const [form, setForm] = useState({ name: "", role: "", email: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!form.name || !form.role || !form.email || !form.reason) {
      alert("Please fill in all fields.");
      return;
    }
    setSubmitting(true);
    await base44.entities.DisputeRequest.create({
      school_id: schoolId,
      requester_name: form.name,
      requester_role: form.role,
      requester_email: form.email,
      reason: form.reason,
      status: "pending",
    });
    setDone(true);
    setSubmitting(false);
  };

  if (done) {
    return (
      <div className="text-center py-6">
        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
        <p className="font-semibold text-slate-800 text-lg">Request submitted</p>
        <p className="text-slate-500 text-sm mt-1">We'll review it within 2 business days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Complete the form below to request access to <strong>{schoolName}</strong>. Our team will review and respond within 2 business days.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
        <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your full name" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Role / Title</label>
        <Input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="e.g. Director of Admissions" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Work Email</label>
        <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@school.ca" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Reason for Request</label>
        <textarea
          value={form.reason}
          onChange={e => setForm({ ...form, reason: e.target.value })}
          placeholder="Explain why you should have access to this school's profile…"
          rows={4}
          className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button
          className="flex-1 bg-teal-600 hover:bg-teal-700"
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Submit Request
        </Button>
      </div>
    </div>
  );
}