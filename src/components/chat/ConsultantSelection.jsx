import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

export default function ConsultantSelection({ onSelectConsultant }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Users className="h-8 w-8 text-teal-600" />
            <h1 className="text-3xl font-bold text-slate-900">Meet Your Consultant</h1>
          </div>
          <p className="text-lg text-slate-600">
            Choose the consultant style that feels right for your family
          </p>
        </div>

        {/* Consultant Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Jackie Card */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-8 hover:border-teal-400 hover:shadow-lg transition-all cursor-pointer"
               onClick={() => onSelectConsultant('Jackie')}>
            <div className="flex flex-col items-center text-center">
              {/* Avatar Placeholder */}
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center mb-4 border-3 border-rose-200">
                <span className="text-4xl font-bold text-rose-600">J</span>
              </div>
              
              <h2 className="text-2xl font-bold text-slate-900 mb-1">Jackie</h2>
              <p className="text-teal-600 font-semibold mb-4">Warm & Supportive</p>
              
              <p className="text-slate-600 italic mb-6">
                "I'll help you find a school where your child feels at home."
              </p>
              
              <Button 
                className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectConsultant('Jackie');
                }}
              >
                Talk to Jackie
              </Button>
            </div>
          </div>

          {/* Liam Card */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-8 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer"
               onClick={() => onSelectConsultant('Liam')}>
            <div className="flex flex-col items-center text-center">
              {/* Avatar Placeholder */}
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-slate-100 flex items-center justify-center mb-4 border-3 border-blue-200">
                <span className="text-4xl font-bold text-blue-600">L</span>
              </div>
              
              <h2 className="text-2xl font-bold text-slate-900 mb-1">Liam</h2>
              <p className="text-blue-600 font-semibold mb-4">Direct & Strategic</p>
              
              <p className="text-slate-600 italic mb-6">
                "I'll help you find the best fit based on what matters most."
              </p>
              
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectConsultant('Liam');
                }}
              >
                Talk to Liam
              </Button>
            </div>
          </div>
        </div>

        {/* Info Text */}
        <div className="text-center text-sm text-slate-500">
          <p>Both consultants have access to the same schools and expertise. Choose the style that feels right for you.</p>
        </div>
      </div>
    </div>
  );
}