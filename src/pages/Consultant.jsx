import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Heart, FileText, Sparkles, LogIn, Menu, ArrowLeft, Badge } from "lucide-react";
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import TypingIndicator from '@/components/chat/TypingIndicator';
import WelcomeState from '@/components/schools/WelcomeState';
import SchoolGrid from '@/components/schools/SchoolGrid';
import SchoolDetail from '@/components/schools/SchoolDetail';
import ShortlistPanel from '@/components/chat/ShortlistPanel';
import NotesPanel from '@/components/chat/NotesPanel';
import ComparisonView from '@/components/schools/ComparisonView';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Navbar from '@/components/navigation/Navbar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function Consultant() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // View states
  const [currentView, setCurrentView] = useState('welcome');
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  
  // Chat states
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [tokenBalance, setTokenBalance] = useState(100);
  const [isPremium, setIsPremium] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  // Panel states
  const [showShortlistPanel, setShowShortlistPanel] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  
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
        await loadConversations(userData.id);
      } else {
        // For guest users, show welcome message immediately
        const greeting = {
          role: 'assistant',
          content: "Hi! I'm your NextSchool education consultant. I help families across Canada, the US, and Europe find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you in a school?",
          timestamp: new Date().toISOString()
        };
        setMessages([greeting]);
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
      // Add initial AI greeting first
      const greeting = {
        role: 'assistant',
        content: "Hi! I'm your NextSchool education consultant. I help families across Canada, the US, and Europe find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you in a school?",
        timestamp: new Date().toISOString()
      };

      const newConvo = await base44.entities.ChatHistory.create({
        userId: user.id,
        messages: [greeting],
        conversationContext: {},
        isActive: true,
        title: 'New Conversation'
      });
      
      setCurrentConversation(newConvo);
      setMessages([greeting]);
      setCurrentView('welcome');
      setConversations([newConvo, ...conversations]);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const loadConversation = async (convo) => {
    setCurrentConversation(convo);
    const msgs = convo.messages || [];
    // If no messages, add initial greeting
    if (msgs.length === 0) {
      const greeting = {
        role: 'assistant',
        content: "Hi! I'm your NextSchool education consultant. I help families across Canada, the US, and Europe find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you in a school?",
        timestamp: new Date().toISOString()
      };
      setMessages([greeting]);
    } else {
      setMessages(msgs);
    }
    setCurrentView('welcome');
  };

  const handleBackToResults = () => {
    setSelectedSchool(null);
    setCurrentView('schools');
  };

  const handleSendMessage = async (messageText) => {
    // Deduct token first
    if (!isAuthenticated) {
      const guestTokens = parseInt(localStorage.getItem('guestTokenBalance') || '100');
      if (guestTokens <= 0) {
        setShowUpgradeModal(true);
        return;
      }
      const newBalance = guestTokens - 1;
      localStorage.setItem('guestTokenBalance', newBalance.toString());
      setTokenBalance(newBalance);
    } else {
      try {
        const tokenResult = await base44.functions.invoke('processTokenTransaction', {
          action: 'message_sent',
          sessionId: currentConversation?.id || 'guest'
        });

        if (tokenResult.data.needsUpgrade) {
          setShowUpgradeModal(true);
          return;
        }

        // Update token balance in state
        setTokenBalance(tokenResult.data.remainingBalance);
        
        // Also refresh user data to sync
        const userData = await base44.auth.me();
        setUser(userData);
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
    
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsTyping(true);

    try {
      // Call orchestrateConversation with current schools context
      const response = await base44.functions.invoke('orchestrateConversation', {
        message: messageText,
        conversationHistory: messages,
        conversationContext: currentConversation?.conversationContext || {},
        region: user?.profileRegion || 'Canada',
        userId: user?.id,
        currentSchools: schools
      });

      // Only fetch schools if intent is SHOW_SCHOOLS or NARROW_DOWN
      const intent = response.data.intent;
      if ((intent === 'SHOW_SCHOOLS' || intent === 'NARROW_DOWN') && response.data.matchingSchools) {
        const schoolData = await base44.entities.School.filter({
          id: { $in: response.data.matchingSchools }
        });
        setSchools(schoolData);
        setCurrentView('schools');
      }

      // Simulate typing delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      const aiMessage = {
        role: 'assistant',
        content: response.data.message,
        timestamp: new Date().toISOString(),
        metadata: response.data.command
      };

      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);
      setIsTyping(false);

      // Handle comparison view
      if (intent === 'COMPARE_SCHOOLS' && response.data.command?.params?.schoolIds) {
        await handleCompareSchools(response.data.command.params);
      }

      // Update conversation if authenticated
      if (isAuthenticated && currentConversation) {
        await base44.entities.ChatHistory.update(currentConversation.id, {
          messages: finalMessages
        });

        // Generate title after 2 messages
        if (finalMessages.length === 2) {
          base44.functions.invoke('generateConversationTitle', {
            conversationId: currentConversation.id
          }).then(() => loadConversations());
        }

        // Trigger summarization every 8 messages
        if (finalMessages.length % 8 === 0) {
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

  const handleAICommand = async (command) => {
    const { action, params } = command;

    switch (action) {
      case 'search_schools':
        await handleSearchSchools(params);
        break;
      case 'compare':
        await handleCompareSchools(params);
        break;
      case 'view_detail':
        await handleViewSchoolDetail(params);
        break;
      case 'show_shortlist':
        setCurrentView('shortlist');
        break;
      default:
        break;
    }
  };

  const handleSearchSchools = async (params) => {
    try {
      // Build query filters from params
      const filters = {};
      
      if (params.city) {
        filters.city = params.city;
      }
      
      if (params.region) {
        filters.region = params.region;
      }
      
      // Fetch schools from database with filters
      let filteredSchools = await base44.entities.School.filter(filters);
      
      // Apply grade range filter
      if (params.grade) {
        filteredSchools = filteredSchools.filter(school => 
          school.lowestGrade <= params.grade && school.highestGrade >= params.grade
        );
      }
      
      // Apply tuition filter
      if (params.minTuition || params.maxTuition) {
        filteredSchools = filteredSchools.filter(school => {
          if (!school.tuition) return false;
          if (params.minTuition && school.tuition < params.minTuition) return false;
          if (params.maxTuition && school.tuition > params.maxTuition) return false;
          return true;
        });
      }
      
      // Apply specializations filter
      if (params.specializations && params.specializations.length > 0) {
        filteredSchools = filteredSchools.filter(school =>
          school.specializations && 
          params.specializations.some(spec => school.specializations.includes(spec))
        );
      }
      
      // If no exact matches and region was specified, show all in region
      if (filteredSchools.length === 0 && params.region) {
        filteredSchools = await base44.entities.School.filter({ region: params.region });
      }
      
      // If still no results, show all schools
      if (filteredSchools.length === 0) {
        filteredSchools = await base44.entities.School.list();
      }
      
      setSchools(filteredSchools);
      setCurrentView('schools');
    } catch (error) {
      console.error('School search failed:', error);
    }
  };

  const handleViewSchoolDetail = async (schoolId) => {
    try {
      const schoolData = await base44.entities.School.filter({ id: schoolId });
      if (schoolData && schoolData.length > 0) {
        setSelectedSchool(schoolData[0]);
        setCurrentView('detail');
      }
    } catch (error) {
      console.error('Failed to load school:', error);
    }
  };

  const handleCompareSchools = async (params) => {
    try {
      const schoolIds = params.schoolIds || params;
      
      // Fetch schools to compare
      const schoolsToCompare = await base44.entities.School.filter({
        id: { $in: Array.isArray(schoolIds) ? schoolIds : [schoolIds] }
      });
      
      setComparisonData({ schools: schoolsToCompare });
      setCurrentView('comparison');
    } catch (error) {
      console.error('Comparison failed:', error);
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <Navbar variant="minimal" />

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR */}
        <aside className={`
          ${sidebarCollapsed ? 'w-0' : 'w-64'}
          transition-all duration-300 bg-slate-100 border-r flex flex-col overflow-hidden
        `}>
          {!sidebarCollapsed && (
            <>
              <div className="p-4 border-b bg-white">
                <Button 
                  className="w-full bg-teal-600 hover:bg-teal-700" 
                  onClick={createNewConversation}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Conversation
                </Button>
              </div>

              {/* Shortlisted & Notes - Above History */}
              <div className="border-b bg-white p-3 space-y-2">
                <button 
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 text-sm transition-colors"
                  onClick={() => setShowShortlistPanel(true)}
                >
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-teal-600" />
                      <span className="font-medium">Shortlisted</span>
                    </div>
                    <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                      {user?.shortlist?.length || 0}
                    </span>
                  </button>
                </Link>
                <Link to={createPageUrl('ParentDashboard')}>
                  <button className="w-full flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-sm transition-colors">
                    <FileText className="h-4 w-4 text-slate-600" />
                    <span className="font-medium">Notes</span>
                  </button>
                </Link>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">
                  Chat History
                </div>
                {conversations.map((convo) => (
                  <button
                    key={convo.id}
                    onClick={() => loadConversation(convo)}
                    className={`w-full text-left p-3 rounded-lg transition-colors text-sm ${
                      currentConversation?.id === convo.id
                        ? 'bg-teal-50 text-teal-700 border border-teal-200'
                        : 'hover:bg-white border border-transparent'
                    }`}
                  >
                    <div className="font-medium truncate">{convo.title}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {new Date(convo.updated_date).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-6 bg-slate-200 hover:bg-slate-300 flex items-center justify-center transition-colors border-r"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4 text-slate-600" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-slate-600" />
          )}
        </button>

        {/* CENTER CONTENT PANEL */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {currentView === 'welcome' && (
            <WelcomeState onPromptClick={handlePromptClick} />
          )}
          
          {currentView === 'schools' && (
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Recommended Schools</h2>
                <p className="text-slate-600">Found {schools.length} schools matching your criteria</p>
              </div>
              <SchoolGrid
                schools={schools}
                onViewDetails={(id) => handleViewSchoolDetail(id)}
                onToggleShortlist={handleToggleShortlist}
                shortlistedIds={user?.shortlist || []}
              />
            </div>
          )}
          
          {currentView === 'detail' && selectedSchool && (
            <div className="h-full flex flex-col">
              {/* Breadcrumb & Back Button */}
              <div className="bg-white border-b px-6 py-4 flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleBackToResults}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Results
                </Button>
                <div className="text-sm text-slate-500">
                  Results <span className="mx-2">›</span> 
                  <span className="text-slate-900 font-medium">{selectedSchool.name}</span>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                <SchoolDetail
                  school={selectedSchool}
                  onClose={() => setCurrentView('schools')}
                  onToggleShortlist={handleToggleShortlist}
                  isShortlisted={user?.shortlist?.includes(selectedSchool.id) || false}
                />
              </div>
            </div>
          )}
          
          {currentView === 'comparison' && comparisonData && (
            <ComparisonView 
              schools={comparisonData.schools} 
              onBack={() => setCurrentView('schools')} 
            />
          )}
          
          {currentView === 'shortlist' && (
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">My Shortlist</h2>
              <p className="text-slate-600 mb-6">Schools you've saved for further consideration</p>
              {/* Shortlist content here */}
            </div>
          )}
        </main>

        {/* RIGHT CHAT PANEL */}
        <aside className="w-[450px] bg-white border-l flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-100 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-teal-600" />
              </div>
              <span className="font-semibold">AI Consultant</span>
            </div>
            <div className="text-xs px-3 py-1 bg-teal-100 text-teal-700 rounded-full font-medium">
              {isPremium ? '∞' : tokenBalance} tokens
            </div>
          </div>

          {/* Messages */}
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

          {/* Chat Input */}
          <ChatInput
            onSend={handleSendMessage}
            disabled={isTyping}
            tokenBalance={tokenBalance}
            isPremium={isPremium}
          />
        </aside>
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

      {/* Shortlist Panel */}
      {showShortlistPanel && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setShowShortlistPanel(false)}
          />
          <ShortlistPanel
            shortlist={schools.filter(s => user?.shortlist?.includes(s.id))}
            onClose={() => setShowShortlistPanel(false)}
            onRemove={handleToggleShortlist}
            onViewSchool={(id) => {
              handleViewSchoolDetail(id);
              setShowShortlistPanel(false);
            }}
          />
        </>
      )}

      {/* Notes Panel */}
      {showNotesPanel && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setShowNotesPanel(false)}
          />
          <NotesPanel
            userId={user?.id}
            onClose={() => setShowNotesPanel(false)}
          />
        </>
      )}
    </div>
  );
}