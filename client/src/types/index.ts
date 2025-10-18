// Core types for the application
export interface Participant {
  socketId: string;
  name: string;
  role: 'admin' | 'user';
  isMicOn: boolean;
  isVideoOn?: boolean;
  isScreenSharing?: boolean;
}

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  timestamp: number;
}

export interface RoomState {
  roomId: string;
  participants: Participant[];
  adminId: string | null;
  messages: ChatMessage[];
}

export interface UserState {
  userName: string;
  role: 'admin' | 'user';
  isConnected: boolean;
  isMicOn: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
}

// WebRTC types
export interface WebRTCConfig {
  initiator: boolean;
  trickle: boolean;
  stream?: MediaStream | null;
  config?: RTCConfiguration;
}

export interface WebRTCEvents {
  signal: (data: RTCSessionDescriptionInit | RTCIceCandidateInit) => void;
  connect: () => void;
  stream: (stream: MediaStream) => void;
  error: (error: Error) => void;
  close: () => void;
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'failed';
  error?: string;
  retryCount: number;
}

// Service types
export interface AudioService {
  startAudio(): Promise<MediaStream>;
  stopAudio(): void;
  toggleMute(): void;
  isMuted(): boolean;
}

export interface VideoService {
  startVideo(): Promise<MediaStream>;
  stopVideo(): void;
  startScreenShare(): Promise<MediaStream>;
  stopScreenShare(): void;
  isVideoOn(): boolean;
  isScreenSharing(): boolean;
}

export interface WebRTCService {
  createConnection(config: WebRTCConfig): Promise<WebRTCConnection>;
  destroyConnection(connectionId: string): void;
  getConnection(connectionId: string): WebRTCConnection | undefined;
}

export interface WebRTCConnection {
  id: string;
  peer: RTCPeerConnection;
  stream?: MediaStream;
  on<K extends keyof WebRTCEvents>(event: K, callback: WebRTCEvents[K]): void;
  signal(data: RTCSessionDescriptionInit | RTCIceCandidateInit): Promise<void>;
  destroy(): void;
}

// Context types
export interface AppContextType {
  // State
  user: UserState;
  room: RoomState;
  connection: ConnectionState;
  
  // Actions
  joinRoom: (roomId: string, userName: string, role: 'admin' | 'user') => Promise<void>;
  leaveRoom: () => void;
  sendMessage: (text: string) => void;
  toggleMic: () => void;
  toggleVideo: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  toggleUserMic: (socketId: string) => void;
  requestUserScreenShare: (socketId: string) => void;
}
