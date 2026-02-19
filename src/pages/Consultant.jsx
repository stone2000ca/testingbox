import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Menu, X, Plus, Heart, FileText, Sparkles, LogIn } from "lucide-react";
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import TypingIndicator from '@/components/chat/TypingIndicator';
import WelcomeState from '@/components/schools/WelcomeState';
import SchoolGrid from '@/components/schools/SchoolGrid';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function Consultant() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState('welcome'); // welcome, schools, detail, comparison, shortlist
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [schools, setSchools] = useState([]);
  const [tokenBalance, setTokenBalance] = useState(100);
  const [isPremium, setIsPremium] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  const messagesEndRef = useRef(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const authenticated = await base44.auth.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        const userData = await base44.auth.me();
        setUser(userData);
        setTokenBalance(userData.tokenBalance || 100);
        setIsPremium(userData.subscriptionPlan === 'premium');
        loadConversations(userData.id);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async (userId) => {
    try {
      const convos = await base44.entities.ChatHistory.filter({ userId, isActive: true });
      setConversations(convos.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date)));
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const createNewConversation = async () => {
    if (!isAuthenticated) {
      base44.auth.redirectToLogin(window.location.pathname);
      return;
    }

    try {
      const newConvo = await base44.entities.ChatHistory.create({
        userId: user.id,
        messages: [],
        conversationContext: {},
        isActive: true,
        title: 'New Conversation'
      });
      setCurrentConversation(newConvo);
      setMessages([]);
      setCurrentView('welcome');
      setConversations([newConvo, ...conversations]);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSendMessage = async (messageText) => {
    // Check auth - if not authenticated, create guest session
    if (!isAuthenticated) {
      // For guest users, check token balance from localStorage
      const guestTokens = parseInt(localStorage.getItem('guestTokenBalance') || '100');
      if (guestTokens <= 0) {
        setShowUpgradeModal(true);
        return;
      }
      localStorage.setItem('guestTokenBalance', (guestTokens - 1).toString());
      setTokenBalance(guestTokens - 1);
    } else {
      // Process token transaction for authenticated users
      try {
        const tokenResult = await base44.functions.invoke('processTokenTransaction', {
          action: 'message_sent',
          sessionId: currentConversation?.id || 'guest'
        });

        if (tokenResult.data.needsUpgrade) {
          setShowUpgradeModal(true);
          return;
        }

        setTokenBalance(tokenResult.data.remainingBalance);
        if (tokenResult.data.showUpgradePrompt) {
          // Show subtle upgrade hint
        }
      } catch (error) {
        console.error('Token transaction failed:', error);
      }
    }

    // Add user message
    const userMessage = {
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    };
    
    setMessages([...messages, userMessage]);
    setIsTyping(true);

    try {
      // Call orchestrateConversation
      const response = await base44.functions.invoke('orchestrateConversation', {
        message: messageText,
        conversationId: currentConversation?.id,
        region: user?.profileRegion || 'Canada'
      });

      // Simulate typing delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      const aiMessage = {
        role: 'assistant',
        content: response.data.message,
        timestamp: new Date().toISOString(),
        metadata: response.data.command
      };

      const updatedMessages = [...messages, userMessage, aiMessage];
      setMessages(updatedMessages);
      setIsTyping(false);

      // Handle commands
      if (response.data.command?.action === 'search_schools') {
        await handleSearchSchools(response.data.command.params);
      }

      // Update conversation if authenticated
      if (isAuthenticated && currentConversation) {
        await base44.entities.ChatHistory.update(currentConversation.id, {
          messages: updatedMessages
        });

        // Trigger summarization every 8 messages
        if (updatedMessages.length % 8 === 0) {
          base44.functions.invoke('summarizeConversation', {
            conversationId: currentConversation.id
          });
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsTyping(false);
    }
  };

  const handleSearchSchools = async (params) => {
    try {
      const result = await base44.functions.invoke('searchSchools', {
        ...params,
        userLat: user?.profileLat,
        userLng: user?.profileLng
      });
      
      setSchools(result.data.schools || []);
      setCurrentView('schools');
    } catch (error) {
      console.error('School search failed:', error);
    }
  };

  const handleToggleShortlist = async (schoolId) => {
    if (!isAuthenticated) {
      base44.auth.redirectToLogin(window.location.pathname);
      return;
    }

    try {
      const currentShortlist = user.shortlist || [];
      const newShortlist = currentShortlist.includes(schoolId)
        ? currentShortlist.filter(id => id !== schoolId)
        : [...currentShortlist, schoolId];

      await base44.auth.updateMe({ shortlist: newShortlist });
      setUser({ ...user, shortlist: newShortlist });
    } catch (error) {
      console.error('Failed to update shortlist:', error);
    }
  };

  const handlePromptClick = (prompt) => {
    handleSendMessage(prompt);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Link to={createPageUrl('Home')} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg hidden sm:inline">NextSchool</span>
          </Link>
        </div>
        
        {!isAuthenticated ? (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
          >
            <LogIn className="h-4 w-4 mr-2" />
            Sign In
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden sm:inline">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={() => base44.auth.logout()}>
              Logout
            </Button>
          </div>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 fixed md:static inset-y-0 left-0 z-40
          w-64 bg-white border-r flex flex-col transition-transform
        `}>
          <div className="p-4 border-b">
            <Button 
              className="w-full bg-teal-600 hover:bg-teal-700" 
              onClick={createNewConversation}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Chat
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {conversations.map((convo) => (
              <button
                key={convo.id}
                onClick={() => {
                  setCurrentConversation(convo);
                  setMessages(convo.messages || []);
                  setSidebarOpen(false);
                }}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  currentConversation?.id === convo.id
                    ? 'bg-teal-50 text-teal-700'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div className="font-medium text-sm truncate">{convo.title}</div>
                <div className="text-xs text-slate-500 truncate">
                  {convo.messages?.length || 0} messages
                </div>
              </button>
            ))}
          </div>

          <div className="p-4 border-t space-y-2">
            <Button variant="outline" className="w-full justify-start" size="sm">
              <Heart className="h-4 w-4 mr-2" />
              Shortlist ({user?.shortlist?.length || 0})
            </Button>
            <Button variant="outline" className="w-full justify-start" size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Notes
            </Button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex">
          {/* Content Panel */}
          <div className="flex-1 overflow-y-auto bg-slate-50">
            {currentView === 'welcome' && (
              <WelcomeState onPromptClick={handlePromptClick} />
            )}
            {currentView === 'schools' && (
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-6">Recommended Schools</h2>
                <SchoolGrid
                  schools={schools}
                  onViewDetails={(id) => console.log('View', id)}
                  onToggleShortlist={handleToggleShortlist}
                  shortlistedIds={user?.shortlist || []}
                />
              </div>
            )}
          </div>

          {/* Chat Panel */}
          <div className="w-full md:w-[450px] bg-white border-l flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, index) => (
                <MessageBubble
                  key={index}
                  message={msg}
                  isUser={msg.role === 'user'}
                />
              ))}
              {isTyping && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>

            <ChatInput
              onSend={handleSendMessage}
              disabled={isTyping}
              tokenBalance={tokenBalance}
              isPremium={isPremium}
            />
          </div>
        </main>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-2xl font-bold mb-2">Out of Tokens</h3>
            <p className="text-slate-600 mb-6">
              {isAuthenticated 
                ? "Upgrade to Premium for unlimited conversations and advanced features."
                : "Sign in to continue your search or upgrade to Premium for unlimited access."
              }
            </p>
            <div className="space-y-3">
              {!isAuthenticated && (
                <Button 
                  className="w-full bg-teal-600 hover:bg-teal-700"
                  onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
                >
                  Sign In
                </Button>
              )}
              <Link to={createPageUrl('Pricing')}>
                <Button className="w-full bg-amber-600 hover:bg-amber-700">
                  Upgrade to Premium
                </Button>
              </Link>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setShowUpgradeModal(false)}
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}