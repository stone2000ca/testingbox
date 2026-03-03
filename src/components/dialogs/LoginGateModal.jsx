import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { User, Sparkles, Check, X } from "lucide-react";

export default function LoginGateModal({ consultantName, childName = 'your child', onClose }) {
  const handleSignup = () => {
    // Redirect to signup, will return to same page after
    base44.auth.redirectToLogin(window.location.pathname);
  };

  const handleLogin = () => {
    // Redirect to login, will return to same page after
    base44.auth.redirectToLogin(window.location.pathname);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl relative animate-fadeIn">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {/* Consultant Avatar */}
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg">
            {consultantName === 'Jackie' ? 'J' : 'L'}
          </div>
        </div>

        {/* Heading */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">
            Create a free account
          </h2>
          <p className="text-slate-600">
            Save {childName}'s School Search Profile and pick up where you left off anytime.
          </p>
        </div>

        {/* Benefits */}
        <div className="bg-gradient-to-br from-teal-50 to-blue-50 rounded-xl p-4 mb-6 space-y-3">
          <div className="flex items-start gap-3">
            <Check className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-900">Your personalized recommendations</p>
              <p className="text-xs text-slate-600">Based on the conversation we just had</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Check className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-900">Save your shortlist</p>
              <p className="text-xs text-slate-600">Keep track of schools you're interested in</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Check className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-900">Continue where you left off</p>
              <p className="text-xs text-slate-600">Your conversation history is saved</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button 
            className="w-full bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-700 hover:to-blue-700 text-white font-semibold py-6 shadow-lg"
            onClick={handleSignup}
          >
            <Sparkles className="h-5 w-5 mr-2" />
            Sign up free
          </Button>
          <Button 
            variant="outline" 
            className="w-full border-2 font-semibold py-6"
            onClick={handleLogin}
          >
            <User className="h-5 w-5 mr-2" />
            Log in
          </Button>
        </div>

        {/* Fine print */}
        <p className="text-xs text-slate-500 text-center mt-4">
          No credit card required • Free forever
        </p>
      </div>
    </div>
  );
}