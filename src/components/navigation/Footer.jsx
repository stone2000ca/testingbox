import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center mb-12">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699717aa28903550c09d4d26/cfcb6f29d_logo_NextSchool_full_white.png" alt="NextSchool" className="h-8" />
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">PRODUCT</h3>
            <Link to={createPageUrl('HowItWorks')} className="block text-sm hover:text-white transition-colors mb-3">How It Works</Link>
            <Link to={createPageUrl('SchoolDirectory')} className="block text-sm hover:text-white transition-colors mb-3">Schools</Link>
            <Link to={createPageUrl('Guides')} className="block text-sm hover:text-white transition-colors mb-3">Guides</Link>
            <Link to={createPageUrl('Pricing')} className="block text-sm hover:text-white transition-colors">Pricing</Link>
          </div>
          
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">FOR SCHOOLS</h3>
            <Link to={createPageUrl('ForSchools')} className="block text-sm hover:text-white transition-colors mb-3">For Schools</Link>
            <Link to={createPageUrl('SchoolDirectory')} className="block text-sm hover:text-white transition-colors mb-3">Claim Your School</Link>
            <Link to={createPageUrl('SchoolAdmin')} className="block text-sm hover:text-white transition-colors">School Log In</Link>
          </div>
          
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">COMPANY</h3>
            <Link to={createPageUrl('About')} className="block text-sm hover:text-white transition-colors mb-3">About</Link>
            <Link to={createPageUrl('Contact')} className="block text-sm hover:text-white transition-colors">Contact</Link>
          </div>
          
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">LEGAL</h3>
            <Link to={createPageUrl('Privacy')} className="block text-sm hover:text-white transition-colors mb-3">Privacy Policy</Link>
            <Link to={createPageUrl('Terms')} className="block text-sm hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
        
        <div className="border-t border-slate-800 pt-8">
          <p className="text-center text-sm">© 2026 NextSchool Navigator. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}