import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "../../utils";
import LoginGateModal from "@/components/dialogs/LoginGateModal";
import UpgradePaywallModal from "@/components/dialogs/UpgradePaywallModal";
import DebugPanel from "@/components/utils/DebugPanel";

export default function ConsultantDialogs({
  // Delete dialog
  deleteDialogOpen, setDeleteDialogOpen, conversationToDelete, deleteConversation,
  // Archive dialog
  archiveConfirmOpen, setArchiveConfirmOpen, conversations, user,
  handleArchiveOldestConversation, setPendingNewConversation,
  // Limit reached dialog
  limitReachedOpen, setLimitReachedOpen, isAuthenticated, getConversationLimits,
  // Upgrade modals
  showUpgradeModal, setShowUpgradeModal, tokenBalance, getPlanLimits,
  // Login gate
  showLoginGate, setShowLoginGate, selectedConsultant, familyProfile,
  // Debug panel
  isDebugMode, extractedEntitiesData, currentConversation,
  // E39-S11: Deep dive & navigation data for Notepad tab
  deepDiveAnalysis, actionPlan, visitPrepKit, fitReEvaluation, journeySteps, selectedSchool, schoolsWithDeepDive,
}) {
  return (
    <>
      {/* 1. Delete Conversation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{conversationToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteConversation} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 2. Archive Confirmation Dialog */}
      <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Profile Limit Reached</AlertDialogTitle>
            <AlertDialogDescription>
              {conversations.length > 0 && (
                <>
                  You've reached your profile limit for your <strong>{user?.subscriptionPlan || 'free'}</strong> plan. Would you like to archive{' '}
                  <strong>"{conversations.sort((a, b) => new Date(a.created_date) - new Date(b.created_date))[0]?.title || 'oldest profile'}"</strong> to create a new one?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setArchiveConfirmOpen(false);
                setPendingNewConversation(false);
                window.location.href = createPageUrl('Dashboard');
              }}
              variant="outline"
            >
              No, View Dashboard
            </AlertDialogAction>
            <AlertDialogAction onClick={handleArchiveOldestConversation} className="bg-teal-600 hover:bg-teal-700">
              Yes, Archive & Create New
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 3. Conversation Limit Reached Dialog */}
      <AlertDialog open={limitReachedOpen} onOpenChange={setLimitReachedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conversation Limit Reached</AlertDialogTitle>
            <AlertDialogDescription>
              {isAuthenticated ? (
                <>
                  You've reached the conversation limit for your <strong>{user?.subscriptionPlan || 'free'}</strong> plan ({getConversationLimits(user?.subscriptionPlan || 'free')} active conversations).{' '}
                  Upgrade your plan or delete old conversations to start a new one.
                </>
              ) : (
                <>Sign in to create and manage multiple conversations.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {isAuthenticated ? (
              <Link to={createPageUrl('Pricing')}>
                <AlertDialogAction className="bg-teal-600 hover:bg-teal-700">Upgrade Plan</AlertDialogAction>
              </Link>
            ) : (
              <AlertDialogAction
                className="bg-teal-600 hover:bg-teal-700"
                onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
              >
                Sign In
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 4. Token exhaustion modal */}
      {showUpgradeModal && tokenBalance <= 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-3xl font-bold mb-2 text-slate-900">You've used all your tokens!</h3>
              <p className="text-slate-600">
                {isAuthenticated ? (
                  <>
                    Your tokens will replenish tomorrow with{' '}
                    <span className="font-semibold text-teal-600">
                      +{getPlanLimits(user?.subscriptionPlan || 'free').dailyReplenishment} tokens
                    </span>
                  </>
                ) : (
                  "Sign in to continue your search or upgrade for more tokens."
                )}
              </p>
            </div>
            {isAuthenticated && (
              <div className="bg-gradient-to-br from-teal-50 to-blue-50 rounded-xl p-6 mb-6 border border-teal-200">
                <h4 className="font-semibold text-lg mb-3 text-slate-900">Upgrade for More Tokens</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                    <span className="text-sm text-slate-700">
                      <strong>Premium Plan:</strong> 1,000 tokens, replenish 33/day
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="text-sm text-slate-700">Priority support & advanced features</span>
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {!isAuthenticated && (
                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-6"
                  onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
                >
                  Sign In
                </Button>
              )}
              {isAuthenticated && (
                <Link to={createPageUrl('Pricing')}>
                  <Button className="w-full bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-700 hover:to-blue-700 text-white font-semibold py-6 shadow-lg">
                    <Sparkles className="h-5 w-5 mr-2" />
                    Upgrade Plan
                  </Button>
                </Link>
              )}
              <Button
                variant="outline"
                className="w-full border-2 font-semibold"
                onClick={() => setShowUpgradeModal(false)}
              >
                {isAuthenticated ? 'Come Back Tomorrow' : 'Maybe Later'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. UpgradePaywallModal (premium features gating) */}
      <UpgradePaywallModal
        isOpen={showUpgradeModal && tokenBalance > 0}
        variant="GENERAL"
        onClose={() => setShowUpgradeModal(false)}
      />

      {/* Login Gate Modal */}
      {showLoginGate && (
        <LoginGateModal
          consultantName={selectedConsultant}
          childName={familyProfile?.childName || 'your child'}
          onClose={() => setShowLoginGate(false)}
        />
      )}

      {/* Debug Panel */}
      {isDebugMode && (
        <DebugPanel
          debugState={{
            familyProfile,
            extractedEntities: extractedEntitiesData,
            conversationContext: currentConversation?.conversationContext,
            deepDiveAnalysis,
            actionPlan,
            visitPrepKit,
            fitReEvaluation,
            journeySteps,
            selectedSchool: selectedSchool ? { id: selectedSchool.id, name: selectedSchool.name } : null,
            schoolsWithDeepDive: schoolsWithDeepDive ? [...schoolsWithDeepDive] : [],
          }}
        />
      )}
    </>
  );
}