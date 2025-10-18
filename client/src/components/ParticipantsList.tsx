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
      <div className={`avatar ${participant.role}`}>
        {participant.name?.slice(0, 1).toUpperCase()}
      </div>
      <div className="meta">
        <div className="name">
          {participant.name}
          {isAdminParticipant && ' (Admin)'}
        </div>
        <div className={`mic-status ${participant.isMicOn ? 'on' : 'off'}`}>
          {participant.isMicOn ? '🎙️ Включен' : '🔇 Выключен'}
        </div>
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
