import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function ConsultantSelection({ onSelectConsultant }) {
  const consultants = [
    {
      name: 'Jackie',
      title: 'The Warm & Supportive Consultant',
      tagline: 'Empathetic, encouraging, and emotionally attuned',
      description: 'Jackie excels at understanding family dynamics and emotional needs. She validates concerns, celebrates strengths, and makes families feel truly heard throughout the school search journey.',
      color: 'from-rose-500 to-pink-500',
      avatar: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699717aa28903550c09d4d26/150ea2350_Jackie.jpg',
      isImage: true
    },
    {
      name: 'Liam',
      title: 'The Direct & Strategic Consultant',
      tagline: 'Data-driven, efficient, and results-oriented',
      description: 'Liam cuts through the noise with clear analysis and strategic recommendations. He focuses on matching your priorities with school data and gets you to the best fit quickly.',
      color: 'from-blue-500 to-cyan-500',
      avatar: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699717aa28903550c09d4d26/568e5604d_liam.png',
      isImage: true
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-5xl w-full">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-4">
            Meet Your Consultant
          </h1>
          <p className="text-xl text-slate-300">
            Choose the consultant style that works best for your family
          </p>
        </div>

        {/* Consultant Cards */}
        <div className="grid md:grid-cols-2 gap-8">
          {consultants.map((consultant) => (
            <div
              key={consultant.name}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-slate-700 to-slate-600 rounded-2xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />
              
              <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-8 hover:border-slate-500 transition-all h-full flex flex-col">
                {/* Consultant Avatar & Name */}
                <div className="mb-8">
                  <div className={`w-40 h-40 rounded-2xl bg-gradient-to-br ${consultant.color} flex items-center justify-center text-4xl mb-6 shadow-2xl overflow-hidden mx-auto`}>
                    {consultant.isImage ? (
                      <img src={consultant.avatar} alt={consultant.name} className="w-full h-full object-cover" />
                    ) : (
                      consultant.avatar
                    )}
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-1 text-center">
                    {consultant.name}
                  </h2>
                  <p className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-400">
                    {consultant.title}
                  </p>
                </div>

                {/* Tagline */}
                <div className="mb-4">
                  <p className="text-slate-400 italic text-sm">
                    "{consultant.tagline}"
                  </p>
                </div>

                {/* Description */}
                <p className="text-slate-300 mb-8 flex-1 leading-relaxed">
                  {consultant.description}
                </p>

                {/* Traits */}
                <div className="mb-8 grid grid-cols-2 gap-2">
                  {consultant.name === 'Jackie' ? (
                    <>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Style</p>
                        <p className="text-sm font-medium text-white">Warm & Encouraging</p>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Strength</p>
                        <p className="text-sm font-medium text-white">Emotional Intelligence</p>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Pace</p>
                        <p className="text-sm font-medium text-white">Thoughtful & Thorough</p>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Best For</p>
                        <p className="text-sm font-medium text-white">Families in Transition</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Style</p>
                        <p className="text-sm font-medium text-white">Direct & Clear</p>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Strength</p>
                        <p className="text-sm font-medium text-white">Strategic Analysis</p>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Pace</p>
                        <p className="text-sm font-medium text-white">Efficient & Focused</p>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Best For</p>
                        <p className="text-sm font-medium text-white">Goal-Driven Families</p>
                      </div>
                    </>
                  )}
                </div>

                {/* CTA Button */}
                <Button
                  onClick={() => onSelectConsultant(consultant.name)}
                  className={`w-full bg-gradient-to-r ${consultant.color} hover:shadow-lg hover:shadow-${consultant.color.split('-')[1]}-500/50 text-white font-semibold py-6 transition-all`}
                >
                  Meet {consultant.name}
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="mt-16 text-center">
          <p className="text-slate-400 text-sm">
            You can also switch consultants anytime in a new conversation
          </p>
        </div>
      </div>
    </div>
  );
}