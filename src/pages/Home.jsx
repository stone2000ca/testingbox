import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageSquare, Zap, BarChart3, CheckCircle2 } from "lucide-react";
import { createPageUrl } from "../utils";
import { Link } from "react-router-dom";
import Navbar from "@/components/navigation/Navbar";
import { base44 } from '@/api/base44Client';
import SchoolCardUnified from '@/components/schools/SchoolCardUnified';

export default function Home() {
  const [schools, setSchools] = useState([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [sessionId] = useState(Math.random().toString(36).substring(2, 11));

  useEffect(() => {
    // Track page view
    base44.functions.invoke('trackSessionEvent', {
      eventType: 'page_view',
      sessionId,
      metadata: { page: 'Home' }
    }).catch(err => console.error('Failed to track:', err));

    // Set meta tags for SEO
    document.title = 'NextSchool - Find the Perfect Private School for Your Child';
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = 'AI-powered education consultant helping Canadian parents find, compare, and choose the right private school. Chat with Jackie or Liam to start your search.';

    // OG Tags
    const ogTags = {
      'og:title': 'NextSchool - Find the Perfect Private School for Your Child',
      'og:description': 'AI-powered education consultant helping Canadian parents find, compare, and choose the right private school. Chat with Jackie or Liam to start your search.',
      'og:image': '/logo.png',
      'og:url': 'https://nextschool.ca/Home',
      'og:type': 'website',
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

    // Structured Data for Website
    const schemaData = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'NextSchool',
      url: 'https://nextschool.ca',
      description: 'AI-powered education consultant helping families find the perfect private school',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://nextschool.ca/Consultant?q={search_term_string}'
        },
        'query-input': 'required name=search_term_string'
      }
    };

    let schemaScript = document.querySelector('script[data-schema="home"]');
    if (!schemaScript) {
      schemaScript = document.createElement('script');
      schemaScript.type = 'application/ld+json';
      schemaScript.setAttribute('data-schema', 'home');
      document.head.appendChild(schemaScript);
    }
    schemaScript.innerHTML = JSON.stringify(schemaData);

    loadFeaturedSchools();
  }, []);

  const loadFeaturedSchools = async () => {
    try {
      const featuredNames = ["Havergal College", "Upper Canada College", "Branksome Hall", "Crescent School"];
      const data = await base44.entities.School.filter({
        name: { "$in": featuredNames }
      });
      setSchools(data.slice(0, 4));
    } catch (error) {
      console.error('Failed to load featured schools:', error);
    } finally {
      setLoadingSchools(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Canonical URL */}
      <link rel="canonical" href="https://nextschool.ca/Home" />
      
      {/* TASK E: Skip navigation */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-600 focus:text-white focus:rounded-lg"
      >
        Skip to main content
      </a>
      
      <Navbar />

      {/* HERO SECTION */}
      <section className="relative overflow-hidden min-h-[70vh] flex items-center justify-center">
        {/* Video Background */}
        <video
          autoPlay
          muted
          loop
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 0 }}
        >
          <source src="https://jamesshi.com/wp-content/uploads/2026/02/nextschool_hero_video.mp4" type="video/mp4" />
        </video>
        
        {/* Overlay for text readability */}
        <div className="absolute inset-0 bg-black/40" style={{ zIndex: 1 }} />
        
        <div id="main-content" className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center" style={{ zIndex: 2 }}>
          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold text-white mb-4 sm:mb-6 leading-tight">
            You Know Your Child.<br /> We Know the Schools.
          </h1>
          <p className="text-lg sm:text-xl lg:text-2xl text-slate-200 mb-8 sm:mb-10 max-w-3xl mx-auto font-light">
            Tell us what matters to your family, and we'll narrow hundreds of options down to the few that actually fit.
          </p>
          <Link to={createPageUrl('Consultant')}>
            <Button 
              size="lg" 
              className="bg-teal-500 hover:bg-teal-600 text-white px-6 sm:px-8 py-5 sm:py-7 text-base sm:text-lg focus:ring-2 focus:ring-teal-400 focus:ring-offset-2"
              aria-label="Start conversation with AI consultant"
            >
              Start a Conversation
              <ArrowRight className="ml-2 h-4 sm:h-5 w-4 sm:w-5" />
            </Button>
          </Link>
        </div>
      </section>


      {/* HOW IT WORKS */}
      <section className="py-12 sm:py-20 lg:py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center mb-12 sm:mb-16 text-slate-900">How It Works</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            <div className="ns-card p-8">
              <div className="h-14 w-14 bg-teal-100 rounded-lg flex items-center justify-center mb-6">
                <MessageSquare className="h-7 w-7 text-teal-600" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-slate-900">Tell Us About Your Child</h3>
              <p className="text-slate-600 leading-relaxed">
                Share your child's needs, interests, and your family's priorities through a natural conversation.
              </p>
            </div>
            
            <div className="ns-card p-8">
              <div className="h-14 w-14 bg-amber-100 rounded-lg flex items-center justify-center mb-6">
                <Zap className="h-7 w-7 text-amber-600" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-slate-900">Get Personalized Matches</h3>
              <p className="text-slate-600 leading-relaxed">
                Our AI consultant cross-references your needs with detailed school data to find real fits — not generic lists.
              </p>
            </div>
            
            <div className="ns-card p-8">
              <div className="h-14 w-14 bg-teal-100 rounded-lg flex items-center justify-center mb-6">
                <BarChart3 className="h-7 w-7 text-teal-600" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-slate-900">Compare, Shortlist & Decide</h3>
              <p className="text-slate-600 leading-relaxed">
                See why each school made the list, compare side-by-side, and build your shortlist with confidence.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF / TRUST SIGNALS */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="mb-4">
                <p className="text-5xl font-bold text-teal-600 mb-2">283+</p>
                <p className="text-xl text-slate-700 font-semibold">Schools</p>
              </div>
              <p className="text-slate-600">Verified school profiles across Canada</p>
            </div>
            
            <div className="text-center">
              <div className="mb-4">
                <CheckCircle2 className="h-16 w-16 text-amber-500 mx-auto mb-2" />
                <p className="text-xl text-slate-700 font-semibold">Personalized Matches</p>
              </div>
              <p className="text-slate-600">Every recommendation explains why it fits your family</p>
            </div>
            
            <div className="text-center">
              <div className="mb-4">
                <p className="text-5xl font-bold text-teal-600 mb-2">Free</p>
                <p className="text-xl text-slate-700 font-semibold">To Start</p>
              </div>
              <p className="text-slate-600">Full consultation with no signup required</p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED SCHOOLS */}
      <section className="py-12 sm:py-20 lg:py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 sm:mb-12 gap-4">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900">Featured Schools</h2>
            <Link to={createPageUrl('SchoolDirectory')}>
              <Button 
                variant="outline" 
                className="text-teal-600 border-teal-600 hover:bg-teal-50 w-full sm:w-auto focus:ring-2 focus:ring-teal-400"
                aria-label="Browse all schools in directory"
              >
                Browse All Schools <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {loadingSchools ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-6 h-64 animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-4" />
                  <div className="h-4 bg-slate-200 rounded w-1/2 mb-6" />
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-200 rounded w-full" />
                    <div className="h-3 bg-slate-200 rounded w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {schools.map((school) => (
                <Link 
                  key={school.id} 
                  to={`${createPageUrl('SchoolProfile')}?id=${school.id}`}
                  className="block focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 rounded-lg"
                >
                  <SchoolCardUnified school={school} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FOR SCHOOLS CTA */}
      <section className="py-20 sm:py-28 bg-gradient-to-r from-teal-50 to-amber-50 border-y border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
            Are You a School Administrator?
          </h2>
          <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
            Claim your free profile on NextSchool. Control how families discover your school.
          </p>
          <Link to={`${createPageUrl('ClaimSchool')}?schoolId=`}>
            <Button size="lg" className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-7 text-lg">
              Claim Your School
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}