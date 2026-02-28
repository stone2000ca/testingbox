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
    <div className="flex flex-col gap-3 animate-fadeIn w-full">
      <div className={`w-full rounded-2xl px-4 py-3 ${
        consultantName === 'Jackie' 
          ? 'bg-[#C27B8A]/20 text-[#E8E8ED] border border-[#C27B8A]/30' 
          : 'bg-[#6B9DAD]/20 text-[#E8E8ED] border border-[#6B9DAD]/30'
      }`}>
        <p className="text-sm">
          Looks like you're interested in <strong>{school.name}</strong>. Want me to do a deeper analysis of how it fits your family's priorities, or would you rather keep browsing?
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full">
        <Button
          size="sm"
          onClick={onAnalyze}
          disabled={isLoading}
          className={`w-full text-xs ${
            consultantName === 'Jackie'
              ? 'bg-[#C27B8A] hover:bg-[#C27B8A]/90 text-white'
              : 'bg-[#6B9DAD] hover:bg-[#6B9DAD]/90 text-white'
          }`}
        >
          Analyze this school
        </Button>
        <Button
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
          variant="outline"
          className="w-full text-xs bg-[#2A2A3D] border-white/20 text-[#E8E8ED] hover:bg-[#2A2A3D]/80"
        >
          Back to my matches
        </Button>
      </div>
    </div>
  );
}