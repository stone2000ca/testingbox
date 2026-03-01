import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function AccountSection({ school }) {
  const [user, setUser] = useState(null);
  const [adminRecord, setAdminRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, [school]);

  const loadUserData = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);

      // Load SchoolAdmin record
      const admins = await base44.entities.SchoolAdmin.filter({ schoolId: school?.id });
      if (admins && admins.length > 0) {
        setAdminRecord(admins[0]);
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Account</h2>
        <p className="text-sm text-slate-500 mt-1">Manage your account details and preferences.</p>
      </div>

      <div className="space-y-6">
        {/* Your Details */}
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Your Details</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-600 uppercase tracking-wide">Display Name</label>
              <div className="text-sm font-medium text-slate-900 mt-1">{user?.full_name || 'N/A'}</div>
            </div>
            <div>
              <label className="text-xs text-slate-600 uppercase tracking-wide">Email</label>
              <div className="text-sm font-medium text-slate-900 mt-1">{user?.email || 'N/A'}</div>
            </div>
            <div>
              <label className="text-xs text-slate-600 uppercase tracking-wide">Role</label>
              <div className="text-sm font-medium text-slate-900 mt-1 capitalize">
                {adminRecord?.role === 'owner' ? 'School Owner' : 'School Editor'}
              </div>
            </div>
          </div>
        </Card>

        {/* Membership */}
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Membership Plan</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-slate-900">Current Plan</span>
                <span className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded">Basic (Free)</span>
              </div>
              <p className="text-sm text-slate-600">
                Your school is on the free basic plan with standard features. Upgrade to Enhanced to unlock analytics, advanced branding, and priority support.
              </p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button disabled className="mt-2 bg-slate-300 cursor-not-allowed">
                    Upgrade to Enhanced
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Coming Soon</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="p-6 border-red-200 bg-red-50">
          <div className="flex items-start gap-3 mb-6">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-red-900">Danger Zone</h3>
              <p className="text-sm text-red-800 mt-1">Proceed with caution. These actions cannot be undone.</p>
            </div>
          </div>

          <div className="space-y-3">
            <TooltipProvider>
              <div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="destructive" disabled className="w-full cursor-not-allowed opacity-60">
                      <Lock className="h-4 w-4 mr-2" />
                      Transfer Ownership
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Contact support to transfer ownership</TooltipContent>
                </Tooltip>
              </div>

              <div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="destructive" disabled className="w-full cursor-not-allowed opacity-60">
                      <Lock className="h-4 w-4 mr-2" />
                      Unclaim This Profile
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Contact support to unclaim this school</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </Card>
      </div>
    </div>
  );
}