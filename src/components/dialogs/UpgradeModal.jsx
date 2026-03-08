import { Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function UpgradeModal({ showUpgradeModal, onClose }) {
  if (!showUpgradeModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-2xl"
        >
          ×
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Upgrade to Premium</h2>
          <p className="text-slate-600">Unlock all advanced features for your school search</p>
        </div>

        {/* Benefits */}
        <div className="space-y-3 mb-8">
          <div className="flex items-start gap-3">
            <Check className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Visit Prep Briefs</p>
              <p className="text-sm text-slate-600">AI-crafted questions and observations for every school tour</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Check className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Debrief Analysis</p>
              <p className="text-sm text-slate-600">Structured insights from your visit experiences</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Check className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Detailed Comparisons</p>
              <p className="text-sm text-slate-600">Interactive comparison matrices for side-by-side analysis</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Check className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Unlimited Messages</p>
              <p className="text-sm text-slate-600">No token limits — chat as much as you want</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <Link to={createPageUrl('Pricing')} className="block">
            <Button className="w-full bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-700 hover:to-blue-700 text-white font-semibold py-6 shadow-lg">
              <Sparkles className="h-5 w-5 mr-2" />
              See Pricing Plans
            </Button>
          </Link>
          <Button
            variant="outline"
            className="w-full border-2 font-semibold"
            onClick={onClose}
          >
            Maybe Later
          </Button>
        </div>
      </div>
    </div>
  );
}