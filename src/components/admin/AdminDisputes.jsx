import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, XCircle, Clock, RefreshCw, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState([]);
  const [enriched, setEnriched] = useState([]); // disputes + school name + current owner
  const [loading, setLoading] = useState(true);
  const [actionMap, setActionMap] = useState({});

  async function load() {
    setLoading(true);
    const raw = await base44.entities.DisputeRequest.filter({ status: "pending" });
    raw.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    // Enrich with school name + current owner from SchoolAdmin
    const enrichedRows = await Promise.all(raw.map(async (d) => {
      let schoolName = d.school_id;
      let ownerEmail = "—";
      let ownerName = "—";

      try {
        const schools = await base44.entities.School.filter({ id: d.school_id });
        if (schools[0]) schoolName = schools[0].name;
      } catch (_) {}

      try {
        const admins = await base44.entities.SchoolAdmin.filter({ schoolId: d.school_id, role: "owner", isActive: true });
        if (admins[0]) {
          ownerEmail = admins[0].userId || "—";
          // Try to get user email by userId
          const users = await base44.entities.User.filter({ id: admins[0].userId });
          if (users[0]) {
            ownerEmail = users[0].email || "—";
            ownerName = users[0].full_name || "—";
          }
        }
      } catch (_) {}

      return { ...d, schoolName, ownerEmail, ownerName };
    }));

    setEnriched(enrichedRows);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function transferOwnership(dispute) {
    setActionMap(m => ({ ...m, [dispute.id]: "transferring" }));

    // Find requester user account
    const users = await base44.entities.User.filter({ email: dispute.requester_email });
    if (!users[0]) {
      alert("No user account found for " + dispute.requester_email + ". They must sign up first.");
      setActionMap(m => ({ ...m, [dispute.id]: null }));
      return;
    }
    const newUserId = users[0].id;

    // Deactivate existing owner records for this school
    const existingAdmins = await base44.entities.SchoolAdmin.filter({ schoolId: dispute.school_id, role: "owner" });
    await Promise.all(existingAdmins.map(a => base44.entities.SchoolAdmin.update(a.id, { isActive: false })));

    // Create new owner SchoolAdmin record
    await base44.entities.SchoolAdmin.create({
      schoolId: dispute.school_id,
      userId: newUserId,
      role: "owner",
      isActive: true,
    });

    // Mark dispute approved
    await base44.entities.DisputeRequest.update(dispute.id, { status: "approved" });

    setEnriched(e => e.filter(x => x.id !== dispute.id));
    setActionMap(m => ({ ...m, [dispute.id]: "done" }));
  }

  async function reject(dispute) {
    setActionMap(m => ({ ...m, [dispute.id]: "rejecting" }));
    await base44.entities.DisputeRequest.update(dispute.id, { status: "rejected" });
    setEnriched(e => e.filter(x => x.id !== dispute.id));
    setActionMap(m => ({ ...m, [dispute.id]: "done" }));
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-slate-500">
        <RefreshCw className="h-5 w-5 animate-spin" /> Loading disputes…
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Ownership Disputes</h2>
          <p className="text-slate-500 text-sm mt-1">Access requests from users disputing an existing school ownership.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {enriched.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-12 text-center">
          <Clock className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No pending disputes.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {enriched.map(d => {
            const busy = actionMap[d.id];
            return (
              <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-base">{d.schoolName}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Submitted {d.created_date ? new Date(d.created_date).toLocaleDateString("en-CA") : "—"}
                    </p>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Requester */}
                      <div className="bg-teal-50 border border-teal-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-teal-700 mb-1">Requester</p>
                        <p className="text-sm font-medium text-slate-800">{d.requester_name}</p>
                        <p className="text-xs text-slate-500">{d.requester_email}</p>
                        <p className="text-xs text-slate-500">{d.requester_role}</p>
                      </div>
                      {/* Current owner */}
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-slate-500 mb-1">Current Owner</p>
                        <p className="text-sm font-medium text-slate-800">{d.ownerName}</p>
                        <p className="text-xs text-slate-500">{d.ownerEmail}</p>
                      </div>
                    </div>

                    {d.reason && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                        <p className="text-xs font-medium text-amber-700 mb-1">Reason for request</p>
                        <p className="text-sm text-slate-700">{d.reason}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      disabled={!!busy}
                      onClick={() => transferOwnership(d)}
                      className="bg-teal-600 hover:bg-teal-700 text-white gap-1 whitespace-nowrap"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      {busy === "transferring" ? "Transferring…" : "Transfer Ownership"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => reject(d)}
                      className="text-red-600 border-red-200 hover:bg-red-50 gap-1"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {busy === "rejecting" ? "Rejecting…" : "Reject"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}