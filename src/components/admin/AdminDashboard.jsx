import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Building2, Users, MessageSquare, ClipboardCheck, DollarSign, TrendingUp } from 'lucide-react';

export default function AdminDashboard({ onViewChange }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [schools, users] = await Promise.all([
        base44.entities.School.list(),
        base44.entities.User.list(),
      ]);

      // Filter out archived schools
      const activeSchools = schools.filter(s => s.status !== 'archived');

      // Conversations — graceful fallback if entity fails
      let activeToday = 0;
      try {
        const conversations = await base44.entities.ChatHistory.list();
        const today = new Date().toDateString();
        activeToday = conversations.filter(c =>
          new Date(c.updated_date).toDateString() === today
        ).length;
      } catch (e) {
        console.warn('ChatHistory unavailable:', e);
      }

      // Pending claims — use SchoolClaim entity, fallback to 0
      let pendingClaims = 0;
      try {
        const claims = await base44.entities.SchoolClaim.filter({ status: 'pending' });
        pendingClaims = claims.length;
      } catch (e) {
        console.warn('SchoolClaim unavailable:', e);
      }

      // Revenue — based on User.subscriptionPlan
      const tierRevenue = { free: 0, basic: 99, premium: 249, pro: 499, enterprise: 999 };
      const revenue = users.reduce((sum, user) => {
        return sum + (tierRevenue[user.subscriptionPlan] || 0);
      }, 0);

      setStats({
        totalSchools: activeSchools.length,
        totalUsers: users.length,
        activeConversationsToday: activeToday,
        pendingClaims,
        monthlyRevenue: revenue
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Schools',
      value: stats.totalSchools,
      icon: Building2,
      color: 'text-teal-600',
      bgColor: 'bg-teal-100'
    },
    {
      label: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      label: 'Active Conversations Today',
      value: stats.activeConversationsToday,
      icon: MessageSquare,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      label: 'Pending Claims',
      value: stats.pendingClaims,
      icon: ClipboardCheck,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100'
    },
    {
      label: 'Monthly Revenue',
      value: `$${stats.monthlyRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Platform Overview</h2>
        <p className="text-slate-600">Real-time statistics and metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-slate-600">{stat.label}</span>
                <div className={`h-10 w-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900">{stat.value}</div>
            </Card>
          );
        })}
      </div>

      <Card className="p-6 mt-6">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-3 gap-4">
          <button onClick={() => onViewChange?.('schools')} className="p-4 border-2 border-slate-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors text-left">
            <Building2 className="h-5 w-5 text-teal-600 mb-2" />
            <div className="font-medium text-slate-900">Add New School</div>
            <div className="text-xs text-slate-600">Manually add a school</div>
          </button>
          <button onClick={() => onViewChange?.('users')} className="p-4 border-2 border-slate-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors text-left">
            <Users className="h-5 w-5 text-teal-600 mb-2" />
            <div className="font-medium text-slate-900">Invite Admin</div>
            <div className="text-xs text-slate-600">Send school admin invite</div>
          </button>
          <button onClick={() => onViewChange?.('analytics')} className="p-4 border-2 border-slate-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors text-left">
            <TrendingUp className="h-5 w-5 text-teal-600 mb-2" />
            <div className="font-medium text-slate-900">Export Report</div>
            <div className="text-xs text-slate-600">Download analytics</div>
          </button>
        </div>
      </Card>
    </div>
  );
}