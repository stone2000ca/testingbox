import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminSubmissions() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMap, setActionMap] = useState({}); // schoolId -> "approving" | "rejecting" | "done"

  async function load() {
    setLoading(true);
    const schools = await base44.entities.School.filter({ source: "school_submitted" });
    const pending = schools.filter(s => s.status === "draft" || s.status === "pending_review");
    setSubmissions(pending.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function approve(school) {
    setActionMap(m => ({ ...m, [school.id]: "approving" }));
    // Fix 1+2: Set status, claimStatus, membershipTier together
    await base44.entities.School.update(school.id, { status: "active", claimStatus: "claimed", membershipTier: "basic" });
    // Fix 3: Update existing SchoolClaim to verified (non-blocking)
    try {
      const claims = await base44.entities.SchoolClaim.filter({ schoolId: school.id, status: "pending_review" });
      if (claims.length > 0) {
        await base44.entities.SchoolClaim.update(claims[0].id, { status: "verified", verifiedAt: new Date().toISOString() });
      }
    } catch (e) { /* non-blocking */ }
    // Fix 4: Use school.userId directly — no User.list() lookup needed
    if (school.userId) {
      try {
        await base44.entities.SchoolAdmin.create({
          schoolId: school.id,
          userId: school.userId,
          role: "owner",
          isActive: true,
        });
      } catch (_) { /* already exists or non-blocking */ }
    }
    setSubmissions(s => s.filter(x => x.id !== school.id));
    setActionMap(m => ({ ...m, [school.id]: "done" }));
  }

  async function reject(school) {
    setActionMap(m => ({ ...m, [school.id]: "rejecting" }));
    await base44.entities.School.update(school.id, { status: "archived" });
    setSubmissions(s => s.filter(x => x.id !== school.id));
    setActionMap(m => ({ ...m, [school.id]: "done" }));
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-slate-500">
        <RefreshCw className="h-5 w-5 animate-spin" />
        Loading submissions…
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">School Submissions</h2>
          <p className="text-slate-500 text-sm mt-1">Schools submitted via the Add Your School form, awaiting review.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {submissions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-12 text-center">
          <Clock className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No pending submissions.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">School Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">City</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Province / State</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Submitter Email</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date Submitted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {submissions.map(school => {
                const busy = actionMap[school.id];
                return (
                  <tr key={school.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{school.name}</td>
                    <td className="px-4 py-3 text-slate-600">{school.city || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{school.provinceState || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{school.created_by || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {school.created_date ? new Date(school.created_date).toLocaleDateString("en-CA") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          disabled={!!busy}
                          onClick={() => approve(school)}
                          className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {busy === "approving" ? "Approving…" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busy}
                          onClick={() => reject(school)}
                          className="text-red-600 border-red-200 hover:bg-red-50 gap-1"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {busy === "rejecting" ? "Rejecting…" : "Reject"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}