import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowRight, Calendar, MoreVertical, Archive } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';

export default function ChatSessionCard({ session, onSessionArchived }) {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const handleContinue = () => {
    // Navigate to Consultant page with session ID in URL params
    navigate(createPageUrl('Consultant') + '?sessionId=' + session.id);
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      await base44.entities.ChatSession.update(session.id, { status: 'archived' });
      setShowMenu(false);
      if (onSessionArchived) {
        onSessionArchived();
      }
    } catch (err) {
      console.error('Failed to archive session:', err);
    } finally {
      setIsArchiving(false);
    }
  };

  // Format dates
  const createdDate = format(new Date(session.created_date), 'MMM d, yyyy');
  const updatedDate = format(new Date(session.updated_date), 'MMM d, yyyy');

  // Parse matchedSchools if it's a JSON string
  let matchedSchoolsCount = 0;
  try {
    if (session.matchedSchools && typeof session.matchedSchools === 'string') {
      const parsed = JSON.parse(session.matchedSchools);
      matchedSchoolsCount = Array.isArray(parsed) ? parsed.length : 0;
    }
  } catch (e) {
    matchedSchoolsCount = 0;
  }

  // Status badge color
  const isActive = session.status === 'active';
  const statusColor = isActive 
    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/50' 
    : 'bg-slate-500/20 text-slate-300 border border-slate-500/50';

  return (
    <div className="bg-[#2A2A3D] border border-white/10 rounded-lg overflow-hidden hover:border-white/20 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 flex flex-col">
      {/* Card Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h3 className="text-lg font-semibold text-white truncate">
              {session.profileName || 'Untitled Profile'}
            </h3>
            {session.childName && (
              <p className="text-sm text-white/60 mt-1">
                {session.childName}
                {session.childGrade != null && ` • Grade ${session.childGrade}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusColor}`}>
              {isActive ? 'Active' : 'Archived'}
            </div>
            {isActive && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <MoreVertical className="w-4 h-4 text-white/60" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-1 bg-[#1E1E2E] border border-white/20 rounded-lg shadow-lg z-10">
                    <button
                      onClick={handleArchive}
                      disabled={isArchiving}
                      className="w-full px-4 py-2 flex items-center gap-2 text-sm text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed first:rounded-t-lg"
                    >
                      <Archive className="w-4 h-4" />
                      {isArchiving ? 'Archiving...' : 'Archive'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 flex-1 space-y-3">
        {/* Dates */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Calendar className="w-3 h-3" />
            <span>Created: {createdDate}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Calendar className="w-3 h-3" />
            <span>Updated: {updatedDate}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="bg-white/5 rounded px-3 py-2">
            <div className="text-xs text-white/60">Schools Found</div>
            <div className="text-lg font-semibold text-teal-400">{matchedSchoolsCount}</div>
          </div>
          <div className="bg-white/5 rounded px-3 py-2">
            <div className="text-xs text-white/60">Shortlisted</div>
            <div className="text-lg font-semibold text-teal-400">
              {session.shortlistedCount || 0}
            </div>
          </div>
        </div>

        {/* Priority Pills */}
        {session.priorities && session.priorities.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-white/60">Priorities:</p>
            <div className="flex flex-wrap gap-2">
              {session.priorities.slice(0, 3).map((priority, idx) => (
                <span
                  key={idx}
                  className="inline-block bg-white/10 text-white/80 text-xs px-2 py-1 rounded-full border border-white/20"
                >
                  {priority}
                </span>
              ))}
              {session.priorities.length > 3 && (
                <span className="text-xs text-white/50 self-center">
                  +{session.priorities.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="p-4 border-t border-white/10 bg-white/5">
        <Button
          onClick={handleContinue}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}