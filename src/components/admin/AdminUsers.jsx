import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await base44.entities.User.list('-created_date');
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Users Management</h2>
        
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search users by email..."
              className="pl-10"
            />
          </div>
        </div>

        <div className="text-sm text-slate-600">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-4 font-semibold text-sm">Email</th>
                <th className="text-left p-4 font-semibold text-sm">Full Name</th>
                <th className="text-left p-4 font-semibold text-sm">Role</th>
                <th className="text-left p-4 font-semibold text-sm">Plan</th>
                <th className="text-left p-4 font-semibold text-sm">Tokens</th>
                <th className="text-left p-4 font-semibold text-sm">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b hover:bg-slate-50">
                  <td className="p-4">
                    <div className="font-medium text-slate-900">{user.email}</div>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{user.full_name || '-'}</td>
                  <td className="p-4">
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role || 'user'}
                    </Badge>
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    {user.subscriptionPlan || 'free'}
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    {user.tokenBalance || 0}
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    {new Date(user.created_date).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}