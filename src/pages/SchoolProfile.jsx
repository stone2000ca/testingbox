import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { MapPin, Users, DollarSign, Calendar, Award, Globe2, Heart, Mail, Phone, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import ContactSchoolModal from '@/components/schools/ContactSchoolModal';
import Navbar from '@/components/navigation/Navbar';
import { HeaderPhotoDisplay, LogoDisplay, isClearbitUrl } from '@/components/schools/HeaderPhotoHelper';

export default function SchoolProfile() {
  const location = useLocation();
  const schoolId = new URLSearchParams(location.search).get('id');
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isShortlisted, setIsShortlisted] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [testimonials, setTestimonials] = useState([]);
  const [sessionId] = useState(Math.random().toString(36).substring(2, 11));

  useEffect(() => {
    // Track page view
    base44.functions.invoke('trackSessionEvent', {
      eventType: 'page_view',
      sessionId,
      metadata: { page: 'SchoolProfile', schoolId }
    }).catch(err => console.error('Failed to track:', err));

    loadSchool();
    checkAuth();
  }, [schoolId, sessionId]);

  useEffect(() => {
    if (schoolId) {
      base44.entities.Testimonial.filter({ school_id: schoolId, is_visible: true })
        .then(setTestimonials)
        .catch(() => {});
    }
  }, [schoolId]);

  useEffect(() => {
    if (!school) return;

    // Set meta tags for SEO
    const gradeRange = school.gradesServed || '';
    document.title = `${school.name} - Grades ${gradeRange}, Tuition, Programs | NextSchool`;
    
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    const desc = (school.missionStatement || school.teachingPhilosophy || '').substring(0, 155);
    metaDesc.content = desc || `${school.name} - Private school in ${school.city}`;

    // OG Tags
    const ogTags = {
      'og:title': `${school.name} - Grades ${gradeRange} | NextSchool`,
      'og:description': desc || `Discover ${school.name} in ${school.city}`,
      'og:image': school.logoUrl || school.headerPhotoUrl || '/logo.png',
      'og:url': `https://nextschool.ca/SchoolProfile?id=${schoolId}`,
      'og:type': 'place',
      'og:site_name': 'NextSchool'
    };

    for (const [property, content] of Object.entries(ogTags)) {
      let tag = document.querySelector(`meta[property="${property}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute('property', property);
        document.head.appendChild(tag);
      }
      tag.content = content;
    }

    // Structured Data for School
    const schemaData = {
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      name: school.name,
      url: `https://nextschool.ca/SchoolProfile?id=${schoolId}`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: school.address || '',
        addressLocality: school.city || '',
        addressRegion: school.provinceState || '',
        addressCountry: school.country || 'CA'
      },
      telephone: school.phone || '',
      email: school.email || '',
      description: school.missionStatement || '',
      ...(school.enrollment && { numberOfStudents: school.enrollment }),
      priceRange: school.tuition ? `${school.currency || 'CAD'} ${school.tuition}` : '',
      image: school.logoUrl || school.headerPhotoUrl || '',
      ...(school.website && { sameAs: school.website.startsWith('http') ? school.website : `https://${school.website}` })
    };

    let schemaScript = document.querySelector('script[data-schema="school"]');
    if (!schemaScript) {
      schemaScript = document.createElement('script');
      schemaScript.type = 'application/ld+json';
      schemaScript.setAttribute('data-schema', 'school');
      document.head.appendChild(schemaScript);
    }
    schemaScript.innerHTML = JSON.stringify(schemaData);
  }, [school, schoolId]);

  const checkAuth = async () => {
    try {
      const authenticated = await base44.auth.isAuthenticated();
      if (authenticated) {
        const userData = await base44.auth.me();
        setUser(userData);
        setIsShortlisted(userData.shortlist?.includes(schoolId) || false);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  };

  const loadSchool = async () => {
    try {
      const schools = await base44.entities.School.filter({ id: schoolId });
      if (schools && schools.length > 0) {
        setSchool(schools[0]);
      }
    } catch (error) {
      console.error('Failed to load school:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleShortlist = async () => {
    if (!user) {
      base44.auth.redirectToLogin(window.location.pathname + window.location.search);
      return;
    }

    try {
      const currentShortlist = user.shortlist || [];
      const newShortlist = isShortlisted
        ? currentShortlist.filter(id => id !== schoolId)
        : [...currentShortlist, schoolId];

      await base44.auth.updateMe({ shortlist: newShortlist });
      setIsShortlisted(!isShortlisted);
      setUser({ ...user, shortlist: newShortlist });
    } catch (error) {
      console.error('Failed to update shortlist:', error);
    }
  };

  const getCurrencySymbol = (currency) => {
    const symbols = { CAD: 'CA$', USD: '$', EUR: '€', GBP: '£' };
    return symbols[currency] || '$';
  };

  const getRegionBadge = (region) => {
    const badges = {
      Canada: { emoji: '🍁', color: 'bg-red-50 text-red-700' },
      US: { emoji: '🇺🇸', color: 'bg-blue-50 text-blue-700' },
      Europe: { emoji: '🇪🇺', color: 'bg-indigo-50 text-indigo-700' }
    };
    return badges[region] || { emoji: '🌍', color: 'bg-slate-50 text-slate-700' };
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!school) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">School Not Found</h2>
          <Link to={createPageUrl('Consultant')}>
            <Button>Back to Search</Button>
          </Link>
        </div>
      </div>
    );
  }

  const badge = getRegionBadge(school.region);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      {/* Hero Section */}
      <div className="relative h-56 sm:h-80 lg:h-96 bg-slate-200">
        <img 
          src={school.headerPhotoUrl || school.heroImage || `https://via.placeholder.com/1200x675/e2e8f0/64748b?text=${encodeURIComponent(school.name)}`}
          alt={`${school.name} campus`}
          className="w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        {/* School Logo - Overlapping Bottom Left */}
        {school.logoUrl && !isClearbitUrl(school.headerPhotoUrl) && (
          <div className="absolute bottom-0 left-0 p-4 sm:p-8 pb-0">
            <div className="transform translate-y-1/2">
              <img 
                src={school.logoUrl} 
                alt={`${school.name} logo`}
                className="h-16 sm:h-24 w-16 sm:w-24 rounded-lg bg-white p-2 shadow-lg object-contain"
                loading="eager"
              />
            </div>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8 text-white">
          <div className="max-w-7xl mx-auto">
            <div className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium mb-2 sm:mb-3 ${badge.color}`}>
              {badge.emoji} {school.region}
            </div>
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              {school.logoUrl && isClearbitUrl(school.headerPhotoUrl) && (
                <img 
                  src={school.logoUrl} 
                  alt={`${school.name} logo`}
                  className="h-8 sm:h-12 w-8 sm:w-12 rounded-lg bg-white p-1 sm:p-2 shadow-lg object-contain"
                  loading="eager"
                />
              )}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">{school.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 sm:h-4 w-3 sm:w-4 flex-shrink-0" />
                <span className="truncate">{school.city}, {school.provinceState}</span>
              </span>
              {school.verified && (
                <span className="flex items-center gap-1 bg-teal-600 px-2 py-1 rounded">
                  <Award className="h-3 sm:h-4 w-3 sm:w-4" />
                  Verified
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
            <div>
              <div className="text-xs sm:text-sm text-slate-600 mb-1">Grades</div>
              <div className="text-base sm:text-xl font-bold truncate">{school.gradesServed}</div>
            </div>
            <div>
              <div className="text-xs sm:text-sm text-slate-600 mb-1">Enrollment</div>
              <div className="text-base sm:text-xl font-bold">{school.enrollment || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs sm:text-sm text-slate-600 mb-1">Annual Tuition</div>
              <div className="text-base sm:text-xl font-bold truncate">
                {school.dayTuition ? `${getCurrencySymbol(school.currency)}${school.dayTuition.toLocaleString()}` : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-xs sm:text-sm text-slate-600 mb-1">Class Size</div>
              <div className="text-base sm:text-xl font-bold">{school.avgClassSize || 'N/A'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
                <TabsTrigger value="programs" className="text-xs sm:text-sm">Programs</TabsTrigger>
                <TabsTrigger value="admissions" className="text-xs sm:text-sm">Admissions</TabsTrigger>
                <TabsTrigger value="photos" className="text-xs sm:text-sm">Photos</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                {school.description && (
                  <Card className="p-6 bg-slate-50 border-slate-200">
                    <h2 className="text-lg font-bold mb-3">About</h2>
                    <p className="text-slate-700 leading-relaxed">{school.description}</p>
                  </Card>
                )}

                {school.highlights && school.highlights.length > 0 && (
                  <Card className="p-6 bg-gradient-to-r from-teal-50 to-cyan-50 border-teal-200">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Award className="h-5 w-5 text-teal-600" />
                      What Makes This School Special
                    </h2>
                    <ul className="space-y-2">
                      {school.highlights.slice(0, 3).map((highlight, idx) => (
                        <li key={idx} className="flex gap-3">
                          <span className="text-teal-600 font-bold">✦</span>
                          <span className="text-teal-900">{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {school.missionStatement && (
                  <Card className="p-6">
                    <h2 className="text-xl font-bold mb-3">Mission Statement</h2>
                    <p className="text-slate-700 leading-relaxed">{school.missionStatement}</p>
                  </Card>
                )}

                {(school.teachingPhilosophy || school.curriculumType) && (
                  <Card className="p-6">
                    <h2 className="text-xl font-bold mb-3">Teaching Philosophy</h2>
                    {school.teachingPhilosophy && (
                      <p className="text-slate-700 mb-4">{school.teachingPhilosophy}</p>
                    )}
                    {school.curriculumType && (
                      <div>
                        <span className="text-sm text-slate-600 font-medium">Curriculum Type:</span>
                        <span className="ml-2 px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm font-medium">
                          {school.curriculumType}
                        </span>
                      </div>
                    )}
                  </Card>
                )}

                {school.values && school.values.length > 0 && (
                  <Card className="p-6">
                    <h2 className="text-xl font-bold mb-3">Core Values</h2>
                    <div className="flex flex-wrap gap-2">
                      {school.values.map((value, index) => (
                        <span key={index} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
                          {value}
                        </span>
                      ))}
                    </div>
                  </Card>
                )}

                {(school.founded || school.studentTeacherRatio || school.financialAidAvailable !== null || school.religiousAffiliation) && (
                  <Card className="p-6">
                    <h2 className="text-xl font-bold mb-4">Key Facts</h2>
                    <div className="space-y-3">
                      {school.founded && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Founded</span>
                          <span className="font-medium">{school.founded}</span>
                        </div>
                      )}
                      {school.studentTeacherRatio && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Student:Teacher Ratio</span>
                          <span className="font-medium">{school.studentTeacherRatio}</span>
                        </div>
                      )}
                      {school.financialAidAvailable !== null && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Financial Aid</span>
                          <span className="font-medium">{school.financialAidAvailable ? 'Available' : 'Not Available'}</span>
                        </div>
                      )}
                      {school.religiousAffiliation && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Religious Affiliation</span>
                          <span className="font-medium">{school.religiousAffiliation}</span>
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="programs" className="space-y-6">
                {/* Curriculum & Core Programs */}
                <Card className="p-6 bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200">
                  <h2 className="text-lg font-bold mb-4">Academic Programs</h2>
                  <div className="space-y-3">
                    {school.curriculumType && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Curriculum</span>
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">{school.curriculumType}</span>
                      </div>
                    )}
                    {school.lowestGrade !== null && school.highestGrade !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Grade Levels</span>
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">{school.gradesServed}</span>
                      </div>
                    )}
                    {school.avgClassSize && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Average Class Size</span>
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">{school.avgClassSize} students</span>
                      </div>
                    )}
                    {school.studentTeacherRatio && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Student-Teacher Ratio</span>
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">{school.studentTeacherRatio}</span>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Specializations */}
                {school.specializations && school.specializations.length > 0 && (
                  <Card className="p-6">
                    <h2 className="text-lg font-bold mb-4">Areas of Specialization</h2>
                    <div className="flex flex-wrap gap-2">
                      {school.specializations.map((spec, index) => {
                        const colors = {
                          'STEM': 'bg-purple-100 text-purple-700',
                          'Arts': 'bg-amber-100 text-amber-700',
                          'Languages': 'bg-indigo-100 text-indigo-700',
                          'Sports': 'bg-teal-100 text-teal-700',
                          'Leadership': 'bg-orange-100 text-orange-700',
                          'Environmental': 'bg-green-100 text-green-700'
                        };
                        return (
                          <span key={index} className={`px-3 py-1 rounded-full text-sm font-medium ${colors[spec] || 'bg-slate-100 text-slate-700'}`}>
                            {spec}
                          </span>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {school.artsPrograms && school.artsPrograms.length > 0 && (
                  <Card className="p-6">
                    <h2 className="text-lg font-bold mb-3">Arts Programs</h2>
                    <div className="flex flex-wrap gap-2">
                      {school.artsPrograms.map((program, index) => (
                        <span key={index} className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
                          {program}
                        </span>
                      ))}
                    </div>
                  </Card>
                )}

                {school.sportsPrograms && school.sportsPrograms.length > 0 && (
                  <Card className="p-6">
                    <h2 className="text-lg font-bold mb-3">Sports Programs</h2>
                    <div className="flex flex-wrap gap-2">
                      {school.sportsPrograms.map((program, index) => (
                        <span key={index} className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm">
                          {program}
                        </span>
                      ))}
                    </div>
                  </Card>
                )}

                {school.languages && school.languages.length > 0 && (
                  <Card className="p-6">
                    <h2 className="text-lg font-bold mb-3">Language Programs</h2>
                    <div className="flex flex-wrap gap-2">
                      {school.languages.map((language, index) => (
                        <span key={index} className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">
                          {language}
                        </span>
                      ))}
                    </div>
                  </Card>
                )}

                {school.clubs && school.clubs.length > 0 && (
                  <Card className="p-6">
                    <h2 className="text-lg font-bold mb-3">Clubs & Extracurricular Activities</h2>
                    <div className="flex flex-wrap gap-2">
                      {school.clubs.map((club, index) => (
                        <span key={index} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
                          {club}
                        </span>
                      ))}
                    </div>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="admissions" className="space-y-6">
                <Card className="p-6">
                  <h2 className="text-xl font-bold mb-4">Admissions Information</h2>
                  {school.applicationDeadline && (
                    <div className="mb-4">
                      <span className="text-slate-600 font-medium">Application Deadline:</span>
                      <span className="ml-2">{school.applicationDeadline}</span>
                    </div>
                  )}
                  {school.acceptanceRate && (
                    <div className="mb-4">
                      <span className="text-slate-600 font-medium">Acceptance Rate:</span>
                      <span className="ml-2">{school.acceptanceRate}%</span>
                    </div>
                  )}
                  {school.admissionRequirements && school.admissionRequirements.length > 0 && (
                    <div className="mb-4">
                      <span className="text-slate-600 font-medium mb-2 block">Requirements:</span>
                      <ul className="list-disc ml-6 text-slate-700 space-y-1">
                        {school.admissionRequirements.map((req, index) => (
                          <li key={index}>{req}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {school.openHouseDates && school.openHouseDates.length > 0 && (
                    <div>
                      <span className="text-slate-600 font-medium mb-2 block">Open House Dates:</span>
                      <div className="space-y-1 text-slate-700">
                        {school.openHouseDates.map((date, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-teal-600" />
                            {date}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="photos" className="space-y-6">
                <Card className="p-4 sm:p-6">
                  <h2 className="text-lg sm:text-xl font-bold mb-4">Gallery</h2>
                  {school.photoGallery && school.photoGallery.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      {school.photoGallery.map((photo, index) => (
                        <img 
                          key={index} 
                          src={photo} 
                          alt={`${school.name} campus photo ${index + 1}`}
                          className="rounded-lg w-full h-40 sm:h-48 object-cover"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500">No photos available yet.</p>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 sm:space-y-6">
            <Card className="p-4 sm:p-6 lg:sticky lg:top-24">
              <Button 
                className="w-full mb-3 bg-teal-600 hover:bg-teal-700 text-sm sm:text-base"
                onClick={() => setShowContactModal(true)}
              >
                <Mail className="h-4 w-4 mr-2" />
                Contact This School
              </Button>
              <Button 
                className={`w-full mb-4 text-sm sm:text-base ${isShortlisted ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                variant={isShortlisted ? "default" : "outline"}
                onClick={handleToggleShortlist}
              >
                <Heart className={`h-4 w-4 mr-2 ${isShortlisted ? 'fill-current' : ''}`} />
                {isShortlisted ? 'Shortlisted' : 'Add to Shortlist'}
              </Button>

              {/* Claim Button / Badge */}
              {(!school.claimStatus || school.claimStatus === 'unclaimed') && (
                <Link to={`${createPageUrl('ClaimSchool')}?schoolId=${schoolId}`} className="block w-full">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 mb-4">
                    Claim This School
                  </Button>
                </Link>
              )}
              {school.claimStatus === 'pending' && (
                <div className="w-full px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm text-center mb-4">
                  Claim in Progress
                </div>
              )}
              {school.claimStatus === 'claimed' && (
                <div className="w-full px-3 py-2 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-sm text-center mb-4">
                  ✓ Managed by school
                </div>
              )}

              <div className="space-y-3 sm:space-y-4">
                <h2 className="font-bold text-sm sm:text-base">Contact Information</h2>
                {school.phone && (
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Phone className="h-3 sm:h-4 w-3 sm:w-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{school.phone}</span>
                  </div>
                )}
                {school.email && (
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Mail className="h-3 sm:h-4 w-3 sm:w-4 text-slate-400 flex-shrink-0" />
                    <a href={`mailto:${school.email}`} className="text-teal-600 hover:underline truncate">
                      {school.email}
                    </a>
                  </div>
                )}
                {school.website && (
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Globe2 className="h-3 sm:h-4 w-3 sm:w-4 text-slate-400 flex-shrink-0" />
                    <a 
                      href={school.website.startsWith('http') ? school.website : `https://${school.website}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-teal-600 hover:underline flex items-center gap-1 truncate"
                    >
                      Visit Website
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                )}
              </div>

              {school.accreditations && school.accreditations.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h2 className="font-bold mb-2">Accreditations</h2>
                  <div className="flex flex-wrap gap-2">
                    {school.accreditations.map((acc, index) => (
                      <span key={index} className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded">
                        {acc}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {showContactModal && (
        <ContactSchoolModal
          school={school}
          onClose={() => setShowContactModal(false)}
        />
      )}
    </div>
  );
}