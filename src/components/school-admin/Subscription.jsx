import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Crown, Sparkles } from 'lucide-react';

export default function Subscription({ school, onUpdate }) {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      features: [
        'Basic profile listing',
        'Up to 5 photos',
        'Inquiry management',
        'Basic profile views'
      ],
      limitations: [
        'No analytics',
        'Limited visibility',
        'No priority support'
      ]
    },
    {
      id: 'growth',
      name: 'Growth',
      price: 99,
      icon: Sparkles,
      features: [
        'Enhanced profile with video',
        'Unlimited photos',
        'Full analytics dashboard',
        'Inquiry management',
        'Events & Open Houses',
        'Priority search placement',
        'Email support'
      ],
      popular: false
    },
    {
      id: 'professional',
      name: 'Professional',
      price: 249,
      icon: Crown,
      features: [
        'Featured school status',
        'Virtual tour integration',
        'Advanced analytics & insights',
        'Top search placement',
        'Dedicated account manager',
        'Custom profile URL',
        'Featured in newsletters'
      ],
      popular: true
    }
  ];

  // Normalize legacy tier names to new names for display logic
  const rawTier = school.subscriptionTier || 'free';
  const currentPlan = rawTier === 'basic' ? 'growth' : rawTier === 'premium' ? 'professional' : rawTier;

  const handleUpgrade = (planId) => {
    // In production, integrate with Stripe
    alert(`Upgrading to ${planId}. Payment integration coming soon!`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Subscription Plans</h2>
        <p className="text-slate-600">Choose the plan that best fits your school's needs</p>
      </div>

      {/* Current Plan */}
      <Card className="p-6 mb-8 bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Current Plan</h3>
            <p className="text-2xl font-bold text-teal-700 capitalize">{currentPlan}</p>
          </div>
          {currentPlan !== 'professional' && (
            <Button className="bg-amber-600 hover:bg-amber-700">
              Upgrade Now
            </Button>
          )}
        </div>
      </Card>

      {/* Plan Cards */}
      <div className="grid grid-cols-3 gap-6">
        {plans.map((plan) => {
          const Icon = plan.icon;
          const isCurrent = currentPlan === plan.id;
          const isUpgrade = plans.findIndex(p => p.id === plan.id) > plans.findIndex(p => p.id === currentPlan);

          return (
            <Card
              key={plan.id}
              className={`p-6 relative ${
                plan.popular ? 'border-2 border-teal-500 shadow-lg' : ''
              } ${isCurrent ? 'bg-slate-50' : ''}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-teal-600 text-white text-xs font-bold rounded-full">
                    MOST POPULAR
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                {Icon && (
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-100 mb-3">
                    <Icon className="h-6 w-6 text-teal-600" />
                  </div>
                )}
                <h3 className="text-2xl font-bold text-slate-900 mb-2">{plan.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold text-slate-900">${plan.price}</span>
                  {plan.price > 0 && <span className="text-slate-600">/month</span>}
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-700">{feature}</span>
                  </li>
                ))}
                {plan.limitations?.map((limitation, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-slate-400 text-sm">✕</span>
                    <span className="text-sm text-slate-400">{limitation}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrent}
                className={`w-full ${
                  plan.popular
                    ? 'bg-teal-600 hover:bg-teal-700'
                    : 'bg-slate-600 hover:bg-slate-700'
                }`}
              >
                {isCurrent ? 'Current Plan' : isUpgrade ? 'Upgrade' : 'Downgrade'}
              </Button>
            </Card>
          );
        })}
      </div>

      {/* Billing Section */}
      {currentPlan !== 'free' && (
        <Card className="p-6 mt-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Billing Information</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Next billing date</span>
              <span className="font-medium">March 1, 2024</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Payment method</span>
              <span className="font-medium">•••• 4242</span>
            </div>
            <div className="pt-3 border-t">
              <Button variant="outline" size="sm">Update Payment Method</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}