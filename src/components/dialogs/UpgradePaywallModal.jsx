import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Share2, Grid3x3, Bell, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { base44 } from '@/api/base44Client';

const variantConfig = {
  GENERAL: {
    icon: Sparkles,
    title: 'Upgrade to Premium',
    subtitle: 'Unlock all advanced features',
    description: 'Get visit prep briefs, debrief analysis, detailed comparisons, and unlimited messages.',
    buttons: [
      { label: 'See Pricing Plans', variant: 'default', action: 'upgrade', isPrimary: true },
      { label: 'Maybe Later', variant: 'outline', action: 'cancel' }
    ]
  },
  NEW_SEARCH: {
    icon: Sparkles,
    title: 'Save Multiple Searches',
    subtitle: 'Keep all your profiles safe',
    description: 'Upgrade to keep this profile and start a new search.',
    warning: 'Starting a new search will replace your current profile.',
    dataPoints: [
      { label: 'Matched Schools', value: 'matched' },
      { label: 'Shortlisted', value: 'shortlisted' }
    ],
    buttons: [
      { label: 'Start Over', variant: 'ghost', action: 'startOver' },
      { label: 'Keep Profile', variant: 'outline', action: 'cancel' },
      { label: 'Upgrade for $9/mo', variant: 'default', action: 'upgrade', isPrimary: true }
    ]
  },
  SHARE: {
    icon: Share2,
    title: 'Share Profiles',
    subtitle: 'Collaborate with your partner',
    description: 'Upgrade to share your school search with your partner and collaborate in real-time.',
    buttons: [
      { label: 'Upgrade for $9/mo', variant: 'default', action: 'upgrade', isPrimary: true },
      { label: 'Maybe Later', variant: 'outline', action: 'cancel' }
    ]
  },
  COMPARE: {
    icon: Grid3x3,
    title: 'Compare Across Sessions',
    subtitle: 'Side-by-side school comparisons',
    description: 'Upgrade to compare schools from different searches side-by-side.',
    buttons: [
      { label: 'Upgrade for $9/mo', variant: 'default', action: 'upgrade', isPrimary: true },
      { label: 'Maybe Later', variant: 'outline', action: 'cancel' }
    ]
  },
  NOTIFICATIONS: {
    icon: Bell,
    title: 'School Event Alerts',
    subtitle: 'Never miss an open house',
    description: 'Upgrade to get notifications for open houses, application deadlines, and admissions updates.',
    buttons: [
      { label: 'Upgrade for $9/mo', variant: 'default', action: 'upgrade', isPrimary: true },
      { label: 'Maybe Later', variant: 'outline', action: 'cancel' }
    ]
  }
};

export default function UpgradePaywallModal({
  isOpen,
  variant = 'SHARE',
  onClose,
  onStartOver,
  profileData = {}
}) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const config = variantConfig[variant] || variantConfig.SHARE;
  const Icon = config.icon;

  if (!isOpen) return null;

  const handleAction = async (action) => {
    if (action === 'upgrade') {
      setIsLoading(true);
      try {
        const user = await base44.auth.me();
        const response = await base44.functions.invoke('createCheckoutSession', {
          userId: user.id,
          priceId: 'price_pro_monthly'
        });
        if (response.data?.checkoutUrl) {
          window.location.href = response.data.checkoutUrl;
        }
      } catch (error) {
        console.error('Failed to create checkout session:', error);
        setIsLoading(false);
      }
      return;
    } else if (action === 'startOver') {
      if (onStartOver) onStartOver();
    } else if (action === 'cancel') {
      onClose();
    }
  };

  const matchedCount = profileData.matchedSchoolsCount || 0;
  const shortlistedCount = profileData.shortlistedCount || 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl max-w-lg w-full p-8 shadow-2xl border border-white/10">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center">
            <Icon className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white text-center mb-2">
          {config.title}
        </h2>
        <p className="text-amber-300 text-sm text-center mb-6 font-medium">
          {config.subtitle}
        </p>

        {/* Description */}
        <p className="text-white/70 text-center mb-6 leading-relaxed">
          {config.description}
        </p>

        {/* Warning (NEW_SEARCH only) */}
        {variant === 'NEW_SEARCH' && config.warning && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 mb-6">
            <p className="text-orange-300 text-sm">{config.warning}</p>
            {matchedCount > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Matched Schools</span>
                  <span className="text-white font-semibold">{matchedCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Shortlisted</span>
                  <span className="text-white font-semibold">{shortlistedCount}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-3">
          {config.buttons.map((btn, idx) => (
            <Button
              key={idx}
              onClick={() => handleAction(btn.action)}
              variant={btn.variant}
              disabled={isLoading && btn.action === 'upgrade'}
              className={
                btn.isPrimary
                  ? 'w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-black font-semibold py-6 disabled:opacity-50 disabled:cursor-not-allowed'
                  : btn.variant === 'outline'
                  ? 'w-full border-white/20 text-white hover:bg-white/10 py-6 disabled:opacity-50 disabled:cursor-not-allowed'
                  : 'w-full text-white/70 hover:text-white py-6 disabled:opacity-50 disabled:cursor-not-allowed'
              }
            >
              {isLoading && btn.action === 'upgrade' ? 'Redirecting to checkout...' : btn.label}
            </Button>
          ))}
        </div>

        {/* Footer Note */}
        <p className="text-xs text-white/40 text-center mt-6">
          Upgrade anytime. Cancel your subscription at any time.
        </p>
      </div>
    </div>
  );
}