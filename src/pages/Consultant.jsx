import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import School from '@/entities/School';
import { STATES, BRIEF_STATUS } from './stateMachineConfig';
import { restoreGuestSession } from '@/components/chat/SessionRestorer';

// Import searchSchools function
const searchSchools = (params) => base44.functions.invoke('searchSchools', params);
import { Button } from "@/components/ui/button";
import { Plus, Heart, FileText, Sparkles, Trash2, Star, ClipboardList } from "lucide-react";
import IconRail from '@/components/navigation/IconRail';
import FamilyBrief from '@/components/chat/FamilyBrief';
import WelcomeState from '@/components/schools/WelcomeState';
import ConsultantSelection from '@/components/chat/ConsultantSelection';
import SchoolGrid from '@/components/schools/SchoolGrid';
import SchoolDetailPanel from '@/components/schools/SchoolDetailPanel';
import ShortlistPanel from '@/components/chat/ShortlistPanel';
import NotesPanel from '@/components/chat/NotesPanel';
import ComparisonView from '@/components/schools/ComparisonView';
import SortControl from '@/components/schools/SortControl';
import { getTuitionBand, buildPriorityChecks } from '@/components/schools/SchoolCard';
import { validateBriefContent, generateProgrammaticBrief } from '../components/utils/briefUtils';
import { buildTiers } from '../components/utils/tierEngine';
import { useUserLocation } from '../components/hooks/useUserLocation';
import { getShortlistNudge } from '../components/utils/shortlistNudges';
import { extractAndSaveMemories } from '../components/utils/memoryManager';
import LoginGateModal from '@/components/dialogs/LoginGateModal';
import FamilyBriefPanel from '@/components/chat/FamilyBriefPanel';
import ChatPanel from '@/components/chat/ChatPanel';
import ProgressBar from '@/components/ui/progress-bar';
import { Link, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Navbar from '@/components/navigation/Navbar';
import { useSchoolFiltering } from '@/hooks/useSchoolFiltering';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const DEFAULT_GREETING = "Hi! I'm your NextSchool education consultant. I help families across Canada, the US, and Europe find the perfect private school. Tell me about your child — what grade are they in, and what matters most to you in a school?";

export default function Consultant() {
  const [searchParams] = useSearchParams();
  const sessionIdParam = searchParams.get('sessionId');
  
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const isRestoringSessionRef = useRef(false);
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
  const userLocation = useUserLocation();
  
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
  const [extractedEntitiesData, setExtractedEntitiesData] = useState({});
  // T046: Right-side rail panel state
  const [activePanel, setActivePanel] = useState(null); // 'brief' | 'shortlist' | null

  // BRIEF→RESULTS transition animation
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevIsIntakePhaseRef = useRef(true);

  // T-RES-005: Sort mode
  const [sortMode, setSortMode] = useState('bestFit');

  // T-RES-006: Priority overrides { [rowId]: 'musthave' | 'nicetohave' | 'dontcare' }
  const [priorityOverrides, setPriorityOverrides] = useState({});

  const handlePriorityToggle = (rowId) => {
    setPriorityOverrides(prev => {
      const CYCLE = ['musthave', 'nicetohave', 'dontcare'];
      const current = prev[rowId] || 'nicetohave';
      const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
      // Guard: at least 1 priority must remain non-dontcare
      const updated = { ...prev, [rowId]: next };
      const allDontCare = Object.values(updated).every(v => v === 'dontcare');
      if (allDontCare) return prev;
      return updated;
    });
  };
  
  // DEEPDIVE confirmation state
  const [confirmingSchool, setConfirmingSchool] = useState(null);

  // T047: Auto-refresh animation trigger
  const [schoolsAnimKey, setSchoolsAnimKey] = useState(0);

  // Track whether shortlist has ever been auto-populated (prevents re-populating after user manually empties)
  const hasAutoPopulatedShortlist = useRef(false);
  
  // WC6: Store restored session data for returning user context
  const [restoredSessionData, setRestoredSessionData] = useState(null);
  
  // Progressive loading states
  const [loadingStage, setLoadingStage] = useState(0);
  const loadingStages = [
    "Analyzing request...",
    "Searching schools...",
    "Preparing recommendations..."
  ];
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  // Helper to map conversation state to view
  const stateToView = (state) => {
    if ([STATES.WELCOME, STATES.DISCOVERY, STATES.BRIEF].includes(state)) return 'chat';
    if (state === STATES.RESULTS) return 'schools';
    if (state === STATES.DEEP_DIVE) return 'detail';
    return 'chat';
  };

  // Helper to track session events
  const trackEvent = (eventType, metadata = {}) => {
    base44.functions.invoke('trackSessionEvent', {
      eventType,
      consultantName: selectedConsultant,
      sessionId,
      ...metadata
    }).catch(err => console.error('Failed to track:', err));
  };

  // Determine UI phase based on state and schools
  const currentState = currentConversation?.conversationContext?.state || STATES.WELCOME;

  // Whether the Family Brief toggle should be visible
  const isBriefState = true; // T045: FamilyBrief visible in all states
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
    setCurrentView(stateToView(conversationState));
  }, [currentConversation?.conversationContext?.state, selectedSchool, currentView]);
  
  const isIntakePhase = !isRestoringSessionRef.current && (
                        schools.length === 0 && 
                        currentView !== 'schools' && 
                        currentView !== 'detail' && 
                        currentView !== 'comparison' && 
                        currentView !== 'comparison-table' &&
                        ![STATES.RESULTS, STATES.DEEP_DIVE].includes(currentState)
                      );

  // Override: show split layout if schools exist (from session restore)
  const showSchoolGrid = schools.length > 0;

  // School filtering/sorting via extracted hook
  const {
    filteredSchools,
    showDistances,
    applyDistances,
    resetSort,
  } = useSchoolFiltering(schools, currentConversation?.conversationContext);

  // BRIEF→RESULTS transition animation
  useEffect(() => {
    const wasIntake = prevIsIntakePhaseRef.current;
    prevIsIntakePhaseRef.current = isIntakePhase;
    if (wasIntake && !isIntakePhase) {
      // Just switched from intake → results: trigger animation
      setIsTransitioning(true);
      setTimeout(() => setIsTransitioning(false), 600);
    }
  }, [isIntakePhase]);

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

    // Track session start
    base44.functions.invoke('trackSessionEvent', {
      eventType: 'session_start',
      sessionId
    }).catch(err => console.error('Failed to track session:', err));
  }, [sessionId]);

  // WC5: Session loading from URL param
  useEffect(() => {
    if (sessionIdParam && !sessionRestored && isAuthenticated && user) {
      restoreSessionFromParam();
    }
  }, [sessionIdParam, isAuthenticated, user?.id, sessionRestored]);

  // Load family profile for Brief panel and restore guest session after login
  useEffect(() => {
    if (user?.id && currentConversation?.id) {
      loadFamilyProfile();
    }
    // Restore guest session when user becomes authenticated
    if (isAuthenticated && user && !sessionIdParam) {
      handleRestoreGuestSession();
    }
  }, [isAuthenticated, user?.id, sessionIdParam]);



  const restoreSessionFromParam = async () => {
    if (!sessionIdParam) return;
    
    // CRITICAL: Set flag FIRST to override isIntakePhase during restoration
    isRestoringSessionRef.current = true;
    setRestoringSession(true);
    alert('RESTORE FUNCTION ENTERED');
    try {
      // Fetch ChatSession
      console.log('[RESTORE] Attempting to fetch ChatSession with ID:', sessionIdParam);
      const chatSession = await base44.entities.ChatSession.get(sessionIdParam);
      console.log('[RESTORE] ChatSession fetched:', chatSession ? 'Success' : 'Not found');
      console.log('[RESTORE] Full sessionData:', JSON.stringify(chatSession, null, 2));
      
      if (!chatSession) {
        console.error('[RESTORE] ChatSession not found with ID:', sessionIdParam);
        setSessionRestored(true);
        return;
      }
      alert('PAST CHAT SESSION FETCH');
      
      console.log('[RESTORE] ChatSession data:', JSON.stringify({
        consultantSelected: chatSession.consultantSelected,
        childName: chatSession.childName,
        childGrade: chatSession.childGrade,
        locationArea: chatSession.locationArea,
        maxTuition: chatSession.maxTuition,
        priorities: chatSession.priorities,
        matchedSchoolsCount: chatSession.matchedSchools ? JSON.parse(chatSession.matchedSchools).length : 0
      }));

      // WC6: Store session data for returning user context
      setRestoredSessionData({
        sessionId: chatSession.id,
        profileName: chatSession.profileName,
        consultantName: chatSession.consultantSelected,
        matchedSchoolsCount: chatSession.matchedSchools ? JSON.parse(chatSession.matchedSchools).length : 0,
        createdDate: chatSession.created_date,
        updatedDate: chatSession.updated_date
      });

      // CRITICAL: Restore consultant selection FIRST so chat panel can render correctly
      if (chatSession.consultantSelected) {
        setSelectedConsultant(chatSession.consultantSelected);
        console.log('[RESTORE] setSelectedConsultant:', chatSession.consultantSelected);
      }

      // DIRECT SEARCH CALL - Simplest possible fix
      try {
        alert('ABOUT TO CALL searchSchools');
        const response = await searchSchools({ 
          region: chatSession.locationArea || 'Toronto', 
          grade: String(chatSession.childGrade || 5), 
          maxTuition: String(chatSession.maxTuition || 30000) 
        });
        console.log('RESTORE searchSchools response:', response);
        alert('RESTORE response type: ' + typeof response + ' keys: ' + Object.keys(response || {}).join(',') + ' length: ' + (response?.length || response?.data?.length || 'none'));
        const schools = response.data || response;
        console.log('RESTORE schools extracted:', schools?.length);
        if (schools && schools.length > 0) {
          setSchools(schools);
          console.log('RESTORE setSchools called with', schools.length, 'schools');
        }
      } catch (err) {
        alert('searchSchools ERROR: ' + err.message);
        console.error('RESTORE searchSchools error:', err);
      }



      // Fetch and restore ChatHistory messages and context
      let chatHistory = null;
      if (chatSession.chatHistoryId) {
        chatHistory = await base44.entities.ChatHistory.get(chatSession.chatHistoryId);
        if (chatHistory?.messages) {
          setMessages(chatHistory.messages);
          console.log('[RESTORE] Loaded', chatHistory.messages.length, 'messages from ChatHistory');
        }
      }

      // Fetch and restore FamilyProfile
      let restoredProfile = null;
      if (chatSession.familyProfileId) {
        restoredProfile = await base44.entities.FamilyProfile.get(chatSession.familyProfileId);
        if (restoredProfile) {
          setFamilyProfile(restoredProfile);
          console.log('[RESTORE] Loaded FamilyProfile for:', restoredProfile.childName);
        }
      } else {
        // Fallback: create profile data from ChatSession
        restoredProfile = {
          childName: chatSession.childName,
          childGrade: chatSession.childGrade,
          locationArea: chatSession.locationArea,
          maxTuition: chatSession.maxTuition,
          priorities: chatSession.priorities || [],
          learningDifferences: chatSession.learningDifferences || []
        };
        setFamilyProfile(restoredProfile);
        console.log('[RESTORE] Using ChatSession data as FamilyProfile fallback');
      }

      // FIX #1: Parse stored school IDs from ChatSession.matchedSchools, fallback to searchSchools
      let restoredSchools = [];
      try {
        // Try to parse matchedSchools JSON string
        let schoolIds = [];
        const matchedSchoolsRaw = chatSession.matchedSchools;
        console.log('[RESTORE] matchedSchools raw value:', matchedSchoolsRaw);
        console.log('[RESTORE] matchedSchools type:', typeof matchedSchoolsRaw);
        
        try {
          schoolIds = JSON.parse(chatSession.matchedSchools || '[]');
          console.log('[RESTORE] Successfully parsed matchedSchools:', JSON.stringify(schoolIds));
        } catch (parseErr) {
          console.error('[RESTORE] Failed to parse matchedSchools JSON:', parseErr);
          schoolIds = [];
        }
        
        if (Array.isArray(schoolIds) && schoolIds.length > 0) {
          console.log('[RESTORE] Parsed', schoolIds.length, 'school IDs from matchedSchools');
          // IDs exist but School.get() may fail with hex IDs, so skip and use fallback
        }
        
        // Fallback: use searchSchools with saved profile data
        if (schoolIds.length === 0 || !restoredSchools.length) {
          console.log('[RESTORE] Falling back to searchSchools with profile data');
          const cityName = chatSession.locationArea 
            ? chatSession.locationArea.split(' ').pop() 
            : undefined;
          
          const searchParams = {
            city: cityName,
            minGrade: chatSession.childGrade,
            maxTuition: chatSession.maxTuition,
            limit: 20
          };
          
          console.log('[RESTORE] searchSchools params:', JSON.stringify(searchParams));
          const searchResponse = await base44.functions.invoke('searchSchools', searchParams);
          console.log('[RESTORE] searchSchools response:', searchResponse);
          console.log('[RESTORE] searchSchools response.data type:', typeof searchResponse.data);
          console.log('[RESTORE] searchSchools response.data length:', searchResponse.data?.length);
          restoredSchools = searchResponse.data || [];
          console.log('[RESTORE] setSchools will be called with', restoredSchools.length, 'schools');
          if (restoredSchools.length > 0) {
            console.log('[RESTORE] First school:', restoredSchools[0].name);
          }
        }
      } catch (e) {
        console.error('[RESTORE] Failed to restore schools:', e);
      }

      // CRITICAL: Batch state updates AFTER searchSchools completes to force UI to RESULTS phase
      // Set schools FIRST so isIntakePhase sees schools.length > 0
      console.log('[RESTORE] Setting RESULTS state with', restoredSchools.length, 'schools');
      setSchools(restoredSchools);
      setCurrentView('schools');
      setOnboardingPhase(STATES.RESULTS);
      
      // Set currentConversation with RESULTS state in context
      if (chatHistory) {
        const restoredContext = {
          ...(chatHistory.conversationContext || {}),
          state: STATES.RESULTS,
          schools: restoredSchools
        };
        setCurrentConversation({
          ...chatHistory,
          conversationContext: restoredContext
        });
        console.log('[RESTORE] setCurrentConversation with state: RESULTS, schools:', restoredSchools.length);
      }

      // Also explicitly set schools state to ensure grid renders
      if (restoredSchools.length > 0) {
        console.log('[RESTORE] Schools set in state:', restoredSchools.length, 'items');
      } else {
        console.warn('[RESTORE] No schools restored - grid will be empty');
      }

      // Load shortlist from user if authenticated
      if (isAuthenticated && user) {
        await loadShortlist(user);
        console.log('[RESTORE] Loaded shortlist for user:', user.email);
      }

      // Add welcome-back message
      const childName = chatSession.childName || 'your child';
      const welcomeMsg = {
        role: 'assistant',
        content: `Welcome back! I see we were exploring schools for ${childName}. Want to pick up where we left off or update anything?`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, welcomeMsg]);
      console.log('[RESTORE] Added welcome-back message');

      setSessionRestored(true);
    } catch (error) {
      console.error('Failed to restore session:', error);
      setSessionRestored(true);
    } finally {
      // FIX #2: Clear restoration flag after state is fully set
      isRestoringSessionRef.current = false;
      setRestoringSession(false);
    }
  };

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

  const handleRestoreGuestSession = () => {
    restoreGuestSession(isAuthenticated, user, currentConversation, setMessages, setSelectedConsultant, setCurrentConversation, base44);
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
        await loadShortlist(userData);
      } else {
        // For guest users, check localStorage for balance
        const guestBalance = parseInt(localStorage.getItem('guestTokenBalance') || '100');
        setTokenBalance(guestBalance);
        
        // Show welcome message
        const greeting = {
          role: 'assistant',
          content: DEFAULT_GREETING,
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

  const loadShortlist = async (userDataOrId) => {
    try {
      // Accept either a user object (with .shortlist) or fall back to current user state
      const userData = typeof userDataOrId === 'object' && userDataOrId !== null ? userDataOrId : user;
      const shortlistIds = userData?.shortlist || [];
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
    trackEvent('consultant_selected');

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
        content: DEFAULT_GREETING,
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
      setCurrentView(stateToView(conversationState));
    }
    setSchools(convo.conversationContext?.schools || []);
    // BUG-DD-001 FIX: Only clear selectedSchool if NOT in DEEP_DIVE state
    if (convo.conversationContext?.state !== STATES.DEEP_DIVE) {
      setSelectedSchool(null);
    }
  };

  const handleBackToResults = async () => {
    setSelectedSchool(null);
    setCurrentView('schools');
    if (currentConversation) {
      const updatedContext = {
        ...currentConversation.conversationContext,
        state: STATES.RESULTS,
        selectedSchoolId: null,
      };
      setCurrentConversation(prevConvo => ({
        ...prevConvo,
        conversationContext: updatedContext,
      }));
      if (currentConversation.id) {
        await base44.entities.ChatHistory.update(currentConversation.id, {
          conversationContext: updatedContext,
        });
      }
    }
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
    trackEvent('message_sent');
    // SOFT LOGIN GATE: Check if user is confirming the Brief without being logged in
    const isBriefConfirmation = messageText === '__CONFIRM_BRIEF__' ||
                                 messageText.toLowerCase().includes("that's right") || 
                                 messageText.toLowerCase().includes("let's see the schools") ||
                                 messageText.toLowerCase().includes("see the schools") ||
                                 messageText.toLowerCase().includes("that looks right") ||
                                 messageText.toLowerCase().includes("show me schools");

    // BUG-BRIEF-DUPE: Immediately lock briefStatus to confirmed so chips disappear before response arrives
    if (messageText === '__CONFIRM_BRIEF__') {
      setBriefStatus('confirmed');
    }
    
    if (isBriefConfirmation && !isAuthenticated && !isDevMode) {
      // Save current conversation data to localStorage before showing gate
      localStorage.setItem('guestConversationData', JSON.stringify({
        messages,
        consultant: selectedConsultant,
        conversationContext: currentConversation?.conversationContext || {},
        familyProfile: familyProfile || {},
        briefStatus: briefStatus || null,
        extractedEntitiesData: extractedEntitiesData || {},
        sessionId
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
      
      // WC6: Build returning user context if session was restored
      let returningUserContext = null;
      if (restoredSessionData && familyProfile) {
        const shortlistedSchoolNames = shortlistData.map(s => s.name).slice(0, 5);
        const lastActive = restoredSessionData.updatedDate 
          ? new Date(restoredSessionData.updatedDate).toLocaleDateString()
          : null;
        
        returningUserContext = {
          isReturningUser: true,
          childName: familyProfile.childName,
          childGrade: familyProfile.childGrade,
          location: familyProfile.locationArea,
          budget: familyProfile.maxTuition ? `$${familyProfile.maxTuition.toLocaleString()}` : null,
          priorities: familyProfile.priorities?.join(', ') || null,
          matchedSchoolsCount: restoredSessionData.matchedSchoolsCount || 0,
          shortlistedSchools: shortlistedSchoolNames,
          lastActive: lastActive,
          profileName: restoredSessionData.profileName,
          consultantName: restoredSessionData.consultantName
        };
      }

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
        selectedSchoolId: explicitSchoolId || selectedSchool?.id || null,
        returningUserContext
      });

      // T043: Update familyProfile live from orchestration response
      if (response.data.familyProfile) {
        setFamilyProfile(response.data.familyProfile);
      }

      // Store extractedEntities from response for FamilyBrief fallback display
      if (response.data.extractedEntities) {
        setExtractedEntitiesData(response.data.extractedEntities);
        console.log('[BUDGET FIX] Stored extractedEntities:', response.data.extractedEntities);
      }

      // T047: If matches were auto-refreshed, bump animation key to trigger fade/reorder
      if (response.data.conversationContext?.autoRefreshed === true) {
        setSchoolsAnimKey(k => k + 1);
      }

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
        setCurrentView(stateToView(response.data.state));
      } else if (isViewingSchoolDetail) {
        console.log('[BUG-DD-001] Maintaining detail view - school selected:', selectedSchool?.name);
        // Keep view locked to detail as long as selectedSchool is set
      }
      
      // Use the same guard for schools display logic
      const isDeepDivingSchool = isViewingSchoolDetail;
      
      // FIX #3: First priority - if schools are returned, display them (ONLY if not in DEEP_DIVE)
      if (response.data.schools && response.data.schools.length > 0 && !isDeepDivingSchool) {
        // Track schools shown
        trackEvent('schools_shown', { metadata: { schoolCount: response.data.schools.length } });

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

        // Auto-populate shortlist for new users with no saved favorites
        if (isAuthenticated && user && !hasAutoPopulatedShortlist.current) {
          const currentShortlist = user.shortlist || [];
          if (currentShortlist.length === 0) {
            const topIds = finalOrderedSchools.slice(0, 5).map(s => s.id);
            if (topIds.length > 0) {
              hasAutoPopulatedShortlist.current = true;
              await base44.auth.updateMe({ shortlist: topIds });
              setUser(prev => ({ ...prev, shortlist: topIds }));
              await loadShortlist({ ...user, shortlist: topIds });
            }
          }
        }
        // BUG-DD-001 FIX: View switching handled in state mapping logic above
      }

      // Create ChatSession when brief is confirmed and transitioning to RESULTS
      if (response.data.state === STATES.RESULTS) {
        try {
          const matchedSchoolIds = response.data.schools ? response.data.schools.map(s => s.id) : [];
          const profileForSession = response.data.familyProfile || familyProfile;
          const profileName = profileForSession?.childName 
            ? `${profileForSession.childName}'s School Search Profile`
            : 'School Search Profile';
          
          const chatSession = await base44.entities.ChatSession.create({
            sessionToken: sessionId,
            userId: user?.id,
            familyProfileId: profileForSession?.id || null,
            chatHistoryId: currentConversation?.id,
            status: 'active',
            consultantSelected: selectedConsultant,
            childName: profileForSession?.childName,
            childGrade: profileForSession?.childGrade,
            locationArea: profileForSession?.locationArea,
            maxTuition: profileForSession?.maxTuition,
            priorities: profileForSession?.priorities,
            matchedSchools: JSON.stringify(matchedSchoolIds),
            profileName
          });
          
          // Update URL with entity id (not sessionToken)
          if (chatSession?.id) {
            const newUrl = createPageUrl(`Consultant?sessionId=${chatSession.id}`);
            window.history.replaceState({}, document.title, newUrl);
            console.log('[SESSION] Created ChatSession with id:', chatSession.id);
          }
        } catch (sessionError) {
          console.error('Failed to create ChatSession:', sessionError);
        }
      }

      // KI-52: Brief content validator — swap thin LLM brief for programmatic fallback
      // DOUBLE-BRIEF FIX: Only apply when the RESPONSE state is also BRIEF (not when transitioning to RESULTS)
      let aiMessageContent = response.data.message;
      if (response.data.state === STATES.BRIEF) {
        const latestProfile = response.data.familyProfile || familyProfile;
        if (!validateBriefContent(aiMessageContent)) {
          const fallback = generateProgrammaticBrief(latestProfile);
          if (fallback) {
            console.warn('[KI-52] Brief failed validation — using programmatic fallback');
            aiMessageContent = fallback;
          }
        }
      }

      const aiMessage = {
        role: 'assistant',
        content: aiMessageContent,
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

       // Save AI memories with deduplication and filtering
       if (isAuthenticated && user) {
         await extractAndSaveMemories(messageText, response.data.message, user, base44);
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
      trackEvent('school_clicked', { metadata: { schoolName: school.name } });
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

  // T047: No manual refresh handler needed — matches auto-refresh on entity extraction

  // Open full-screen comparison view and update conversationContext with compared school names
  const handleOpenComparison = async (comparedSchools) => {
    setComparisonData(comparedSchools);
    setCurrentView('comparison');
    // Update conversationContext so chat AI knows which schools are being compared
    const updatedContext = {
      ...(currentConversation?.conversationContext || {}),
      comparingSchools: comparedSchools.map(s => s.name),
    };
    setCurrentConversation(prev => prev ? { ...prev, conversationContext: updatedContext } : prev);
    if (currentConversation?.id) {
      await base44.entities.ChatHistory.update(currentConversation.id, {
        conversationContext: updatedContext,
      });
    }
    // Trigger narration
    handleNarrateComparison(comparedSchools);
  };

  // T-SL-005: AI-narrated comparison synthesis
  const handleNarrateComparison = async (comparedSchools) => {
    const isJackie = selectedConsultant === 'Jackie';
    const persona = isJackie
      ? 'You are Jackie, a warm and empathetic private school consultant. Speak naturally, like a trusted advisor.'
      : 'You are Liam, a direct and analytical private school consultant. Speak concisely and clearly.';

    const briefSummary = familyProfile ? [
      familyProfile.priorities?.length ? `Priorities: ${familyProfile.priorities.join(', ')}` : '',
      familyProfile.maxTuition ? `Budget: up to $${familyProfile.maxTuition.toLocaleString()}` : '',
      familyProfile.locationArea ? `Location: ${familyProfile.locationArea}` : '',
      familyProfile.learningDifferences?.length ? `Learning needs: ${familyProfile.learningDifferences.join(', ')}` : '',
      familyProfile.boardingPreference ? `Boarding preference: ${familyProfile.boardingPreference}` : '',
    ].filter(Boolean).join('. ') : '';

    const schoolSummaries = comparedSchools.map(s => {
      const tuition = s.dayTuition ?? s.tuition;
      return [
        `School: ${s.name}`,
        s.city ? `City: ${s.city}` : '',
        s.distanceKm != null ? `Distance: ${s.distanceKm.toFixed(1)} km` : '',
        tuition ? `Tuition: $${tuition.toLocaleString()} ${s.currency || ''}` : '',
        s.curriculumType ? `Curriculum: ${s.curriculumType}` : '',
        s.genderPolicy ? `Gender: ${s.genderPolicy}` : '',
        s.boardingAvailable != null ? `Boarding: ${s.boardingAvailable ? 'Yes' : 'No'}` : '',
        s.avgClassSize ? `Avg class size: ${s.avgClassSize}` : '',
        s.specializations?.length ? `Specializations: ${s.specializations.join(', ')}` : '',
        s.highlights?.length ? `Highlights: ${s.highlights.slice(0, 2).join('; ')}` : '',
      ].filter(Boolean).join(', ');
    }).join('\n');

    const prompt = `${persona}

A parent is comparing these ${comparedSchools.length} schools:
${schoolSummaries}

Family brief context: ${briefSummary || 'Not provided'}

Write a SHORT (3–5 sentence) synthesis paragraph comparing these schools for this specific family. 
- Highlight the most meaningful differences
- Call out tradeoffs relevant to their priorities/budget
- End with a practical suggestion or question
- Do NOT use bullet points. Write as flowing conversational prose.
- Do NOT repeat the school names in a list. Weave them naturally into the narrative.`;

    // Inject a loading placeholder first
    const loadingMsg = {
      role: 'assistant',
      content: '...',
      timestamp: new Date().toISOString(),
      isNudge: true,
    };
    setMessages(prev => [...prev, loadingMsg]);

    try {
      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      setMessages(prev => {
        const updated = [...prev];
        // Replace the last loading message with the real synthesis
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].content === '...') {
            updated[i] = { ...updated[i], content: result };
            break;
          }
        }
        return updated;
      });
    } catch (e) {
      console.error('Comparison synthesis failed:', e);
      setMessages(prev => prev.filter(m => m.content !== '...'));
    }
  };

  // T-SL-004: Shortlist nudge — injects a consultant message for shortlist state changes
  const injectShortlistNudge = (nudgeText) => {
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: nudgeText,
      timestamp: new Date().toISOString(),
      isNudge: true,
    }]);
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
      const school = schools.find(s => s.id === schoolId) || shortlistData.find(s => s.id === schoolId);
      const isRemoving = currentShortlist.includes(schoolId);
      
      if (isRemoving) {
        updatedShortlist = currentShortlist.filter(id => id !== schoolId);
      } else {
        updatedShortlist = [...currentShortlist, schoolId];
        trackEvent('shortlisted', { metadata: { schoolName: school?.name } });
      }
      
      await base44.auth.updateMe({ shortlist: updatedShortlist });
      setUser({ ...user, shortlist: updatedShortlist });
      await loadShortlist(user.id);

      // T-SL-004: Determine nudge (max 1 per action, only in RESULTS state)
      if (currentState === STATES.RESULTS) {
        const nudge = getShortlistNudge({
          isRemoving,
          newCount: updatedShortlist.length,
          isJackie: selectedConsultant === 'Jackie',
          school,
          familyProfile,
          shortlistData: shortlistData.filter(s => updatedShortlist.includes(s.id)),
          schools
        });
        
        if (nudge) {
          injectShortlistNudge(nudge);
        }
      }
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

  // Shared ChatPanel props for intake + results phases
  const chatPanelProps = {
    ref: inputRef,
    messages,
    schools,
    selectedConsultant,
    currentState,
    briefStatus,
    isTyping,
    tokenBalance,
    isPremium,
    loadingStage,
    loadingStages,
    feedbackPromptShown,
    showResponseChips,
    familyProfile,
    onSendMessage: handleSendMessage,
    onViewSchoolDetail: (school) => {
      setSelectedSchool(school);
      setCurrentView('detail');
    },
    onConfirmDeepDive: handleConfirmDeepDive,
    onCancelDeepDive: handleCancelDeepDive,
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

  // Show loading spinner while restoring session from URL param
  if (sessionIdParam && !sessionRestored && restoringSession) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show consultant selection if not yet selected (but skip if restoring a session from URL)
  if (!selectedConsultant && !sessionIdParam) {
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

  // If sessionId is in URL but consultant not yet selected, show loading spinner while restoration completes
  if (!selectedConsultant && sessionIdParam) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
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

      {(isIntakePhase && !showSchoolGrid) ? (
         /* INTAKE PHASE - Centered Layout */
         <div id="main-content" className="flex-1 flex bg-[#1E1E2E] overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-2 sm:p-4">
            <div className="w-full max-w-2xl h-full max-h-[95vh] sm:max-h-[90vh] bg-[#2A2A3D] rounded-xl sm:rounded-2xl shadow-2xl flex flex-col transition-all duration-400">
              <ChatPanel
                {...chatPanelProps}
                variant="intake"
                heroContent={
                  currentState === STATES.WELCOME ? (
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

          {/* T046: Right rail + sliding panel — intake phase */}
          {activePanel === 'brief' && (
            <FamilyBrief
              familyProfile={familyProfile}
              consultantName={selectedConsultant}
              onClose={() => setActivePanel(null)}
              extractedEntities={extractedEntitiesData}
            />
          )}
          <IconRail
            currentState={currentState}
            activePanel={activePanel}
            onTogglePanel={(panel) => setActivePanel(p => p === panel ? null : panel)}
          />
        </div>
      ) : (
        /* RESULTS PHASE - Split Layout */
        <div className="flex-1 flex flex-row overflow-hidden relative transition-all duration-400 pb-0">
        {/* Mobile tab toggle */}
        <div className="lg:hidden flex border-b bg-white" style={{ display: 'none' }}>
          {/* hidden — mobile uses mobileView state below */}
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

        {/* CENTER CONTENT AREA */}
        <main
          className="overflow-y-auto bg-white transition-all duration-200 ease-out"
          style={{
            flex: 1,
            minWidth: 0,
            animation: isTransitioning ? 'slideInFromLeft 420ms cubic-bezier(0.22,1,0.36,1) both' : undefined,
          }}
        >


          {comparisonData ? (
            <ComparisonView
              schools={comparisonData}
              familyProfile={familyProfile}
              onBack={() => {
                setComparisonData(null);
                setCurrentView('schools');
                // Clear comparingSchools from context
                const updatedContext = { ...(currentConversation?.conversationContext || {}) };
                delete updatedContext.comparingSchools;
                setCurrentConversation(prev => prev ? { ...prev, conversationContext: updatedContext } : prev);
              }}
            />
          ) : currentView === 'detail' && selectedSchool ? (
            <SchoolDetailPanel
              school={selectedSchool}
              familyProfile={familyProfile}
              onBack={() => {
                setSelectedSchool(null);
                setCurrentView('schools');
              }}
              onToggleShortlist={handleToggleShortlist}
              isShortlisted={user?.shortlist?.includes(selectedSchool.id) || false}
            />
          ) : currentState === STATES.RESULTS && schools.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
              <div className="max-w-md">
                <div className="text-6xl mb-4">🔍</div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">No schools matched your criteria</h2>
                <p className="text-slate-600 mb-6">Try broadening your search with one of these suggestions:</p>
                <div className="space-y-2 text-left">
                  <button 
                    onClick={() => handleSendMessage("Can you show me schools with a higher budget?")}
                    className="w-full p-3 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg text-sm font-medium transition-colors text-left"
                  >
                    • Increase your budget range
                  </button>
                  <button 
                    onClick={() => handleSendMessage("What schools are available in nearby areas?")}
                    className="w-full p-3 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg text-sm font-medium transition-colors text-left"
                  >
                    • Search in nearby cities
                  </button>
                  <button 
                    onClick={() => handleSendMessage("Show me schools without my priority filters")}
                    className="w-full p-3 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg text-sm font-medium transition-colors text-left"
                  >
                    • Relax your priority filters
                  </button>
                  <button 
                    onClick={() => handleSendMessage("What grade levels are available?")}
                    className="w-full p-3 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg text-sm font-medium transition-colors text-left"
                  >
                    • Adjust grade level
                  </button>
                </div>
              </div>
              </div>
              ) : (currentState === STATES.RESULTS || showSchoolGrid) && schools.length > 0 ? (
            <div className="h-full flex flex-col animate-fadeIn">
              <div className="p-3 sm:p-4 border-b flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900">
                    Results ({filteredSchools.length})
                  </h2>
                </div>
                <SortControl sortMode={sortMode} onSortChange={setSortMode} />
              </div>
              <div className="flex-1 overflow-auto p-3 sm:p-4">
                <SchoolGrid
                key={`${schoolsAnimKey}-${sortMode}-${JSON.stringify(priorityOverrides)}`}
                schools={filteredSchools}
                tieredSchools={buildTiers(filteredSchools, familyProfile, sortMode, priorityOverrides)}
                onViewDetails={handleViewSchoolDetail}
                onToggleShortlist={handleToggleShortlist}
                shortlistedIds={user?.shortlist || []}
                shortlistedSchools={shortlistData}
                showDistances={showDistances}
                isLoading={isTyping && schools.length === 0}
                accentColor={selectedConsultant === 'Jackie' ? '#C27B8A' : '#6B9DAD'}
                familyProfile={familyProfile}
                priorityOverrides={priorityOverrides}
                onPriorityToggle={handlePriorityToggle}
                onNarrateComparison={handleNarrateComparison}
                onOpenComparison={handleOpenComparison}
                />
              </div>
            </div>
          ) : null}

          

        </main>

        {/* T046: Sliding Brief/Shortlist panel */}
        {activePanel === 'brief' && (
          <div
            className="flex-shrink-0 h-full overflow-hidden"
            style={{
              width: 320,
              animation: 'slideInFromRight 200ms ease-out',
            }}
          >
            <FamilyBrief
              familyProfile={familyProfile}
              consultantName={selectedConsultant}
              onClose={() => setActivePanel(null)}
              extractedEntities={extractedEntitiesData}
            />
          </div>
        )}
        {activePanel === 'shortlist' && (
          <div
            className="flex-shrink-0 h-full overflow-hidden"
            style={{
              width: 320,
              animation: 'slideInFromRight 200ms ease-out',
              background: '#1A1A2A',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <ShortlistPanel
              shortlist={shortlistData}
              onClose={() => setActivePanel(null)}
              onRemove={handleToggleShortlist}
              familyProfile={familyProfile}
              onViewSchool={(id) => {
                handleViewSchoolDetail(id);
                setActivePanel(null);
              }}
            />
          </div>
        )}

        {/* T046: Right-side Icon Rail */}
        <IconRail
          currentState={currentState}
          activePanel={activePanel}
          onTogglePanel={(panel) => setActivePanel(p => p === panel ? null : panel)}
        />

        {/* RIGHT CHAT PANEL */}
        <aside
          className="bg-[#2A2A3D] border-l border-white/10 flex flex-col relative flex-shrink-0"
          style={{
            width: 450,
            transition: 'width 420ms cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <ChatPanel
            {...chatPanelProps}
            variant="sidebar"
            confirmingSchool={confirmingSchool}
            showNewMessageIndicator={showNewMessageIndicator}
            onScrollDownClick={handleScrollDownClick}
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
          childName={familyProfile?.childName || 'your child'}
          onClose={() => setShowLoginGate(false)}
        />
      )}

      {/* T046: Panel rendered inline in layout, no overlay needed */}
    </div>
  );
}