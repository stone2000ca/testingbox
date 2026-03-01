import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import UpgradePaywallModal from '@/components/dialogs/UpgradePaywallModal';
import { CheckCircle, Copy } from 'lucide-react';
import {
  MapPin,
  DollarSign,
  Calendar,
  Navigation,
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
  Plus,
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
      // Update ChatSession with new profile data
      await base44.entities.ChatSession.update(session.id, {
        childGrade: editData.childGrade,
        maxTuition: editData.maxTuition,
        locationArea: editData.locationArea,
        priorities: editData.priorities,
        learningDifferences: editData.learningDifferences,
      });

      // Re-run school matching
      const matchResult = await base44.functions.invoke('matchSchoolsForProfile', {
        sessionId: session.id,
        familyProfile: editData,
      });

      // Regenerate AI narrative
      if (matchResult.data?.success) {
        await base44.functions.invoke('generateProfileNarrative', {
          sessionId: session.id,
          familyProfile: editData,
        }).catch(err => console.error('Narrative regeneration failed:', err));
      }

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
      const url = `https://nextschool.ca/profile/${shareToken}`;
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
    <div className="bg-gradient-to-br from-[#1E1E2E] to-[#2A2A3D] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all duration-200 hover:shadow-xl flex flex-col group">
      {/* Header */}
      <div className="p-5 border-b border-white/10 bg-white/5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center font-bold text-white text-lg flex-shrink-0">
              {initial}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {session.childName || 'Student'}
              </h2>
              {session.childGrade != null && (
                <p className="text-sm text-white/60">Grade {session.childGrade}</p>
              )}
            </div>
          </div>

          {/* Status + Menu */}
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
                      className="w-full px-4 py-2 flex items-center gap-2 text-sm text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Priority Tags */}
        {priorities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {priorities.slice(0, 4).map((priority, idx) => {
              const IconComponent = PRIORITY_ICONS[priority] || Zap;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full"
                >
                  <IconComponent className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-xs font-medium text-white/80">{priority}</span>
                </div>
              );
            })}
            {priorities.length > 4 && (
              <div className="flex items-center px-3 py-1.5 text-xs text-white/50">
                +{priorities.length - 4} more
              </div>
            )}
          </div>
        )}
      </div>

      {/* Key Data Grid */}
      <div className="p-5 border-b border-white/10 grid grid-cols-2 gap-3">
        {/* Location */}
        {session.locationArea && (
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-white/60">Location</p>
              <p className="text-sm font-medium text-white/90">{session.locationArea}</p>
            </div>
          </div>
        )}

        {/* Budget */}
        {session.maxTuition && (
          <div className="flex items-start gap-2">
            <DollarSign className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-white/60">Budget</p>
              <p className="text-sm font-medium text-white/90">{budgetRange}/year</p>
            </div>
          </div>
        )}

        {/* Grade */}
        {session.childGrade != null && (
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-white/60">Grade</p>
              <p className="text-sm font-medium text-white/90">Grade {session.childGrade}</p>
            </div>
          </div>
        )}

        {/* Commute Preference */}
        {session.commuteToleranceMinutes && (
          <div className="flex items-start gap-2">
            <Navigation className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-white/60">Commute</p>
              <p className="text-sm font-medium text-white/90">{session.commuteToleranceMinutes} min</p>
            </div>
          </div>
        )}

        {/* Special Needs */}
        {session.learningDifferences && session.learningDifferences.length > 0 && (
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-white/60">Special Needs</p>
              <p className="text-sm font-medium text-white/90">
                {session.learningDifferences[0]}
              </p>
            </div>
          </div>
        )}

        {/* Boarding Preference */}
        {session.boardingPreference && (
          <div className="flex items-start gap-2">
            <Globe className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-white/60">Boarding</p>
              <p className="text-sm font-medium text-white/90 capitalize">
                {session.boardingPreference.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* AI Narrative */}
      {session.aiNarrative && (
        <div className="p-5 border-b border-white/10">
          <p className="text-sm text-white/75 leading-relaxed">
            {session.aiNarrative}
          </p>
        </div>
      )}

      {/* Match Summary */}
      <div className="p-5 border-b border-white/10 bg-white/5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Schools Matched</span>
            <span className="text-lg font-bold text-teal-400">{matchedCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Shortlisted</span>
            <span className="text-lg font-bold text-teal-400">{session.shortlistedCount || 0}</span>
          </div>
          {bestMatchSchool && (
            <div className="pt-2 border-t border-white/10">
              <p className="text-xs text-white/50 mb-1">Best Match</p>
              <p className="text-sm font-semibold text-teal-300">{bestMatchSchool}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Bar or Edit Mode */}
      {!isEditMode ? (
        <div className="p-4 flex gap-2 flex-wrap">
          <Button
            onClick={handleViewMatches}
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white gap-2 text-sm"
          >
            <Eye className="w-4 h-4" />
            View Matches
          </Button>
          <Button
            onClick={() => setIsEditMode(true)}
            variant="outline"
            className="flex-1 border-white/20 text-white hover:bg-white/10 gap-2 text-sm"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Button>
          {isPaid ? (
            <Button
              onClick={handleShare}
              variant="outline"
              className="flex-1 border-white/20 text-white hover:bg-white/10 gap-2 text-sm"
            >
              <Share2 className="w-4 h-4" />
              Share
            </Button>
          ) : (
            <Button
              onClick={() => setShowShareUpgrade(true)}
              variant="outline"
              className="flex-1 border-white/20 text-white hover:bg-white/10 gap-2 text-sm"
            >
              <Share2 className="w-4 h-4" />
              Share
            </Button>
          )}
        </div>
      ) : (
        /* Edit Mode */
        <div className="p-5 border-t border-white/10 bg-white/5 space-y-4">
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
              variant="outline"
              className="flex-1 border-white/20 text-white hover:bg-white/10 text-sm"
            >
              Cancel
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
              variant="outline"
              className="w-full border-white/20 text-white hover:bg-white/10"
            >
              Remove Sharing
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}