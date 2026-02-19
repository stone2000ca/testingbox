import { MessageSquare, Search, Heart, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WelcomeState({ onPromptClick }) {
  const prompts = [
    "I'm looking for a Montessori school in Toronto for my 6-year-old",
    "Show me IB schools in New York with strong STEM programs",
    "Find schools in London under £20,000/year with good sports programs",
    "I need a school with special education support in Vancouver"
  ];

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] p-8">
      <div className="max-w-2xl text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 mb-6">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold mb-3">Welcome to NextSchool</h1>
        <p className="text-lg text-slate-600 mb-8">
          I'm your AI education consultant. Let's find the perfect school for your child through conversation.
        </p>

        <div className="grid gap-3 mb-8">
          <div className="flex items-start gap-3 text-left bg-white p-4 rounded-xl border">
            <MessageSquare className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm mb-1">Tell me about your child</h3>
              <p className="text-xs text-slate-600">Age, grade, interests, and learning style</p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-left bg-white p-4 rounded-xl border">
            <Search className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm mb-1">Share your priorities</h3>
              <p className="text-xs text-slate-600">Curriculum, location, budget, values, programs</p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-left bg-white p-4 rounded-xl border">
            <Heart className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm mb-1">Get personalized matches</h3>
              <p className="text-xs text-slate-600">Compare schools and build your shortlist</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 mb-3">Try these examples:</p>
          {prompts.map((prompt, index) => (
            <Button
              key={index}
              variant="outline"
              className="w-full text-left justify-start h-auto py-3 px-4 hover:bg-teal-50 hover:border-teal-300"
              onClick={() => onPromptClick(prompt)}
            >
              <span className="text-sm text-slate-700">{prompt}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}