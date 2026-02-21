import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Settings, Edit, Image, FileText, User, Menu, X } from 'lucide-react';
import ProfileCompletenessRing from '@/components/school-admin/ProfileCompletenessRing';
import EditProfileForm from '@/components/school-admin/EditProfileForm';
import PhotosMediaSection from '@/components/school-admin/PhotosMediaSection';
import AdmissionsSection from '@/components/school-admin/AdmissionsSection';
import AccountSection from '@/components/school-admin/AccountSection';
import { createPageUrl } from '../utils';

export default function SchoolAdminDashboard() {
  const location = useLocation();
  const schoolId = new URLSearchParams(location.search).get('schoolId');
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadSchool();
  }, [schoolId]);

  const loadSchool = async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    try {
      const schools = await base44.entities.School.filter({ id: schoolId });
      if (schools && schools.length > 0) {
        setSchool(schools[0]);
      }
    } catch (error) {
      console.error('Failed to load school:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!school) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">School Not Found</h2>
          <p className="text-slate-600">Unable to load school data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50 flex flex-col">
      {/* Top Bar */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl('Home')}>
              <Button variant="ghost" size="sm" className="gap-2">
                ← Back
              </Button>
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{school.name}</h1>
              <p className="text-sm text-slate-600">{school.city}, {school.country}</p>
            </div>
          </div>
          <a
            href={createPageUrl(`SchoolProfile?id=${schoolId}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-600 hover:bg-teal-50 rounded-lg"
          >
            View Public Profile
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className={`${
            mobileMenuOpen ? 'block' : 'hidden'
          } lg:block w-64 bg-white border-r border-slate-200 overflow-y-auto`}
        >
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value);
              setMobileMenuOpen(false);
            }}
            orientation="vertical"
            className="h-full p-4"
          >
            <TabsList className="flex flex-col items-stretch gap-2 h-auto bg-transparent">
              <TabsTrigger
                value="overview"
                className="justify-start px-4 py-3 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-600"
              >
                <Settings className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="edit"
                className="justify-start px-4 py-3 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-600"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Profile
              </TabsTrigger>
              <TabsTrigger
                value="media"
                className="justify-start px-4 py-3 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-600"
              >
                <Image className="h-4 w-4 mr-2" />
                Photos & Media
              </TabsTrigger>
              <TabsTrigger
                value="admissions"
                className="justify-start px-4 py-3 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-600"
              >
                <FileText className="h-4 w-4 mr-2" />
                Admissions
              </TabsTrigger>
              <TabsTrigger
                value="account"
                className="justify-start px-4 py-3 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-600"
              >
                <User className="h-4 w-4 mr-2" />
                Account
              </TabsTrigger>
            </TabsList>

            {/* Content Area */}
            <div className="hidden" />
          </Tabs>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            {/* Overview Tab */}
            <TabsContent value="overview" className="p-8 space-y-8">
              <div>
                <h2 className="text-xl font-bold mb-6">Profile Completeness</h2>
                <div className="flex flex-wrap gap-6">
                  <ProfileCompletenessRing school={school} />
                </div>
              </div>
            </TabsContent>

            {/* Edit Profile Tab */}
            <TabsContent value="edit" className="p-8">
              <div className="max-w-3xl">
                <h2 className="text-xl font-bold mb-6">Edit School Profile</h2>
                <EditProfileForm
                  school={school}
                  onUpdate={(field, value) => {
                    setSchool({ ...school, [field]: value });
                  }}
                />
              </div>
            </TabsContent>

            {/* Photos & Media Tab */}
            <TabsContent value="media" className="p-8">
              <div className="max-w-3xl">
                <h2 className="text-xl font-bold mb-6">Photos & Media</h2>
                <PhotosMediaSection
                  school={school}
                  onUpdate={(field, value) => {
                    setSchool({ ...school, [field]: value });
                  }}
                />
              </div>
            </TabsContent>

            {/* Admissions Tab */}
            <TabsContent value="admissions" className="p-8">
              <div>
                <h2 className="text-xl font-bold mb-6">Admissions</h2>
                <AdmissionsSection
                  school={school}
                  onUpdate={(field, value) => {
                    setSchool({ ...school, [field]: value });
                  }}
                />
              </div>
            </TabsContent>

            {/* Account Tab */}
            <TabsContent value="account" className="p-8">
              <div>
                <h2 className="text-xl font-bold mb-6">Account</h2>
                <AccountSection school={school} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}