import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, MapPin, DollarSign, Users, Loader2, Heart } from "lucide-react";
import Navbar from '@/components/navigation/Navbar';
import Footer from '@/components/navigation/Footer';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { HeaderPhotoDisplay, LogoDisplay } from '@/components/schools/HeaderPhotoHelper';

export default function SchoolDirectory() {
  const [allSchools, setAllSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRegion, setFilterRegion] = useState('all');
  const [displayedCount, setDisplayedCount] = useState(20);
  const [user, setUser] = useState(null);
  const [sessionId] = useState(Math.random().toString(36).substring(2, 11));
  const SCHOOLS_PER_PAGE = 20;

  useEffect(() => {
    // Track page view
    base44.functions.invoke('trackSessionEvent', {
      eventType: 'page_view',
      sessionId,
      metadata: { page: 'SchoolDirectory' }
    }).catch(err => console.error('Failed to track:', err));

    // Set meta tags for SEO
    document.title = 'Private School Directory - Browse Schools | NextSchool';
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }

    loadSchools();
    checkAuth();
  }, []);

  // Update meta description when schools are loaded
  useEffect(() => {
    if (allSchools.length > 0) {
      document.title = `Private School Directory - Browse ${allSchools.length} Schools | NextSchool`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.content = `Browse ${allSchools.length} private schools across Canada. Filter by location, grade, tuition, and more.`;
      }
    }
  }, [allSchools]);

  const checkAuth = async () => {
    try {
      const authenticated = await base44.auth.isAuthenticated();
      if (authenticated) {
        const userData = await base44.auth.me();
        setUser(userData);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  };

  const loadSchools = async () => {
    try {
      // Fetch ALL schools without limit
      const schools = await base44.entities.School.filter({ status: 'active' }, '-updated_date', 1000);
      setAllSchools(schools || []);
    } catch (error) {
      console.error('Failed to load schools:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCurrencySymbol = (currency) => {
    const symbols = { CAD: 'CA$', USD: '$', EUR: '€', GBP: '£' };
    return symbols[currency] || '$';
  };

  const filteredSchools = allSchools.filter(school => {
    const matchesSearch = school.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         school.city.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRegion = filterRegion === 'all' || school.region === filterRegion;
    return matchesSearch && matchesRegion;
  });

  const displayedSchools = filteredSchools.slice(0, displayedCount);
  const hasMore = displayedCount < filteredSchools.length;

  const handleLoadMore = () => {
    setDisplayedCount(prev => prev + SCHOOLS_PER_PAGE);
  };

  const handleToggleShortlist = async (schoolId) => {
    if (!user) {
      base44.auth.redirectToLogin(window.location.pathname);
      return;
    }

    try {
      const currentShortlist = user.shortlist || [];
      const newShortlist = currentShortlist.includes(schoolId)
        ? currentShortlist.filter(id => id !== schoolId)
        : [...currentShortlist, schoolId];

      await base44.auth.updateMe({ shortlist: newShortlist });
      setUser({ ...user, shortlist: newShortlist });
    } catch (error) {
      console.error('Failed to update shortlist:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* TASK E: Skip navigation */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-600 focus:text-white focus:rounded-lg"
      >
        Skip to main content
      </a>
      
      <Navbar />

      <div id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">School Directory</h1>
          <p className="text-sm sm:text-base text-slate-600">Browse all {allSchools.length} private schools across Canada, the US, and Europe</p>
        </div>

        {/* Search and Filters */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6 sm:mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setDisplayedCount(20);
              }}
              placeholder="Search by school name or city..."
              className="pl-10 focus:ring-2 focus:ring-teal-400"
              aria-label="Search schools by name or city"
            />
          </div>
          <select
            value={filterRegion}
            onChange={(e) => {
              setFilterRegion(e.target.value);
              setDisplayedCount(20);
            }}
            className="px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-teal-400 focus:outline-none"
            aria-label="Filter schools by region"
          >
            <option value="all">All Regions</option>
            <option value="Canada">Canada</option>
            <option value="US">United States</option>
            <option value="Europe">Europe</option>
          </select>
        </div>

        {/* Results count */}
        <div className="text-sm text-slate-600 mb-6">
          Showing {displayedSchools.length} of {filteredSchools.length} schools
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          </div>
        ) : (
          <>
            {/* Schools Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
              {displayedSchools.map((school) => {
                const isShortlisted = user?.shortlist?.includes(school.id) || false;
                
                return (
                  <Link 
                    key={school.id} 
                    to={`${createPageUrl('SchoolProfile')}?id=${school.id}`}
                    className="block focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 rounded-lg"
                  >
                    <Card className="h-full hover:shadow-lg transition-shadow overflow-hidden">
                      {/* Header Photo */}
                      <div className="h-32 sm:h-40 bg-gradient-to-br from-slate-200 to-slate-300 relative overflow-hidden">
                        {school.headerPhotoUrl && (
                          <img 
                            src={school.headerPhotoUrl} 
                            alt={`${school.name} campus`}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>

                      <div className="p-3 sm:p-4">
                        {/* Logo and Name */}
                        <div className="flex gap-2 sm:gap-3 mb-2 sm:mb-3">
                          {school.logoUrl && (
                            <div className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
                              <img 
                                src={school.logoUrl} 
                                alt={`${school.name} logo`}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h2 className="font-semibold text-sm sm:text-base text-slate-900 line-clamp-2">{school.name}</h2>
                          </div>
                        </div>

                        {/* Location and Grades */}
                        <div className="space-y-1 text-xs sm:text-sm text-slate-600 mb-3">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3 sm:h-4 w-3 sm:w-4 flex-shrink-0" />
                            <span className="truncate">{school.city}, {school.provinceState || school.country}</span>
                          </div>
                          {school.gradesServed && (
                            <div className="flex items-center gap-2">
                              <Users className="h-3 sm:h-4 w-3 sm:w-4 flex-shrink-0" />
                              <span>Grades {school.gradesServed}</span>
                            </div>
                          )}
                          {school.tuition && (
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-3 sm:h-4 w-3 sm:w-4 flex-shrink-0" />
                              <span className="truncate">{getCurrencySymbol(school.currency)}{school.tuition.toLocaleString()}/year</span>
                            </div>
                          )}
                        </div>

                        {/* Highlights */}
                        {school.highlights && school.highlights.length > 0 && (
                          <p className="text-xs text-slate-600 mb-4 line-clamp-2">
                            {school.highlights[0]}
                          </p>
                        )}

                        {/* Shortlist Button */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            handleToggleShortlist(school.id);
                          }}
                          className={`w-full py-2 px-3 rounded-lg text-xs sm:text-sm font-medium transition-colors focus:ring-2 focus:ring-teal-400 focus:outline-none ${
                            isShortlisted
                              ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                          aria-label={isShortlisted ? `Remove ${school.name} from shortlist` : `Add ${school.name} to shortlist`}
                        >
                          <Heart className={`h-3 sm:h-4 w-3 sm:w-4 inline mr-2 ${isShortlisted ? 'fill-current' : ''}`} />
                          {isShortlisted ? 'Saved' : 'Save School'}
                        </button>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>

            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center">
                <Button
                  onClick={handleLoadMore}
                  className="bg-teal-600 hover:bg-teal-700 px-8"
                >
                  Load More ({filteredSchools.length - displayedCount} remaining)
                </Button>
              </div>
            )}

            {/* No results */}
            {filteredSchools.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-600">No schools found matching your criteria.</p>
              </div>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}