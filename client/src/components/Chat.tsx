import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { ChatMessage } from '../types';

interface ChatProps {
  className?: string;
}

export function Chat({ className = '' }: ChatProps) {
  const { room, sendMessage } = useApp();
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [room.messages]);

  const handleSubmit = (e: any) => {
    e.preventDefault();
    if (message.trim()) {
      sendMessage(message);
      setMessage('');
    }
  };

  const handleKeyPress = (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className={`chat ${className}`}>
      <div className="header">Чат</div>
      <div className="messages">
        {room.messages.map((msg: ChatMessage) => (
          <ChatMessageItem key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Введите сообщение..."
        />
        <button type="submit" disabled={!message.trim()}>
          Отправить
        </button>
      </form>
    </div>
  );
}

interface ChatMessageItemProps {
  message: ChatMessage;
  key?: string;
}

function ChatMessageItem({ message }: ChatMessageItemProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="chat-message">
      <div className="message-header">
        <span className="sender-name">{message.name || message.from}</span>
        <span className="timestamp">{formatTime(message.timestamp)}</span>
      </div>
      <div className="message-text">{message.text}</div>
    </div>
  );
}
