import { Button } from "@/components/ui/button";
import { X, Sparkles, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../pages/utils";
import { base44 } from "@/api/base44Client";

export default function UpgradeModal({ isOpen, onClose, isAuthenticated }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-8 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 mb-4">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-2">
            {isAuthenticated ? "Unlock Unlimited Access" : "Continue Your Search"}
          </h2>
          <p className="text-slate-600">
            {isAuthenticated 
              ? "Upgrade to Premium for unlimited conversations and powerful features"
              : "Sign in to continue searching or upgrade to Premium for unlimited access"
            }
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Free */}
          <div className="border-2 border-slate-200 rounded-xl p-6">
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold mb-2">Free</h3>
              <div className="text-3xl font-bold mb-1">$0</div>
              <p className="text-sm text-slate-600">100 tokens</p>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2">
                <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                <span>AI consultant</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                <span>Browse schools</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                <span>Create shortlist</span>
              </li>
            </ul>
          </div>

          {/* Premium */}
          <div className="border-2 border-teal-500 rounded-xl p-6 bg-gradient-to-br from-teal-50 to-teal-100 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-teal-600 text-white px-3 py-1 rounded-full text-xs font-medium">
              Recommended
            </div>
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold mb-2">Premium</h3>
              <div className="text-3xl font-bold mb-1">$29</div>
              <p className="text-sm text-slate-600">/month</p>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2">
                <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                <span className="font-semibold">Unlimited tokens</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                <span>Unlimited conversations</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                <span>Advanced comparisons</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                <span>Deep analysis reports</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                <span>Export to PDF</span>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                <span>Priority support</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          {!isAuthenticated && (
            <Button 
              className="w-full bg-teal-600 hover:bg-teal-700"
              onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
            >
              Sign In to Continue
            </Button>
          )}
          <Link to={createPageUrl('Pricing')}>
            <Button className="w-full bg-amber-600 hover:bg-amber-700">
              Upgrade to Premium
            </Button>
          </Link>
          <Button 
            variant="ghost" 
            className="w-full"
            onClick={onClose}
          >
            Maybe Later
          </Button>
        </div>
      </div>
    </div>
  );
}