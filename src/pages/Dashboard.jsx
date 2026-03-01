import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Navbar from '@/components/navigation/Navbar';
import ChatSessionCard from '@/components/dashboard/ChatSessionCard.jsx';
import { Plus, Settings, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [shortlistedSchools, setShortlistedSchools] = useState([]);
  const [sessionMap, setSessionMap] = useState({});
  const [error, setError] = useState(null);
  const [showNewSearchModal, setShowNewSearchModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    checkAuthAndLoadSessions();
  }, []);

  const checkAuthAndLoadSessions = async () => {
    try {
      const authenticated = await base44.auth.isAuthenticated();
      setIsAuthenticated(authenticated);

      if (!authenticated) {
        // Redirect to login
        base44.auth.redirectToLogin(window.location.pathname);
        return;
      }

      const userData = await base44.auth.me();
      setUser(userData);

      // Fetch ChatSession records for this user
      const chatSessions = await base44.entities.ChatSession.filter({
        userId: userData.id
      });
      
      // Sort by created_date descending (most recent first)
      const sorted = chatSessions.sort((a, b) => 
        new Date(b.created_date) - new Date(a.created_date)
      );
      
      setSessions(sorted);

      // WC7: Load shortlisted schools and build session map
      if (userData.shortlist && userData.shortlist.length > 0) {
        try {
          // Build map of school ID -> session name for later cross-reference
          const map = {};
          for (const session of sorted) {
            if (session.matchedSchools) {
              try {
                const matchedIds = JSON.parse(session.matchedSchools);
                for (const schoolId of matchedIds) {
                  if (!map[schoolId]) {
                    map[schoolId] = session.profileName || 'Unnamed Profile';
                  }
                }
              } catch (e) {
                console.error('Failed to parse matchedSchools:', e);
              }
            }
          }
          setSessionMap(map);

          // Fetch school data for shortlisted IDs
          const schools = await base44.entities.School.filter({
            id: { $in: userData.shortlist }
          });
          setShortlistedSchools(schools);
        } catch (err) {
          console.error('Failed to load shortlisted schools:', err);
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setError('Failed to load your sessions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromShortlist = async (schoolId) => {
    if (!user) return;
    try {
      const updated = (user.shortlist || []).filter(id => id !== schoolId);
      await base44.auth.updateMe({ shortlist: updated });
      setUser({ ...user, shortlist: updated });
      setShortlistedSchools(shortlistedSchools.filter(s => s.id !== schoolId));
    } catch (err) {
      console.error('Failed to remove school from shortlist:', err);
    }
  };

  const handleNewSearch = () => {
    // WC8: Case 1 (free user with 0 sessions) - navigate directly
    if (sessions.length === 0) {
      navigate(createPageUrl('Consultant'));
      return;
    }

    // WC8: Case 2 (free user with 1+ session) - show modal
    setShowNewSearchModal(true);
  };

  const handleStartOver = async () => {
    if (sessions.length === 0) {
      navigate(createPageUrl('Consultant'));
      return;
    }

    // Archive the first (most recent) active session
    const activeSession = sessions.find(s => s.status === 'active');
    if (!activeSession) {
      navigate(createPageUrl('Consultant'));
      return;
    }

    setModalLoading(true);
    try {
      await base44.entities.ChatSession.update(activeSession.id, { status: 'archived' });
      setShowNewSearchModal(false);
      // Refresh sessions
      await checkAuthAndLoadSessions();
      navigate(createPageUrl('Consultant'));
    } catch (err) {
      console.error('Failed to archive session:', err);
    } finally {
      setModalLoading(false);
    }
  };

  const handleSessionArchived = async () => {
    // Refresh sessions when one is archived
    await checkAuthAndLoadSessions();
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#1E1E2E]">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect
  }

  return (
    <div className="h-screen flex flex-col bg-[#1E1E2E]">
      <Navbar />

      {/* Top Bar */}
      <div className="bg-[#2A2A3D] border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {user.full_name || 'User'}
        </h1>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleNewSearch}
            className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            New Search
          </Button>
          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <Settings className="w-5 h-5 text-white/60" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 sm:p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {sessions.length === 0 ? (
          /* No Sessions - Welcome Message */
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-4">🎓</div>
              <h2 className="text-3xl font-bold text-white mb-3">Welcome to NextSchool!</h2>
              <p className="text-white/70 mb-8 text-lg">
                Start your first school search to see your profiles here.
              </p>
              <Button
                onClick={handleNewSearch}
                className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-6 text-lg font-semibold gap-2"
              >
                <Plus className="w-5 h-5" />
                Start Your First Search
              </Button>
            </div>
          </div>
        ) : (
          /* Sessions Grid + Shortlist */
          <div>
            <h2 className="text-xl font-semibold text-white mb-6">
              Your Search Profiles ({sessions.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {sessions.map((session) => (
                <ChatSessionCard
                  key={session.id}
                  session={session}
                  onSessionArchived={handleSessionArchived}
                />
              ))}
            </div>

            {/* WC7: Global Shortlist Section */}
            <div className="mt-12 pt-8 border-t border-white/10">
              <h2 className="text-xl font-semibold text-white mb-6">Your Shortlisted Schools</h2>
              {shortlistedSchools.length === 0 ? (
                <div className="bg-[#2A2A3D] rounded-lg p-8 border border-white/10 text-center">
                  <div className="text-4xl mb-3">📚</div>
                  <p className="text-white/60">Schools you shortlist during your search will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {shortlistedSchools.map((school) => (
                    <div
                      key={school.id}
                      className="bg-[#2A2A3D] rounded-lg p-4 border border-white/10 hover:border-white/20 transition-colors flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <h3 className="font-semibold text-white">{school.name}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-white/60">
                          <span>{school.city || 'Location TBA'}</span>
                          {sessionMap[school.id] && (
                            <span className="text-teal-400">Added in: {sessionMap[school.id]}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFromShortlist(school.id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg transition-colors flex-shrink-0 ml-4"
                        title="Remove from shortlist"
                      >
                        <X className="w-5 h-5 text-white/60 hover:text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* WC8: New Search Confirmation Modal (Free Users) */}
      {showNewSearchModal && sessions.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2A2A3D] rounded-lg max-w-md w-full p-6 border border-white/10">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-xl font-semibold text-white mb-2">Start a New Search?</h2>
                <p className="text-white/70 text-sm">
                  Starting a new search will replace <strong>{sessions[0].profileName || 'Untitled Profile'}</strong>, including{' '}
                  <strong>
                    {(() => {
                      try {
                        return sessions[0].matchedSchools ? JSON.parse(sessions[0].matchedSchools).length : 0;
                      } catch {
                        return 0;
                      }
                    })()}
                  </strong>{' '}
                  matched schools and <strong>{sessions[0].shortlistedCount || 0}</strong> shortlisted schools. Your global shortlist will be preserved.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleStartOver}
                disabled={modalLoading}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {modalLoading ? 'Archiving...' : 'Start Over'}
              </button>
              <button
                onClick={() => setShowNewSearchModal(false)}
                disabled={modalLoading}
                className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Keep Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}