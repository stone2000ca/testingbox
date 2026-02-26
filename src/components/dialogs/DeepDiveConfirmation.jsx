import { Button } from "@/components/ui/button";

export default function DeepDiveConfirmation({ 
  school, 
  childName, 
  consultantName,
  onAnalyze, 
  onCancel,
  isLoading
}) {
  if (!school) return null;

  return (
    <div className="flex items-end gap-3 animate-fadeIn">
      <div className={`flex-1 rounded-2xl px-4 py-3 ${
        consultantName === 'Jackie' 
          ? 'bg-[#C27B8A]/20 text-[#E8E8ED] border border-[#C27B8A]/30' 
          : 'bg-[#6B9DAD]/20 text-[#E8E8ED] border border-[#6B9DAD]/30'
      }`}>
        <p className="text-sm">
          Great choice — <strong>{school.name}</strong> came up as a strong match for {childName || 'your child'}. I can do a detailed analysis of how it fits your family's priorities. Want me to dig in, or would you rather keep browsing your other matches?
        </p>
      </div>
      <div className="flex gap-2 flex-col sm:flex-row flex-shrink-0">
        <Button
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
          variant="outline"
          className="text-xs bg-[#2A2A3D] border-white/20 text-[#E8E8ED] hover:bg-[#2A2A3D]/80 whitespace-nowrap"
        >
          Back to my matches
        </Button>
        <Button
          size="sm"
          onClick={onAnalyze}
          disabled={isLoading}
          className={`text-xs whitespace-nowrap ${
            consultantName === 'Jackie'
              ? 'bg-[#C27B8A] hover:bg-[#C27B8A]/90 text-white'
              : 'bg-[#6B9DAD] hover:bg-[#6B9DAD]/90 text-white'
          }`}
        >
          Analyze this school
        </Button>
      </div>
    </div>
  );
}