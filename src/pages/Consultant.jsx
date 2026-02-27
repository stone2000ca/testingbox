import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { STATES, BRIEF_STATUS } from './stateMachineConfig';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Heart, FileText, Sparkles, Trash2, Star, ClipboardList } from "lucide-react";
import FamilyBrief from '@/components/chat/FamilyBrief';
import WelcomeState from '@/components/schools/WelcomeState';
import ConsultantSelection from '@/components/chat/ConsultantSelection';
import SchoolGrid from '@/components/schools/SchoolGrid';
import SchoolDetailPanel from '@/components/schools/SchoolDetailPanel';
import ShortlistPanel from '@/components/chat/ShortlistPanel';
import NotesPanel from '@/components/chat/NotesPanel';
import ComparisonView from '@/components/schools/ComparisonView';
import SortControl from '@/components/schools/SortControl';
import LoginGateModal from '@/components/dialogs/LoginGateModal';
import FamilyBriefPanel from '@/components/chat/FamilyBriefPanel';
import ChatPanel from '@/components/chat/ChatPanel';
import ProgressBar from '@/components/ui/progress-bar';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Navbar from '@/components/navigation/Navbar';
import { useSchoolFiltering } from '@/hooks/useSchoolFiltering';
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
  const [userLocation, setUserLocation] = useState(null);
  
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
  const [showFamilyBrief, setShowFamilyBrief] = useState(false);
  
  // DEEPDIVE confirmation state
  const [confirmingSchool, setConfirmingSchool] = useState(null);
  
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

  // Whether the Family Brief toggle should be visible
  const isBriefState = [STATES.DISCOVERY, STATES.BRIEF].includes(currentState);
  const hasFamilyProfileData = familyProfile && Object.entries(familyProfile).some(
    ([k, v]) => !['id', 'userId', 'conversationId', 'created_date', 'updated_date', 'created_by', 'onboardingPhase', 'onboardingComplete'].includes(k)
      && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && v !== ''
  );
  const showBriefToggle = isBriefState && hasFamilyProfileData;
  
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

  // School filtering/sorting via extracted hook
  const {
    filteredSchools,
    sortField,
    sortDirection,
    setSortField,
    setSortDirection,
    showDistances,
    applyDistances,
    resetSort,
  } = useSchoolFiltering(schools, currentConversation?.conversationContext);

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
            const apiKey = Deno?.env?.get('GOOGLE_MAPS_API_KEY');
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
        ? "Hey there — I'm Jackie. I've worked with hundreds of families going through exactly this. Tell me a bit about your child and what's prompting the search."
        : "Hi, I'm Liam. I'll help you cut through the noise and find schools that actually fit. What's driving the search?",
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

  const handleSendMessage = async (messageText, explicitSchoolId = null, displayText = null) => {
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
      content: displayText || messageText,
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
        conversationContext: currentConversation?.conversationContext || {},
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
        resetSort();
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
      base44.functions.invoke('trackSessionEvent', {
        eventType: 'school_clicked',
        consultantName: selectedConsultant,
        sessionId,
        metadata: { schoolName: school.name }
      }).catch(err => console.error('Failed to track:', err));
      setSelectedSchool(school);
      setCurrentView('detail');
      setConfirmingSchool(school);
    }
  };

  const handleConfirmDeepDive = async (school) => {
    setConfirmingSchool(null);
    await handleSendMessage(`Tell me about ${school.name}`, school.id);
  };

  const handleCancelDeepDive = () => {
    setConfirmingSchool(null);
    handleBackToResults();
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
    const sorted = applyDistances(location, schools);
    setSchools(sorted);
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
          {/* Family Brief toggle button (intake phase) */}
          {showBriefToggle && (
            <button
              onClick={() => setShowFamilyBrief(v => !v)}
              className="absolute top-3 right-3 z-40 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: showFamilyBrief ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}
              aria-label="Toggle Family Brief"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Brief
            </button>
          )}
          <div className="flex-1 flex items-center justify-center p-2 sm:p-4">
            <div className="w-full max-w-2xl h-full max-h-[95vh] sm:max-h-[90vh] bg-[#2A2A3D] rounded-xl sm:rounded-2xl shadow-2xl flex flex-col transition-all duration-400">
              <ChatPanel
                ref={inputRef}
                variant="intake"
                messages={messages}
                schools={schools}
                selectedConsultant={selectedConsultant}
                currentState={currentState}
                briefStatus={briefStatus}
                isTyping={isTyping}
                tokenBalance={tokenBalance}
                isPremium={isPremium}
                loadingStage={loadingStage}
                loadingStages={loadingStages}
                feedbackPromptShown={feedbackPromptShown}
                showResponseChips={showResponseChips}
                onSendMessage={handleSendMessage}
                onViewSchoolDetail={(school) => {
                  setSelectedSchool(school);
                  setCurrentView('detail');
                }}
                onConfirmDeepDive={handleConfirmDeepDive}
                onCancelDeepDive={handleCancelDeepDive}
                heroContent={
                  [STATES.WELCOME, STATES.DISCOVERY, STATES.BRIEF].includes(currentState) && messages.length <= 1 ? (
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
                  ) : null
                }
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
                  Results ({filteredSchools.length})
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
                  schools={filteredSchools}
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
        <aside className={`w-full lg:w-[450px] bg-[#2A2A3D] border-l border-white/10 flex flex-col transition-all duration-400 relative ${
          mobileView === 'chat' ? 'block' : 'hidden lg:flex'
        }`}>
          {showBriefToggle && (
            <button
              onClick={() => setShowFamilyBrief(v => !v)}
              className="absolute top-3 right-3 z-40 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: showFamilyBrief ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}
              aria-label="Toggle Family Brief"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Brief
            </button>
          )}
          <ChatPanel
            ref={inputRef}
            variant="sidebar"
            messages={messages}
            schools={schools}
            selectedConsultant={selectedConsultant}
            currentState={currentState}
            briefStatus={briefStatus}
            isTyping={isTyping}
            tokenBalance={tokenBalance}
            isPremium={isPremium}
            loadingStage={loadingStage}
            loadingStages={loadingStages}
            feedbackPromptShown={feedbackPromptShown}
            showResponseChips={showResponseChips}
            confirmingSchool={confirmingSchool}
            familyProfile={familyProfile}
            showNewMessageIndicator={showNewMessageIndicator}
            onScrollDownClick={handleScrollDownClick}
            onSendMessage={handleSendMessage}
            onViewSchoolDetail={(school) => {
              setSelectedSchool(school);
              setCurrentView('detail');
            }}
            onConfirmDeepDive={handleConfirmDeepDive}
            onCancelDeepDive={handleCancelDeepDive}
          />
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

      {/* Family Brief overlay panel */}
      {showFamilyBrief && isBriefState && (
        <FamilyBrief
          familyProfile={familyProfile}
          consultantName={selectedConsultant}
          onClose={() => setShowFamilyBrief(false)}
        />
      )}
    </div>
  );
}