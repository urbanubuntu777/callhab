import React, { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { ParticipantsList } from './ParticipantsList';
import { Chat } from './Chat';
import { Controls } from './Controls';
import { VolumeControls } from './VolumeControls';

function randomRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

export function App() {
  const { user, room, connection, joinRoom } = useApp();
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [role, setRole] = useState('user');
  const [joining, setJoining] = useState(false);
  const [showChat, setShowChat] = useState(true);

  // Get room ID from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRoomId = params.get('room');
    if (urlRoomId) {
      setRoomId(urlRoomId);
    }
  }, []);

  const handleJoinRoom = async () => {
    if (!userName.trim() || !roomId.trim()) {
      alert('Пожалуйста, введите имя и ID комнаты');
      return;
    }

    setJoining(true);
    try {
      await joinRoom(roomId, userName, role);
    } catch (error) {
      alert(error.message || 'Не удалось войти в комнату');
    } finally {
      setJoining(false);
    }
  };

  const generateRoomId = () => {
    setRoomId(randomRoomId());
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Ссылка скопирована в буфер обмена');
    }).catch(() => {
      alert('Не удалось скопировать ссылку');
    });
  };

  // Show join form if not in room
  if (room.participants.length === 0) {
    return (
      <div className="app join-form">
        <div className="join-container">
          <h1>CallHub</h1>
          <div className="form-group">
            <label>
              Имя
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Введите ваше имя"
              />
            </label>
          </div>
          
          <div className="form-group">
            <label>
              Роль
              <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')}>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>
            </label>
          </div>
          
          <div className="form-group">
            <label>
              Комната
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="room-123"
              />
            </label>
          </div>
          
          <div className="form-actions">
            <button
              className="join-button"
              onClick={handleJoinRoom}
              disabled={!userName.trim() || !roomId.trim() || joining}
            >
              {joining ? 'Подключение...' : 'Войти'}
            </button>
            <button
              className="generate-button"
              onClick={generateRoomId}
              disabled={joining}
            >
              Создать комнату
            </button>
          </div>
          
          {connection.status === 'failed' && (
            <div className="error-message">
              Ошибка подключения: {connection.error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show main interface
  return (
    <div className={`app main-interface ${user.role === 'admin' ? 'admin' : 'user'}`}>
      <div className="layout">
        <aside className="left-panel">
          <ParticipantsList />
        </aside>
        
        <main className="center-panel">
          <div className="video-container">
            <video
              id="main-video"
              autoPlay
              playsInline
              muted={user.role === 'admin'}
              style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
            />
          </div>
        </main>
        
        {showChat && (
          <aside className="right-panel">
            <Chat />
          </aside>
        )}
      </div>
      
      <footer className="bottom-panel">
        <Controls />
        
        {user.role === 'admin' && (
          <div className="admin-actions">
            <VolumeControls />
            <button
              className="action-button"
              onClick={copyInviteLink}
              title="Скопировать ссылку для приглашения"
            >
              Скопировать ссылку
            </button>
            <button
              className="action-button"
              onClick={() => setShowChat(!showChat)}
              title={showChat ? 'Скрыть чат' : 'Показать чат'}
            >
              {showChat ? '💬' : '💬'}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
