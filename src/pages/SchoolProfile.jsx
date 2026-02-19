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

export default function SchoolProfile() {
  const location = useLocation();
  const schoolId = new URLSearchParams(location.search).get('id');
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isShortlisted, setIsShortlisted] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  useEffect(() => {
    loadSchool();
    checkAuth();
  }, [schoolId]);

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
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link to={createPageUrl('Home')} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">NextSchool</span>
          </Link>
          <Link to={createPageUrl('Consultant')}>
            <Button variant="outline">Back to Search</Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative h-96 bg-slate-200">
        {school.heroImage ? (
          <img 
            src={school.heroImage} 
            alt={school.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-100 to-teal-200">
            <Users className="h-32 w-32 text-teal-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
          <div className="max-w-7xl mx-auto">
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-3 ${badge.color}`}>
              {badge.emoji} {school.region}
            </div>
            <h1 className="text-4xl font-bold mb-2">{school.name}</h1>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {school.city}, {school.provinceState}
              </span>
              {school.verified && (
                <span className="flex items-center gap-1 bg-teal-600 px-2 py-1 rounded">
                  <Award className="h-4 w-4" />
                  Verified
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-slate-600 mb-1">Grades</div>
              <div className="text-xl font-bold">{school.gradesServed}</div>
            </div>
            <div>
              <div className="text-sm text-slate-600 mb-1">Enrollment</div>
              <div className="text-xl font-bold">{school.enrollment}</div>
            </div>
            <div>
              <div className="text-sm text-slate-600 mb-1">Annual Tuition</div>
              <div className="text-xl font-bold">
                {getCurrencySymbol(school.currency)}{school.tuition?.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-600 mb-1">Class Size</div>
              <div className="text-xl font-bold">{school.avgClassSize}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="programs">Programs</TabsTrigger>
                <TabsTrigger value="admissions">Admissions</TabsTrigger>
                <TabsTrigger value="photos">Photos</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <Card className="p-6">
                  <h3 className="text-xl font-bold mb-3">Mission Statement</h3>
                  <p className="text-slate-700 leading-relaxed">{school.missionStatement}</p>
                </Card>

                <Card className="p-6">
                  <h3 className="text-xl font-bold mb-3">Teaching Philosophy</h3>
                  <p className="text-slate-700">{school.teachingPhilosophy}</p>
                  <div className="mt-4">
                    <span className="text-sm text-slate-600 font-medium">Curriculum Type:</span>
                    <span className="ml-2 px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm font-medium">
                      {school.curriculumType}
                    </span>
                  </div>
                </Card>

                {school.values && school.values.length > 0 && (
                  <Card className="p-6">
                    <h3 className="text-xl font-bold mb-3">Core Values</h3>
                    <div className="flex flex-wrap gap-2">
                      {school.values.map((value, index) => (
                        <span key={index} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
                          {value}
                        </span>
                      ))}
                    </div>
                  </Card>
                )}

                <Card className="p-6">
                  <h3 className="text-xl font-bold mb-4">Key Facts</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Founded</span>
                      <span className="font-medium">{school.founded}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Student:Teacher Ratio</span>
                      <span className="font-medium">{school.studentTeacherRatio}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Financial Aid</span>
                      <span className="font-medium">{school.financialAidAvailable ? 'Available' : 'Not Available'}</span>
                    </div>
                    {school.religiousAffiliation && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Religious Affiliation</span>
                        <span className="font-medium">{school.religiousAffiliation}</span>
                      </div>
                    )}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="programs" className="space-y-6">
                {school.artsPrograms && school.artsPrograms.length > 0 && (
                  <Card className="p-6">
                    <h3 className="text-xl font-bold mb-3">Arts Programs</h3>
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
                    <h3 className="text-xl font-bold mb-3">Sports Programs</h3>
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
                    <h3 className="text-xl font-bold mb-3">Language Programs</h3>
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
                    <h3 className="text-xl font-bold mb-3">Clubs & Activities</h3>
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
                  <h3 className="text-xl font-bold mb-4">Admissions Information</h3>
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
                    <div>
                      <span className="text-slate-600 font-medium block mb-2">Requirements:</span>
                      <ul className="list-disc list-inside space-y-1 text-slate-700">
                        {school.admissionRequirements.map((req, index) => (
                          <li key={index}>{req}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="photos">
                <Card className="p-6">
                  <h3 className="text-xl font-bold mb-4">Photo Gallery</h3>
                  {school.photoGallery && school.photoGallery.length > 0 ? (
                    <div className="grid grid-cols-2 gap-4">
                      {school.photoGallery.map((photo, index) => (
                        <img 
                          key={index}
                          src={photo} 
                          alt={`${school.name} ${index + 1}`}
                          className="w-full h-48 object-cover rounded-lg"
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
          <div className="space-y-6">
            <Card className="p-6 sticky top-24">
              <Button 
                className="w-full mb-3 bg-teal-600 hover:bg-teal-700"
                onClick={() => setShowContactModal(true)}
              >
                <Mail className="h-4 w-4 mr-2" />
                Contact This School
              </Button>
              <Button 
                className={`w-full mb-4 ${isShortlisted ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                variant={isShortlisted ? "default" : "outline"}
                onClick={handleToggleShortlist}
              >
                <Heart className={`h-4 w-4 mr-2 ${isShortlisted ? 'fill-current' : ''}`} />
                {isShortlisted ? 'Shortlisted' : 'Add to Shortlist'}
              </Button>

              <div className="space-y-4">
                <h3 className="font-bold">Contact Information</h3>
                {school.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{school.phone}</span>
                  </div>
                )}
                {school.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <a href={`mailto:${school.email}`} className="text-teal-600 hover:underline">
                      {school.email}
                    </a>
                  </div>
                )}
                {school.website && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe2 className="h-4 w-4 text-slate-400" />
                    <a 
                      href={`https://${school.website}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-teal-600 hover:underline flex items-center gap-1"
                    >
                      Visit Website
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              {school.accreditations && school.accreditations.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h3 className="font-bold mb-2">Accreditations</h3>
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