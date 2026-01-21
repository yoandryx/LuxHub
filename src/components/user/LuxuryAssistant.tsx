// src/components/user/LuxuryAssistant.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/LuxuryAssistant.module.css';
import {
  FaArrowUp,
  FaTimes,
  FaTrash,
  FaUser,
  FaStore,
  FaShieldAlt,
  FaWallet,
} from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi2';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: number;
}

interface UserContext {
  role: 'buyer' | 'vendor' | 'admin' | 'guest';
  wallet: string | null;
}

interface QuickAction {
  label: string;
  prompt: string;
}

const STORAGE_KEY = 'luxhub_assistant_history';
const MAX_STORED_MESSAGES = 50;

// Page detection mapping
type PageType =
  | 'home'
  | 'marketplace'
  | 'pools'
  | 'nft-detail'
  | 'seller-dashboard'
  | 'admin-dashboard'
  | 'my-offers'
  | 'create-nft'
  | 'profile'
  | 'learn-more'
  | 'other';

const getPageType = (pathname: string): PageType => {
  if (pathname === '/' || pathname === '/index') return 'home';
  if (pathname === '/watchMarket' || pathname === '/marketplace') return 'marketplace';
  if (pathname.startsWith('/pools') || pathname === '/bagsPoolsPage') return 'pools';
  if (pathname.startsWith('/nft/') || pathname.startsWith('/asset/')) return 'nft-detail';
  if (pathname === '/sellerDashboard' || pathname === '/vendorDashboard') return 'seller-dashboard';
  if (pathname === '/adminDashboard' || pathname === '/admin') return 'admin-dashboard';
  if (pathname === '/myOffers' || pathname === '/offers') return 'my-offers';
  if (pathname === '/createNFT' || pathname === '/mint') return 'create-nft';
  if (pathname === '/profile' || pathname.startsWith('/user/')) return 'profile';
  if (pathname === '/learnMore' || pathname === '/about') return 'learn-more';
  return 'other';
};

const getPageLabel = (pageType: PageType): string => {
  const labels: Record<PageType, string> = {
    home: 'Home',
    marketplace: 'Marketplace',
    pools: 'Pools',
    'nft-detail': 'Item Details',
    'seller-dashboard': 'Seller Dashboard',
    'admin-dashboard': 'Admin Dashboard',
    'my-offers': 'My Offers',
    'create-nft': 'Create NFT',
    profile: 'Profile',
    'learn-more': 'Learn More',
    other: 'LuxHub',
  };
  return labels[pageType];
};

// Page-specific quick actions (take priority)
const pageQuickActions: Record<PageType, QuickAction[]> = {
  home: [
    { label: 'Explore Market', prompt: "What's currently trending on the marketplace?" },
    { label: 'How It Works', prompt: 'How does LuxHub work? Give me a quick overview.' },
    { label: 'Get Started', prompt: "I'm new here. What should I do first?" },
  ],
  marketplace: [
    { label: "What's Hot?", prompt: 'What luxury items are trending right now?' },
    { label: 'Make an Offer', prompt: 'How do I make an offer on an item I like?' },
    { label: 'Price Check', prompt: 'How can I tell if an item is priced fairly?' },
  ],
  pools: [
    { label: 'How Pools Work', prompt: 'How do fractional ownership pools work on LuxHub?' },
    { label: 'ROI Explained', prompt: 'How is ROI calculated for pools? When do I get paid?' },
    { label: 'Pool Risks', prompt: 'What are the risks of investing in a pool?' },
  ],
  'nft-detail': [
    { label: 'Fair Price?', prompt: 'How can I tell if this item is priced fairly?' },
    { label: 'Make Offer', prompt: 'What should I consider before making an offer?' },
    { label: 'Verify Auth', prompt: 'How is the authenticity of this item verified?' },
  ],
  'seller-dashboard': [
    { label: 'View Offers', prompt: 'How do I see and respond to offers on my listings?' },
    { label: 'Pricing Tips', prompt: 'Any tips for pricing my luxury items competitively?' },
    { label: 'Ship Item', prompt: 'How do I update tracking info after a sale?' },
  ],
  'admin-dashboard': [
    { label: 'Verify Shipment', prompt: 'How do I verify a shipment has been delivered?' },
    { label: 'Pool Lifecycle', prompt: 'Walk me through the pool lifecycle stages.' },
    { label: 'Squads Proposal', prompt: 'How do I create a Squads multisig proposal?' },
  ],
  'my-offers': [
    { label: 'Offer Status', prompt: 'What do the different offer statuses mean?' },
    { label: 'Counter Tips', prompt: 'How should I respond to a counter-offer?' },
    { label: 'Withdraw Offer', prompt: 'How do I withdraw an offer I made?' },
  ],
  'create-nft': [
    { label: 'Mint Steps', prompt: 'Walk me through the NFT minting process.' },
    { label: 'Best Photos', prompt: 'What makes a good listing photo for luxury items?' },
    { label: 'Set Price', prompt: 'How should I price my item for the best results?' },
  ],
  profile: [
    { label: 'Edit Profile', prompt: 'How do I update my profile information?' },
    { label: 'My History', prompt: 'Where can I see my transaction history?' },
    { label: 'Link Wallet', prompt: 'How do I link additional wallets to my account?' },
  ],
  'learn-more': [
    { label: 'How It Works', prompt: 'Give me a complete overview of how LuxHub works.' },
    { label: 'Escrow Safety', prompt: 'How does the escrow system protect me?' },
    { label: 'Fees', prompt: 'What are the fees on LuxHub?' },
  ],
  other: [
    { label: 'Help', prompt: 'What can you help me with?' },
    { label: 'Navigate', prompt: 'How do I navigate around LuxHub?' },
    { label: 'Contact', prompt: 'How do I get support if I have an issue?' },
  ],
};

// Role-based fallback actions (used when page actions don't apply)
const roleQuickActions: Record<UserContext['role'], QuickAction[]> = {
  guest: [
    { label: 'What is LuxHub?', prompt: 'What is LuxHub and how does it work?' },
    { label: 'Connect Wallet', prompt: 'How do I connect my Solana wallet?' },
    { label: 'Browse Items', prompt: 'Can I browse items without a wallet?' },
  ],
  buyer: [
    { label: 'Make Offer', prompt: 'How do I make an offer on an item?' },
    { label: 'Pool Investing', prompt: 'How do fractional ownership pools work?' },
    { label: 'Track Order', prompt: 'How can I track my purchase shipment?' },
  ],
  vendor: [
    { label: 'List Item', prompt: 'How do I list a new luxury item for sale?' },
    { label: 'View Offers', prompt: 'Where can I see offers on my listings?' },
    { label: 'Pricing Tips', prompt: 'Any tips for pricing my luxury items?' },
  ],
  admin: [
    { label: 'Verify Shipment', prompt: 'How do I verify a shipment delivery?' },
    { label: 'Pool Management', prompt: 'How do I manage pool lifecycles?' },
    { label: 'Squads Proposals', prompt: 'How do I create a Squads multisig proposal?' },
  ],
};

const roleConfig = {
  guest: { icon: FaWallet, label: 'Guest', color: '#666666' },
  buyer: { icon: FaUser, label: 'Buyer', color: '#4ade80' },
  vendor: { icon: FaStore, label: 'Vendor', color: '#c8a1ff' },
  admin: { icon: FaShieldAlt, label: 'Admin', color: '#f59e0b' },
};

const LuxuryAssistant = () => {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [userContext, setUserContext] = useState<UserContext>({ role: 'guest', wallet: null });
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Detect current page
  const currentPage = useMemo(() => getPageType(router.pathname), [router.pathname]);
  const pageLabel = useMemo(() => getPageLabel(currentPage), [currentPage]);

  // Get contextual quick actions (page-specific first, then role-based)
  const currentQuickActions = useMemo(() => {
    // For guests, always show guest actions
    if (userContext.role === 'guest') {
      return roleQuickActions.guest;
    }

    // Use page-specific actions
    const pageActions = pageQuickActions[currentPage];

    // For admin/vendor on their dashboards, use role actions
    if (currentPage === 'admin-dashboard' && userContext.role === 'admin') {
      return pageActions;
    }
    if (currentPage === 'seller-dashboard' && userContext.role === 'vendor') {
      return pageActions;
    }

    // Otherwise use page actions
    return pageActions;
  }, [currentPage, userContext.role]);

  // Load conversation history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setMessages(parsed.slice(-MAX_STORED_MESSAGES));
        }
      }
    } catch (e) {
      console.error('Failed to load chat history:', e);
    }
  }, []);

  // Save conversation history to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
      } catch (e) {
        console.error('Failed to save chat history:', e);
      }
    }
  }, [messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when chat opens
  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
    }
  }, [visible]);

  // Show quick actions again when page changes
  useEffect(() => {
    if (messages.length === 0) {
      setShowQuickActions(true);
    }
  }, [currentPage, messages.length]);

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const sendMessage = useCallback(
    async (messageText?: string) => {
      const text = messageText || input.trim();
      if (!text) return;

      const userMessage: Message = {
        id: generateId(),
        sender: 'user',
        text,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setLoading(true);
      setShowQuickActions(false);

      try {
        const res = await fetch('/api/users/luxury-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            wallet: publicKey?.toBase58() || null,
            conversationHistory: messages.slice(-10),
            currentPage: currentPage,
            pageLabel: pageLabel,
          }),
        });

        const data = await res.json();

        if (data.error) {
          throw new Error(data.error);
        }

        const botMessage: Message = {
          id: generateId(),
          sender: 'bot',
          text: data.reply,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, botMessage]);

        // Update user context from response
        if (data.context) {
          setUserContext(data.context);
        }
      } catch (error: any) {
        console.error('Error:', error);
        const errorMessage: Message = {
          id: generateId(),
          sender: 'bot',
          text: error.message || 'Sorry, I encountered an error. Please try again.',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setLoading(false);
      }
    },
    [input, publicKey, messages, currentPage, pageLabel]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearHistory = () => {
    setMessages([]);
    setShowQuickActions(true);
    localStorage.removeItem(STORAGE_KEY);
  };

  const RoleIcon = roleConfig[userContext.role].icon;

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        className={`${styles.floatingButton} ${visible ? styles.active : ''}`}
        onClick={() => setVisible(!visible)}
        aria-label={visible ? 'Close assistant' : 'Open assistant'}
      >
        {visible ? (
          <FaTimes className={styles.toggleIcon} />
        ) : (
          <>
            <HiSparkles className={styles.sparkleIcon} />
            <img src="/images/purpleLGG.png" alt="LuxHub" className={styles.logo} />
          </>
        )}
      </button>

      {/* Chat Panel */}
      {visible && (
        <div className={styles.chatPanel}>
          {/* Holographic shine effect */}
          <div className={styles.holoShine} />

          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <HiSparkles className={styles.headerIcon} />
              <div className={styles.headerText}>
                <span className={styles.headerTitle}>Luxury</span>
                <span className={styles.headerSubtitle}>AI Concierge</span>
              </div>
            </div>
            <div className={styles.headerRight}>
              <div
                className={styles.roleBadge}
                style={{ borderColor: roleConfig[userContext.role].color }}
              >
                <RoleIcon style={{ color: roleConfig[userContext.role].color }} />
                <span>{roleConfig[userContext.role].label}</span>
              </div>
              {messages.length > 0 && (
                <button
                  className={styles.clearButton}
                  onClick={clearHistory}
                  aria-label="Clear chat history"
                  title="Clear history"
                >
                  <FaTrash />
                </button>
              )}
            </div>
          </div>

          {/* Page Context Indicator */}
          <div className={styles.pageContext}>
            <span className={styles.pageContextLabel}>Viewing:</span>
            <span className={styles.pageContextValue}>{pageLabel}</span>
          </div>

          {/* Messages Area */}
          <div className={styles.messagesContainer}>
            {messages.length === 0 && (
              <div className={styles.welcomeMessage}>
                <HiSparkles className={styles.welcomeIcon} />
                <h3>Welcome to LuxHub</h3>
                <p>
                  {userContext.role === 'guest'
                    ? 'Connect your wallet to unlock personalized assistance.'
                    : `How can I help you with ${pageLabel}?`}
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`${styles.message} ${styles[msg.sender]}`}>
                <div className={styles.messageContent}>{msg.text}</div>
              </div>
            ))}

            {loading && (
              <div className={`${styles.message} ${styles.bot}`}>
                <div className={styles.typingIndicator}>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {showQuickActions && (
            <div className={styles.quickActions}>
              {currentQuickActions.map((action, idx) => (
                <button
                  key={idx}
                  className={styles.quickActionBtn}
                  onClick={() => sendMessage(action.prompt)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div className={styles.inputArea}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask about ${pageLabel}...`}
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className={styles.sendButton}
              aria-label="Send message"
            >
              <FaArrowUp />
            </button>
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <span>Powered by Grok</span>
            <span className={styles.footerDot}>·</span>
            <span>LuxHub AI</span>
          </div>
        </div>
      )}
    </>
  );
};

export default LuxuryAssistant;
