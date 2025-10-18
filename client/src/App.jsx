import React, { useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;

function randomRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState('user');
  const [participants, setParticipants] = useState([]);
  const [adminId, setAdminId] = useState(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [isMicOn, setIsMicOn] = useState(false); // Default off for admin, will be set for user
  const [isCamOn, setIsCamOn] = useState(false);
  const [isShareOn, setIsShareOn] = useState(false);
  const [joining, setJoining] = useState(false);

  const socketRef = useRef(null);
  const peersRef = useRef(new Map()); // key: peer socketId, value: Peer
  const localMicStreamRef = useRef(null);
  const adminScreenStreamRef = useRef(null);
  const adminCamStreamRef = useRef(null);
  const centerVideoRef = useRef(null);

  const inviteUrl = useMemo(() => {
    const base = window.location.origin + window.location.pathname;
    return `${base}?room=${roomId}`;
  }, [roomId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('room');
    if (r) setRoomId(r);
  }, []);

  useEffect(() => {
    if (!socketRef.current) {
      console.log('Connecting to server:', SERVER_URL);
      socketRef.current = io(SERVER_URL, { transports: ['websocket'] });
    }
    const s = socketRef.current;
    s.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
    });
    s.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });
    s.on('connect_error', (err) => {
      console.error('Connection error:', err);
    });

    s.on('participant-joined', ({ socketId, name, role: joinedRole, isMicOn: micState }) => {
      console.log('Participant joined:', { socketId, name, role: joinedRole, isMicOn: micState });
      setParticipants((prev) => {
        if (prev.some((p) => p.socketId === socketId)) return prev;
        return [...prev, { socketId, name, role: joinedRole, isMicOn: micState }];
      });
      
      // Establish audio connection when new participant joins
      if (joinedRole === 'user' && role === 'admin' && socketId !== socketRef.current.id) {
        console.log('Admin: new user joined, establishing audio connection');
        establishAudioConnection(socketId, true); // admin receiving from user
      } else if (joinedRole === 'admin' && role === 'user' && socketId !== socketRef.current.id) {
        console.log('User: admin joined, establishing audio connection');
        establishAudioConnection(socketId, false); // user sending to admin
      }
    });
    s.on('participant-left', ({ socketId }) => {
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      const peer = peersRef.current.get(socketId);
      if (peer) {
        peer.destroy();
        peersRef.current.delete(socketId);
      }
    });
    s.on('chat-message', (m) => setMessages((prev) => [...prev, m]));
    s.on('admin-toggle-user-mic', ({ mute }) => {
      if (localMicStreamRef.current) {
        localMicStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !mute));
        setIsMicOn(!mute);
      }
    });
    
    s.on('participant-mic-changed', ({ socketId, isMicOn: micState }) => {
      console.log('Participant mic changed:', socketId, micState);
      setParticipants((prev) => prev.map((p) => 
        p.socketId === socketId ? { ...p, isMicOn: micState } : p
      ));
    });

    // Signaling handlers: audio channel user<->admin
    s.on('audio-signal', ({ from, signal }) => {
      console.log('Received audio signal from:', from, 'my role:', role);
      handleAudioSignal(from, signal);
    });
    s.on('admin-audio-signal', ({ from, signal }) => {
      console.log('Received admin audio signal from:', from, 'my role:', role);
      handleAudioSignal(from, signal);
    });
    s.on('screen-share-signal', ({ from, signal }) => {
      handleSignal(from, signal, false, 'screen');
    });
    s.on('video-signal', ({ from, signal }) => {
      handleSignal(from, signal, false, 'camera');
    });
    
    // Screen share events
    s.on('admin-request-screen-share', async () => {
      if (role === 'user') {
        console.log('User received screen share request from admin');
        // Show notification to user
        const confirmed = confirm('Админ запрашивает демонстрацию вашего экрана. Разрешить?');
        if (confirmed) {
          try {
            console.log('User accepted screen share request');
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            
            // Create peer connection to send screen to admin
            const peer = new Peer({ 
              initiator: true, 
              trickle: false, 
              stream,
              config: {
                iceServers: [
                  { urls: 'stun:stun.l.google.com:19302' },
                  { urls: 'stun:stun1.l.google.com:19302' }
                ]
              }
            });
            
            peer.on('signal', (sig) => {
              console.log('User sending screen share signal to admin');
              socketRef.current.emit('user-screen-signal', { signal: sig });
            });
            
            peer.on('error', (err) => {
              console.error('Screen share peer error:', err);
            });
            
            // Store peer reference
            peersRef.current.set('user-screen-share', peer);
            
            // Notify admin that screen share started
            socketRef.current.emit('user-start-screen-share');
            
            console.log('Screen share started successfully');
            
            // Handle screen share stop
            stream.getVideoTracks()[0].onended = () => {
              console.log('User stopped screen share');
              peer.destroy();
              peersRef.current.delete('user-screen-share');
              socketRef.current.emit('user-stop-screen-share');
            };
          } catch (err) {
            console.error('User screen share failed:', err);
            if (err.name === 'NotAllowedError') {
              alert('Демонстрация экрана отклонена пользователем');
            } else {
              alert('Не удалось начать демонстрацию экрана: ' + err.message);
            }
          }
        } else {
          console.log('User rejected screen share request');
          // Notify admin that user rejected
          socketRef.current.emit('user-reject-screen-share');
        }
      }
    });
    
    s.on('user-screen-share-started', ({ from }) => {
      console.log('User started screen share:', from);
      if (role === 'admin') {
        setIsShareOn(true);
        console.log('Admin: screen share started, waiting for video stream');
      }
    });
    
    s.on('user-screen-signal', ({ from, signal }) => {
      console.log('Admin received user screen signal from:', from);
      if (role === 'admin') {
        let peer = peersRef.current.get(`screen-${from}`);
        if (!peer) {
          peer = new Peer({ 
            initiator: false, 
            trickle: false,
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
              ]
            }
          });
          
          peer.on('signal', (sig) => {
            console.log('Admin responding to user screen signal');
            socketRef.current.emit('admin-screen-signal', { targetId: from, signal: sig });
          });
          
          peer.on('stream', (remoteStream) => {
            console.log('Admin received user screen stream');
            if (centerVideoRef.current) {
              centerVideoRef.current.srcObject = remoteStream;
              centerVideoRef.current.play().catch(() => {});
            }
          });
          
          peer.on('error', (err) => {
            console.error('Admin screen peer error:', err);
          });
          
          peersRef.current.set(`screen-${from}`, peer);
        }
        peer.signal(signal);
      }
    });
    
    s.on('admin-screen-signal', ({ signal }) => {
      console.log('User received admin screen signal response');
      const peer = peersRef.current.get('user-screen-share');
      if (peer) {
        peer.signal(signal);
      }
    });
    
    s.on('user-stop-screen-share', ({ from }) => {
      console.log('User stopped screen share:', from);
      if (role === 'admin') {
        const peer = peersRef.current.get(`screen-${from}`);
        if (peer) {
          peer.destroy();
          peersRef.current.delete(`screen-${from}`);
        }
        if (centerVideoRef.current) {
          centerVideoRef.current.srcObject = null;
        }
        setIsShareOn(false);
      }
    });
    
    s.on('user-reject-screen-share', ({ from }) => {
      console.log('User rejected screen share:', from);
      if (role === 'admin') {
        alert('Пользователь отклонил демонстрацию экрана');
        setIsShareOn(false);
      }
    });

    return () => {
      s.removeAllListeners();
    };
  }, []);

  async function ensureMic() {
    if (localMicStreamRef.current) return localMicStreamRef.current;
    
    try {
      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }, 
        video: false 
      });
      
      console.log('Microphone access granted:', stream);
      
      // users: mic always on; admin: mic off by default
      const shouldBeOn = role !== 'admin';
      stream.getAudioTracks().forEach((t) => {
        t.enabled = shouldBeOn;
        console.log(`Audio track enabled: ${t.enabled}, role: ${role}`);
      });
      
      setIsMicOn(shouldBeOn);
      localMicStreamRef.current = stream;
      
      // Show notification for user
      if (role === 'user') {
        console.log('Микрофон включен для пользователя');
      }
      
      return stream;
    } catch (error) {
      console.error('Failed to access microphone:', error);
      alert('Не удалось получить доступ к микрофону. Проверьте разрешения браузера.');
      throw error;
    }
  }

  // New simplified audio handling
  function establishAudioConnection(targetId, isAdminReceiving) {
    console.log('Establishing audio connection:', { targetId, isAdminReceiving, role });
    
    if (isAdminReceiving && role === 'admin') {
      // Admin receiving from user - create peer without stream
      const peer = new Peer({ 
        initiator: false, 
        trickle: false,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });
      
      peer.on('signal', (sig) => {
        console.log('Admin responding to user audio signal');
        socketRef.current.emit('admin-audio-signal', { targetId, signal: sig });
      });
      
      peer.on('stream', (remoteStream) => {
        console.log('Admin received user audio stream');
        const audio = document.createElement('audio');
        audio.srcObject = remoteStream;
        audio.autoplay = true;
        audio.volume = 1.0;
        audio.style.display = 'none';
        audio.id = `audio-${targetId}`;
        document.body.appendChild(audio);
        
        audio.onloadedmetadata = () => {
          console.log('✅ Admin now hearing user audio from:', targetId);
          audio.play().catch(err => console.error('Failed to play audio:', err));
        };
        
        if (!window.adminAudioElements) window.adminAudioElements = [];
        window.adminAudioElements.push(audio);
      });
      
      peer.on('error', (err) => {
        console.error('Admin audio peer error:', err);
      });
      
      peersRef.current.set(targetId, peer);
    } else if (!isAdminReceiving && role === 'user') {
      // User sending to admin - create peer with mic stream
      ensureMic().then(stream => {
        const peer = new Peer({ 
          initiator: true, 
          trickle: false,
          stream,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });
        
        peer.on('signal', (sig) => {
          console.log('User sending audio signal to admin');
          socketRef.current.emit('audio-signal', { targetId, signal: sig });
        });
        
        peer.on('error', (err) => {
          console.error('User audio peer error:', err);
        });
        
        peersRef.current.set(targetId, peer);
      });
    }
  }
  
  function handleAudioSignal(fromId, signal) {
    console.log('Handling audio signal from:', fromId);
    const peer = peersRef.current.get(fromId);
    if (peer) {
      peer.signal(signal);
    }
  }
  
  function handleSignal(fromId, signal, adminToUser, channel = 'audio') {
    console.log('Handling signal:', { fromId, channel, role, adminToUser });
    
    let peer = peersRef.current.get(fromId);
    if (!peer) {
      const initiator = false; // receiving side
      let stream = undefined;
      
      if (channel === 'screen') {
        stream = adminScreenStreamRef.current || undefined;
      } else if (channel === 'camera') {
        stream = adminCamStreamRef.current || undefined;
      }
      
      console.log('Creating new peer for:', fromId, 'with stream:', !!stream, 'role:', role);
      
      peer = new Peer({ 
        initiator, 
        trickle: false, 
        stream: stream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });
      
      peer.on('signal', (sig) => {
        console.log('Peer signaling back to:', fromId, 'channel:', channel);
        if (channel === 'screen') {
          socketRef.current.emit('screen-share-signal', { targetId: fromId, signal: sig });
        } else if (channel === 'camera') {
          socketRef.current.emit('video-signal', { targetId: fromId, signal: sig });
        }
      });
      
      peer.on('connect', () => {
        console.log('Peer connected:', fromId, 'channel:', channel);
      });
      
      peer.on('stream', (remoteStream) => {
        console.log('Received stream from:', fromId, 'channel:', channel, 'stream:', remoteStream);
        
        // Center video shows admin stream (screen or camera) for users
        if ((channel === 'screen' || channel === 'camera') && role === 'user') {
          if (centerVideoRef.current) {
            centerVideoRef.current.srcObject = remoteStream;
            centerVideoRef.current.play().catch(() => {});
          }
        }
      });
      
      peer.on('close', () => {
        console.log('Peer connection closed:', fromId);
        peer.destroy();
      });
      
      peer.on('error', (err) => {
        console.error('Peer error:', err, 'from:', fromId);
        peer.destroy();
      });
      
      peersRef.current.set(fromId, peer);
    }
    
    console.log('Sending signal to peer:', fromId);
    peer.signal(signal);
  }

  function selectLocalStreamForChannel(channel) {
    if (channel === 'screen') return adminScreenStreamRef.current || undefined;
    if (channel === 'camera') return adminCamStreamRef.current || undefined;
    return localMicStreamRef.current || undefined;
  }

  async function startScreenShare() {
    if (role !== 'admin') return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      adminScreenStreamRef.current = stream;
      setIsShareOn(true);
      
      // Show admin's screen in center video
      if (centerVideoRef.current) {
        centerVideoRef.current.srcObject = stream;
        centerVideoRef.current.play().catch(() => {});
      }
      
      // broadcast offer to all users
      const peer = new Peer({ initiator: true, trickle: false, stream });
      peer.on('signal', (sig) => socketRef.current.emit('screen-share-signal', { signal: sig }));
      peer.on('close', () => peer.destroy());
      peer.on('error', () => peer.destroy());
      
      // Handle user screen share requests
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.error('Screen share failed:', err);
    }
  }

  function stopScreenShare() {
    if (adminScreenStreamRef.current) {
      adminScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      adminScreenStreamRef.current = null;
    }
    setIsShareOn(false);
  }

  async function startCamera() {
    if (role !== 'admin') return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    adminCamStreamRef.current = stream;
    setIsCamOn(true);
    const peer = new Peer({ initiator: true, trickle: false, stream });
    peer.on('signal', (sig) => socketRef.current.emit('video-signal', { signal: sig }));
    peer.on('close', () => peer.destroy());
    peer.on('error', () => peer.destroy());
  }

  function stopCamera() {
    if (adminCamStreamRef.current) {
      adminCamStreamRef.current.getTracks().forEach((t) => t.stop());
      adminCamStreamRef.current = null;
    }
    setIsCamOn(false);
  }

  async function joinRoom() {
    setJoining(true);
    try {
      console.log('Joining room:', { roomId, userName, role });
      if (!socketRef.current || !connected) {
        throw new Error('Не подключен к серверу');
      }
      
      // prepare mic stream
      await ensureMic();
      const s = socketRef.current;
      
      const { ok, participants: list, adminId: aid, error } = await new Promise((resolve) => {
        s.emit('join-room', { roomId, userName, userRole: role }, resolve);
        // timeout after 10 seconds
        setTimeout(() => resolve({ ok: false, error: 'Timeout' }), 10000);
      });
      
      if (!ok) throw new Error(error || 'join failed');
      console.log('Joined successfully:', { participants: list, adminId: aid });
      
      // Set initial mic state based on role
      const initialMicState = role !== 'admin';
      setIsMicOn(initialMicState);
      
      // Update participants with correct mic states
      const updatedParticipants = list.map(p => ({
        ...p,
        isMicOn: p.role === 'user' ? true : p.isMicOn || false
      }));
      
      setParticipants(updatedParticipants);
      setAdminId(aid || null);

      // Establish audio connections for existing participants
      if (role === 'user' && aid) {
        console.log('User: establishing audio connection to admin:', aid);
        establishAudioConnection(aid, false); // user sending to admin
      } else if (role === 'admin') {
        console.log('Admin: ready to receive audio from users');
        // Admin doesn't need to establish connections here, will be done in participant-joined
      }
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e.message || 'Не удалось войти в комнату');
    } finally {
      setJoining(false);
    }
  }

  function leaveRoom() {
    socketRef.current.emit('leave-room');
    peersRef.current.forEach((peer) => peer.destroy());
    peersRef.current.clear();
    if (localMicStreamRef.current) {
      localMicStreamRef.current.getTracks().forEach((t) => t.stop());
      localMicStreamRef.current = null;
    }
    stopScreenShare();
    stopCamera();
    
    // Clean up admin audio elements
    if (window.adminAudioElements) {
      window.adminAudioElements.forEach(audio => {
        audio.pause();
        audio.srcObject = null;
        if (audio.parentNode) audio.parentNode.removeChild(audio);
      });
      window.adminAudioElements = [];
    }
    
    setParticipants([]);
    setMessages([]);
  }

  function sendMessage(text) {
    socketRef.current.emit('chat-message', { text });
  }

  function toggleMic() {
    if (role === 'user') return; // Users cannot toggle their own mic
    if (!localMicStreamRef.current || !socketRef.current) return;
    
    const next = !isMicOn;
    localMicStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = next));
    setIsMicOn(next);
    socketRef.current.emit('admin-toggle-own-mic', { enabled: next });
  }
  
  function toggleUserMic(targetId, mute) {
    if (role !== 'admin' || !socketRef.current) return;
    socketRef.current.emit('admin-toggle-user-mic', { targetId, mute });
  }
  
  function requestUserScreenShare() {
    if (role !== 'admin' || !socketRef.current) return;
    // Request screen share from first user found
    const user = participants.find(p => p.role === 'user');
    if (user) {
      console.log('Admin requesting screen share from user:', user.socketId);
      socketRef.current.emit('admin-request-screen-share', { targetId: user.socketId });
      // Don't set isShareOn here - wait for user to accept
    } else {
      alert('Нет пользователей для демонстрации экрана');
    }
  }

  return (
    <div className={`app ${role === 'admin' ? 'admin' : ''}`}>
      {!participants.length ? (
        <div className="auth">
          <h1>CallHub</h1>
          <label>
            Имя
            <input value={userName} onChange={(e) => setUserName(e.target.value)} />
          </label>
          <label>
            Роль
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </label>
          <label>
            Комната
            <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="room-123" />
          </label>
          <div className="row">
            <button disabled={!userName || !roomId || joining} onClick={joinRoom}>Войти</button>
            <button onClick={() => setRoomId(randomRoomId())}>Создать</button>
          </div>
          {joining && <div className="loader">Подключение…</div>}
        </div>
      ) : (
        <div className="layout">
          <aside className="left">
            <div className="header">Участники</div>
            <div className="list">
              {participants.map((p) => (
                <div className="item" key={p.socketId}>
                  <div className={`avatar ${p.role}`}>{p.name?.slice(0, 1).toUpperCase()}</div>
                  <div className="meta">
                    <div className="name">{p.name} {p.socketId === adminId ? '(Admin)' : ''}</div>
                    <div className={`mic-status ${p.isMicOn ? 'on' : 'off'}`}>
                      {p.isMicOn ? '🎙️ Включен' : '🔇 Выключен'}
                    </div>
                  </div>
                  {role === 'admin' && p.socketId !== adminId && (
                    <button 
                      className="micctl" 
                      onClick={() => toggleUserMic(p.socketId, p.isMicOn)}
                      title={p.isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
                    >
                      {p.isMicOn ? '🔇' : '🎙️'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className={`mic-indicator ${isMicOn ? 'on' : 'off'}`}></div>
          </aside>
          <main className="center">
            <video ref={centerVideoRef} autoPlay playsInline muted={role === 'admin'} />
          </main>
          {chatOpen && (
            <aside className="right">
              <div className="header">Чат</div>
              <div className="messages">
                {messages.map((m, i) => (
                  <div key={i} className="msg"><b>{m.name || m.from}:</b> {m.text}</div>
                ))}
              </div>
              <ChatInput onSend={sendMessage} />
            </aside>
          )}
          <footer className="bottom">
            {role === 'admin' && (
              <button 
                className={`ctl ${isMicOn ? 'active' : ''}`} 
                onClick={toggleMic}
                title={isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
              >
                🎙️
              </button>
            )}
            {role === 'admin' && (
              <>
                <button className={`ctl ${isCamOn ? 'active' : ''}`} onClick={() => (isCamOn ? stopCamera() : startCamera())}>🎥</button>
                <button className={`ctl ${isShareOn ? 'active' : ''}`} onClick={() => (isShareOn ? stopScreenShare() : requestUserScreenShare())}>🖥️</button>
              </>
            )}
            <button className={`ctl ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen((v) => !v)}>💬</button>
            <button className="ctl" onClick={leaveRoom}>🚪</button>
            {role === 'admin' && (
              <>
                <button className="link" onClick={() => navigator.clipboard.writeText(inviteUrl)}>Скопировать ссылку</button>
                <button className="link" onClick={() => {
                  console.log('Admin audio elements:', window.adminAudioElements);
                  if (window.adminAudioElements) {
                    window.adminAudioElements.forEach((audio, i) => {
                      console.log(`Audio ${i}:`, audio.srcObject, 'volume:', audio.volume);
                      audio.volume = 1.0;
                      audio.play();
                    });
                  }
                }}>🔊 Тест аудио</button>
              </>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}

function ChatInput({ onSend }) {
  const [text, setText] = useState('');
  return (
    <div className="chat-input">
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text && (onSend(text), setText(''))} />
      <button onClick={() => text && (onSend(text), setText(''))}>Отправить</button>
    </div>
  );
}


