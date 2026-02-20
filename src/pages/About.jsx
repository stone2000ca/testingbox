import { Button } from "@/components/ui/button";
import { ArrowRight, Database, Lightbulb, ShieldCheck } from "lucide-react";
import { createPageUrl } from "../utils";
import { Link } from "react-router-dom";
import Navbar from "@/components/navigation/Navbar";
import Footer from "@/components/navigation/Footer";

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 py-20 sm:py-28 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl sm:text-6xl font-bold mb-6">About NextSchool</h1>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto">
            We're making private school search smarter, faster, and more confident.
          </p>
        </div>
      </section>

      {/* Why We Built This */}
      <section className="py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-slate-900 mb-8">Why We Built This</h2>
          <p className="text-xl text-slate-700 leading-relaxed mb-6">
            Choosing a private school is one of the biggest decisions a family makes. We built NextSchool because we saw hundreds of families struggle with the same problem: too many options, not enough guidance.
          </p>
          <p className="text-xl text-slate-700 leading-relaxed">
            Traditional directories give you lists. Human education consultants cost thousands. NextSchool sits in the middle — an AI consultant powered by real school data that helps you make this decision with confidence.
          </p>
        </div>
      </section>

      {/* What Makes Us Different */}
      <section className="py-20 sm:py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-slate-900 mb-12 text-center">What Makes Us Different</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 border border-slate-100">
              <div className="h-14 w-14 bg-teal-100 rounded-lg flex items-center justify-center mb-6">
                <Database className="h-7 w-7 text-teal-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Grounded in Real Data</h3>
              <p className="text-slate-700 leading-relaxed">
                Every recommendation is based on verified school profiles — not generated from thin air. 283+ schools with detailed academic, program, and admissions data.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-slate-100">
              <div className="h-14 w-14 bg-amber-100 rounded-lg flex items-center justify-center mb-6">
                <Lightbulb className="h-7 w-7 text-amber-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Transparent Reasoning</h3>
              <p className="text-slate-700 leading-relaxed">
                When we recommend a school, we tell you exactly why — and we're honest about the tradeoffs. No black boxes.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-slate-100">
              <div className="h-14 w-14 bg-teal-100 rounded-lg flex items-center justify-center mb-6">
                <ShieldCheck className="h-7 w-7 text-teal-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Schools Verify Their Own Data</h3>
              <p className="text-slate-700 leading-relaxed">
                School administrators can claim and update their profiles directly, ensuring the information families see is accurate and current.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Database */}
      <section className="py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-slate-900 mb-8">Our Database</h2>
          <p className="text-xl text-slate-700 mb-8 leading-relaxed">
            283+ schools across Canada, the US, and Europe. Each profile includes academics, programs, tuition, admissions requirements, and more.
          </p>
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="bg-teal-50 rounded-xl p-6">
              <p className="text-4xl font-bold text-teal-600 mb-2">283+</p>
              <p className="text-slate-700">Verified Schools</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-6">
              <p className="text-4xl font-bold text-amber-600 mb-2">3</p>
              <p className="text-slate-700">Regions Covered</p>
            </div>
            <div className="bg-teal-50 rounded-xl p-6">
              <p className="text-4xl font-bold text-teal-600 mb-2">100%</p>
              <p className="text-slate-700">Data Accuracy</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 sm:py-28 bg-gradient-to-r from-teal-50 to-amber-50 border-t border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-slate-900 mb-6">Ready to Start?</h2>
          <p className="text-xl text-slate-700 mb-8">
            Begin your free consultation today.
          </p>
          <Link to={createPageUrl('Consultant')}>
            <Button size="lg" className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-7 text-lg">
              Start Your Free Consultation
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}