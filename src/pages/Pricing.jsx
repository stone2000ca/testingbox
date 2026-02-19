import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import Navbar from "@/components/navigation/Navbar";
import Footer from "@/components/navigation/Footer";

export default function Pricing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-xl text-slate-600">Choose the plan that works for you</p>
        </div>

        {/* Parent Plans */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8">For Parents</h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-8">
              <h3 className="text-2xl font-bold mb-2">Free</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-slate-600">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex gap-2">
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm">100 tokens to get started</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm">AI consultant conversations</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm">Browse all schools</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm">Create shortlist</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm">Take notes</span>
                </li>
              </ul>
              <Link to={createPageUrl('Consultant')}>
                <Button variant="outline" className="w-full">
                  Get Started
                </Button>
              </Link>
            </div>

            {/* Premium Plan */}
            <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-2xl shadow-lg border-2 border-teal-600 p-8 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-teal-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                Most Popular
              </div>
              <h3 className="text-2xl font-bold mb-2">Premium</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">$29</span>
                <span className="text-slate-600">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex gap-2">
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm font-semibold">Unlimited tokens</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm">Unlimited AI conversations</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm">Advanced school comparisons</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm">Deep analysis reports</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm">Export shortlist to PDF</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm">Priority support</span>
                </li>
              </ul>
              <Button className="w-full bg-teal-600 hover:bg-teal-700">
                Upgrade to Premium
              </Button>
            </div>
          </div>
        </div>

        {/* School Plans */}
        <div>
          <h2 className="text-2xl font-bold text-center mb-8">For Schools</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Free */}
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <h3 className="text-xl font-bold mb-2">Free Listing</h3>
              <div className="mb-6">
                <span className="text-3xl font-bold">$0</span>
                <span className="text-slate-600">/month</span>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span>Basic profile</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span>1 photo</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span>Appear in search</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full" size="sm">
                Start Free
              </Button>
            </div>

            {/* Basic */}
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <h3 className="text-xl font-bold mb-2">Basic</h3>
              <div className="mb-6">
                <span className="text-3xl font-bold">$99</span>
                <span className="text-slate-600">/month</span>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span>Enhanced profile</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span>Photo gallery (10 photos)</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span>Video tours</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span>Inquiry management</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span>Basic analytics</span>
                </li>
              </ul>
              <Button className="w-full bg-teal-600 hover:bg-teal-700" size="sm">
                Upgrade
              </Button>
            </div>

            {/* Premium */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl shadow-sm border-2 border-amber-500 p-6">
              <h3 className="text-xl font-bold mb-2">Premium</h3>
              <div className="mb-6">
                <span className="text-3xl font-bold">$249</span>
                <span className="text-slate-600">/month</span>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>Premium profile</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>Unlimited photos</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>Featured placement</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>Priority in AI recommendations</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>Advanced analytics</span>
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>Verified badge</span>
                </li>
              </ul>
              <Button className="w-full bg-amber-600 hover:bg-amber-700" size="sm">
                Go Premium
              </Button>
            </div>
          </div>
        </div>

        {/* Token Usage */}
        <div className="mt-16 bg-slate-50 rounded-2xl p-8 max-w-3xl mx-auto">
          <h3 className="text-xl font-bold mb-4 text-center">How Tokens Work (Free Plan)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-teal-600 mb-1">1</div>
              <div className="text-sm text-slate-600">Send message</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-teal-600 mb-1">2</div>
              <div className="text-sm text-slate-600">Get recommendations</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-teal-600 mb-1">3</div>
              <div className="text-sm text-slate-600">Compare schools</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-teal-600 mb-1">5</div>
              <div className="text-sm text-slate-600">Deep analysis</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-teal-600 mb-1">2</div>
              <div className="text-sm text-slate-600">Export PDF</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-teal-600 mb-1">0</div>
              <div className="text-sm text-slate-600">View profiles</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}