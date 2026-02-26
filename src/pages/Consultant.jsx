import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { STATES, BRIEF_STATUS } from './stateMachineConfig';
import { useBriefConfirmHandler } from '@/components/chat/BriefConfirmHandler';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Heart, FileText, Sparkles, LogIn, Menu, ArrowLeft, Badge, Trash2, MapPin, Star } from "lucide-react";
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import TypingIndicator from '@/components/chat/TypingIndicator';
import WelcomeState from '@/components/schools/WelcomeState';
import ConsultantSelection from '@/components/chat/ConsultantSelection';
import SchoolGrid from '@/components/schools/SchoolGrid';
import SchoolDetail from '@/components/schools/SchoolDetail';
import SchoolDetailPanel from '@/components/schools/SchoolDetailPanel';
import ShortlistPanel from '@/components/chat/ShortlistPanel';
import NotesPanel from '@/components/chat/NotesPanel';
import ComparisonView from '@/components/schools/ComparisonView';
import ComparisonTable from '@/components/schools/ComparisonTable';
import SortControl from '@/components/schools/SortControl';
import LoginGateModal from '@/components/dialogs/LoginGateModal';
import FamilyBriefPanel from '@/components/chat/FamilyBriefPanel';
import ProgressBar from '@/components/ui/progress-bar';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Navbar from '@/components/navigation/Navbar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function Consultant() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [selectedConsultant, setSelectedConsultant] = useState(null);
  const [showResponseChips, setShowResponseChips] = useState(false);
  const [sessionId] = useState(Math.random().toString(36).substring(2, 11));
  const [feedbackPromptShown, setFeedbackPromptShown] = useState(false);
  
  // View states
  const [currentView, setCurrentView] = useState('welcome');
  const [schools, setSchools] = useState([]);
  const [previousSearchResults, setPreviousSearchResults] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [onboardingPhase, setOnboardingPhase] = useState(null);
  const [briefStatus, setBriefStatus] = useState(null);
  
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
  const [shortlistData, setShortlistData] = useState([]);
  
  // Distance feature
  const [showDistances, setShowDistances] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  
  // Sorting
  const [sortField, setSortField] = useState('relevance');
  const [sortDirection, setSortDirection] = useState('asc');
  
  // Delete conversation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState(null);
  
  // Mobile toggle
  const [mobileView, setMobileView] = useState('chat');
  
  // Scroll position preservation
  const chatScrollRef = useRef(null);
  const [savedScrollPosition, setSavedScrollPosition] = useState(0);
  
  // New message indicator
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  
  // Limit reached dialog
  const [limitReachedOpen, setLimitReachedOpen] = useState(false);
  
  // Login gate
  const [showLoginGate, setShowLoginGate] = useState(false);
  
  // Family Brief panel
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [lastTypingTime, setLastTypingTime] = useState(Date.now());
  const [familyProfile, setFamilyProfile] = useState(null);
  
  // Progressive loading states
  const [loadingStage, setLoadingStage] = useState(0);
  const loadingStages = [
    "Analyzing request...",
    "Searching schools...",
    "Preparing recommendations..."
  ];
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  // Determine UI phase based on state and schools
  const currentState = currentConversation?.conversationContext?.state || STATES.WELCOME;
  
  // FIX 17: Sync briefStatus from conversationContext whenever it changes
  useEffect(() => {
    const contextBriefStatus = currentConversation?.conversationContext?.briefStatus;
    if (contextBriefStatus !== briefStatus) {
      console.log('[FIX 17] Syncing briefStatus:', contextBriefStatus);
      setBriefStatus(contextBriefStatus);
    }
  }, [currentConversation?.conversationContext?.briefStatus]);
  
  // BUG-DD-001 FIX: selectedSchool is the SINGLE SOURCE OF TRUTH for detail view
  useEffect(() => {
    // CRITICAL: If a school is selected, ALWAYS maintain detail view - no exceptions
    if (selectedSchool) {
      if (currentView !== 'detail') {
        console.log('[DETAIL VIEW] Setting view to detail for:', selectedSchool.name);
        setCurrentView('detail');
      }
      return;
    }
    
    // Only sync view from state if NO school is selected
    const conversationState = currentConversation?.conversationContext?.state || STATES.WELCOME;
    if ([STATES.WELCOME, STATES.DISCOVERY, STATES.BRIEF].includes(conversationState)) {
      setCurrentView('chat');
    } else if (conversationState === STATES.RESULTS) {
      setCurrentView('schools');
    }
  }, [currentConversation?.conversationContext?.state, selectedSchool, currentView]);
  
  const isIntakePhase = schools.length === 0 && 
                        currentView !== 'schools' && 
                        currentView !== 'detail' && 
                        currentView !== 'comparison' && 
                        currentView !== 'comparison-table' &&
                        ![STATES.RESULTS, STATES.DEEP_DIVE].includes(currentState);

  // TASK B: Save/restore scroll position during transition
  useEffect(() => {
    if (!isIntakePhase && chatScrollRef.current) {
      // Entering results phase - restore scroll
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = savedScrollPosition;
        }
      }, 450); // After transition completes
    }
  }, [isIntakePhase]);

  const saveScrollPosition = () => {
    if (chatScrollRef.current) {
      setSavedScrollPosition(chatScrollRef.current.scrollTop);
    }
  };

  // Dev mode bypass for login gate
  const isDevMode = new URLSearchParams(window.location.search).get('dev') === 'true';

  useEffect(() => {
    // Set meta tags for SEO
    document.title = 'Meet Your Education Consultant | NextSchool';
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = 'Chat with Jackie or Liam, your AI education consultants. Get personalized private school recommendations in minutes.';

    // Structured data for Service
    const schemaData = {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'School Search Consulting',
      description: 'AI-powered personalized private school recommendations',
      provider: {
        '@type': 'Organization',
        name: 'NextSchool',
        url: 'https://nextschool.ca'
      },
      areaServed: ['CA', 'US', 'EU'],
      serviceType: 'Educational Consulting'
    };

    let schemaScript = document.querySelector('script[data-schema="consultant"]');
    if (!schemaScript) {
      schemaScript = document.createElement('script');
      schemaScript.type = 'application/ld+json';
      schemaScript.setAttribute('data-schema', 'consultant');
      document.head.appendChild(schemaScript);
    }
    schemaScript.innerHTML = JSON.stringify(schemaData);

    checkAuth();
    loadUserLocation();
    restoreGuestSession();

    // Track session start
    base44.functions.invoke('trackSessionEvent', {
      eventType: 'session_start',
      sessionId
    }).catch(err => console.error('Failed to track session:', err));
  }, [sessionId]);

  // Load family profile for Brief panel
  useEffect(() => {
    if (user?.id && currentConversation?.id) {
      loadFamilyProfile();
    }
  }, [user?.id, currentConversation?.id, messages]);



  const loadFamilyProfile = async () => {
    if (!user?.id || !currentConversation?.id) return;
    
    try {
      const profiles = await base44.entities.FamilyProfile.filter({
        userId: user.id,
        conversationId: currentConversation.id
      });
      
      if (profiles.length > 0) {
        setFamilyProfile(profiles[0]);
      }
    } catch (error) {
      console.error('Failed to load family profile:', error);
    }
  };

  // Restore guest session data after login
  const restoreGuestSession = () => {
    if (isAuthenticated && user) {
      const guestData = localStorage.getItem('guestConversationData');
      if (guestData) {
        try {
          const { messages: guestMessages, consultant, conversationContext } = JSON.parse(guestData);
          // Restore the conversation
          if (guestMessages && guestMessages.length > 0) {
            setMessages(guestMessages);
            setSelectedConsultant(consultant);
            if (conversationContext) {
              setCurrentConversation({ 
                ...currentConversation, 
                conversationContext 
              });
            }
          }
          // Clear guest data
          localStorage.removeItem('guestConversationData');
        } catch (e) {
          console.error('Failed to restore guest session:', e);
        }
      }
    }
  };

  const loadUserLocation = async () => {
    // Check localStorage first
    const savedLocation = localStorage.getItem('userLocation');
    if (savedLocation) {
      setUserLocation(JSON.parse(savedLocation));
      return;
    }

    // Default to Toronto if geolocation unavailable or fails
    const defaultLocation = {
      lat: 43.6532,
      lng: -79.3832,
      address: 'Toronto, Ontario'
    };

    // Try browser geolocation
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // Reverse geocode to get address
          try {
            const apiKey = Deno?.env?.get('GOOGLE_MAPS_API_KEY') || 'AIzaSyCJNHWSvBWXVfYXYxlz4Kg4NzQ9gCfMzIw';
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`
            );
            const data = await response.json();
            
            const location = {
              lat: latitude,
              lng: longitude,
              address: data.results[0]?.formatted_address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
            };
            
            setUserLocation(location);
            localStorage.setItem('userLocation', JSON.stringify(location));
          } catch (error) {
            console.error('Geocoding failed:', error);
            const location = { lat: latitude, lng: longitude, address: null };
            setUserLocation(location);
            localStorage.setItem('userLocation', JSON.stringify(location));
          }
        },
        (error) => {
          console.log('Geolocation denied or failed:', error);
          // Fall back to Toronto
          setUserLocation(defaultLocation);
          localStorage.setItem('userLocation', JSON.stringify(defaultLocation));
        }
      );
    } else {
      // Fall back to Toronto if geolocation not available
      setUserLocation(defaultLocation);
      localStorage.setItem('userLocation', JSON.stringify(defaultLocation));
    }
  };

  // Progress through loading stages
  useEffect(() => {
    if (isTyping) {
      setLoadingStage(0);
      const timer1 = setTimeout(() => setLoadingStage(1), 2000);
      const timer2 = setTimeout(() => setLoadingStage(2), 4000);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isTyping]);

  // Auto-focus input after AI response
  useEffect(() => {
    if (!isTyping && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isTyping]);

  const getPlanLimits = (plan) => {
    const limits = {
      free: { total: 100, dailyReplenishment: 3 },
      pro: { total: 1000, dailyReplenishment: 33 },
      enterprise: { total: 5000, dailyReplenishment: 166 }
    };
    return limits[plan] || limits.free;
  };

  const getConversationLimits = (plan) => {
    const limits = {
      free: 1,
      pro: 10,
      enterprise: 50
    };
    return limits[plan] || limits.free;
  };

  const checkAuth = async () => {
    try {
      const authenticated = await base44.auth.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        const userData = await base44.auth.me();
        setUser(userData);
        
        // Check daily token replenishment
        const plan = userData.subscriptionPlan || 'free';
        const limits = getPlanLimits(plan);
        const today = new Date().toISOString().split('T')[0];
        const renewalDate = userData.renewalDate ? userData.renewalDate.split('T')[0] : null;
        
        let newBalance = userData.tokenBalance !== undefined ? userData.tokenBalance : limits.total;
        let needsUpdate = false;
        
        // Replenish tokens if it's a new day
        if (!renewalDate || today > renewalDate) {
          newBalance = Math.min(newBalance + limits.dailyReplenishment, limits.total);
          needsUpdate = true;
          
          // Update user with new balance and renewal date
          await base44.auth.updateMe({
            tokenBalance: newBalance,
            renewalDate: new Date().toISOString()
          });
        }
        
        setTokenBalance(newBalance);
        setIsPremium(plan === 'pro' || plan === 'enterprise');
        await loadConversations(userData.id);
        await loadShortlist(userData.id);
      } else {
        // For guest users, check localStorage for balance
        const guestBalance = parseInt(localStorage.getItem('guestTokenBalance') || '100');
        setTokenBalance(guestBalance);
        
        // Show welcome message
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
      // Sort: starred first (by date), then unstarred (by date)
      const sorted = convos.sort((a, b) => {
        if (a.starred && !b.starred) return -1;
        if (!a.starred && b.starred) return 1;
        return new Date(b.updated_date) - new Date(a.updated_date);
      });
      setConversations(sorted);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadShortlist = async (userId) => {
    try {
      const shortlistIds = user?.shortlist || [];
      if (shortlistIds.length > 0) {
        const shortlistSchools = await base44.entities.School.filter({
          id: { $in: shortlistIds }
        });
        setShortlistData(shortlistSchools);
      } else {
        setShortlistData([]);
      }
    } catch (error) {
      console.error('Failed to load shortlist:', error);
      setShortlistData([]);
    }
  };

  const createNewConversation = async () => {
    // If not authenticated, return to consultant selection
    if (!isAuthenticated) {
      setSelectedConsultant(null);
      return;
    }

    // Check conversation limit
    const activeCount = conversations.filter(c => c.isActive).length;
    const plan = user?.subscriptionPlan || 'free';
    const limit = getConversationLimits(plan);

    if (activeCount >= limit) {
      setLimitReachedOpen(true);
      return;
    }

    try {
      const newConvo = {
        userId: user?.id,
        title: 'New Conversation',
        messages: [],
        conversationContext: { consultant: selectedConsultant },
        isActive: true
      };
      
      const created = await base44.entities.ChatHistory.create(newConvo);
      
      // Load conversations to update sidebar
      await loadConversations(user.id);
      
      // Set as current conversation
      selectConversation(created);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSelectConsultant = (consultantName) => {
    setSelectedConsultant(consultantName);
    // Track consultant selection
    base44.functions.invoke('trackSessionEvent', {
      eventType: 'consultant_selected',
      consultantName,
      sessionId
    }).catch(err => console.error('Failed to track:', err));

    // CRITICAL: Complete state reset for fresh conversation
    setCurrentConversation({ conversationContext: {} });
    setSchools([]);
    setBriefStatus(null);
    setOnboardingPhase(null);
    setCurrentView('chat');
    
    // Initialize first message with consultant's greeting
    const greeting = {
      role: 'assistant',
      content: consultantName === 'Jackie'
        ? "Hi, I'm Jackie! I help families find the right private school for their child. I'll ask a few questions about your family, and then I'll show you schools that actually fit — not just a generic list. What's bringing you here today?"
        : "Hi, I'm Liam. I help families find the right private school by matching what matters most to you with real school data. I'll ask a few focused questions, then show you your strongest options. What's bringing you here today?",
      timestamp: new Date().toISOString()
    };
    setMessages([greeting]);
    setShowResponseChips(true);
  };

  const selectConversation = (convo) => {
    setCurrentConversation(convo);
    
    // FIX #3: Set briefStatus from conversation context
    const contextBriefStatus = convo.conversationContext?.briefStatus;
    if (contextBriefStatus) {
      setBriefStatus(contextBriefStatus);
    } else {
      setBriefStatus(null);
    }
    
    // Then set messages from this conversation
    const msgs = convo.messages || [];
    if (msgs.length === 0) {
      const greeting = {
        role: 'assistant',
        content: "Hi! I'm your NextSchool education consultant. I help families across Canada, the US, and Europe find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you in a school?",
        timestamp: new Date().toISOString()
      };
      setMessages([greeting]);
      // Clear conversation context for new conversations to prevent memory leaks
      setCurrentConversation({ ...convo, conversationContext: {} });
    } else {
      setMessages(msgs);
    }
    
    // BUG-DD-001: Map state to view with DEEP_DIVE guard
    const conversationState = convo.conversationContext?.state || STATES.WELCOME;
    const isDeepDiveWithSchool = conversationState === STATES.DEEP_DIVE && selectedSchool !== null;
    
    if (!isDeepDiveWithSchool) {
      if ([STATES.WELCOME, STATES.DISCOVERY, STATES.BRIEF].includes(conversationState)) {
        setCurrentView('chat');
      } else if (conversationState === STATES.RESULTS) {
        setCurrentView('schools');
      } else if (conversationState === STATES.DEEP_DIVE) {
        setCurrentView('detail');
      } else {
        setCurrentView('chat');
      }
    }
    setSchools(convo.conversationContext?.schools || []);
    // BUG-DD-001 FIX: Only clear selectedSchool if NOT in DEEP_DIVE state
    if (convo.conversationContext?.state !== STATES.DEEP_DIVE) {
      setSelectedSchool(null);
    }
  };

  const handleBackToResults = () => {
    setSelectedSchool(null);
    setCurrentView('schools');
  };

  const handleComparisonBack = () => {
    if (previousSearchResults.length > 0) {
      setSchools(previousSearchResults);
    }
    setComparisonData(null);
    if (!selectedSchool) {
      setCurrentView('schools');
    }
  };

  const handleSendMessage = async (messageText, explicitSchoolId = null) => {
    // Track message sent
    base44.functions.invoke('trackSessionEvent', {
      eventType: 'message_sent',
      consultantName: selectedConsultant,
      sessionId
    }).catch(err => console.error('Failed to track:', err));
    // SOFT LOGIN GATE: Check if user is confirming the Brief without being logged in
    const isBriefConfirmation = messageText.toLowerCase().includes("that's right") || 
                                 messageText.toLowerCase().includes("let's see the schools") ||
                                 messageText.toLowerCase().includes("see the schools") ||
                                 messageText.toLowerCase().includes("that looks right") ||
                                 messageText.toLowerCase().includes("show me schools");
    
    if (isBriefConfirmation && !isAuthenticated && !isDevMode) {
      // Save current conversation data to localStorage before showing gate
      localStorage.setItem('guestConversationData', JSON.stringify({
        messages,
        consultant: selectedConsultant,
        conversationContext: currentConversation?.conversationContext || {}
      }));
      
      setShowLoginGate(true);
      return;
    }

    // Check if user has tokens (skip for premium)
    if (!isPremium && tokenBalance <= 0) {
      setShowUpgradeModal(true);
      return;
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
    setShowResponseChips(false);
    setLastTypingTime(Date.now());

    try {
      // Fetch user notes and shortlist for AI context
      let userNotes = [];
      let shortlistedSchools = [];
      if (isAuthenticated && user) {
        try {
          const notes = await base44.entities.Notes.filter({ userId: user.id });
          userNotes = notes.map(n => n.content);
          
          shortlistedSchools = shortlistData.map(s => s.name);
        } catch (e) {
          console.error('Failed to fetch notes/shortlist:', e);
        }
      }

      // CRITICAL FIX: When confirming brief, pass empty array to force fresh search
      const isBriefConfirmingForResults = isBriefConfirmation || 
                                          (briefStatus === BRIEF_STATUS.PENDING_REVIEW && 
                                           (messageText.toLowerCase().includes('show') || 
                                            messageText.toLowerCase().includes('right')));
      
      // Call orchestrateConversation with current schools context and user location
      const response = await base44.functions.invoke('orchestrateConversation', {
        message: messageText,
        conversationHistory: messages,
        conversationContext: contextOverride || currentConversation?.conversationContext || {},
        region: user?.profileRegion || 'Canada',
        userId: user?.id,
        consultantName: selectedConsultant,
        currentOnboardingPhase: onboardingPhase,
        currentSchools: isBriefConfirmingForResults ? [] : schools,
        userNotes,
        shortlistedSchools,
        userLocation: userLocation ? {
          lat: userLocation.lat,
          lng: userLocation.lng,
          address: userLocation.address
        } : null,
        selectedSchoolId: explicitSchoolId || selectedSchool?.id || null
      });

      // CRITICAL: Update briefStatus from response immediately
      const newBriefStatus = response.data.briefStatus || null;
      if (newBriefStatus) {
        setBriefStatus(newBriefStatus);
        console.log('[BRIEF STATUS] Updated to:', newBriefStatus);
      }
      
      // CRITICAL FIX: Merge backend's full context (including extractedEntities) with frontend state
      const updatedContext = { 
        ...(currentConversation?.conversationContext || {}), 
        ...(response.data.conversationContext || {}),
        state: response.data.state,
        briefStatus: newBriefStatus,
        schools: response.data.schools || [],
        conversationId: currentConversation?.id || null
      };
      
      if (currentConversation) {
        setCurrentConversation({ ...currentConversation, conversationContext: updatedContext });
      } else {
        // For guests without a conversation object, create a temporary one
        setCurrentConversation({ 
          id: null, 
          conversationContext: updatedContext,
          messages: []
        });
      }

      // BUG-DD-001 FIX: selectedSchool is SINGLE SOURCE OF TRUTH - NEVER clear it based on AI state
      const isViewingSchoolDetail = selectedSchool !== null;
      
      if (!isViewingSchoolDetail && response.data.state) {
        // Only update view if NOT viewing a school detail
        // CRITICAL: Do NOT call setSelectedSchool(null) here - it defeats the single source of truth
        if ([STATES.WELCOME, STATES.DISCOVERY, STATES.BRIEF].includes(response.data.state)) {
          setCurrentView('chat');
        } else if (response.data.state === STATES.RESULTS) {
          setCurrentView('schools');
        } else if (response.data.state === STATES.DEEP_DIVE) {
          setCurrentView('detail');
        }
      } else if (isViewingSchoolDetail) {
        console.log('[BUG-DD-001] Maintaining detail view - school selected:', selectedSchool?.name);
        // Keep view locked to detail as long as selectedSchool is set
      }
      
      // Use the same guard for schools display logic
      const isDeepDivingSchool = isViewingSchoolDetail;
      
      // FIX #3: First priority - if schools are returned, display them (ONLY if not in DEEP_DIVE)
      if (response.data.schools && response.data.schools.length > 0 && !isDeepDivingSchool) {
        // Track schools shown
        base44.functions.invoke('trackSessionEvent', {
          eventType: 'schools_shown',
          consultantName: selectedConsultant,
          sessionId,
          metadata: { schoolCount: response.data.schools.length }
        }).catch(err => console.error('Failed to track:', err));

        // Show feedback prompt if not already shown
        if (!feedbackPromptShown && messages.length > 5) {
          setFeedbackPromptShown(true);
        }
        // Reorder schools to match the order mentioned in AI response
        const aiResponse = response.data.message;
        const orderedSchools = [...response.data.schools];

        const mentionedSchools = [];
        const remainingSchools = [];

        for (const school of orderedSchools) {
          const schoolNameIndex = aiResponse.indexOf(school.name);
          if (schoolNameIndex !== -1) {
            mentionedSchools.push({ school, index: schoolNameIndex });
          } else {
            remainingSchools.push(school);
          }
        }

        mentionedSchools.sort((a, b) => a.index - b.index);

        const finalOrderedSchools = [
          ...mentionedSchools.map(ms => ms.school),
          ...remainingSchools
        ];

        setSchools(finalOrderedSchools);
        // Reset sort to relevance when new schools arrive
        setSortField('relevance');
        setSortDirection('asc');
        // BUG-DD-001 FIX: View switching handled in state mapping logic above
      }

      const aiMessage = {
        role: 'assistant',
        content: response.data.message,
        timestamp: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);
      
      setIsTyping(false);

       // Deduct 1 token and persist to database (skip for premium)
       if (isAuthenticated && user && !isPremium) {
         const newTokenBalance = Math.max(0, tokenBalance - 1);
         setTokenBalance(newTokenBalance);
         await base44.auth.updateMe({ tokenBalance: newTokenBalance });
       }

       // Save AI memories - IMPROVED VERSION with deduplication and filtering
       if (isAuthenticated && user) {
         try {
           // Extract memory from conversation message only, not schools
           const memoryPrompt = `Extract ONLY verified facts that the user explicitly stated about themselves or their family. 
DO NOT infer from schools shown, locations searched, or school details.
DO NOT store negative statements like "not mentioned" or "unknown".
Return a JSON array of facts ONLY if user said them directly.

User message: "${messageText}"
AI response: "${response.data.message}"

Facts to extract (only if user said them):
- Child's name, age, grade level
- Parent/family location/address  
- Budget they mentioned
- School preferences they stated
- Academic/non-academic priorities they mentioned

Return empty array if user didn't provide any of these facts.`;
           
           const memoryResult = await base44.integrations.Core.InvokeLLM({
             prompt: memoryPrompt,
             response_json_schema: {
               type: "object",
               properties: {
                 facts: {
                   type: "array",
                   items: { type: "string" }
                 }
               }
             }
           });

           // Only update if we got new facts
           if (memoryResult.facts && memoryResult.facts.length > 0) {
             const existingMemories = await base44.entities.UserMemory.filter({ userId: user.id });
             if (existingMemories.length > 0) {
               const existingMem = existingMemories[0];
               // Use Set to deduplicate, then convert back to array
               const dedupedMemories = [...new Set([...existingMem.memories, ...memoryResult.facts])];
               await base44.entities.UserMemory.update(existingMem.id, {
                 memories: dedupedMemories,
                 lastUpdated: new Date().toISOString()
               });
             } else {
               await base44.entities.UserMemory.create({
                 userId: user.id,
                 memories: memoryResult.facts,
                 lastUpdated: new Date().toISOString()
               });
             }
           }
         } catch (e) {
           console.error('Failed to save memories:', e);
         }
       }

       // Update conversation if authenticated
       if (isAuthenticated && currentConversation && currentConversation.id) {
         await base44.entities.ChatHistory.update(currentConversation.id, {
           messages: finalMessages,
           conversationContext: updatedContext
         });

         // Count user messages to determine when to generate title
         const userMessageCount = finalMessages.filter(m => m.role === 'user').length;
         
         // Generate title after first user message
         if (userMessageCount === 1 && currentConversation.title === 'New Conversation') {
           try {
             const titleResult = await base44.functions.invoke('generateConversationTitle', {
               conversationId: currentConversation.id
             });
             
             // Update the conversation in state with new title
             if (titleResult.data?.title) {
               const updatedConvo = { ...currentConversation, title: titleResult.data.title };
               setCurrentConversation(updatedConvo);
               
               // Reload conversations to refresh sidebar
               await loadConversations(user.id);
             }
           } catch (titleError) {
             console.error('Failed to generate title:', titleError);
           }
         }

         // Trigger summarization if more than 5 messages
         if (finalMessages.filter(m => m.role === 'user').length % 5 === 0) {
           try {
             await base44.functions.invoke('summarizeConversation', {
               conversationId: currentConversation.id
             });
           } catch (summarizeError) {
             console.error('Failed to summarize conversation:', summarizeError);
           }
         }
       }
    } catch (error) {
      console.error('Error sending message:', error);
      setIsTyping(false);
      
      // Add error message to chat
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages([...updatedMessages, errorMessage]);
    }
  };

  const handleViewSchoolDetail = async (schoolId) => {
    const school = schools.find(s => s.id === schoolId) || shortlistData.find(s => s.id === schoolId);
    if (school) {
      // Track school clicked
      base44.functions.invoke('trackSessionEvent', {
        eventType: 'school_clicked',
        consultantName: selectedConsultant,
        sessionId,
        metadata: { schoolName: school.name }
      }).catch(err => console.error('Failed to track:', err));

      setSelectedSchool(school);
      setCurrentView('detail');
      
      // Auto-send message to trigger DEEP_DIVE analysis - pass school.id directly to avoid async state issue
      await handleSendMessage(`Tell me about ${school.name}`, school.id);
    }
  };

  const handleToggleShortlist = async (schoolId) => {
    // Login gate for shortlist
    if (!isAuthenticated) {
      setShowLoginGate(true);
      return;
    }
    if (!user) return;
    
    try {
      const currentShortlist = user.shortlist || [];
      let updatedShortlist;
      const school = schools.find(s => s.id === schoolId);
      
      if (currentShortlist.includes(schoolId)) {
        // Remove from shortlist
        updatedShortlist = currentShortlist.filter(id => id !== schoolId);
      } else {
        // Add to shortlist
        updatedShortlist = [...currentShortlist, schoolId];
        // Track shortlisted
        base44.functions.invoke('trackSessionEvent', {
          eventType: 'shortlisted',
          consultantName: selectedConsultant,
          sessionId,
          metadata: { schoolName: school?.name }
        }).catch(err => console.error('Failed to track:', err));
      }
      
      // Update user
      await base44.auth.updateMe({ shortlist: updatedShortlist });
      
      // Update local state
      setUser({ ...user, shortlist: updatedShortlist });
      
      // Reload shortlist data
      await loadShortlist(user.id);
    } catch (error) {
      console.error('Failed to toggle shortlist:', error);
    }
  };

  const deleteConversation = async () => {
    if (!conversationToDelete) return;
    
    try {
      // Mark as inactive instead of deleting
      await base44.entities.ChatHistory.update(conversationToDelete.id, {
        isActive: false
      });
      
      // Reload conversations
      await loadConversations(user.id);
      
      // Clear current conversation if it was the one deleted
      if (currentConversation?.id === conversationToDelete.id) {
        const firstActive = conversations.find(c => c.id !== conversationToDelete.id && c.isActive);
        if (firstActive) {
          selectConversation(firstActive);
        } else {
          setCurrentConversation(null);
          setMessages([]);
          if (!selectedSchool) {
            setCurrentView('welcome');
          }
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
    
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const toggleStarConversation = async (convo, e) => {
    e.stopPropagation();
    try {
      await base44.entities.ChatHistory.update(convo.id, {
        starred: !convo.starred
      });
      await loadConversations(user.id);
    } catch (error) {
      console.error('Failed to toggle star:', error);
    }
  };

  const applyDistancesToSchools = (location) => {
    // Calculate distances for all schools
    const schoolsWithDistance = schools.map(school => {
      if (school.lat && school.lng) {
        const distance = calculateHaversineDistance(
          location.lat,
          location.lng,
          school.lat,
          school.lng
        );
        return { ...school, distanceKm: distance };
      }
      return school;
    });
    
    // Sort by distance
    const sorted = schoolsWithDistance.sort((a, b) => 
      (a.distanceKm || Infinity) - (b.distanceKm || Infinity)
    );
    
    setSchools(sorted);
    setShowDistances(true);
  };

  // Haversine formula to calculate distance between two coordinates
  const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getFilteredAndSortedSchools = () => {
    try {
      if (!schools || schools.length === 0) return schools || [];
      
      let filtered = [...schools];
      
      // SAFE FRONTEND FILTERING with try/catch and optional chaining
      try {
        const profile = currentConversation?.conversationContext?.familyProfile;
        
        // Grade Filter: Exclude schools where highestGrade < child's grade
        const childGrade = profile?.childGrade;
        if (childGrade !== null && childGrade !== undefined) {
          const gradeNum = typeof childGrade === 'number' ? childGrade : parseInt(String(childGrade));
          
          if (!isNaN(gradeNum)) {
            filtered = filtered.filter(school => {
              if (!school?.highestGrade && school?.highestGrade !== 0) return true;
              return school.highestGrade >= gradeNum;
            });
            console.log('[FILTER] Grade:', gradeNum, 'Schools:', filtered.length);
          }
        }
        
        // Budget Filter: Exclude schools where tuition > budget (keep N/A)
        const maxBudget = profile?.maxTuition;
        if (maxBudget && maxBudget !== 'unlimited') {
          const budgetNum = typeof maxBudget === 'number' ? maxBudget : parseInt(String(maxBudget));
          
          if (!isNaN(budgetNum)) {
            filtered = filtered.filter(school => {
              const tuition = school?.tuition || school?.dayTuition;
              if (!tuition) return true;
              return tuition <= budgetNum;
            });
            console.log('[FILTER] Budget:', budgetNum, 'Schools:', filtered.length);
          }
        }
        
        // Religious Dealbreaker Filter: Exclude schools with religious affiliation or keywords in name
        try {
          const dealbreakers = profile?.dealbreakers || [];
          const hasReligiousDealbreaker = Array.isArray(dealbreakers) && dealbreakers.some(d => typeof d === 'string' && d.toLowerCase().includes('religious'));
          
          if (hasReligiousDealbreaker) {
            const beforeCount = filtered.length;
            filtered = filtered.filter(school => {
              const name = (school?.name || '').toLowerCase();
              const affiliation = (school?.religiousAffiliation || '').toLowerCase();
              
              // Exclude if religiousAffiliation is set and not secular
              if (affiliation && affiliation !== 'none' && affiliation !== 'secular' && affiliation !== 'non-denominational') {
                console.log('[RELIGIOUS FILTER] Excluded by affiliation:', school.name, '(' + school.religiousAffiliation + ')');
                return false;
              }
              
              // Exclude by name keywords
              const religiousKeywords = ['christian', 'catholic', 'islamic', 'jewish', 'lutheran', 'baptist', 'adventist', 'anglican', 'hebrew', 'saint', "st. michael's", "st michael's"];
              if (religiousKeywords.some(kw => name.includes(kw))) {
                console.log('[RELIGIOUS FILTER] Excluded by name keyword:', school.name);
                return false;
              }
              
              return true;
            });
            console.log('[FILTER] Religious dealbreaker: filtered from', beforeCount, 'to', filtered.length, 'schools');
          }
        } catch (religiousFilterError) {
          console.error('[RELIGIOUS FILTER] Error, skipping religious filter:', religiousFilterError);
        }
      } catch (filterError) {
        console.error('[FILTER] Error applying filters, showing all schools:', filterError);
        filtered = [...schools];
      }
      
      // Apply sorting
      if (sortField === 'relevance') return filtered;
      
      const sorted = [...filtered];
      switch (sortField) {
        case 'name':
          sorted.sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
          break;
        case 'distance':
          sorted.sort((a, b) => (a?.distanceKm ?? Infinity) - (b?.distanceKm ?? Infinity));
          break;
        case 'tuition':
          sorted.sort((a, b) => (a?.tuition ?? Infinity) - (b?.tuition ?? Infinity));
          break;
      }

      if (sortDirection === 'desc') sorted.reverse();
      return sorted;
      
    } catch (error) {
      console.error('[FILTER] Critical error, returning all schools:', error);
      return schools || [];
    }
  };

  // Detect if user is scrolled up, show new message indicator on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px threshold
      
      if (!isAtBottom) {
        setIsScrolledUp(true);
        setShowNewMessageIndicator(true);
      } else {
        setIsScrolledUp(false);
        setShowNewMessageIndicator(false);
      }
    }
  }, [messages]);

  // Auto-scroll to bottom on new messages (works in both views)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleScrollDownClick = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowNewMessageIndicator(false);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show consultant selection if not yet selected
  if (!selectedConsultant) {
    return (
      <div className="h-screen flex flex-col bg-slate-50">
        <a 
          href="#consultant-selection" 
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-600 focus:text-white focus:rounded-lg"
        >
          Skip to consultant selection
        </a>
        <Navbar variant="minimal" />
        <div id="consultant-selection" className="flex-1 overflow-auto">
          <ConsultantSelection onSelectConsultant={handleSelectConsultant} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* TASK E: Skip navigation */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-600 focus:text-white focus:rounded-lg"
      >
        Skip to main content
      </a>
      
      {/* TASK D: Progress bar */}
      <ProgressBar isLoading={isTyping} />
      
      {/* Header */}
      <Navbar variant="minimal" />

      {isIntakePhase ? (
        /* INTAKE PHASE - Centered Layout */
        <div id="main-content" className="flex-1 flex flex-col bg-[#1E1E2E] overflow-hidden relative">
          <div className="flex-1 flex items-center justify-center p-2 sm:p-4">
            <div className="w-full max-w-2xl h-full max-h-[95vh] sm:max-h-[90vh] bg-[#2A2A3D] rounded-xl sm:rounded-2xl shadow-2xl flex flex-col transition-all duration-400">
              {/* Consultant Header */}
              <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between bg-[#2A2A3D]">
              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <img 
                  src={selectedConsultant === 'Jackie' 
                    ? 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699717aa28903550c09d4d26/150ea2350_Jackie.jpg'
                    : 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699717aa28903550c09d4d26/568e5604d_liam.png'
                  }
                  alt={selectedConsultant}
                  className="h-8 sm:h-10 w-8 sm:w-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h2 className={`font-bold text-base sm:text-lg truncate ${
                    selectedConsultant === 'Jackie' ? 'text-[#C27B8A]' : 'text-[#6B9DAD]'
                  }`}>{selectedConsultant}</h2>
                  {isTyping ? (
                    <p className="text-xs text-[#E8E8ED]/60">{selectedConsultant} is thinking...</p>
                  ) : (
                    <p className="text-xs text-[#E8E8ED]/60">Education Consultant</p>
                  )}
                </div>
              </div>
            </div>

              {/* Messages */}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#1E1E2E] pb-32">
                {[STATES.WELCOME, STATES.DISCOVERY, STATES.BRIEF].includes(currentState) && messages.length <= 1 && (
                <div className="text-center space-y-6 py-8">
                  <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-[#E8E8ED]">Welcome to NextSchool</h1>
                    <p className="text-[#E8E8ED]/70">Your personalized school search, simplified</p>
                  </div>
                  <div className="grid gap-4 max-w-md mx-auto text-left">
                    <div className="flex items-start gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                        selectedConsultant === 'Jackie' ? 'bg-[#C27B8A]/20 text-[#C27B8A]' : 'bg-[#6B9DAD]/20 text-[#6B9DAD]'
                      }`}>1</div>
                      <div>
                        <h3 className="font-semibold text-[#E8E8ED]">Tell us about your child</h3>
                        <p className="text-sm text-[#E8E8ED]/60">Grade, location, priorities</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                        selectedConsultant === 'Jackie' ? 'bg-[#C27B8A]/20 text-[#C27B8A]' : 'bg-[#6B9DAD]/20 text-[#6B9DAD]'
                      }`}>2</div>
                      <div>
                        <h3 className="font-semibold text-[#E8E8ED]">Review your brief</h3>
                        <p className="text-sm text-[#E8E8ED]/60">Confirm what matters most</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                        selectedConsultant === 'Jackie' ? 'bg-[#C27B8A]/20 text-[#C27B8A]' : 'bg-[#6B9DAD]/20 text-[#6B9DAD]'
                      }`}>3</div>
                      <div>
                        <h3 className="font-semibold text-[#E8E8ED]">See your matches</h3>
                        <p className="text-sm text-[#E8E8ED]/60">Personalized school recommendations</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {messages.map((msg, index) => (
                <MessageBubble
                  key={index}
                  message={msg}
                  isUser={msg.role === 'user'}
                  schools={schools}
                  consultantName={selectedConsultant}
                  onViewSchoolProfile={async (slug) => {
                    let school = schools?.find(s => 
                      s.slug === slug || 
                      s.name.toLowerCase() === slug.toLowerCase() ||
                      s.name.toLowerCase().replace(/[^a-z0-9]/g, '-') === slug
                    );
                    
                    if (school) {
                      setSelectedSchool(school);
                      setCurrentView('detail');
                    } else {
                      try {
                        let results = await base44.entities.School.filter({ slug });
                        if (!results || results.length === 0) {
                          const possibleName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                          results = await base44.entities.School.filter({ name: { $regex: slug.replace(/-/g, ' '), $options: 'i' } });
                        }
                        if (results && results.length > 0) {
                          setSelectedSchool(results[0]);
                          setCurrentView('detail');
                        }
                      } catch (error) {
                        console.error('Error finding school:', error);
                      }
                    }
                  }}
                />
              ))}
              {isTyping && <TypingIndicator message={loadingStages[loadingStage]} consultantName={selectedConsultant} />}

              {/* Feedback Prompt */}
              {feedbackPromptShown && schools.length > 0 && !isTyping && (
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-teal-900">
                      I hope that was helpful! If you have a minute, I'd love to hear how this went for you.
                    </p>
                  </div>
                  <Link to={createPageUrl('Feedback')} className="flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-teal-600 text-teal-600 hover:bg-teal-50"
                    >
                      Share Feedback
                    </Button>
                  </Link>
                </div>
              )}

              <div ref={messagesEndRef} />
              </div>

                {/* Suggested Response Chips */}
              {(() => {
              const lastAIMessage = messages.filter(m => m.role === 'assistant').slice(-1)[0];
              const isBriefMessage = lastAIMessage?.content && (
                lastAIMessage.content.includes("Does that capture") ||
                lastAIMessage.content.includes("Anything I'm missing") ||
                lastAIMessage.content.includes("Here's what I'm taking away") ||
                lastAIMessage.content.includes("needs adjustment")
              );
              
              // FIX 17: Show chips when in BRIEF state with pending_review/editing status OR initial greeting
              const shouldShowChips = showResponseChips || 
                                      (currentState === STATES.BRIEF && [BRIEF_STATUS.PENDING_REVIEW, BRIEF_STATUS.EDITING].includes(briefStatus)) ||
                                      onboardingPhase === 'confirm_brief' ||
                                      isBriefMessage;
              
                return shouldShowChips;
              })() && (
                <div className="p-3 sm:p-4 border-t border-white/10 bg-[#2A2A3D] flex flex-col sm:flex-row flex-wrap gap-2 justify-center">
                {(() => {
                  const isBriefStatus = currentState === STATES.BRIEF && 
                                        [BRIEF_STATUS.PENDING_REVIEW, BRIEF_STATUS.EDITING].includes(briefStatus);
                  return showResponseChips && !isBriefStatus;
                })() && (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => handleSendMessage("My child needs a new school")}
                      disabled={isTyping}
                      className="text-xs bg-[#2A2A3D] border-white/20 text-[#E8E8ED] hover:bg-[#2A2A3D]/80 hover:border-white/30"
                    >
                      My child needs a new school
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleSendMessage("I'm comparing a few schools already")}
                      disabled={isTyping}
                      className="text-xs bg-[#2A2A3D] border-white/20 text-[#E8E8ED] hover:bg-[#2A2A3D]/80 hover:border-white/30"
                    >
                      I'm comparing a few schools already
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleSendMessage("I'm not sure where to start")}
                      disabled={isTyping}
                      className="text-xs bg-[#2A2A3D] border-white/20 text-[#E8E8ED] hover:bg-[#2A2A3D]/80 hover:border-white/30"
                    >
                      I'm not sure where to start
                    </Button>
                  </>
                )}
                {currentState === STATES.BRIEF && 
                 [BRIEF_STATUS.PENDING_REVIEW, BRIEF_STATUS.EDITING].includes(briefStatus) && (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={handleBriefConfirm}
                      disabled={isTyping}
                      className={`text-sm px-4 py-2 rounded-full border-2 font-medium ${
                        selectedConsultant === 'Jackie' 
                          ? 'bg-[#C27B8A]/20 border-[#C27B8A] text-[#C27B8A] hover:bg-[#C27B8A]/30' 
                          : 'bg-[#6B9DAD]/20 border-[#6B9DAD] text-[#6B9DAD] hover:bg-[#6B9DAD]/30'
                      }`}
                    >
                      That looks right - show me schools
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleSendMessage("I would like to adjust")}
                      disabled={isTyping}
                      className="text-sm px-4 py-2 rounded-full bg-[#2A2A3D] border-white/20 text-[#E8E8ED] hover:bg-[#2A2A3D]/80 hover:border-white/30"
                    >
                      I would like to adjust
                    </Button>
                  </>
                )}
                </div>
                )}

                {/* Chat Input - Fixed at bottom of modal */}
                <ChatInput
                ref={inputRef}
                onSend={handleSendMessage}
                disabled={isTyping}
                tokenBalance={tokenBalance}
                isPremium={isPremium}
              />
            </div>
          </div>
        </div>
      ) : (
        /* RESULTS PHASE - Sidebar Layout */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative transition-all duration-400 pb-0">
        {/* Mobile tab toggle */}
        <div className="lg:hidden flex border-b bg-white">
          <button
            onClick={() => setMobileView('chat')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mobileView === 'chat' 
                ? 'text-teal-600 border-b-2 border-teal-600' 
                : 'text-slate-600'
            }`}
            aria-label="View chat"
          >
            Chat
          </button>
          <button
            onClick={() => setMobileView('schools')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mobileView === 'schools' 
                ? 'text-teal-600 border-b-2 border-teal-600' 
                : 'text-slate-600'
            }`}
            aria-label="View schools"
          >
            Schools ({schools.length})
          </button>
        </div>

        {/* LEFT SIDEBAR */}
        <aside className={`
          ${sidebarCollapsed ? 'w-0' : 'w-64'}
          transition-all duration-300 bg-slate-100 border-r flex-col overflow-hidden
          hidden lg:flex
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
                    {shortlistData.length}
                  </span>
                </button>
                <button 
                  className="w-full flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-sm transition-colors"
                  onClick={() => setShowNotesPanel(true)}
                >
                  <FileText className="h-4 w-4 text-slate-600" />
                  <span className="font-medium">Notes</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {conversations.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    <p>No conversations yet</p>
                  </div>
                ) : (
                  conversations.map(convo => (
                    <div
                      key={convo.id}
                      onClick={() => selectConversation(convo)}
                      className={`p-3 rounded-lg cursor-pointer transition-all group ${
                        currentConversation?.id === convo.id
                          ? 'bg-white shadow border border-teal-200'
                          : 'hover:bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-slate-900">{convo.title}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(convo.updated_date).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={(e) => toggleStarConversation(convo, e)}
                          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {convo.starred ? (
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          ) : (
                            <Star className="h-4 w-4 text-slate-400 hover:text-yellow-400" />
                          )}
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConversationToDelete(convo);
                          setDeleteDialogOpen(true);
                        }}
                        className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              {/* Collapse button */}
              <div className="border-t bg-white p-2">
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="w-full p-2 rounded hover:bg-slate-50 transition flex items-center justify-center"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              </div>
            </>
          )}
        </aside>

        {/* Expand button when collapsed */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-white border border-l-0 border-slate-200 rounded-r-lg p-2 shadow-lg hover:bg-slate-50 transition-all"
          >
            <ChevronRight className="h-5 w-5 text-slate-600" />
          </button>
        )}

        {/* CENTER CONTENT AREA */}
        <main className={`flex-1 overflow-hidden bg-white transition-opacity duration-200 ${
          mobileView === 'schools' ? 'block' : 'hidden lg:block'
        }`} style={{ animationDelay: '100ms' }}>
          {currentView === 'detail' && selectedSchool ? (
            <SchoolDetailPanel
              school={selectedSchool}
              onBack={() => {
                setSelectedSchool(null);
                setCurrentView('schools');
              }}
              onToggleShortlist={handleToggleShortlist}
              isShortlisted={user?.shortlist?.includes(selectedSchool.id) || false}
            />
          ) : currentState === STATES.RESULTS && schools.length === 0 ? (
            <WelcomeState onPromptClick={handleSendMessage} />
          ) : currentState === STATES.RESULTS && schools.length > 0 ? (
            <div className="h-full flex flex-col animate-fadeIn">
              <div className="p-3 sm:p-4 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900">
                  Results ({getFilteredAndSortedSchools().length})
                </h2>
                <SortControl
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSortFieldChange={setSortField}
                  onSortDirectionChange={setSortDirection}
                />
              </div>
              <div className="flex-1 overflow-auto p-3 sm:p-4">
                <SchoolGrid
                  schools={getFilteredAndSortedSchools()}
                  onViewDetails={handleViewSchoolDetail}
                  onToggleShortlist={handleToggleShortlist}
                  shortlistedIds={user?.shortlist || []}
                  showDistances={showDistances}
                  isLoading={isTyping && schools.length === 0}
                  accentColor={selectedConsultant === 'Jackie' ? '#C27B8A' : '#6B9DAD'}
                />
              </div>
            </div>
          ) : null}

          {currentState === STATES.RESULTS && comparisonData && (
            <ComparisonView 
              schools={comparisonData} 
              onBack={() => setComparisonData(null)}
            />
          )}

          

        </main>

        {/* RIGHT CHAT PANEL */}
        <aside className={`w-full lg:w-[450px] bg-[#2A2A3D] border-l border-white/10 flex flex-col transition-all duration-400 ${
          mobileView === 'chat' ? 'block' : 'hidden lg:flex'
        }`}>
          {/* Chat Header */}
          <div className="p-3 sm:p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
               <img 
                  src={selectedConsultant === 'Jackie' 
                    ? 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699717aa28903550c09d4d26/150ea2350_Jackie.jpg'
                    : 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699717aa28903550c09d4d26/568e5604d_liam.png'
                  }
                  alt={selectedConsultant}
                  className="h-8 sm:h-10 w-8 sm:w-10 rounded-full object-cover flex-shrink-0"
               />
              <div className="min-w-0 flex-1">
                <span className={`font-semibold block text-sm sm:text-base truncate ${
                  selectedConsultant === 'Jackie' ? 'text-[#C27B8A]' : 'text-[#6B9DAD]'
                }`}>{selectedConsultant}</span>
                {isTyping && (
                  <span className="text-xs text-[#E8E8ED]/60">{selectedConsultant} is thinking...</span>
                )}
              </div>
            </div>
          </div>

          {/* Messages - Dynamic height with scroll */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#1E1E2E] min-h-0">
            {/* Feedback Prompt in Sidebar */}
            {feedbackPromptShown && schools.length > 0 && !isTyping && (
              <div className="bg-teal-900/30 border border-teal-500/30 rounded-lg p-3 mb-2">
                <p className="text-sm text-[#E8E8ED] mb-2">
                  I hope that was helpful! If you have a minute, I'd love to hear how this went for you.
                </p>
                <Link to={createPageUrl('Feedback')} className="block">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-teal-500 text-teal-400 hover:bg-teal-900/50"
                  >
                    Share Feedback
                  </Button>
                </Link>
              </div>
            )}

            {messages.map((msg, index) => (
              <MessageBubble
                key={index}
                message={msg}
                isUser={msg.role === 'user'}
                schools={schools}
                consultantName={selectedConsultant}
                onViewSchoolProfile={async (slug) => {
                  console.log('🔗 onViewSchoolProfile called with slug:', slug);
                  console.log('📚 Available schools:', schools?.map(s => ({ name: s.name, slug: s.slug })));

                  // Robust slug matching: try direct slug, then name matching
                  let school = schools?.find(s => 
                    s.slug === slug || 
                    s.name.toLowerCase() === slug.toLowerCase() ||
                    s.name.toLowerCase().replace(/[^a-z0-9]/g, '-') === slug
                  );

                  console.log('✅ School found in state:', school);

                  if (school) {
                    setSelectedSchool(school);
                    setCurrentView('detail');
                  } else {
                    try {
                      // Try database lookup by slug first
                      console.log('🔍 Searching database for slug:', slug);
                      let results = await base44.entities.School.filter({ slug });

                      // If not found by slug, try by name (slug might be derived differently)
                      if (!results || results.length === 0) {
                        console.log('❌ Not found by slug, trying by name...');
                        // Try to extract possible school name from slug
                        const possibleName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        results = await base44.entities.School.filter({ name: { $regex: slug.replace(/-/g, ' '), $options: 'i' } });
                      }

                      if (results && results.length > 0) {
                        console.log('✅ School found in database:', results[0]);
                        setSelectedSchool(results[0]);
                        setCurrentView('detail');
                      } else {
                        console.warn('⚠️ School not found in database either. Slug:', slug);
                      }
                    } catch (error) {
                      console.error('❌ Error finding school:', error);
                    }
                  }
                }}
              />
            ))}
            {isTyping && <TypingIndicator message={loadingStages[loadingStage]} consultantName={selectedConsultant} />}
            <div ref={messagesEndRef} />

            {/* New Message Indicator */}
            {showNewMessageIndicator && !isTyping && (
              <div className="flex justify-center sticky bottom-0 z-30 pt-2">
                <Button
                  onClick={handleScrollDownClick}
                  className="bg-teal-600 hover:bg-teal-700 text-white text-sm px-4 py-2 rounded-full shadow-lg"
                >
                  New message ↓
                </Button>
              </div>
            )}
          </div>

          {/* Suggested Response Chips - After greeting, for confirm_brief, BRIEF state, or Brief message detected */}
          {(() => {
            const shouldShowChips = showResponseChips || 
                                    (currentState === STATES.BRIEF && [BRIEF_STATUS.PENDING_REVIEW, BRIEF_STATUS.EDITING].includes(briefStatus));
            return shouldShowChips;
          })() && (
            <div className="p-3 sm:p-4 border-t border-white/10 bg-[#2A2A3D] flex flex-col sm:flex-row flex-wrap gap-2 justify-center">
              {(() => {
                const isBriefState = currentState === STATES.BRIEF && [BRIEF_STATUS.PENDING_REVIEW, BRIEF_STATUS.EDITING].includes(briefStatus);
                return showResponseChips && !isBriefState;
              })() && (
                <>
                  <Button 
                    variant="outline" 
                    onClick={() => handleSendMessage("My child needs a new school")}
                    disabled={isTyping}
                    className="text-xs bg-[#2A2A3D] border-white/20 text-[#E8E8ED] hover:bg-[#2A2A3D]/80 hover:border-white/30"
                  >
                    My child needs a new school
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => handleSendMessage("I'm comparing a few schools already")}
                    disabled={isTyping}
                    className="text-xs bg-[#2A2A3D] border-white/20 text-[#E8E8ED] hover:bg-[#2A2A3D]/80 hover:border-white/30"
                  >
                    I'm comparing a few schools already
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => handleSendMessage("I'm not sure where to start")}
                    disabled={isTyping}
                    className="text-xs bg-[#2A2A3D] border-white/20 text-[#E8E8ED] hover:bg-[#2A2A3D]/80 hover:border-white/30"
                  >
                    I'm not sure where to start
                  </Button>
                </>
              )}
              {currentState === STATES.BRIEF && [BRIEF_STATUS.PENDING_REVIEW, BRIEF_STATUS.EDITING].includes(briefStatus) && (
                <>
                  <Button 
                    variant="outline" 
                    onClick={handleBriefConfirm}
                    disabled={isTyping}
                    className={`text-sm px-4 py-2 rounded-full border-2 font-medium ${
                      selectedConsultant === 'Jackie' 
                        ? 'bg-[#C27B8A]/20 border-[#C27B8A] text-[#C27B8A] hover:bg-[#C27B8A]/30' 
                        : 'bg-[#6B9DAD]/20 border-[#6B9DAD] text-[#6B9DAD] hover:bg-[#6B9DAD]/30'
                    }`}
                  >
                    That's right, let's see the schools
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => handleSendMessage("I'd like to adjust something")}
                    disabled={isTyping}
                    className="text-sm px-4 py-2 rounded-full bg-[#2A2A3D] border-white/20 text-[#E8E8ED] hover:bg-[#2A2A3D]/80 hover:border-white/30"
                  >
                    I'd like to adjust something
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Chat Input - Sticky at bottom */}
          <div className="sticky bottom-0 z-40 bg-[#2A2A3D] border-t border-white/10">
            <ChatInput
              ref={inputRef}
              onSend={handleSendMessage}
              disabled={isTyping}
              tokenBalance={tokenBalance}
              isPremium={isPremium}
            />
          </div>
          </aside>
        </div>
      )}

      {/* Delete Conversation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{conversationToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteConversation}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conversation Limit Reached Dialog */}
      <AlertDialog open={limitReachedOpen} onOpenChange={setLimitReachedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conversation Limit Reached</AlertDialogTitle>
            <AlertDialogDescription>
              {isAuthenticated ? (
                <>
                  You've reached the conversation limit for your <strong>{user?.subscriptionPlan || 'free'}</strong> plan ({getConversationLimits(user?.subscriptionPlan || 'free')} active conversations). 
                  Upgrade your plan or delete old conversations to start a new one.
                </>
              ) : (
                <>
                  Sign in to create and manage multiple conversations.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {isAuthenticated ? (
              <Link to={createPageUrl('Pricing')}>
                <AlertDialogAction className="bg-teal-600 hover:bg-teal-700">
                  Upgrade Plan
                </AlertDialogAction>
              </Link>
            ) : (
              <AlertDialogAction 
                className="bg-teal-600 hover:bg-teal-700"
                onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
              >
                Sign In
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-3xl font-bold mb-2 text-slate-900">You've used all your tokens!</h3>
              <p className="text-slate-600">
                {isAuthenticated ? (
                  <>
                    Your tokens will replenish tomorrow with{' '}
                    <span className="font-semibold text-teal-600">
                      +{getPlanLimits(user?.subscriptionPlan || 'free').dailyReplenishment} tokens
                    </span>
                  </>
                ) : (
                  "Sign in to continue your search or upgrade for more tokens."
                )}
              </p>
            </div>

            {isAuthenticated && (
              <div className="bg-gradient-to-br from-teal-50 to-blue-50 rounded-xl p-6 mb-6 border border-teal-200">
                <h4 className="font-semibold text-lg mb-3 text-slate-900">Upgrade for More Tokens</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                    <span className="text-sm text-slate-700">
                      <strong>Pro Plan:</strong> 1,000 tokens, replenish 33/day
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    <span className="text-sm text-slate-700">
                      <strong>Enterprise Plan:</strong> 5,000 tokens, replenish 166/day
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="text-sm text-slate-700">
                      Priority support & advanced features
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {!isAuthenticated && (
                <Button 
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-6"
                  onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
                >
                  Sign In
                </Button>
              )}
              {isAuthenticated && (
                <Link to={createPageUrl('Pricing')}>
                  <Button className="w-full bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-700 hover:to-blue-700 text-white font-semibold py-6 shadow-lg">
                    <Sparkles className="h-5 w-5 mr-2" />
                    Upgrade Plan
                  </Button>
                </Link>
              )}
              <Button 
                variant="outline" 
                className="w-full border-2 font-semibold"
                onClick={() => setShowUpgradeModal(false)}
              >
                {isAuthenticated ? 'Come Back Tomorrow' : 'Maybe Later'}
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
            shortlist={shortlistData}
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

      {/* Login Gate Modal */}
      {showLoginGate && (
        <LoginGateModal
          consultantName={selectedConsultant}
          onClose={() => setShowLoginGate(false)}
        />
      )}

      {/* Family Brief Panel - Show during BRIEF state */}
      {isAuthenticated && selectedConsultant && currentState === STATES.BRIEF && [BRIEF_STATUS.PENDING_REVIEW, BRIEF_STATUS.EDITING].includes(briefStatus) && (
        <FamilyBriefPanel
          familyProfile={familyProfile}
          shortlist={shortlistData}
          isExpanded={briefExpanded}
          onToggleExpand={setBriefExpanded}
          onSectionClick={(sectionId) => {
            console.log('Section clicked:', sectionId);
          }}
        />
      )}
    </div>
  );
}