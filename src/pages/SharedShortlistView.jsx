import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Check, X, Circle, MapPin, Navigation, DollarSign, ExternalLink } from 'lucide-react';

// =============================================================================
// T-SL-006: Shared Shortlist View — public read-only page, no login required
// Loaded via /SharedShortlistView?hash=<hash>
// =============================================================================

function CheckIcon({ status }) {
  if (status === 'match') return <Check className="h-3.5 w-3.5 text-teal-400 flex-shrink-0" />;
  if (status === 'mismatch') return <X className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />;
  return <Circle className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />;
}

function SchoolCard({ school }) {
  return (
    <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 hover:border-slate-500 transition-colors">
      {/* Photo */}
      <div className="relative h-44 bg-slate-700 overflow-hidden">
        {school.photoUrl ? (
          <img
            src={school.photoUrl}
            alt={school.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-600">
            <span className="text-2xl font-bold text-slate-500">{school.name?.charAt(0)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
        {/* Priority badge */}
        {school.priorityCheckmarks?.length > 0 && (() => {
          const matches = school.priorityCheckmarks.filter(c => c.status === 'match').length;
          const total = school.priorityCheckmarks.length;
          return (
            <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-900/80 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs font-semibold text-teal-400 border border-teal-800">
              <Check className="h-3 w-3" />
              {matches}/{total}
            </div>
          );
        })()}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-white font-semibold text-base leading-tight">{school.name}</h3>
          <div className="flex items-center gap-1 text-slate-400 text-xs mt-1">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span>{[school.city, school.provinceState].filter(Boolean).join(', ')}</span>
          </div>
        </div>

        {/* Tuition + Distance */}
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1 text-teal-400 font-medium">
            <DollarSign className="h-3 w-3" />
            {school.tuitionBand || 'Contact school'}
          </span>
          {school.distanceKm != null && (
            <span className="flex items-center gap-1 text-slate-400">
              <Navigation className="h-3 w-3" />
              {school.distanceKm.toFixed(1)} km
            </span>
          )}
        </div>

        {/* Rationale */}
        {school.rationale && (
          <p className="text-slate-300 text-sm leading-relaxed border-l-2 border-teal-600 pl-3">
            {school.rationale}
          </p>
        )}

        {/* Priority Checkmarks */}
        {school.priorityCheckmarks?.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-slate-700">
            {school.priorityCheckmarks.map((check, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <CheckIcon status={check.status} />
                <span className="text-slate-400 font-medium w-20 flex-shrink-0">{check.label}</span>
                <span className="text-slate-500 truncate">{check.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SharedShortlistView() {
  const [shortlist, setShortlist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get('hash');

    if (!hash) {
      setError('No shortlist hash provided.');
      setLoading(false);
      return;
    }

    base44.entities.SharedShortlist.filter({ hash })
      .then(results => {
        if (!results || results.length === 0) {
          setError('This shortlist link is invalid or has expired.');
        } else {
          setShortlist(results[0]);
        }
      })
      .catch(err => {
        setError('Unable to load this shortlist. The link may be invalid.');
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  const formattedDate = shortlist?.generatedDate
    ? new Date(shortlist.generatedDate).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Loading shortlist…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="text-center max-w-sm space-y-4">
          <div className="text-4xl">🔍</div>
          <h1 className="text-white text-xl font-semibold">Shortlist Not Found</h1>
          <p className="text-slate-400 text-sm">{error}</p>
          <a
            href="/Home"
            className="inline-block bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            Start Your Own Search
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/95 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/Home" className="flex items-center gap-2 group">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699717aa28903550c09d4d26/cfcb6f29d_logo_NextSchool_full_white.png" alt="NextSchool" className="h-8" />
          </a>
          <a
            href="/Home"
            className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors font-medium"
          >
            Start your own search
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Title block */}
        <div className="mb-8 text-center">
          <h1 className="text-white text-2xl font-bold mb-2">Shared School Shortlist</h1>
          <p className="text-slate-400 text-sm">
            {shortlist.schools?.length} {shortlist.schools?.length === 1 ? 'school' : 'schools'} shortlisted
            {formattedDate && <span className="text-slate-500"> · Shared {formattedDate}</span>}
          </p>
        </div>

        {/* School grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {shortlist.schools?.map(school => (
            <SchoolCard key={school.id} school={school} />
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-12 text-center border-t border-slate-800 pt-10">
          <p className="text-slate-400 text-sm mb-4">Want to explore more schools with an AI consultant?</p>
          <a
            href="/Home"
            className="inline-block bg-teal-600 hover:bg-teal-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
          >
            Try NextSchool Free
          </a>
          <p className="text-slate-600 text-xs mt-3">Free · No account required to start</p>
        </div>
      </div>
    </div>
  );
}