import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PremiumGate({
  feature = 'visit-prep',
  isPremium = false,
  schoolName = '',
  onUpgrade = () => {},
  children
}) {
  if (isPremium) {
    return children;
  }

  const featureConfig = {
    'visit-prep': {
      title: `Unlock your personalized tour prep brief${schoolName ? ` for ${schoolName}` : ''}`,
      description: 'Get AI-crafted questions, things to observe, and logistical tips before your school visit.'
    },
    'debrief-analysis': {
      title: 'Unlock structured visit analysis and insights',
      description: 'Let AI synthesize your visit experience and extract key insights from your debrief.'
    },
    'comparison': {
      title: 'Unlock the detailed comparison matrix',
      description: 'See how schools stack up across all your priorities in an interactive comparison table.'
    },
    'next-action': {
      title: 'Unlock personalized next steps',
      description: 'Get AI-recommended actions tailored to where you are in your school search journey.'
    }
  };

  const config = featureConfig[feature] || featureConfig['visit-prep'];

  return (
    <div className="mt-4 bg-gradient-to-br from-orange-50 to-pink-50 border-2 border-orange-200 rounded-lg p-6 text-center">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-orange-900 mb-2">{config.title}</h3>
      <p className="text-sm text-orange-800 mb-4">{config.description}</p>
      <Button
        onClick={onUpgrade}
        className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white font-semibold px-6 py-2"
      >
        Upgrade to Premium
      </Button>
    </div>
  );
}