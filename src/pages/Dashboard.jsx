import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Navbar from '@/components/navigation/Navbar';
import ChatSessionCard from '@/components/dashboard/ChatSessionCard.jsx';
import { Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);

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
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setError('Failed to load your sessions. Please try again.');
    } finally {
      setLoading(false);
    }
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
            onClick={() => navigate(createPageUrl('Consultant'))}
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
                onClick={() => navigate(createPageUrl('Consultant'))}
                className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-6 text-lg font-semibold gap-2"
              >
                <Plus className="w-5 h-5" />
                Start Your First Search
              </Button>
            </div>
          </div>
        ) : (
          /* Sessions Grid */
          <div>
            <h2 className="text-xl font-semibold text-white mb-6">
              Your Search Profiles ({sessions.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sessions.map((session) => (
                <ChatSessionCard key={session.id} session={session} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}