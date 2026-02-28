// T-RES-005: Sort toggle bar — 4 options, replaces old dropdown
const SORT_OPTIONS = [
  { value: 'bestFit',     label: 'Best Fit' },
  { value: 'closest',     label: 'Closest to Me' },
  { value: 'affordable',  label: 'Most Affordable' },
  { value: 'newest',      label: 'New to Me' },
];

export default function SortControl({ sortMode, onSortChange }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {SORT_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onSortChange(opt.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
            sortMode === opt.value
              ? 'bg-slate-800 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}