import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, ImagePlus, ExternalLink, Camera, Loader2, X } from 'lucide-react';

const TYPE_BADGE = {
  hero:      'bg-purple-100 text-purple-700',
  campus:    'bg-teal-100 text-teal-700',
  classroom: 'bg-blue-100 text-blue-700',
  sports:    'bg-orange-100 text-orange-700',
  general:   'bg-slate-100 text-slate-600',
};

function formatKB(bytes) {
  if (!bytes) return null;
  return `${Math.round(bytes / 1024)} KB`;
}

export default function PhotoReviewSection({ school, onUpdate, onCountChange }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(new Set());
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [hiddenIds, setHiddenIds] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [user, setUser] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, records] = await Promise.all([
        base44.auth.me(),
        base44.entities.PhotoCandidate.filter({ schoolId: school.id }),
      ]);
      setUser(u);
      setCandidates(records);
    } finally {
      setLoading(false);
    }
  }, [school.id]);

  useEffect(() => { load(); }, [load]);

  const pending  = candidates.filter(c => c.status === 'pending');
  const approved = candidates.filter(c => c.status === 'approved');
  const rejected = candidates.filter(c => c.status === 'rejected');

  const setProc = (id, val) =>
    setProcessing(prev => { const next = new Set(prev); val ? next.add(id) : next.delete(id); return next; });

  const approveAs = async (candidate, approvedAs) => {
    setProc(candidate.id, true);
    try {
      await base44.entities.PhotoCandidate.update(candidate.id, {
        status: 'approved',
        approvedAs,
        reviewedAt: new Date().toISOString(),
      });

      if (approvedAs === 'headerPhoto') {
        await base44.entities.School.update(school.id, { headerPhotoUrl: candidate.imageUrl });
        onUpdate && onUpdate('headerPhotoUrl', candidate.imageUrl);
      } else {
        const gallery = Array.isArray(school.photoGallery) ? school.photoGallery : [];
        if (!gallery.includes(candidate.imageUrl)) {
          const updated = [...gallery, candidate.imageUrl];
          await base44.entities.School.update(school.id, { photoGallery: updated });
          onUpdate && onUpdate('photoGallery', updated);
        }
      }
      setCandidates(prev => {
        const next = prev.map(c => c.id === candidate.id ? { ...c, status: 'approved', approvedAs } : c);
        onCountChange && onCountChange(next.filter(c => c.status === 'pending').length);
        return next;
      });
    } finally {
      setProc(candidate.id, false);
    }
  };

  const confirmReject = async (id, reason) => {
    setProc(id, true);
    try {
      await base44.entities.PhotoCandidate.update(id, {
        status: 'rejected',
        rejectionReason: reason || '',
        reviewedAt: new Date().toISOString(),
      });
      setCandidates(prev => {
        const next = prev.map(c => c.id === id ? { ...c, status: 'rejected', rejectionReason: reason } : c);
        onCountChange && onCountChange(next.filter(c => c.status === 'pending').length);
        return next;
      });
    } finally {
      setProc(id, false);
      setRejectingId(null);
      setRejectReason('');
    }
  };

  const bulkReject = async () => {
    setBulkRejecting(true);
    await Promise.all([...selected].map(id => confirmReject(id, 'Bulk rejected')));
    setSelected(new Set());
    setBulkRejecting(false);
  };

  const toggleSelect = (id) =>
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Photo Review</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-4 text-center">
          <p className="text-3xl font-bold text-amber-600">{pending.length}</p>
          <p className="text-sm text-amber-700 mt-1">Pending</p>
        </div>
        <div className="rounded-xl border bg-green-50 border-green-200 p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{approved.length}</p>
          <p className="text-sm text-green-700 mt-1">Approved</p>
        </div>
        <div className="rounded-xl border bg-red-50 border-red-200 p-4 text-center">
          <p className="text-3xl font-bold text-red-600">{rejected.length}</p>
          <p className="text-sm text-red-700 mt-1">Rejected</p>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size >= 2 && (
        <div className="flex items-center justify-between bg-slate-800 text-white px-4 py-3 rounded-xl">
          <span className="text-sm">{selected.size} photos selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={bulkReject} disabled={bulkRejecting}>
              {bulkRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Reject All
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Camera className="h-12 w-12 mb-3" />
          <p className="text-lg font-medium">All photos reviewed!</p>
          <p className="text-sm mt-1">Run AI Auto-Fill again to discover new photos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {pending.filter(c => !hiddenIds.has(c.id)).map(candidate => {
            const isProc = processing.has(candidate.id);
            const isRejecting = rejectingId === candidate.id;
            const isSelected = selected.has(candidate.id);

            return (
              <div key={candidate.id} className={`relative rounded-xl border bg-white overflow-hidden shadow-sm transition-all ${isSelected ? 'ring-2 ring-slate-800' : ''}`}>
                {/* Thumbnail */}
                <div className="relative aspect-video bg-slate-100">
                  <img
                    src={candidate.imageUrl}
                    alt={candidate.altText || ''}
                    className="w-full h-full object-cover"
                    onError={() => setHiddenIds(prev => new Set([...prev, candidate.id]))}
                  />
                  {/* Checkbox overlay */}
                  <button
                    onClick={() => toggleSelect(candidate.id)}
                    className={`absolute top-2 left-2 h-5 w-5 rounded border-2 ${isSelected ? 'bg-slate-800 border-slate-800' : 'bg-white/80 border-slate-400'} flex items-center justify-center`}
                  >
                    {isSelected && <span className="text-white text-xs">✓</span>}
                  </button>
                  {/* Type badge */}
                  <span className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[candidate.inferredType] || TYPE_BADGE.general}`}>
                    {candidate.inferredType}
                  </span>
                </div>

                {/* Meta */}
                <div className="px-2 pt-2 pb-1 space-y-0.5">
                  {candidate.altText && (
                    <p className="text-xs text-slate-500 truncate" title={candidate.altText}>{candidate.altText}</p>
                  )}
                  <div className="flex items-center justify-between">
                    {formatKB(candidate.fileSizeBytes) && (
                      <span className="text-xs text-slate-400">{formatKB(candidate.fileSizeBytes)}</span>
                    )}
                    <a
                      href={candidate.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-teal-600 ml-auto"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* Reject reason inline */}
                {isRejecting && (
                  <div className="px-2 pb-2 space-y-1">
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      className="w-full text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" className="flex-1 h-7 text-xs bg-red-500 hover:bg-red-600 text-white" onClick={() => confirmReject(candidate.id, rejectReason)} disabled={isProc}>
                        {isProc ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRejectingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {!isRejecting && (
                  <div className="px-2 pb-2 flex gap-1">
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                      disabled={isProc}
                      onClick={() => approveAs(candidate, 'headerPhoto')}
                    >
                      {isProc ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Header'}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                      disabled={isProc}
                      onClick={() => approveAs(candidate, 'gallery')}
                    >
                      {isProc ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Gallery'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      disabled={isProc}
                      onClick={() => { setRejectingId(candidate.id); setRejectReason(''); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {isProc && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}