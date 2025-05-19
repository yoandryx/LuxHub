// src/components/LuxuryAssistant.tsx
import React, { useState } from 'react';
import styles from '../../styles/LuxuryAssistant.module.css'; // Adjust the path as necessary
import { FaArrowUp } from "react-icons/fa";

const LuxuryAssistant = () => {
  const [messages, setMessages] = useState<{ sender: 'user' | 'bot'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: { sender: 'user' | 'bot'; text: string } = { sender: 'user', text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/users/luxury-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });

      const data = await res.json();
      const botMessage: { sender: 'user' | 'bot'; text: string } = { sender: 'bot', text: data.reply };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
        <div className={styles.floatingButton} onClick={() => setVisible(!visible)}>
        <img src="/images/purpleLGG.png" alt="LuxHub Logo" className={styles.logo} />
        </div>
        {visible && (
        <div className={styles.floatingChat}>
            {/* Chat code as-is */}
            <div className={styles.chatContainer}>
            <div className={styles.messages}>
                {messages.map((msg, idx) => (
                <div key={idx} className={styles[msg.sender]}>
                    {msg.text}
                </div>
                ))}
                {loading && <div className={styles.bot}>Typing...</div>}
            </div>
            <div className={styles.inputArea}>
                <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="How may I assist you?"
                />
                <button onClick={sendMessage} disabled={loading}>
                 <FaArrowUp />
                </button>
            </div>
            <p style={{ margin: 4, display:'flex', justifyContent:'center', fontSize: 'x-small', textShadow: '#000000 0px 1px 2px', letterSpacing:'0.5px' }}> LuxHub AI Assistant here to help . .</p>
            </div>
        </div>
        )}
    </>
    );
};

export default LuxuryAssistant;
