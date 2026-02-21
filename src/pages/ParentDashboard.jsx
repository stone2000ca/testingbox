import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Heart, FileText, MessageSquare, Settings, Sparkles, Coins, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import SchoolCard from '@/components/schools/SchoolCard';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from 'sonner';

export default function ParentDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shortlistedSchools, setShortlistedSchools] = useState([]);
  const [notes, setNotes] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [tokenHistory, setTokenHistory] = useState([]);
  const [clearMemoryDialogOpen, setClearMemoryDialogOpen] = useState(false);
  const [clearingMemory, setClearingMemory] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);

      // Load shortlisted schools
      if (userData.shortlist && userData.shortlist.length > 0) {
        const schools = await Promise.all(
          userData.shortlist.map(id => 
            base44.entities.School.filter({ id }).then(arr => arr[0])
          )
        );
        setShortlistedSchools(schools.filter(Boolean));
      }

      // Load notes
      const userNotes = await base44.entities.Notes.filter({ userId: userData.id });
      setNotes(userNotes);

      // Load conversations
      const convos = await base44.entities.ChatHistory.filter({ userId: userData.id });
      setConversations(convos.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date)));

      // Load token history
      const history = await base44.entities.TokenTransaction.filter({ userId: userData.id });
      setTokenHistory(history.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 20));
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromShortlist = async (schoolId) => {
    try {
      const newShortlist = user.shortlist.filter(id => id !== schoolId);
      await base44.auth.updateMe({ shortlist: newShortlist });
      setUser({ ...user, shortlist: newShortlist });
      setShortlistedSchools(shortlistedSchools.filter(s => s.id !== schoolId));
    } catch (error) {
      console.error('Failed to update shortlist:', error);
    }
  };

  const handleClearMemory = async () => {
    setClearingMemory(true);
    try {
      // Delete UserMemory
      const memories = await base44.entities.UserMemory.filter({ userId: user.id });
      if (memories.length > 0) {
        await base44.entities.UserMemory.delete(memories[0].id);
      }

      // Delete FamilyProfile
      const profiles = await base44.entities.FamilyProfile.filter({ userId: user.id });
      if (profiles.length > 0) {
        await base44.entities.FamilyProfile.delete(profiles[0].id);
      }

      toast.success('AI Memory and Family Profile cleared. Fresh start ready!');
      setClearMemoryDialogOpen(false);
    } catch (error) {
      console.error('Failed to clear memory:', error);
      toast.error('Failed to clear memory: ' + error.message);
    } finally {
      setClearingMemory(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link to={createPageUrl('Home')} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">NextSchool</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to={createPageUrl('Consultant')}>
              <Button variant="outline">Back to Search</Button>
            </Link>
            <Button variant="ghost" onClick={() => base44.auth.logout()}>Logout</Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Header */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.full_name?.split(' ')[0] || 'Parent'}</h1>
              <p className="text-slate-600">{user?.email}</p>
            </div>
            <Button variant="outline" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-teal-100 rounded-lg flex items-center justify-center">
                  <Heart className="h-6 w-6 text-teal-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{shortlistedSchools.length}</div>
                  <div className="text-sm text-slate-600">Shortlisted Schools</div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Coins className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {user?.subscriptionPlan === 'premium' ? '∞' : (user?.tokenBalance || 0)}
                  </div>
                  <div className="text-sm text-slate-600">
                    {user?.subscriptionPlan === 'premium' ? 'Premium Account' : 'Tokens Remaining'}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{conversations.length}</div>
                  <div className="text-sm text-slate-600">Conversations</div>
                </div>
              </div>
            </Card>
          </div>
        </div>



        {/* Tabs */}
        <Tabs defaultValue="shortlist" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="shortlist">Shortlist</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="tokens">Token Usage</TabsTrigger>
          </TabsList>

          <TabsContent value="shortlist" className="mt-6">
            {shortlistedSchools.length === 0 ? (
              <Card className="p-12 text-center">
                <Heart className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">No Schools Shortlisted Yet</h3>
                <p className="text-slate-600 mb-6">Start searching to find schools you love</p>
                <Link to={createPageUrl('Consultant')}>
                  <Button className="bg-teal-600 hover:bg-teal-700">
                    Start Searching
                  </Button>
                </Link>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {shortlistedSchools.map((school) => (
                  <SchoolCard
                    key={school.id}
                    school={school}
                    onViewDetails={() => window.location.href = createPageUrl('SchoolProfile') + '?id=' + school.id}
                    onToggleShortlist={handleRemoveFromShortlist}
                    isShortlisted={true}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes" className="mt-6">
            {notes.length === 0 ? (
              <Card className="p-12 text-center">
                <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">No Notes Yet</h3>
                <p className="text-slate-600">Take notes while exploring schools</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {notes.map((note) => (
                  <Card key={note.id} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-sm text-slate-500">
                        {new Date(note.created_date).toLocaleDateString()}
                      </div>
                      {note.tags && note.tags.length > 0 && (
                        <div className="flex gap-1">
                          {note.tags.map((tag, idx) => (
                            <span key={idx} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-slate-700">{note.content}</p>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="conversations" className="mt-6">
            <div className="space-y-3">
              {conversations.map((convo) => (
                <Card key={convo.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <Link to={createPageUrl('Consultant')}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">{convo.title}</h3>
                        <p className="text-sm text-slate-600 line-clamp-2">{convo.summary || 'School search conversation'}</p>
                        <div className="flex gap-4 mt-2 text-xs text-slate-500">
                          <span>{convo.messages?.length || 0} messages</span>
                          <span>{new Date(convo.updated_date).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <MessageSquare className="h-5 w-5 text-slate-400" />
                    </div>
                  </Link>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tokens" className="mt-6">
            {user?.subscriptionPlan === 'premium' ? (
              <Card className="p-12 text-center">
                <Coins className="h-16 w-16 text-amber-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Premium Account</h3>
                <p className="text-slate-600">You have unlimited tokens!</p>
              </Card>
            ) : (
              <div className="space-y-4">
                <Card className="p-6 bg-gradient-to-br from-teal-50 to-teal-100">
                  <h3 className="font-bold text-lg mb-2">Current Balance</h3>
                  <div className="text-4xl font-bold text-teal-700 mb-4">{user?.tokenBalance || 0} tokens</div>
                  {(user?.tokenBalance || 0) <= 20 && (
                    <Link to={createPageUrl('Pricing')}>
                      <Button className="bg-teal-600 hover:bg-teal-700">
                        Upgrade to Premium
                      </Button>
                    </Link>
                  )}
                </Card>

                <div className="space-y-2">
                  <h3 className="font-semibold mb-3">Recent Activity</h3>
                  {tokenHistory.map((transaction) => (
                    <Card key={transaction.id} className="p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium capitalize">
                            {transaction.action.replace(/_/g, ' ')}
                          </div>
                          <div className="text-xs text-slate-500">
                            {new Date(transaction.created_date).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-red-600 font-semibold">
                            -{transaction.tokensDeducted}
                          </div>
                          <div className="text-xs text-slate-500">
                            Balance: {transaction.remainingBalance}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}