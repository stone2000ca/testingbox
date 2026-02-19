import { Button } from "@/components/ui/button";
import { ArrowRight, MessageSquare, Search, Heart, Globe2, Users, Sparkles } from "lucide-react";
import { createPageUrl } from "../utils";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">NextSchool</span>
          </div>
          <nav className="hidden md:flex gap-6">
            <a href="#how-it-works" className="text-slate-600 hover:text-teal-600">How it Works</a>
            <Link to={createPageUrl('Pricing')} className="text-slate-600 hover:text-teal-600">Pricing</Link>
          </nav>
          <Link to={createPageUrl('Consultant')}>
            <Button className="bg-teal-600 hover:bg-teal-700">
              Start Searching <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 rounded-full text-sm font-medium mb-6">
          <Globe2 className="h-4 w-4" />
          Canada • United States • Europe
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
          Find the Perfect School<br />
          <span className="text-teal-600">for Your Child</span>
        </h1>
        <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
          AI-powered education consultant that helps you discover private schools across multiple regions through personalized conversation
        </p>
        <div className="flex gap-4 justify-center">
          <Link to={createPageUrl('Consultant')}>
            <Button size="lg" className="bg-teal-600 hover:bg-teal-700">
              <MessageSquare className="mr-2 h-5 w-5" />
              Start Free Consultation
            </Button>
          </Link>
          <a href="#how-it-works">
            <Button size="lg" variant="outline">
              Learn More
            </Button>
          </a>
        </div>
        <p className="text-sm text-slate-500 mt-4">100 free tokens • No credit card required</p>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-slate-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">How NextSchool Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm">
              <div className="h-12 w-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">1. Share Your Needs</h3>
              <p className="text-slate-600">
                Chat with our AI consultant about your child, priorities, budget, and location. No forms to fill out.
              </p>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-sm">
              <div className="h-12 w-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">2. Get Personalized Matches</h3>
              <p className="text-slate-600">
                View curated schools that fit your criteria. Compare options, explore programs, and see what makes each unique.
              </p>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-sm">
              <div className="h-12 w-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                <Heart className="h-6 w-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">3. Build Your Shortlist</h3>
              <p className="text-slate-600">
                Save your favorites, take notes, and connect directly with schools when you're ready.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">Why Parents Love NextSchool</h2>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="h-6 w-6 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-teal-600 text-sm">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Conversational Search</h4>
                    <p className="text-slate-600 text-sm">No more endless filter dropdowns - just chat naturally about what matters</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-6 w-6 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-teal-600 text-sm">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Multi-Region Coverage</h4>
                    <p className="text-slate-600 text-sm">Search across Canada, US, and Europe with region-aware recommendations</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-6 w-6 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-teal-600 text-sm">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Expert Guidance</h4>
                    <p className="text-slate-600 text-sm">AI-powered insights help you understand tradeoffs and make confident decisions</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-6 w-6 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-teal-600 text-sm">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Save Time</h4>
                    <p className="text-slate-600 text-sm">Get personalized recommendations in minutes, not weeks of research</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-teal-50 to-amber-50 rounded-2xl p-8 aspect-square flex items-center justify-center">
              <Users className="h-48 w-48 text-teal-200" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-teal-600 to-teal-700 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Find Your Perfect School Match?
          </h2>
          <p className="text-teal-100 text-lg mb-8">
            Start your free consultation now - no signup required
          </p>
          <Link to={createPageUrl('Consultant')}>
            <Button size="lg" className="bg-white text-teal-600 hover:bg-slate-100">
              Start Searching <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="h-6 w-6 rounded-lg bg-teal-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">NextSchool</span>
          </div>
          <p className="text-sm">© 2026 NextSchool. Helping families find the right school.</p>
        </div>
      </footer>
    </div>
  );
}