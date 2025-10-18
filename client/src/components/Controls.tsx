import React from 'react';
import { useApp } from '../contexts/AppContext';

interface ControlsProps {
  className?: string;
}

export function Controls({ className = '' }: ControlsProps) {
  const { user, room, toggleMic, toggleVideo, startScreenShare, stopScreenShare, requestUserScreenShare } = useApp();

  const handleScreenShare = async () => {
    if (user.role !== 'admin') {
      return; // Only admin can access screen share
    }
    
    try {
      if (user.isScreenSharing) {
        stopScreenShare();
      } else {
        // Admin requests screen share from first user
        const userParticipant = room.participants.find(p => p.role === 'user');
        if (userParticipant) {
          requestUserScreenShare(userParticipant.socketId);
        } else {
          alert('Нет пользователей для демонстрации экрана');
        }
      }
    } catch (error) {
      console.error('Screen share error:', error);
      alert(error.message);
    }
  };

  return (
    <div className={`controls ${className}`}>
      {/* Only show controls for admin */}
      {user.role === 'admin' && (
        <>
          <button
            className={`control-button mic ${user.isMicOn ? 'active' : 'muted'}`}
            onClick={toggleMic}
            title={user.isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              {user.isMicOn ? (
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              ) : (
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              )}
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              {!user.isMicOn && (
                <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              )}
            </svg>
          </button>
          
          <button
            className={`control-button video ${user.isVideoOn ? 'active' : 'inactive'}`}
            onClick={toggleVideo}
            title={user.isVideoOn ? 'Выключить камеру' : 'Включить камеру'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              {!user.isVideoOn && (
                <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              )}
            </svg>
          </button>
          
          <button
            className={`control-button screen-share ${user.isScreenSharing ? 'active' : 'inactive'}`}
            onClick={handleScreenShare}
            title={user.isScreenSharing ? 'Остановить демонстрацию экрана' : 'Запросить демонстрацию экрана у пользователя'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
              <path d="M8 8h8v2H8V8zm0 3h8v2H8v-2z"/>
            </svg>
          </button>
        </>
      )}
      
      <button
        className="control-button leave"
        onClick={() => window.location.reload()}
        title="Покинуть комнату"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 17v-3H9v-4h7V7l5 5-5 5z"/>
          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
      </button>
    </div>
  );
}
