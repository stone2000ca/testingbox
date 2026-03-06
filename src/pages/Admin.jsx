import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Shield, LayoutDashboard, Building2, Users, ClipboardCheck, BarChart3, PlusSquare, ShieldAlert } from 'lucide-react';
import AdminDashboard from '@/components/admin/AdminDashboard';
import AdminSchools from '@/components/admin/AdminSchools';
import AdminUsers from '@/components/admin/AdminUsers';
import AdminClaims from '@/components/admin/AdminClaims';
import AdminAnalytics from '@/components/admin/AdminAnalytics';
import AdminSubmissions from '@/components/admin/AdminSubmissions';
import AdminDisputes from '@/components/admin/AdminDisputes';

export default function Admin() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      const userData = await base44.auth.me();
      const users = await base44.entities.User.filter({ email: userData.email });
      const userRecord = users?.[0];

      if (!userRecord || userRecord.role !== 'admin') {
        window.location.href = '/';
        return;
      }

      setUser({ ...userData, ...userRecord });
    } catch (error) {
      window.location.href = '/';
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'schools', label: 'Schools', icon: Building2 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'claims', label: 'Claims', icon: ClipboardCheck },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'submissions', label: 'Submissions', icon: PlusSquare },
    { id: 'disputes', label: 'Disputes', icon: ShieldAlert }
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Top Bar */}
      <header className="bg-gradient-to-r from-teal-600 to-teal-700 text-white px-6 py-4 flex items-center justify-between flex-shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">NextSchool Admin</h1>
            <p className="text-xs text-teal-100">Platform Management Console</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">{user?.email}</span>
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
            <span className="text-sm font-semibold">{user?.email?.charAt(0).toUpperCase()}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r flex flex-col shadow-sm">
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
                    ${isActive 
                      ? 'bg-teal-50 text-teal-700 border border-teal-200' 
                      : 'text-slate-700 hover:bg-slate-50'
                    }
                  `}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {currentView === 'dashboard' && <AdminDashboard />}
          {currentView === 'schools' && <AdminSchools />}
          {currentView === 'users' && <AdminUsers />}
          {currentView === 'claims' && <AdminClaims />}
          {currentView === 'analytics' && <AdminAnalytics />}
          {currentView === 'submissions' && <AdminSubmissions />}
          {currentView === 'disputes' && <AdminDisputes />}
        </main>
      </div>
    </div>
  );
}