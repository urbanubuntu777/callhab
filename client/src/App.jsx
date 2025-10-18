import React, { useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin.replace(/:\\d+$/, ':5000');

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
  const [isMicOn, setIsMicOn] = useState(true);
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
      socketRef.current = io(SERVER_URL, { transports: ['websocket'] });
    }
    const s = socketRef.current;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('participant-joined', ({ socketId, name, role }) => {
      setParticipants((prev) => {
        if (prev.some((p) => p.socketId === socketId)) return prev;
        return [...prev, { socketId, name, role }];
      });
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

    // Signaling handlers: audio channel user<->admin
    s.on('audio-signal', ({ from, signal }) => {
      handleSignal(from, signal, false);
    });
    s.on('admin-audio-signal', ({ from, signal }) => {
      handleSignal(from, signal, true);
    });
    s.on('screen-share-signal', ({ from, signal }) => {
      handleSignal(from, signal, false, 'screen');
    });
    s.on('video-signal', ({ from, signal }) => {
      handleSignal(from, signal, false, 'camera');
    });

    return () => {
      s.removeAllListeners();
    };
  }, []);

  async function ensureMic() {
    if (localMicStreamRef.current) return localMicStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    // users: mic on by default; admin: mic off by default
    const shouldBeOn = role !== 'admin';
    stream.getAudioTracks().forEach((t) => (t.enabled = shouldBeOn));
    setIsMicOn(shouldBeOn);
    localMicStreamRef.current = stream;
    return stream;
  }

  function handleSignal(fromId, signal, adminToUser, channel = 'audio') {
    let peer = peersRef.current.get(fromId);
    if (!peer) {
      const initiator = false; // receiving side
      const stream = selectLocalStreamForChannel(channel);
      peer = new Peer({ initiator, trickle: false, stream });
      peer.on('signal', (sig) => {
        if (channel === 'audio') {
          if (role === 'admin') {
            socketRef.current.emit('admin-audio-signal', { targetId: fromId, signal: sig });
          } else {
            socketRef.current.emit('audio-signal', { targetId: fromId, signal: sig });
          }
        } else if (channel === 'screen') {
          socketRef.current.emit('screen-share-signal', { targetId: fromId, signal: sig });
        } else if (channel === 'camera') {
          socketRef.current.emit('video-signal', { targetId: fromId, signal: sig });
        }
      });
      peer.on('stream', (remoteStream) => {
        // Center video shows admin stream (screen or camera) for users; admin hears users via audio tracks
        if (channel === 'screen' || channel === 'camera' || role === 'user') {
          if (centerVideoRef.current) {
            centerVideoRef.current.srcObject = remoteStream;
            centerVideoRef.current.play().catch(() => {});
          }
        }
      });
      peer.on('close', () => peer.destroy());
      peer.on('error', () => peer.destroy());
      peersRef.current.set(fromId, peer);
    }
    peer.signal(signal);
  }

  function selectLocalStreamForChannel(channel) {
    if (channel === 'screen') return adminScreenStreamRef.current || undefined;
    if (channel === 'camera') return adminCamStreamRef.current || undefined;
    return localMicStreamRef.current || undefined;
  }

  async function startScreenShare() {
    if (role !== 'admin') return;
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    adminScreenStreamRef.current = stream;
    setIsShareOn(true);
    // broadcast offer to all others
    const peer = new Peer({ initiator: true, trickle: false, stream });
    peer.on('signal', (sig) => socketRef.current.emit('screen-share-signal', { signal: sig }));
    peer.on('close', () => peer.destroy());
    peer.on('error', () => peer.destroy());
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
      // prepare mic stream
      await ensureMic();
      const s = socketRef.current;
      const { ok, participants: list, adminId: aid, error } = await new Promise((resolve) => {
        s.emit('join-room', { roomId, userName, userRole: role }, resolve);
      });
      if (!ok) throw new Error(error || 'join failed');
      setParticipants(list);
      setAdminId(aid || null);

      // Establish audio channel: users connect to admin, admin connects to each user
      if (role === 'user' && aid) {
        const stream = await ensureMic();
        const peer = new Peer({ initiator: true, trickle: false, stream });
        peer.on('signal', (sig) => socketRef.current.emit('audio-signal', { targetId: aid, signal: sig }));
        peer.on('close', () => peer.destroy());
        peer.on('error', () => peer.destroy());
        peersRef.current.set(aid, peer);
      } else if (role === 'admin') {
        // connect to each user for downstream admin->user audio if needed
        for (const p of list) {
          if (p.socketId === socketRef.current.id) continue;
          const stream = await ensureMic();
          const peer = new Peer({ initiator: true, trickle: false, stream });
          peer.on('signal', (sig) => socketRef.current.emit('admin-audio-signal', { targetId: p.socketId, signal: sig }));
          peer.on('close', () => peer.destroy());
          peer.on('error', () => peer.destroy());
          peersRef.current.set(p.socketId, peer);
        }
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
    setParticipants([]);
    setMessages([]);
  }

  function sendMessage(text) {
    socketRef.current.emit('chat-message', { text });
  }

  function toggleMic() {
    if (!localMicStreamRef.current) return;
    const next = !isMicOn;
    localMicStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = next));
    setIsMicOn(next);
  }

  return (
    <div className="app">
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
                  </div>
                  {role === 'admin' && p.socketId !== adminId && (
                    <button className="micctl" onClick={() => socketRef.current.emit('admin-toggle-user-mic', { targetId: p.socketId, mute: true })}>🔇</button>
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
            <button className={`ctl ${isMicOn ? 'active' : ''}`} onClick={toggleMic}>🎙️</button>
            {role === 'admin' && (
              <>
                <button className={`ctl ${isCamOn ? 'active' : ''}`} onClick={() => (isCamOn ? stopCamera() : startCamera())}>🎥</button>
                <button className={`ctl ${isShareOn ? 'active' : ''}`} onClick={() => (isShareOn ? stopScreenShare() : startScreenShare())}>🖥️</button>
              </>
            )}
            <button className={`ctl ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen((v) => !v)}>💬</button>
            <button className="ctl" onClick={leaveRoom}>🚪</button>
            <button className="link" onClick={() => navigator.clipboard.writeText(inviteUrl)}>Скопировать ссылку</button>
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


