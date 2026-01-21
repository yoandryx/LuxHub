// src/components/user/LuxuryAssistant.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

const STORAGE_KEY = 'luxhub_assistant_history';
const MAX_STORED_MESSAGES = 50;

const quickActions = {
  guest: [
    { label: 'How do I start?', prompt: 'How do I get started on LuxHub?' },
    { label: 'What is LuxHub?', prompt: 'What is LuxHub and how does it work?' },
    { label: 'Connect Wallet', prompt: 'How do I connect my Solana wallet?' },
  ],
  buyer: [
    { label: 'Make an Offer', prompt: 'How do I make an offer on an item?' },
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
  const { publicKey } = useWallet();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [userContext, setUserContext] = useState<UserContext>({ role: 'guest', wallet: null });
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Hide quick actions after first message
  useEffect(() => {
    if (messages.length > 0) {
      setShowQuickActions(false);
    }
  }, [messages]);

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
    [input, publicKey, messages]
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
  const currentQuickActions = quickActions[userContext.role];

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

          {/* Messages Area */}
          <div className={styles.messagesContainer}>
            {messages.length === 0 && (
              <div className={styles.welcomeMessage}>
                <HiSparkles className={styles.welcomeIcon} />
                <h3>Welcome to LuxHub</h3>
                <p>
                  {userContext.role === 'guest'
                    ? 'Connect your wallet to unlock personalized assistance.'
                    : `How can I help you today?`}
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
              placeholder="Ask anything about LuxHub..."
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
