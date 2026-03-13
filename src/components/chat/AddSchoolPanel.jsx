import { useState, useEffect, useRef } from 'react';
import { X, Check, Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AddSchoolPanel({ onClose, onToggleShortlist, shortlistedIds, base44 }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const found = await base44.entities.School.filter(
          { name: { $regex: query, $options: 'i' } },
          'name',
          10
        );
        setResults(found);
      } catch (e) {
        console.error('[AddSchoolPanel] search failed:', e);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleAdd = (school) => {
    onToggleShortlist(school.id, { school });
    toast(`${school.name} added to shortlist`);
    onClose();
  };

  const gradeRange = (school) => {
    if (school.lowestGrade != null && school.highestGrade != null) {
      return `Gr ${school.lowestGrade}–${school.highestGrade}`;
    }
    return school.gradesServed || '';
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#1A1A2A', borderLeft: '1px solid rgba(255,255,255,0.08)', width: 320 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-white font-semibold text-sm">+ Add School</span>
        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Search input */}
      <div className="px-3 py-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search schools by name or city..."
          autoFocus
          className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-white/30 border border-white/10 outline-none focus:border-teal-500 transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="animate-spin text-teal-400" style={{ width: 20, height: 20 }} />
          </div>
        )}

        {!isLoading && !query.trim() && (
          <p className="text-white/30 text-xs text-center mt-6 px-2">
            Search any school in Canada by name
          </p>
        )}

        {!isLoading && query.trim() && results.length === 0 && (
          <p className="text-white/30 text-xs text-center mt-6">
            No schools found. Try a different name.
          </p>
        )}

        {!isLoading && results.map(school => {
          const isShortlisted = shortlistedIds.includes(school.id);
          return (
            <div
              key={school.id}
              className="flex items-center justify-between gap-2 py-2.5 border-b border-white/05"
            >
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{school.name}</p>
                <p className="text-white/40 text-xs truncate">
                  {[school.city, school.provinceState].filter(Boolean).join(', ')}
                  {gradeRange(school) ? ` · ${gradeRange(school)}` : ''}
                </p>
              </div>
              {isShortlisted ? (
                <Check style={{ width: 16, height: 16, flexShrink: 0, color: '#0D9488' }} />
              ) : (
                <button
                  onClick={() => handleAdd(school)}
                  className="flex-shrink-0 flex items-center justify-center rounded-full transition-colors hover:bg-teal-500/20"
                  style={{ width: 26, height: 26, background: 'rgba(13,148,136,0.15)', color: '#0D9488' }}
                >
                  <Plus style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}