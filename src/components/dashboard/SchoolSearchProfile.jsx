import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import UpgradePaywallModal from '@/components/dialogs/UpgradePaywallModal';
import { CheckCircle, Copy } from 'lucide-react';
import {
  Zap,
  Eye,
  Edit,
  Share2,
  Archive,
  Palette,
  BookOpen,
  Heart,
  Microscope,
  Music,
  Trophy,
  Globe,
  MoreVertical,
  X,
} from 'lucide-react';

const PRIORITY_ICONS = {
  Arts: Palette,
  Academics: BookOpen,
  Nurturing: Heart,
  'STEM': Microscope,
  'Sports': Trophy,
  'Music': Music,
  'Languages': Globe,
};

const AVAILABLE_PRIORITIES = ['Arts', 'Academics', 'Nurturing', 'STEM', 'Sports', 'Music', 'Languages'];

export default function SchoolSearchProfile({
  session,
  onViewMatches,
  onEditProfile,
  onArchive,
  isPaid = false,
}) {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [isSaving, setIsSaving] = useState(false);
  const [showShareUpgrade, setShowShareUpgrade] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [editData, setEditData] = useState({
    childGrade: session.childGrade,
    maxTuition: session.maxTuition,
    locationArea: session.locationArea,
    priorities: session.priorities || [],
    learningDifferences: session.learningDifferences || [],
  });

  const handleViewMatches = () => {
    navigate(createPageUrl('Consultant') + '?sessionId=' + session.id);
    if (onViewMatches) onViewMatches(session);
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      await base44.entities.ChatSession.update(session.id, { status: 'archived' });
      setShowMenu(false);
      if (onArchive) onArchive();
    } catch (err) {
      console.error('Failed to archive session:', err);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleSaveEdits = async () => {
    setIsSaving(true);
    try {
      // Update ONLY the editable session fields — never touch familyBrief or FamilyProfile
      const sessionUpdate = {
        childGrade: editData.childGrade ?? null,
        maxTuition: editData.maxTuition ?? null,
        locationArea: editData.locationArea ?? null,
        priorities: editData.priorities,
        learningDifferences: editData.learningDifferences,
      };
      await base44.entities.ChatSession.update(session.id, sessionUpdate);

      // Re-run school matching using the edited fields only
      await base44.functions.invoke('matchSchoolsForProfile', {
        sessionId: session.id,
        familyProfile: {
          childGrade: editData.childGrade,
          maxTuition: editData.maxTuition,
          locationArea: editData.locationArea,
          priorities: editData.priorities,
          learningDifferences: editData.learningDifferences,
        },
      });

      setIsEditMode(false);
      if (onArchive) onArchive(); // Trigger refresh
    } catch (err) {
      console.error('Failed to save edits:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    try {
      // Generate UUID for shareToken
      const shareToken = crypto.randomUUID();
      await base44.entities.ChatSession.update(session.id, { shareToken });
      const url = `https://nextschool.ca/SharedProfile?token=${shareToken}`;
      setShareUrl(url);
      setShowShareModal(true);
    } catch (err) {
      console.error('Failed to generate share link:', err);
    }
  };

  const handleCopyUrl = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    }
  };

  const handleRemoveSharing = async () => {
    try {
      await base44.entities.ChatSession.update(session.id, { shareToken: null });
      setShowShareModal(false);
      setShareUrl(null);
    } catch (err) {
      console.error('Failed to remove sharing:', err);
    }
  };

  const isActive = session.status === 'active';
  const statusColor = isActive ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-500/20 text-slate-300';

  // Parse matchedSchools
  let matchedCount = 0;
  let matchedSchools = [];
  try {
    if (session.matchedSchools && typeof session.matchedSchools === 'string') {
      matchedSchools = JSON.parse(session.matchedSchools);
      matchedCount = Array.isArray(matchedSchools) ? matchedSchools.length : 0;
    }
  } catch (e) {
    matchedCount = 0;
  }

  // Get child initial for avatar
  const initial = session.childName ? session.childName.charAt(0).toUpperCase() : '?';

  // Prioritize tags (if priorities exist)
  const priorities = session.priorities || [];

  // Format budget range
  const budgetRange = session.maxTuition
    ? `$${(session.maxTuition / 1000).toFixed(0)}K`
    : 'Not set';

  // Best match school (first in matched)
  const bestMatchSchool = matchedSchools[0];

  return (
    <div className="bg-[#2A2A3D] border border-white/10 border-l-4 border-l-teal-500 rounded-xl overflow-hidden hover:border-l-teal-400 transition-all duration-200 hover:shadow-xl flex flex-col">
      {/* Vertical Card — non-edit mode */}
      {!isEditMode ? (
        <div className="p-5 flex flex-col gap-4 flex-1">
          {/* TOP ROW: Name + Grade + Status dot */}
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-teal-400' : 'bg-slate-500'}`} />
            <span className="font-bold text-white truncate">{session.childName || 'Student'}</span>
            {session.childGrade != null && (
              <span className="text-sm text-white/50 flex-shrink-0">· Grade {session.childGrade}</span>
            )}
          </div>

          {/* Priority chips */}
          {priorities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {priorities.slice(0, 3).map((priority, idx) => {
                const IconComponent = PRIORITY_ICONS[priority] || Zap;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-1 px-2 py-1 bg-teal-500/10 border border-teal-500/30 rounded-full"
                  >
                    <IconComponent className="w-3 h-3 text-teal-400" />
                    <span className="text-xs text-white/80">{priority}</span>
                  </div>
                );
              })}
              {priorities.length > 3 && (
                <div className="flex items-center px-2 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-white/50">
                  +{priorities.length - 3} more
                </div>
              )}
            </div>
          )}

          {/* Stats line */}
          <p className="text-sm text-white/60">
            <span className="text-teal-400 font-semibold">{matchedCount}</span> matched
            {(session.shortlistedCount > 0) && (
              <> · <span className="text-teal-400 font-semibold">{session.shortlistedCount}</span> shortlisted</>
            )}
          </p>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 mt-auto">
            <Button
              onClick={handleViewMatches}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2"
            >
              <Eye className="w-4 h-4" />
              View Matches
            </Button>
            <Button
              onClick={() => setIsEditMode(true)}
              variant="outline"
              className="w-full border-white/20 text-white hover:bg-white/10 gap-2"
            >
              <Edit className="w-4 h-4" />
              Edit Profile
            </Button>
            <div className="flex gap-2">
              <button
                onClick={isPaid ? handleShare : () => setShowShareUpgrade(true)}
                className="flex-1 text-sm text-white/60 hover:text-white flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
              <button
                onClick={handleArchive}
                disabled={isArchiving}
                className="flex-1 text-sm text-white/60 hover:text-red-400 flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                <Archive className="w-3.5 h-3.5" />
                {isArchiving ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Edit Mode */
        <div className="p-4 border-t border-white/10 bg-white/5 space-y-4">
          {/* Grade */}
          <div>
            <label className="text-xs text-white/60 mb-2 block">Grade</label>
            <select
              value={editData.childGrade || ''}
              onChange={(e) => setEditData({ ...editData, childGrade: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm"
            >
              <option value="">Select Grade</option>
              {[...Array(13)].map((_, i) => (
                <option key={i} value={i}>{`Grade ${i}`}</option>
              ))}
            </select>
          </div>

          {/* Budget Slider */}
          <div>
            <label className="text-xs text-white/60 mb-2 block">Budget</label>
            <input
              type="range"
              min="5000"
              max="100000"
              step="5000"
              value={editData.maxTuition || 30000}
              onChange={(e) => setEditData({ ...editData, maxTuition: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="text-sm text-teal-400 mt-1">
              ${(editData.maxTuition / 1000 || 30).toFixed(0)}K/year
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-xs text-white/60 mb-2 block">Location</label>
            <input
              type="text"
              value={editData.locationArea || ''}
              onChange={(e) => setEditData({ ...editData, locationArea: e.target.value })}
              placeholder="City or region"
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm placeholder:text-white/40"
            />
          </div>

          {/* Priorities */}
          <div>
            <label className="text-xs text-white/60 mb-2 block">Priorities</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {editData.priorities.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1 px-2 py-1 bg-white/10 border border-white/20 rounded-full text-xs text-white"
                >
                  {p}
                  <button
                    onClick={() => setEditData({
                      ...editData,
                      priorities: editData.priorities.filter((_, i) => i !== idx)
                    })}
                    className="ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <select
              onChange={(e) => {
                if (e.target.value && !editData.priorities.includes(e.target.value)) {
                  setEditData({
                    ...editData,
                    priorities: [...editData.priorities, e.target.value]
                  });
                }
                e.target.value = '';
              }}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm"
            >
              <option value="">+ Add Priority</option>
              {AVAILABLE_PRIORITIES.map(p => (
                <option key={p} value={p} disabled={editData.priorities.includes(p)}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Special Needs */}
          <div>
            <label className="text-xs text-white/60 mb-2 block">Special Needs</label>
            <input
              type="text"
              value={editData.learningDifferences?.join(', ') || ''}
              onChange={(e) => setEditData({
                ...editData,
                learningDifferences: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              })}
              placeholder="E.g., dyslexia support, gifted program"
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm placeholder:text-white/40"
            />
          </div>

          {/* Save/Cancel */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSaveEdits}
              disabled={isSaving}
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm"
            >
              {isSaving ? 'Updating matches...' : 'Save Changes'}
            </Button>
            <Button
              onClick={() => {
                setIsEditMode(false);
                setEditData({
                  childGrade: session.childGrade,
                  maxTuition: session.maxTuition,
                  locationArea: session.locationArea,
                  priorities: session.priorities || [],
                  learningDifferences: session.learningDifferences || [],
                });
              }}
              disabled={isSaving}
              variant="secondary"
              className="flex-1 text-sm"
            >
              Cancel Edit
            </Button>
          </div>
        </div>
      )}

      {/* WC12: Share Upgrade Modal */}
      <UpgradePaywallModal
        isOpen={showShareUpgrade}
        variant="SHARE"
        onClose={() => setShowShareUpgrade(false)}
      />

      {/* WC13: Share Modal for Paid Users */}
      {showShareModal && shareUrl && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl max-w-lg w-full p-8 shadow-2xl border border-white/10">
            <h2 className="text-2xl font-bold text-white mb-2">Share This Profile</h2>
            <p className="text-white/70 mb-6">Send this link to your partner or anyone you want to collaborate with.</p>
            
            {/* URL Display */}
            <div className="bg-white/10 border border-white/20 rounded-lg p-4 mb-6 break-all">
              <p className="text-sm text-white/90 font-mono">{shareUrl}</p>
            </div>

            {/* Copy Button */}
            <Button
              onClick={handleCopyUrl}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2 mb-3"
            >
              {copiedToClipboard ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Link
                </>
              )}
            </Button>

            {/* Remove Sharing Button */}
            <Button
              onClick={handleRemoveSharing}
              variant="secondary"
              className="w-full gap-2"
            >
              <X className="w-4 h-4" />
              Revoke Access
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}