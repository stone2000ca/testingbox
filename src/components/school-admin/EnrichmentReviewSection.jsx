// Component: EnrichmentReviewSection
// Purpose: Admin review interface for pending EnrichmentDiff records per school
// Entities: EnrichmentDiff (read/update), School (update on approve)

import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Zap, ExternalLink } from 'lucide-react';

function confidenceBadge(confidence) {
  if (confidence >= 0.9) return <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">{Math.round(confidence * 100)}%</span>;
  if (confidence >= 0.7) return <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{Math.round(confidence * 100)}%</span>;
  return <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{Math.round(confidence * 100)}%</span>;
}

function rowBg(confidence) {
  if (confidence >= 0.9) return 'bg-green-50';
  if (confidence < 0.7) return 'bg-amber-50';
  return 'bg-white';
}

export default function EnrichmentReviewSection({ school }) {
  const [diffs, setDiffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(new Set());
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadData();
  }, [school.id]);

  const loadData = async () => {
    setLoading(true);
    const [allDiffs, userData] = await Promise.all([
      base44.entities.EnrichmentDiff.filter({ schoolId: school.id }),
      base44.auth.me(),
    ]);
    setDiffs(allDiffs);
    setUser(userData);
    setLoading(false);
  };

  const pendingDiffs = diffs.filter(d => d.status === 'pending');
  const approvedCount = diffs.filter(d => d.status === 'approved' || d.status === 'applied').length;
  const rejectedCount = diffs.filter(d => d.status === 'rejected').length;

  // Group pending by batchId
  const batches = {};
  for (const d of pendingDiffs) {
    const key = d.batchId || 'ungrouped';
    if (!batches[key]) batches[key] = [];
    batches[key].push(d);
  }

  const approveDiff = async (diff) => {
    setProcessing(p => new Set(p).add(diff.id));
    // Parse proposedValue (may be JSON string for arrays/objects)
    let parsedValue = diff.proposedValue;
    try { parsedValue = JSON.parse(diff.proposedValue); } catch (_) {}

    await Promise.all([
      base44.entities.School.update(school.id, { [diff.field]: parsedValue }),
      base44.entities.EnrichmentDiff.update(diff.id, {
        status: 'approved',
        reviewedBy: user?.email || '',
        reviewedAt: new Date().toISOString(),
      }),
    ]);
    setDiffs(prev => prev.map(d => d.id === diff.id ? { ...d, status: 'approved' } : d));
    setProcessing(p => { const n = new Set(p); n.delete(diff.id); return n; });
  };

  const rejectDiff = async (diff) => {
    setProcessing(p => new Set(p).add(diff.id));
    await base44.entities.EnrichmentDiff.update(diff.id, {
      status: 'rejected',
      reviewedBy: user?.email || '',
      reviewedAt: new Date().toISOString(),
    });
    setDiffs(prev => prev.map(d => d.id === diff.id ? { ...d, status: 'rejected' } : d));
    setProcessing(p => { const n = new Set(p); n.delete(diff.id); return n; });
  };

  const approveAllHighConfidence = async () => {
    const highConf = pendingDiffs.filter(d => d.confidence >= 0.9);
    for (const diff of highConf) {
      await approveDiff(diff);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-slate-500">
        <div className="animate-spin h-5 w-5 border-2 border-teal-600 border-t-transparent rounded-full" />
        Loading enrichment diffs…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Enrichment Review</h2>
          <p className="text-sm text-slate-500 mt-1">Review AI-suggested data changes from the school's website</p>
        </div>
        {pendingDiffs.filter(d => d.confidence >= 0.9).length > 0 && (
          <Button
            onClick={approveAllHighConfidence}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            <Zap className="h-4 w-4" />
            Approve All High Confidence ({pendingDiffs.filter(d => d.confidence >= 0.9).length})
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-amber-700">{pendingDiffs.length}</div>
          <div className="text-sm text-amber-600">Pending</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{approvedCount}</div>
          <div className="text-sm text-green-600">Approved</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-700">{rejectedCount}</div>
          <div className="text-sm text-red-600">Rejected</div>
        </div>
      </div>

      {pendingDiffs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400" />
          <p className="text-lg font-medium text-slate-500">All caught up!</p>
          <p className="text-sm">No pending enrichment diffs for this school.</p>
        </div>
      ) : (
        Object.entries(batches).map(([batchId, batchDiffs]) => (
          <div key={batchId} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Batch</span>
                <span className="ml-2 text-xs text-slate-400 font-mono">{batchId}</span>
              </div>
              <span className="text-xs text-slate-500">{batchDiffs.length} pending</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-medium">Field</th>
                  <th className="text-left px-4 py-2 font-medium">Current Value</th>
                  <th className="text-left px-4 py-2 font-medium">Proposed Value</th>
                  <th className="text-left px-4 py-2 font-medium">Confidence</th>
                  <th className="text-left px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batchDiffs.map(diff => (
                  <tr key={diff.id} className={rowBg(diff.confidence)}>
                    <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{diff.field}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate" title={diff.currentValue}>
                      {diff.currentValue || <span className="italic text-slate-300">empty</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-800 max-w-[220px] truncate" title={diff.proposedValue}>
                      {diff.proposedValue}
                    </td>
                    <td className="px-4 py-3">{confidenceBadge(diff.confidence)}</td>
                    <td className="px-4 py-3">
                      {diff.sourceUrl ? (
                        <a href={diff.sourceUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-teal-600 hover:underline text-xs">
                          <ExternalLink className="h-3 w-3" /> source
                        </a>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 flex items-center gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-700 border-green-300 hover:bg-green-50 gap-1"
                        disabled={processing.has(diff.id)}
                        onClick={() => approveDiff(diff)}
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 gap-1"
                        disabled={processing.has(diff.id)}
                        onClick={() => rejectDiff(diff)}
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}