import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="h-6 w-6 rounded-lg bg-teal-600 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white">NextSchool</span>
        </div>
        <div className="flex justify-center gap-8 mb-6 text-sm">
          <Link to={createPageUrl('Home')} className="hover:text-white transition-colors">About</Link>
          <a href="mailto:contact@nextschool.com" className="hover:text-white transition-colors">Contact</a>
          <Link to={createPageUrl('SchoolAdmin')} className="hover:text-white transition-colors">For Schools</Link>
          <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
        </div>
        <p className="text-center text-sm">© 2026 NextSchool. All rights reserved.</p>
      </div>
    </footer>
  );
}