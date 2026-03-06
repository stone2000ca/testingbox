import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Pencil, Check, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [currentUser, setCurrentUser] = useState(null);

  // editState: { [userId]: { role, subscriptionPlan, tokenBalance } }
  const [editState, setEditState] = useState({});
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    Promise.all([loadUsers(), loadCurrentUser()]);
  }, []);

  const loadCurrentUser = async () => {
    const me = await base44.auth.me();
    setCurrentUser(me);
  };

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

  const filteredUsers = users.filter(user => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q ||
      (user.email || '').toLowerCase().includes(q) ||
      (user.full_name || '').toLowerCase().includes(q);
    const matchesRole = roleFilter === 'all' || (user.role || 'user') === roleFilter;
    const matchesPlan = planFilter === 'all' || (user.subscriptionPlan || 'free') === planFilter;
    return matchesSearch && matchesRole && matchesPlan;
  });

  const startEdit = (user) => {
    setEditState(prev => ({
      ...prev,
      [user.id]: {
        role: user.role || 'user',
        subscriptionPlan: user.subscriptionPlan || 'free',
        tokenBalance: user.tokenBalance ?? 0,
      }
    }));
  };

  const cancelEdit = (userId) => {
    setEditState(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const handleSave = async (user) => {
    const edits = editState[user.id];
    if (!edits) return;

    const currentRole = user.role || 'user';
    const newRole = edits.role;

    // Tokens validation
    if (Number(edits.tokenBalance) < 0) {
      toast.error("Token balance cannot be negative.");
      return;
    }

    // Self-demotion guard
    if (currentUser && user.id === currentUser.id && currentRole === 'admin' && newRole === 'user') {
      toast.error("You can't demote yourself.");
      return;
    }

    // Last-admin protection
    if (currentRole === 'admin' && newRole === 'user') {
      const adminCount = users.filter(u => (u.role || 'user') === 'admin').length;
      if (adminCount <= 1) {
        toast.error("Cannot demote the only admin. Promote another user first.");
        return;
      }
    }

    setSavingId(user.id);
    await base44.entities.User.update(user.id, {
      role: newRole,
      subscriptionPlan: edits.subscriptionPlan,
      tokenBalance: Number(edits.tokenBalance),
      updated_by: currentUser?.email,
      updated_at: new Date().toISOString(),
    });

    setUsers(prev => prev.map(u =>
      u.id === user.id
        ? { ...u, role: newRole, subscriptionPlan: edits.subscriptionPlan, tokenBalance: Number(edits.tokenBalance) }
        : u
    ));
    cancelEdit(user.id);
    setSavingId(null);
    toast.success('User updated.');
  };

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

        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or email..."
              className="pl-10"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
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
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isEditing = !!editState[user.id];
                const edits = editState[user.id] || {};
                const isSaving = savingId === user.id;

                return (
                  <tr key={user.id} className={`border-b ${isEditing ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                    <td className="p-4">
                      <div className="font-medium text-slate-900">{user.email}</div>
                    </td>
                    <td className="p-4 text-sm text-slate-600">{user.full_name || '-'}</td>

                    {/* Role */}
                    <td className="p-4">
                      {isEditing ? (
                        <Select
                          value={edits.role}
                          onValueChange={(v) => setEditState(prev => ({ ...prev, [user.id]: { ...prev[user.id], role: v } }))}
                        >
                          <SelectTrigger className="w-28 h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">user</SelectItem>
                            <SelectItem value="admin">admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {user.role || 'user'}
                        </Badge>
                      )}
                    </td>

                    {/* Plan / Tier */}
                    <td className="p-4 text-sm text-slate-600">
                      {isEditing ? (
                        <Select
                          value={edits.subscriptionPlan}
                          onValueChange={(v) => setEditState(prev => ({ ...prev, [user.id]: { ...prev[user.id], subscriptionPlan: v } }))}
                        >
                          <SelectTrigger className="w-32 h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">free</SelectItem>
                            <SelectItem value="basic">basic</SelectItem>
                            <SelectItem value="premium">premium</SelectItem>
                            <SelectItem value="pro">pro</SelectItem>
                            <SelectItem value="enterprise">enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        user.subscriptionPlan || 'free'
                      )}
                    </td>

                    {/* Tokens */}
                    <td className="p-4 text-sm text-slate-600">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={0}
                          value={edits.tokenBalance}
                          onChange={(e) => setEditState(prev => ({ ...prev, [user.id]: { ...prev[user.id], tokenBalance: e.target.value } }))}
                          className="w-24 h-8 text-sm"
                        />
                      ) : (
                        user.tokenBalance ?? 0
                      )}
                    </td>

                    <td className="p-4 text-sm text-slate-600">
                      {new Date(user.created_date).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="p-4">
                      <div className="flex items-center gap-1 justify-end">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              disabled={isSaving}
                              onClick={() => handleSave(user)}
                              className="h-7 px-2 bg-teal-600 hover:bg-teal-700 text-white gap-1"
                            >
                              <Check className="h-3.5 w-3.5" />
                              {isSaving ? 'Saving…' : 'Save'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSaving}
                              onClick={() => cancelEdit(user.id)}
                              className="h-7 px-2 gap-1"
                            >
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(user)}
                            className="h-7 px-2 text-slate-500 hover:text-slate-900"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}