import React from 'react';
import { useApp } from '../contexts/AppContext';
import { Participant } from '../types';

interface ParticipantsListProps {
  className?: string;
}

export function ParticipantsList({ className = '' }: ParticipantsListProps) {
  const { user, room, toggleUserMic } = useApp();

  return (
    <div className={`participants-list ${className}`}>
      <div className="header">Участники</div>
      <div className="list">
        {room.participants.map((participant: Participant) => (
          <ParticipantItem
            key={participant.socketId}
            participant={participant}
            isAdmin={user.role === 'admin'}
            isCurrentUser={participant.socketId === user.userName}
            onToggleMic={toggleUserMic}
          />
        ))}
      </div>
    </div>
  );
}

interface ParticipantItemProps {
  participant: Participant;
  isAdmin: boolean;
  isCurrentUser: boolean;
  onToggleMic: (socketId: string) => void;
  key?: string;
}

function ParticipantItem({ participant, isAdmin, isCurrentUser, onToggleMic }: ParticipantItemProps) {
  const { room } = useApp();
  const isAdminParticipant = participant.socketId === room.adminId;

  return (
    <div className="participant-item">
      <div className={`avatar ${participant.role} ${participant.isMicOn ? 'speaking' : ''} ${participant.isScreenSharing ? 'screen-sharing' : ''}`}>
        <div className="avatar-inner">
          {participant.name?.slice(0, 1).toUpperCase()}
        </div>
        {participant.isMicOn && (
          <div className="speaking-indicator">
            <div className="pulse-ring"></div>
            <div className="pulse-ring delay-1"></div>
            <div className="pulse-ring delay-2"></div>
          </div>
        )}
        {participant.isScreenSharing && (
          <div className="screen-share-indicator">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
            </svg>
          </div>
        )}
      </div>
      <div className="meta">
        <div className="name">
          {participant.name}
          {isAdminParticipant && ' (Admin)'}
        </div>
        <div className={`mic-status ${participant.isMicOn ? 'on' : 'off'}`}>
          {participant.isMicOn ? '🎙️ Говорит' : '🔇 Молчит'}
        </div>
        {participant.isScreenSharing && (
          <div className="screen-status">
            🖥️ Демонстрирует экран
          </div>
        )}
      </div>
      {isAdmin && !isCurrentUser && (
        <button
          className="mic-control"
          onClick={() => onToggleMic(participant.socketId)}
          title={participant.isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
        >
          {participant.isMicOn ? '🔇' : '🎙️'}
        </button>
      )}
    </div>
  );
}
