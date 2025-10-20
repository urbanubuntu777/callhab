import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { AppContextType, UserState, RoomState, ConnectionState, Participant, ChatMessage } from '../types';
import { webRTCService } from '../services/WebRTCService';
import { audioService } from '../services/AudioService';
import { videoService } from '../services/VideoService';
import { screenShareService } from '../services/ScreenShareService';

// Initial state
const initialUserState: UserState = {
  userName: '',
  role: 'user',
  isConnected: false,
  isMicOn: false,
  isVideoOn: false,
  isScreenSharing: false
};

const initialRoomState: RoomState = {
  roomId: '',
  participants: [],
  adminId: null,
  messages: []
};

const initialConnectionState: ConnectionState = {
  status: 'disconnected',
  retryCount: 0
};

// Action types
type AppAction =
  | { type: 'SET_USER'; payload: Partial<UserState> }
  | { type: 'SET_ROOM'; payload: Partial<RoomState> }
  | { type: 'SET_CONNECTION'; payload: Partial<ConnectionState> }
  | { type: 'ADD_PARTICIPANT'; payload: Participant }
  | { type: 'REMOVE_PARTICIPANT'; payload: string }
  | { type: 'UPDATE_PARTICIPANT'; payload: { socketId: string; updates: Partial<Participant> } }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'CLEAR_MESSAGES' };

// Reducer
function appReducer(state: { user: UserState; room: RoomState; connection: ConnectionState }, action: AppAction) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: { ...state.user, ...action.payload } };
    
    case 'SET_ROOM':
      return { ...state, room: { ...state.room, ...action.payload } };
    
    case 'SET_CONNECTION':
      return { ...state, connection: { ...state.connection, ...action.payload } };
    
    case 'ADD_PARTICIPANT':
      const existingParticipant = state.room.participants.find(p => p.socketId === action.payload.socketId);
      if (existingParticipant) {
        return state;
      }
      return {
        ...state,
        room: {
          ...state.room,
          participants: [...state.room.participants, action.payload]
        }
      };
    
    case 'REMOVE_PARTICIPANT':
      return {
        ...state,
        room: {
          ...state.room,
          participants: state.room.participants.filter(p => p.socketId !== action.payload)
        }
      };
    
    case 'UPDATE_PARTICIPANT':
      return {
        ...state,
        room: {
          ...state.room,
          participants: state.room.participants.map(p =>
            p.socketId === action.payload.socketId
              ? { ...p, ...action.payload.updates }
              : p
          )
        }
      };
    
    case 'ADD_MESSAGE':
      return {
        ...state,
        room: {
          ...state.room,
          messages: [...state.room.messages, action.payload]
        }
      };
    
    case 'CLEAR_MESSAGES':
      return {
        ...state,
        room: {
          ...state.room,
          messages: []
        }
      };
    
    default:
      return state;
  }
}

// Context
const AppContext = createContext(undefined);

// Provider component
export function AppProvider({ children }: { children: any }) {
  const [state, dispatch] = useReducer(appReducer, {
    user: initialUserState,
    room: initialRoomState,
    connection: initialConnectionState
  });

  const socketRef = useRef(null);
  const connectionsRef = useRef(new Map<string, any>());

  // Socket connection
  useEffect(() => {
    const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;
    
    if (!socketRef.current) {
      console.log('Connecting to server:', SERVER_URL);
      socketRef.current = io(SERVER_URL, { transports: ['websocket'] });
      // Make socket available globally for VideoService
      (window as any).socketRef = socketRef;
    }

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Connected to server');
      dispatch({ type: 'SET_CONNECTION', payload: { status: 'connected' } });
      dispatch({ type: 'SET_USER', payload: { isConnected: true } });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      dispatch({ type: 'SET_CONNECTION', payload: { status: 'disconnected' } });
      dispatch({ type: 'SET_USER', payload: { isConnected: false } });
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      dispatch({ type: 'SET_CONNECTION', payload: { status: 'failed', error: error.message } });
    });

    // Participant events
    socket.on('participant-joined', ({ socketId, name, role, isMicOn }) => {
      console.log('Participant joined:', { socketId, name, role, isMicOn });
      dispatch({
        type: 'ADD_PARTICIPANT',
        payload: { socketId, name, role, isMicOn, isVideoOn: false, isScreenSharing: false }
      });
    });

    socket.on('participant-left', ({ socketId }) => {
      console.log('Participant left:', socketId);
      dispatch({ type: 'REMOVE_PARTICIPANT', payload: socketId });
      
      // Clean up WebRTC connections for this participant
      const audioConnection = connectionsRef.current.get(`${socketId}_audio`);
      const screenConnection = connectionsRef.current.get(`${socketId}_screen`);
      
      if (audioConnection) {
        audioConnection.destroy();
        connectionsRef.current.delete(`${socketId}_audio`);
      }
      
      if (screenConnection) {
        screenConnection.destroy();
        connectionsRef.current.delete(`${socketId}_screen`);
      }
    });

    socket.on('participant-mic-changed', ({ socketId, isMicOn }) => {
      console.log('Participant mic changed:', socketId, isMicOn);
      dispatch({
        type: 'UPDATE_PARTICIPANT',
        payload: { socketId, updates: { isMicOn } }
      });
    });

    // Chat events
    socket.on('chat-message', (message) => {
      const chatMessage: ChatMessage = {
        id: `${message.from}_${message.ts}`,
        from: message.from,
        name: message.name,
        text: message.text,
        timestamp: message.ts
      };
      dispatch({ type: 'ADD_MESSAGE', payload: chatMessage });
    });

    // WebRTC signaling events
    socket.on('audio-signal', ({ from, signal }) => {
      console.log('Received audio signal from:', from);
      handleWebRTCSignal(from, signal, 'audio');
    });

    socket.on('admin-audio-signal', ({ from, signal }) => {
      console.log('Received admin audio signal from:', from);
      handleWebRTCSignal(from, signal, 'audio');
    });

    socket.on('user-screen-signal', ({ from, signal }) => {
      console.log('Received user screen signal from:', from);
      handleWebRTCSignal(from, signal, 'screen');
    });

    socket.on('admin-screen-signal', ({ signal }) => {
      console.log('Received admin screen signal response');
      // Only users (who initiated screen share) should handle this
      if (state.user.role === 'user') {
        handleWebRTCSignal('admin', signal, 'screen');
      }
    });

    // Screen share events
    socket.on('admin-request-screen-share', async () => {
      if (state.user.role === 'user') {
        console.log('User received screen share request from admin');
        const confirmed = confirm('Админ запрашивает демонстрацию вашего экрана. Разрешить?');
        if (confirmed) {
          try {
            await startScreenShare();
            socket.emit('user-start-screen-share');
          } catch (error) {
            console.error('Screen share failed:', error);
            alert(error.message);
          }
        } else {
          socket.emit('user-reject-screen-share');
        }
      }
    });

    // Handle screen share stop from user
    socket.on('user-screen-share-stopped', ({ from }) => {
      console.log('User stopped screen share:', from);
      if (state.user.role === 'admin') {
        dispatch({ type: 'SET_USER', payload: { isScreenSharing: false } });
        dispatch({
          type: 'UPDATE_PARTICIPANT',
          payload: { socketId: from, updates: { isScreenSharing: false } }
        });
        screenShareService.stopRemoteScreenShare();
      }
    });

    socket.on('user-screen-share-started', ({ from }) => {
      console.log('User started screen share:', from);
      if (state.user.role === 'admin') {
        dispatch({ type: 'SET_USER', payload: { isScreenSharing: true } });
        // Update participant to show screen sharing
        dispatch({
          type: 'UPDATE_PARTICIPANT',
          payload: { socketId: from, updates: { isScreenSharing: true } }
        });
      }
    });

    socket.on('user-stop-screen-share', ({ from }) => {
      console.log('User stopped screen share:', from);
      if (state.user.role === 'admin') {
        dispatch({ type: 'SET_USER', payload: { isScreenSharing: false } });
        dispatch({
          type: 'UPDATE_PARTICIPANT',
          payload: { socketId: from, updates: { isScreenSharing: false } }
        });
        screenShareService.stopRemoteScreenShare();
      }
    });

    socket.on('user-reject-screen-share', ({ from }) => {
      console.log('User rejected screen share:', from);
      if (state.user.role === 'admin') {
        alert('Пользователь отклонил демонстрацию экрана');
        dispatch({ type: 'SET_USER', payload: { isScreenSharing: false } });
        dispatch({
          type: 'UPDATE_PARTICIPANT',
          payload: { socketId: from, updates: { isScreenSharing: false } }
        });
        screenShareService.stopRemoteScreenShare();
      }
    });

    return () => {
      socket.removeAllListeners();
    };
  }, [state.user.role]);

  // WebRTC signal handler
  const handleWebRTCSignal = async (from: string, signal: any, type: 'audio' | 'screen') => {
    try {
      // Create separate connection keys for different media types
      const connectionKey = `${from}_${type}`;
      let connection = connectionsRef.current.get(connectionKey);
      
      if (!connection) {
        console.log(`Creating new ${type} connection for:`, from);
        
        const config = {
          initiator: false,
          trickle: false,
          stream: type === 'audio' ? audioService.getStream() : undefined
        };
        
        connection = await webRTCService.createConnection(config);
        connectionsRef.current.set(connectionKey, connection);
        
        // Set up event handlers
        connection.on('signal', (data) => {
          if (socketRef.current) {
            if (type === 'audio') {
              if (state.user.role === 'admin') {
                socketRef.current.emit('admin-audio-signal', { targetId: from, signal: data });
              } else {
                socketRef.current.emit('audio-signal', { targetId: from, signal: data });
              }
            } else if (type === 'screen') {
              if (state.user.role === 'admin') {
                socketRef.current.emit('admin-screen-signal', { targetId: from, signal: data });
              } else {
                socketRef.current.emit('user-screen-signal', { signal: data });
              }
            }
          }
        });
        
        connection.on('stream', (stream) => {
          console.log(`Received ${type} stream from:`, from, stream);
          if (type === 'audio') {
            audioService.playRemoteAudio(stream, from);
          } else if (type === 'screen') {
            console.log('Playing screen share video:', stream);
            // Only show screen share for admin
            if (state.user.role === 'admin') {
              screenShareService.playRemoteScreenShare(stream);
            }
            // Update participant to show screen sharing
            dispatch({
              type: 'UPDATE_PARTICIPANT',
              payload: { socketId: from, updates: { isScreenSharing: true } }
            });
            // Update admin UI to show screen sharing
            if (state.user.role === 'admin') {
              dispatch({ type: 'SET_USER', payload: { isScreenSharing: true } });
            }
          }
        });
        
        connection.on('error', (error) => {
          console.error(`WebRTC ${type} error:`, error);
        });
        
        connection.on('close', () => {
          console.log(`WebRTC ${type} connection closed:`, from);
          connectionsRef.current.delete(connectionKey);
          if (type === 'audio') {
            audioService.removeAudioElement(from);
          }
        });
      }
      
      await connection.signal(signal);
    } catch (error) {
      console.error(`Error handling ${type} signal:`, error);
    }
  };

  // Actions
  const joinRoom = useCallback(async (roomId: string, userName: string, role: 'admin' | 'user') => {
    if (!socketRef.current) {
      throw new Error('Not connected to server');
    }

    try {
      dispatch({ type: 'SET_CONNECTION', payload: { status: 'connecting' } });
      
      // Prepare audio
      await audioService.startAudio();
      
      const result = await new Promise((resolve) => {
        socketRef.current!.emit('join-room', { roomId, userName, userRole: role }, resolve);
        setTimeout(() => resolve({ ok: false, error: 'Timeout' }), 10000);
      }) as any;
      
      const { ok, participants, adminId, error } = result;
      
      if (!ok) {
        throw new Error(error || 'Failed to join room');
      }
      
      console.log('Joined successfully:', { participants, adminId });
      
      // Admin: isMicOn controls if they HEAR users (remote audio muted/unmuted)
      // User: isMicOn controls if their mic is on (but not used in current implementation)
      const initialMicOn = true; // Everyone starts with mic "on" (admin hears users)
      
      dispatch({
        type: 'SET_USER',
        payload: {
          userName,
          role,
          isMicOn: initialMicOn
        }
      });
      
      dispatch({
        type: 'SET_ROOM',
        payload: {
          roomId,
          participants: participants || [],
          adminId
        }
      });
      
      dispatch({ type: 'SET_CONNECTION', payload: { status: 'connected' } });
      
      // Set up audio for users
      if (role === 'user' && adminId) {
        await establishAudioConnection(adminId);
      }
      
    } catch (error) {
      console.error('Failed to join room:', error);
      dispatch({ type: 'SET_CONNECTION', payload: { status: 'failed', error: error.message } });
      throw error;
    }
  }, []);

  const establishAudioConnection = async (targetId: string) => {
    try {
      console.log('Establishing audio connection to:', targetId);
      
      const config = {
        initiator: true,
        trickle: false,
        stream: audioService.getStream() || undefined
      };
      
      const connection = await webRTCService.createConnection(config);
      const connectionKey = `${targetId}_audio`;
      connectionsRef.current.set(connectionKey, connection);
      
      connection.on('signal', (data) => {
        if (socketRef.current) {
          socketRef.current.emit('audio-signal', { targetId, signal: data });
        }
      });
      
      connection.on('error', (error) => {
        console.error('Audio connection error:', error);
      });
      
    } catch (error) {
      console.error('Failed to establish audio connection:', error);
    }
  };

  const leaveRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('leave-room');
    }
    
    // Clean up WebRTC connections
    connectionsRef.current.forEach(connection => connection.destroy());
    connectionsRef.current.clear();
    
    // Clean up services
    audioService.stopAudio();
    videoService.stopVideo();
    videoService.stopScreenShare();
    
    // Reset state
    dispatch({ type: 'SET_USER', payload: initialUserState });
    dispatch({ type: 'SET_ROOM', payload: initialRoomState });
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (socketRef.current && text.trim()) {
      socketRef.current.emit('chat-message', { text });
    }
  }, []);

  const toggleMic = useCallback(() => {
    console.log('=== ADMIN MICROPHONE TOGGLE START ===');
    
    // Admin toggles REMOTE audio (what they hear from users)
    const currentMicState = state.user.isMicOn;
    console.log('Current mic state:', currentMicState);
    
    const newMicState = !currentMicState;
    console.log('New mic state:', newMicState);
    
    // Mute/unmute ALL remote audio
    audioService.muteAllRemoteAudio(!newMicState);
    
    // Update UI state
    dispatch({ type: 'SET_USER', payload: { isMicOn: newMicState } });
    
    console.log('=== ADMIN MICROPHONE TOGGLE END ===', { isMicOn: newMicState, remoteAudioMuted: !newMicState });
  }, [state.user.isMicOn]);

  const toggleVideo = useCallback(async () => {
    try {
      if (state.user.isVideoOn) {
        videoService.stopVideo();
        dispatch({ type: 'SET_USER', payload: { isVideoOn: false } });
      } else {
        await videoService.startVideo();
        dispatch({ type: 'SET_USER', payload: { isVideoOn: true } });
      }
    } catch (error) {
      console.error('Failed to toggle video:', error);
      alert(error.message);
    }
  }, [state.user.isVideoOn]);

  const startScreenShare = useCallback(async () => {
    try {
      console.log('Starting screen share...');
      const stream = await screenShareService.startScreenShare();
      console.log('Screen share stream:', stream);
      
      // Create WebRTC connection for screen share
      const connection = await webRTCService.createConnection({
        initiator: true,
        stream: stream
      });
      
      connection.on('signal', (signal) => {
        console.log('Sending screen share signal:', signal);
        if (socketRef.current) {
          socketRef.current.emit('user-screen-signal', { signal });
        }
      });
      
      connection.on('stream', (stream) => {
        console.log('Screen share stream received locally');
        // Only show thumbnail for admin
        if (state.user.role === 'admin') {
          screenShareService.playRemoteScreenShare(stream);
        }
      });
      
      connection.on('error', (error) => {
        console.error('Screen share connection error:', error);
      });
      
      // Store connection with proper key
      const connectionKey = `${state.user.userName}_screen`;
      connectionsRef.current.set(connectionKey, connection);
      
      dispatch({ type: 'SET_USER', payload: { isScreenSharing: true } });
      
    } catch (error) {
      console.error('Screen share failed:', error);
      throw error;
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    screenShareService.stopScreenShare();
    dispatch({ type: 'SET_USER', payload: { isScreenSharing: false } });
  }, []);

  const toggleUserMic = useCallback((socketId: string) => {
    console.log('=== ADMIN TOGGLE USER MIC ===', socketId);
    const participant = state.room.participants.find(p => p.socketId === socketId);
    if (participant) {
      const newMicState = !participant.isMicOn;
      console.log(`Toggling user ${socketId} mic:`, participant.isMicOn, '->', newMicState);
      
      // Mute/unmute this specific user's audio
      audioService.muteRemoteAudio(socketId, !newMicState);
      
      // Update UI
      dispatch({
        type: 'UPDATE_PARTICIPANT',
        payload: { socketId, updates: { isMicOn: newMicState } }
      });
      
      console.log(`User ${socketId} mic ${newMicState ? 'ON' : 'OFF'}`);
    }
  }, [state.room.participants]);

  const requestUserScreenShare = useCallback((socketId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('admin-request-screen-share', { targetId: socketId });
      dispatch({ type: 'SET_USER', payload: { isScreenSharing: true } });
    }
  }, []);

  const contextValue: AppContextType = {
    user: state.user,
    room: state.room,
    connection: state.connection,
    joinRoom,
    leaveRoom,
    sendMessage,
    toggleMic,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    toggleUserMic,
    requestUserScreenShare
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

// Hook to use the context
export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
