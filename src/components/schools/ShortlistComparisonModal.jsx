import { useState, useRef, useEffect } from 'react';
import { X, Check, Circle, ChevronLeft, ChevronRight } from 'lucide-react';
import { buildPriorityChecks } from './SchoolCard';
import { HeaderPhotoDisplay } from './HeaderPhotoHelper';

// =============================================================================
// T-SL-003: ShortlistComparisonModal
// Brief-driven side-by-side comparison for shortlisted schools (max 3 at once)
// Uses buildPriorityChecks to derive rows from familyProfile — no generic grid
// =============================================================================

function formatGrade(grade) {
  if (grade === null || grade === undefined) return '';
  const n = Number(grade);
  if (n <= -2) return 'PK';
  if (n === -1) return 'JK';
  if (n === 0) return 'K';
  return String(n);
}

function formatTuition(school) {
  const val = school.dayTuition ?? school.tuition;
  if (!val) return 'Contact school';
  const symbol = school.currency === 'USD' ? 'US$' : school.currency === 'GBP' ? '£' : '$';
  return `${symbol}${val.toLocaleString()}`;
}

function StatusIcon({ status }) {
  if (status === 'match') return <Check className="h-4 w-4 text-green-600 flex-shrink-0" />;
  if (status === 'mismatch') return <X className="h-4 w-4 text-red-400 flex-shrink-0" />;
  return <Circle className="h-4 w-4 text-slate-300 flex-shrink-0" />;
}

// Derive the union of all priority row IDs from all selected schools
function buildRowsFromProfiles(schools, familyProfile) {
  if (!familyProfile) return [];
  const rowMap = new Map();
  for (const school of schools) {
    const checks = buildPriorityChecks(school, familyProfile);
    for (const row of checks) {
      if (!rowMap.has(row.id)) rowMap.set(row.id, row.label);
    }
  }
  // Always prepend baseline rows
  const baseline = [
    { id: '_location', label: 'Location' },
    { id: '_grades', label: 'Grades' },
    { id: '_tuition', label: 'Tuition' },
  ];
  const priorityRows = Array.from(rowMap.entries()).map(([id, label]) => ({ id, label }));
  return [...baseline, ...priorityRows];
}

function getCellForRow(rowId, school, familyProfile) {
  if (rowId === '_location') {
    const loc = [school.city, school.provinceState].filter(Boolean).join(', ');
    return { status: 'info', detail: loc || '—' };
  }
  if (rowId === '_grades') {
    const f = formatGrade(school.lowestGrade), t = formatGrade(school.highestGrade);
    return { status: 'info', detail: f && t ? `${f}–${t}` : '—' };
  }
  if (rowId === '_tuition') {
    return { status: 'info', detail: formatTuition(school) };
  }
  const checks = buildPriorityChecks(school, familyProfile);
  const found = checks.find(r => r.id === rowId);
  if (!found) return { status: 'unknown', detail: 'No data' };
  return { status: found.status, detail: found.detail };
}

export default function ShortlistComparisonModal({ schools, familyProfile, onClose, onNarrateComparison }) {
  const MAX = 3;
  const [selected, setSelected] = useState(() => schools.slice(0, MAX).map(s => s.id));
  const scrollRef = useRef(null);
  const narratedRef = useRef(false);

  const displaySchools = schools.filter(s => selected.includes(s.id)).slice(0, MAX);
  const rows = buildRowsFromProfiles(displaySchools, familyProfile);

  // T-SL-005: Trigger narration once on open (fresh each time modal mounts)
  useEffect(() => {
    if (!narratedRef.current && displaySchools.length >= 2 && onNarrateComparison) {
      narratedRef.current = true;
      onNarrateComparison(displaySchools);
    }
  }, []);

  const toggleSchool = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev; // min 2
        return prev.filter(x => x !== id);
      }
      if (prev.length >= MAX) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-4xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Compare Shortlisted Schools</h2>
            <p className="text-xs text-slate-500 mt-0.5">Rows drawn from your brief priorities</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* School picker (if > MAX shortlisted) */}
        {schools.length > MAX && (
          <div className="px-5 py-3 border-b border-slate-100 flex-shrink-0 bg-slate-50">
            <p className="text-xs text-slate-500 mb-2">Select up to 3 schools to compare:</p>
            <div className="flex gap-2 flex-wrap">
              {schools.map(s => (
                <button
                  key={s.id}
                  onClick={() => toggleSchool(s.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                    selected.includes(s.id)
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Comparison table */}
        <div className="flex-1 overflow-auto" ref={scrollRef}>
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: displaySchools.length > 1 ? `${displaySchools.length * 180 + 120}px` : undefined }}>
            <colgroup>
              <col style={{ width: '130px' }} />
              {displaySchools.map(s => <col key={s.id} />)}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr>
                <th className="p-3 bg-white border-b border-slate-100" />
                {displaySchools.map(school => (
                  <th key={school.id} className="p-0 border-b border-slate-100 border-l border-l-slate-100">
                    <div className="relative h-24 bg-slate-100 overflow-hidden">
                      <HeaderPhotoDisplay
                        headerPhotoUrl={school.headerPhotoUrl}
                        heroImage={school.heroImage}
                        schoolName={school.name}
                        height="h-24"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-white text-xs font-semibold line-clamp-2 leading-tight">{school.name}</p>
                        {school.distanceKm != null && (
                          <p className="text-white/80 text-xs">{school.distanceKm.toFixed(1)} km</p>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  <td className="p-3 text-xs font-medium text-slate-600 border-b border-slate-100 align-middle sticky left-0 bg-inherit z-[1]">
                    {row.label}
                  </td>
                  {displaySchools.map(school => {
                    const cell = getCellForRow(row.id, school, familyProfile);
                    return (
                      <td key={school.id} className="p-3 border-b border-slate-100 border-l border-l-slate-100 align-middle">
                        <div className="flex items-center gap-1.5">
                          {cell.status !== 'info' && <StatusIcon status={cell.status} />}
                          <span className={`text-xs ${
                            cell.status === 'match' ? 'text-slate-700' :
                            cell.status === 'mismatch' ? 'text-slate-400' :
                            cell.status === 'info' ? 'text-slate-700 font-medium' :
                            'text-slate-400 italic'
                          }`}>{cell.detail}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}