import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center gap-2 mb-12">
          <div className="h-6 w-6 rounded-lg bg-teal-600 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white">NextSchool</span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">PRODUCT</h3>
            <Link to={createPageUrl('Home')} className="block text-sm hover:text-white transition-colors mb-3">How It Works</Link>
            <Link to={createPageUrl('SchoolDirectory')} className="block text-sm hover:text-white transition-colors mb-3">Schools</Link>
            <Link to={createPageUrl('Pricing')} className="block text-sm hover:text-white transition-colors">Pricing</Link>
          </div>
          
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">FOR SCHOOLS</h3>
            <Link to={createPageUrl('SchoolDirectory')} className="block text-sm hover:text-white transition-colors">Claim Your School</Link>
            <Link to={createPageUrl('SchoolAdmin')} className="block text-sm hover:text-white transition-colors">School Admin</Link>
          </div>
          
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">COMPANY</h3>
            <a href="#" className="block text-sm hover:text-white transition-colors mb-3">About</a>
            <a href="mailto:contact@nextschool.com" className="block text-sm hover:text-white transition-colors">Contact</a>
          </div>
          
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">LEGAL</h3>
            <a href="#" className="block text-sm hover:text-white transition-colors mb-3">Privacy Policy</a>
            <a href="#" className="block text-sm hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
        
        <div className="border-t border-slate-800 pt-8">
          <p className="text-center text-sm">© 2026 NextSchool Navigator. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}