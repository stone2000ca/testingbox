import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '../utils';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, DollarSign, Heart } from 'lucide-react';
import Navbar from '@/components/navigation/Navbar';

export default function SharedProfile() {
  const { shareToken } = useParams();
  const [session, setSession] = useState(null);
  const [schools, setSchools] = useState([]);
  const [shortlistedSchools, setShortlistedSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadSharedProfile();
  }, [shareToken]);

  const loadSharedProfile = async () => {
    try {
      // Fetch ChatSession by shareToken
      const sessions = await base44.entities.ChatSession.filter({
        shareToken: shareToken
      });

      if (sessions.length === 0) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const chatSession = sessions[0];
      setSession(chatSession);

      // Load matched schools
      if (chatSession.matchedSchools) {
        try {
          const matchedIds = JSON.parse(chatSession.matchedSchools);
          const matchedSchoolIds = Array.isArray(matchedIds) ? matchedIds : [];
          
          if (matchedSchoolIds.length > 0) {
            const schoolData = await base44.entities.School.filter({
              id: { $in: matchedSchoolIds.slice(0, 5) }
            });
            setSchools(schoolData);
          }
        } catch (e) {
          console.error('Failed to parse matched schools:', e);
        }
      }

      // Load shortlisted schools if any
      if (chatSession.userId) {
        try {
          const user = await base44.entities.User.filter({
            id: chatSession.userId
          });
          if (user.length > 0 && user[0].shortlist) {
            const shortlistedData = await base44.entities.School.filter({
              id: { $in: user[0].shortlist }
            });
            setShortlistedSchools(shortlistedData);
          }
        } catch (e) {
          console.error('Failed to load shortlisted schools:', e);
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load shared profile:', error);
      setNotFound(true);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md">
            <h1 className="text-3xl font-bold text-slate-900 mb-3">Profile Not Found</h1>
            <p className="text-slate-600 mb-6">This shared profile link is invalid or has been removed.</p>
            <Link to={createPageUrl('Consultant')}>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
                Start Your Own Search <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Profile Card */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-8 border border-slate-200 mb-12">
          {/* Child Info */}
          <div className="mb-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center font-bold text-white text-2xl flex-shrink-0">
                {session.childName ? session.childName.charAt(0).toUpperCase() : '?'}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-1">
                  {session.childName || 'Student Profile'}
                </h1>
                {session.childGrade != null && (
                  <p className="text-lg text-slate-600">Grade {session.childGrade}</p>
                )}
              </div>
            </div>

            {/* Key Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {session.locationArea && (
                <div className="flex items-start gap-3 p-3 bg-white rounded-lg">
                  <MapPin className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-600">Location</p>
                    <p className="text-sm font-medium text-slate-900">{session.locationArea}</p>
                  </div>
                </div>
              )}
              {session.maxTuition && (
                <div className="flex items-start gap-3 p-3 bg-white rounded-lg">
                  <DollarSign className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-600">Budget</p>
                    <p className="text-sm font-medium text-slate-900">${(session.maxTuition / 1000).toFixed(0)}K/year</p>
                  </div>
                </div>
              )}
            </div>

            {/* Priorities */}
            {session.priorities && session.priorities.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Priorities</p>
                <div className="flex flex-wrap gap-2">
                  {session.priorities.map((p, idx) => (
                    <span key={idx} className="px-3 py-1.5 bg-white border border-teal-200 text-teal-700 text-sm font-medium rounded-full">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI Narrative */}
            {session.aiNarrative && (
              <div className="p-4 bg-white rounded-lg border border-slate-200">
                <p className="text-slate-700 leading-relaxed">{session.aiNarrative}</p>
              </div>
            )}
          </div>
        </div>

        {/* Match Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Schools Matched</span>
              <span className="text-3xl font-bold text-teal-600">{schools.length}</span>
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Shortlisted</span>
              <span className="text-3xl font-bold text-teal-600">{shortlistedSchools.length}</span>
            </div>
          </div>
        </div>

        {/* Top Matched Schools */}
        {schools.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Top Matched Schools</h2>
            <div className="space-y-4">
              {schools.map((school, idx) => (
                <div key={school.id} className="bg-white border border-slate-200 rounded-lg p-6 hover:border-teal-300 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="flex items-center justify-center w-12 h-12 bg-teal-100 rounded-lg font-bold text-teal-600 flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">{school.name}</h3>
                      <p className="text-sm text-slate-600">
                        {school.city}{school.provinceState ? `, ${school.provinceState}` : ''}
                      </p>
                      {school.highlights && school.highlights.length > 0 && (
                        <p className="text-sm text-slate-700 mt-2">{school.highlights[0]}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shortlisted Schools */}
        {shortlistedSchools.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Shortlisted Schools</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {shortlistedSchools.map((school) => (
                <div key={school.id} className="bg-white border border-slate-200 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-900">{school.name}</h3>
                  <p className="text-sm text-slate-600">
                    {school.city}{school.provinceState ? `, ${school.provinceState}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA Footer */}
        <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-2xl p-8 border border-teal-200 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Start Your Own Search</h2>
          <p className="text-slate-600 mb-6 max-w-xl mx-auto">
            Find the perfect private school for your child with personalized AI recommendations.
          </p>
          <Link to={createPageUrl('Consultant')}>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white gap-2 px-8 py-6 text-lg font-semibold">
              Create Your Profile <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}