import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function Navbar({ variant = "default" }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const authenticated = await base44.auth.isAuthenticated();
      setIsAuthenticated(authenticated);
      if (authenticated) {
        const userData = await base44.auth.me();
        setUser(userData);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  };

  // Minimal variant for Consultant page
  if (variant === "minimal") {
    return (
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <Link to={createPageUrl('Home')} className="flex items-center gap-2">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699717aa28903550c09d4d26/c6c11cc4b_logo_NextSchool_full.png" alt="NextSchool" className="h-8" />
          </Link>
          {isAuthenticated && user ? (
            <Link to={createPageUrl('Dashboard')}>
              <Button variant="ghost" size="sm" className="gap-2">
                <User className="h-4 w-4" />
                Dashboard
              </Button>
            </Link>
          ) : (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
            >
              Login
            </Button>
          )}
        </div>
      </header>
    );
  }

  // Default variant for other pages
  return (
    <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <Link to={createPageUrl('Home')} className="flex items-center gap-2">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699717aa28903550c09d4d26/c6c11cc4b_logo_NextSchool_full.png" alt="NextSchool" className="h-10" />
        </Link>
        <nav className="hidden md:flex gap-8 items-center">
          <Link to={createPageUrl('HowItWorks')} className="text-slate-600 hover:text-teal-600 text-sm">How it Works</Link>
          <Link to={createPageUrl('SchoolDirectory')} className="text-slate-600 hover:text-teal-600 text-sm">
            Browse Schools
          </Link>
          <Link to={createPageUrl('Guides')} className="text-slate-600 hover:text-teal-600 text-sm">Guides</Link>
          <Link to={createPageUrl('Pricing')} className="text-slate-600 hover:text-teal-600 text-sm">Pricing</Link>
          <Link to={createPageUrl('ForSchools')} className="text-slate-600 hover:text-teal-600 text-sm">For Schools</Link>
          <Link to={createPageUrl('About')} className="text-slate-600 hover:text-teal-600 text-sm">About</Link>
        </nav>
        {isAuthenticated && user ? (
          <Link to={createPageUrl('Dashboard')}>
            <Button variant="outline" className="gap-2">
              <User className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
        ) : (
          <Button 
            className="bg-teal-600 hover:bg-teal-700"
            onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
          >
            Login / Sign Up
          </Button>
        )}
      </div>
    </header>
  );
}