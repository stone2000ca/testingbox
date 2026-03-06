import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { TrendingUp, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const users = await base44.entities.User.list('-created_date');

      let conversations = [];
      try {
        conversations = await base44.entities.ChatHistory.list('-created_date');
      } catch (e) {
        console.error('Failed to load ChatHistory:', e);
      }

      let transactions = [];
      try {
        transactions = await base44.entities.TokenTransaction.list('-created_date', 1000);
      } catch (e) {
        console.error('Failed to load TokenTransaction:', e);
      }

      const weeklyUsers = calculateWeeklyData(users, 'created_date', 6);
      const dailyConversations = calculateDailyData(conversations, 'created_date', 7);

      // Calculate period-over-period token trend (30-day windows)
      const now = new Date();
      const currentStart = new Date(now);
      currentStart.setDate(now.getDate() - 30);
      const previousStart = new Date(currentStart);
      previousStart.setDate(currentStart.getDate() - 30);

      const currentTokens = transactions
        .filter(t => new Date(t.created_date) >= currentStart)
        .reduce((sum, t) => sum + t.tokensDeducted, 0);
      const previousTokens = transactions
        .filter(t => new Date(t.created_date) >= previousStart && new Date(t.created_date) < currentStart)
        .reduce((sum, t) => sum + t.tokensDeducted, 0);

      let tokenTrend = 'Insufficient data';
      if (previousTokens > 0) {
        const pct = ((currentTokens - previousTokens) / previousTokens) * 100;
        tokenTrend = `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% from last period`;
      } else if (currentTokens > 0) {
        tokenTrend = 'New data (no previous period)';
      }

      setAnalytics({
        weeklyUsers,
        dailyConversations,
        tokenUsage: currentTokens,
        tokenTrend,
      });
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateWeeklyData = (data, dateField, weeks) => {
    const result = [];
    const now = new Date();
    
    for (let i = weeks; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      const count = data.filter(item => {
        const date = new Date(item[dateField]);
        return date >= weekStart && date < weekEnd;
      }).length;
      
      result.push({
        label: `Week ${weeks - i}`,
        value: count
      });
    }
    return result;
  };

  const calculateDailyData = (data, dateField, days) => {
    const result = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toDateString();
      
      const count = data.filter(item => 
        new Date(item[dateField]).toDateString() === dateStr
      ).length;
      
      result.push({
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: count
      });
    }
    return result;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const BarChart = ({ data, title, color = 'bg-teal-500' }) => {
    const maxValue = Math.max(...data.map(d => d.value));
    
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="h-64 flex items-end justify-between gap-2">
          {data.map((item, index) => {
            const height = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
            
            return (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs text-slate-600">{item.value}</span>
                <div
                  className={`w-full ${color} rounded-t-lg transition-all hover:opacity-80`}
                  style={{ height: `${height}%`, minHeight: item.value > 0 ? '8px' : '0px' }}
                />
                <span className="text-xs text-slate-500">{item.label}</span>
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Platform Analytics</h2>
        <p className="text-slate-600">Insights and trends</p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <BarChart
          data={analytics.weeklyUsers}
          title="New Users (Weekly)"
          color="bg-teal-500"
        />
        <BarChart
          data={analytics.dailyConversations}
          title="Conversations (Daily)"
          color="bg-purple-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Token Usage</h3>
          <div className="text-4xl font-bold text-teal-600 mb-2">
            {analytics.tokenUsage.toLocaleString()}
          </div>
          <div className="flex items-center gap-2 text-sm text-green-600">
            <TrendingUp className="h-4 w-4" />
            <span>{analytics.tokenTrend}</span>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Revenue by Plan</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Free</span>
              <span className="text-sm font-medium">$0</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Basic ($99/mo)</span>
              <span className="text-sm font-medium">$4,950</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Premium ($249/mo)</span>
              <span className="text-sm font-medium">$19,617</span>
            </div>
            <div className="pt-3 border-t flex justify-between items-center">
              <span className="font-semibold">Total Monthly</span>
              <span className="text-xl font-bold text-teal-600">
                ${analytics.totalRevenue.toLocaleString()}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}