import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Building2, BarChart3, Mail, CreditCard, Upload, Crown, Sparkles, Image, MessageSquareQuote, User, CalendarDays, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import ProfileEditor from '@/components/school-admin/ProfileEditor';
import Analytics from '@/components/school-admin/Analytics';
import Inquiries from '@/components/school-admin/Inquiries';
import Subscription from '@/components/school-admin/Subscription';
import CSVUpload from '@/components/school-admin/CSVUpload';
import PhotosMediaSection from '@/components/school-admin/PhotosMediaSection';
import TestimonialsSection from '@/components/school-admin/TestimonialsSection';
import AccountSection from '@/components/school-admin/AccountSection';
import EventsSection from '@/components/school-admin/EventsSection';
import ProfileCompletenessRing from '@/components/school-admin/ProfileCompletenessRing';
import AdmissionsSection from '@/components/school-admin/AdmissionsSection';

export default function SchoolAdmin() {
  const [user, setUser] = useState(null);
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [newInquiryCount, setNewInquiryCount] = useState(0);

  useEffect(() => {
    loadSchoolData();
  }, []);

  const loadSchoolData = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);

      // Check account_type — only "school" or "both" can access this portal
      if (userData.account_type && userData.account_type === 'family') {
        setLoading(false);
        return;
      }

      // Look up SchoolAdmin records for this user (new userId field)
      const adminRecords = await base44.entities.SchoolAdmin.filter({ userId: userData.id, isActive: true });

      let resolvedSchool = null;
      if (adminRecords && adminRecords.length > 0) {
        // Load the first associated school (multi-school selector can come later)
        const schoolData = await base44.entities.School.filter({ id: adminRecords[0].schoolId });
        if (schoolData && schoolData.length > 0) {
          resolvedSchool = schoolData[0];
          setSchool(resolvedSchool);
        }
      } else {
        // Fallback: legacy adminUserId field on School
        const schools = await base44.entities.School.filter({ adminUserId: userData.id });
        if (schools && schools.length > 0) {
          resolvedSchool = schools[0];
          setSchool(resolvedSchool);
        }
      }

      // Load new tour request count for badge
      if (resolvedSchool) {
        try {
          const inquiries = await base44.entities.SchoolInquiry.filter({ schoolId: resolvedSchool.id, inquiryType: 'tour_request' });
          const newCount = inquiries.filter(i => !i.tourStatus || i.tourStatus === 'new').length;
          setNewInquiryCount(newCount);
        } catch (e) { /* non-blocking */ }
      }
    } catch (error) {
      console.error('Failed to load school data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSchool = async (updatedData) => {
    if (!school) return;
    
    setIsSaving(true);
    try {
      await base44.entities.School.update(school.id, updatedData);
      const updated = { ...school, ...updatedData };
      setSchool(updated);
      // Post-save: recalculate completeness score server-side (non-blocking)
      base44.functions.invoke('calculateCompletenessScore', { schoolId: school.id })
        .then(res => {
          if (res?.data?.completenessScore != null) {
            setSchool(s => ({ ...s, completenessScore: res.data.completenessScore }));
          }
        })
        .catch(e => console.warn('completenessScore update failed:', e));
    } catch (error) {
      console.error('Failed to save school:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Access gate: family-only accounts cannot access school portal
  if (!loading && user && user.account_type === 'family') {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md">
          <Building2 className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">School Portal Access Required</h2>
          <p className="text-slate-600 mb-6">
            Your account is set up as a family account. To access the school portal, please contact support to update your account type.
          </p>
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md">
          <Building2 className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">No School Profile Found</h2>
          <p className="text-slate-600 mb-6">
            You don't have a school profile associated with your account. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  const tierColors = {
    free: 'bg-slate-100 text-slate-700',
    basic: 'bg-blue-100 text-blue-700',
    premium: 'bg-amber-100 text-amber-700'
  };

  const tierIcons = {
    free: null,
    basic: <Sparkles className="h-3 w-3" />,
    premium: <Crown className="h-3 w-3" />
  };

  const navGroups = [
    {
      label: 'Content',
      items: [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'profile', label: 'Profile Editor', icon: Building2 },
        { id: 'media', label: 'Photos & Media', icon: Image },
        { id: 'testimonials', label: 'Testimonials', icon: MessageSquareQuote },
      ],
    },
    {
      label: 'Engagement',
      items: [
        { id: 'admissions', label: 'Admissions', icon: FileText },
        { id: 'events', label: 'Events & Open Houses', icon: CalendarDays, locked: school.subscriptionTier === 'free', lockLabel: 'Premium' },
        { id: 'inquiries', label: 'Inquiries', icon: Mail, badge: newInquiryCount },
        { id: 'analytics', label: 'Analytics', icon: BarChart3, locked: school.subscriptionTier === 'free' },
      ],
    },
    {
      label: 'Admin',
      items: [
        { id: 'csv', label: 'CSV Upload', icon: Upload },
        { id: 'subscription', label: 'Subscription', icon: CreditCard },
        { id: 'account', label: 'Account', icon: User },
      ],
    },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Top Navigation */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{school.name}</h1>
            <p className="text-sm text-slate-500">{school.city}, {school.region}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${tierColors[school.subscriptionTier || 'free']}`}>
            {tierIcons[school.subscriptionTier || 'free']}
            <span className="uppercase">{school.subscriptionTier || 'free'}</span>
          </div>

        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-white border-r flex flex-col">
          <nav className="p-4 space-y-1">
            {navGroups.map((group, groupIdx) => (
              <div key={group.label}>
                {groupIdx > 0 && <div className="my-3 border-t border-slate-100" />}
                <p className="px-4 mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">{group.label}</p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => (item.id === 'events' || !item.locked) && setCurrentView(item.id)}
                      disabled={item.locked && item.id !== 'events'}
                      className={`
                        w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
                        ${isActive
                          ? 'bg-teal-50 text-teal-700 border border-teal-200'
                          : item.locked
                            ? 'text-slate-400 cursor-not-allowed'
                            : 'text-slate-700 hover:bg-slate-50'
                        }
                      `}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{item.label}</span>
                      {item.locked && (
                        <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          {item.lockLabel || 'Upgrade'}
                        </span>
                      )}
                      {!item.locked && item.badge > 0 && (
                        <span className="ml-auto text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full font-semibold">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {currentView === 'overview' && (
            <div className="p-8 space-y-8">
              <h2 className="text-2xl font-bold text-slate-900">Overview</h2>
              <ProfileCompletenessRing school={school} />
            </div>
          )}
          {currentView === 'profile' && (
            <ProfileEditor school={school} onSave={handleSaveSchool} isSaving={isSaving} />
          )}
          {currentView === 'media' && (
            <div className="p-6 max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Photos & Media</h2>
              <PhotosMediaSection school={school} onUpdate={(field, value) => setSchool({ ...school, [field]: value })} />
            </div>
          )}
          {currentView === 'testimonials' && (
            <TestimonialsSection school={school} />
          )}
          {currentView === 'admissions' && (
            <div className="p-6 max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Admissions</h2>
              <AdmissionsSection school={school} onUpdate={(field, value) => setSchool({ ...school, [field]: value })} />
            </div>
          )}
          {currentView === 'events' && (
            <EventsSection school={school} />
          )}
          {currentView === 'inquiries' && (
            <Inquiries schoolId={school.id} />
          )}
          {currentView === 'analytics' && (
            <Analytics school={school} />
          )}
          {currentView === 'csv' && (
            <CSVUpload school={school} onUpdate={loadSchoolData} />
          )}
          {currentView === 'subscription' && (
            <Subscription school={school} onUpdate={loadSchoolData} />
          )}
          {currentView === 'account' && (
            <AccountSection school={school} />
          )}
        </main>
      </div>
    </div>
  );
}