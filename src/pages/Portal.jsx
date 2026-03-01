import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Building2, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import Navbar from "@/components/navigation/Navbar";

// --- T-SP-006: Fuzzy normalization helpers ---
function normalize(str = "") {
  return str
    .toLowerCase()
    .replace(/\bthe\b/g, "")
    .replace(/\bst\.\b/g, "saint")
    .replace(/\bst\b/g, "saint")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyScore(query, school) {
  const q = normalize(query);
  const name = normalize(school.name || "");
  const city = normalize(school.city || "");
  const province = normalize(school.provinceState || "");

  if (name.includes(q)) return 3;
  if (name.startsWith(q.slice(0, 4))) return 2;
  if (city.includes(q) || province.includes(q)) return 1;
  // token overlap
  const qTokens = q.split(" ").filter(Boolean);
  const nameTokens = name.split(" ");
  const overlap = qTokens.filter(t => nameTokens.some(n => n.startsWith(t))).length;
  return overlap / Math.max(qTokens.length, 1);
}

export default function Portal() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const search = useCallback(async (q) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      // Fetch a broad set and score client-side for fuzzy matching
      const allSchools = await base44.entities.School.list("-updated_date", 500);
      const norm = normalize(q);
      const scored = allSchools
        .filter(s => {
          const name = normalize(s.name || "");
          const city = normalize(s.city || "");
          const province = normalize(s.provinceState || "");
          return name.includes(norm) || norm.split(" ").some(t => t.length >= 3 && (name.includes(t) || city.includes(t) || province.includes(t)));
        })
        .map(s => ({ ...s, _score: fuzzyScore(q, s) }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 5);
      setResults(scored);
      setOpen(true);
      setSearched(true);
    } catch (_) {
      setResults([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !inputRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const noResults = searched && !loading && results.length === 0 && query.trim().length >= 2;

  return (
    <div className="min-h-screen bg-white">
      <Navbar minimal />

      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4">
        <div className="w-full max-w-xl text-center">
          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-3">
              Find Your School
            </h1>
            <p className="text-lg text-slate-500">
              Search for your school to claim and manage your profile, or add it if it's not listed yet.
            </p>
          </div>

          {/* Search */}
          <div className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-4 h-5 w-5 text-slate-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Type your school name..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
                className="w-full pl-11 pr-4 py-4 text-lg border-2 border-slate-200 rounded-2xl focus:border-teal-500 focus:outline-none shadow-sm transition-colors"
                autoFocus
              />
              {loading && (
                <div className="absolute right-4 h-5 w-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {/* Dropdown results */}
            {open && results.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
              >
                {results.map(school => (
                  <div
                    key={school.id}
                    className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Building2 className="h-5 w-5 text-slate-400 flex-shrink-0" />
                      <div className="text-left min-w-0">
                        <p className="font-medium text-slate-900 truncate">{school.name}</p>
                        <p className="text-sm text-slate-500 truncate">
                          {[school.city, school.provinceState].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    </div>
                    <Link to={createPageUrl(`ClaimSchool`) + `?schoolId=${school.id}`}>
                      <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white flex-shrink-0 ml-3">
                        Claim
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {/* No results CTA */}
            {noResults && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-slate-600 mb-4">
                  We couldn't find <span className="font-semibold text-slate-900">"{query}"</span> in our directory.
                </p>
                <Link to={createPageUrl("SubmitSchool") + `?name=${encodeURIComponent(query)}`}>
                  <Button className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Add Your School
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Helper text */}
          {!searched && (
            <p className="mt-6 text-sm text-slate-400">
              Already claimed?{" "}
              <Link to={createPageUrl("SchoolAdmin")} className="text-teal-600 hover:underline">
                Go to your dashboard
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}