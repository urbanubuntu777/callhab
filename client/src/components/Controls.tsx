import React from 'react';
import { useApp } from '../contexts/AppContext';

interface ControlsProps {
  className?: string;
}

export function Controls({ className = '' }: ControlsProps) {
  const { user, room, toggleMic, toggleVideo, startScreenShare, stopScreenShare, requestUserScreenShare } = useApp();

  const handleScreenShare = async () => {
    try {
      if (user.isScreenSharing) {
        stopScreenShare();
      } else {
        if (user.role === 'admin') {
          // Admin requests screen share from first user
          const userParticipant = room.participants.find(p => p.role === 'user');
          if (userParticipant) {
            requestUserScreenShare(userParticipant.socketId);
          } else {
            alert('Нет пользователей для демонстрации экрана');
          }
        } else {
          await startScreenShare();
        }
      }
    } catch (error) {
      console.error('Screen share error:', error);
      alert(error.message);
    }
  };

  return (
    <div className={`controls ${className}`}>
      <button
        className={`control-button mic ${user.isMicOn ? 'active' : ''}`}
        onClick={toggleMic}
        title={user.isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
      >
        🎙️
      </button>
      
      <button
        className={`control-button video ${user.isVideoOn ? 'active' : ''}`}
        onClick={toggleVideo}
        title={user.isVideoOn ? 'Выключить камеру' : 'Включить камеру'}
      >
        🎥
      </button>
      
      <button
        className={`control-button screen-share ${user.isScreenSharing ? 'active' : ''}`}
        onClick={handleScreenShare}
        title={user.isScreenSharing ? 'Остановить демонстрацию' : 'Начать демонстрацию экрана'}
      >
        🖥️
      </button>
      
      <button
        className="control-button leave"
        onClick={() => window.location.reload()}
        title="Покинуть комнату"
      >
        🚪
      </button>
    </div>
  );
}
