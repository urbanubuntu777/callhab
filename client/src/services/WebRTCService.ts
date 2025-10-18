import { WebRTCConfig, WebRTCConnection, WebRTCEvents } from '../types';

class WebRTCConnectionImpl implements WebRTCConnection {
  public id: string;
  public peer: RTCPeerConnection;
  public stream?: MediaStream;
  private listeners: Partial<WebRTCEvents> = {};

  constructor(id: string, config: WebRTCConfig) {
    this.id = id;
    this.stream = config.stream || undefined;
    
    this.peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      ...config.config
    });

    this.setupEventHandlers();
    
    if (this.stream) {
      this.addStream(this.stream);
    }
  }

  private setupEventHandlers() {
    this.peer.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[${this.id}] ICE candidate generated:`, event.candidate.type);
        this.emit('signal', {
          type: 'candidate',
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid
        } as RTCIceCandidateInit);
      } else {
        console.log(`[${this.id}] ICE gathering complete`);
      }
    };

    this.peer.oniceconnectionstatechange = () => {
      console.log(`[${this.id}] ICE connection state:`, this.peer.iceConnectionState);
      switch (this.peer.iceConnectionState) {
        case 'connected':
          this.emit('connect', undefined);
          break;
        case 'failed':
        case 'disconnected':
        case 'closed':
          this.emit('close', undefined);
          break;
      }
    };

    this.peer.ontrack = (event) => {
      console.log(`[${this.id}] Received remote stream`);
      this.emit('stream', event.streams[0]);
    };

    this.peer.onconnectionstatechange = () => {
      console.log(`[${this.id}] Connection state:`, this.peer.connectionState);
      if (this.peer.connectionState === 'failed') {
        this.emit('error', new Error('WebRTC connection failed'));
      }
    };
  }

  private addStream(stream: MediaStream) {
    if (this.peer && stream) {
      stream.getTracks().forEach(track => {
        this.peer.addTrack(track, stream);
      });
    }
  }

  public async signal(data: RTCSessionDescriptionInit | RTCIceCandidateInit): Promise<void> {
    try {
      console.log(`[${this.id}] Handling signal:`, 'type' in data ? data.type : 'candidate');
      
      if ('sdp' in data) {
        // Session description (offer/answer)
        await this.peer.setRemoteDescription(new RTCSessionDescription(data));
        
        if (data.type === 'offer') {
          const answer = await this.peer.createAnswer();
          await this.peer.setLocalDescription(answer);
          this.emit('signal', answer);
        }
      } else if ('candidate' in data) {
        // ICE candidate
        if (data.candidate) {
          await this.peer.addIceCandidate(new RTCIceCandidate({
            candidate: data.candidate,
            sdpMLineIndex: data.sdpMLineIndex,
            sdpMid: data.sdpMid
          }));
        }
      }
    } catch (error) {
      console.error(`[${this.id}] Error handling signal:`, error);
      this.emit('error', error as Error);
    }
  }

  public on<K extends keyof WebRTCEvents>(event: K, callback: WebRTCEvents[K]): void {
    this.listeners[event] = callback;
  }

  public emit<K extends keyof WebRTCEvents>(event: K, data: Parameters<WebRTCEvents[K]>[0]): void {
    const callback = this.listeners[event];
    if (callback) {
      callback(data as any);
    }
  }

  public destroy(): void {
    console.log(`[${this.id}] Destroying connection`);
    if (this.peer) {
      this.peer.close();
      this.peer = null as any;
    }
    this.listeners = {};
  }
}

class WebRTCService {
  private connections: Map<string, WebRTCConnection> = new Map();
  private connectionCounter = 0;

  public async createConnection(config: WebRTCConfig): Promise<WebRTCConnection> {
    const id = `connection_${++this.connectionCounter}`;
    console.log(`Creating WebRTC connection: ${id}`);
    
    try {
      const connection = new WebRTCConnectionImpl(id, config);
      this.connections.set(id, connection);
      
      // Start connection process if initiator
      if (config.initiator) {
        setTimeout(async () => {
          try {
            const offer = await connection.peer.createOffer();
            await connection.peer.setLocalDescription(offer);
            connection.emit('signal', offer);
          } catch (error) {
            console.error(`[${id}] Error creating offer:`, error);
            connection.emit('error', error as Error);
          }
        }, 100);
      }
      
      return connection;
    } catch (error) {
      console.error(`Failed to create WebRTC connection:`, error);
      throw error;
    }
  }

  public destroyConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.destroy();
      this.connections.delete(connectionId);
    }
  }

  public getConnection(connectionId: string): WebRTCConnection | undefined {
    return this.connections.get(connectionId);
  }

  public destroyAllConnections(): void {
    console.log('Destroying all WebRTC connections');
    this.connections.forEach(connection => connection.destroy());
    this.connections.clear();
  }
}

export const webRTCService = new WebRTCService();
export default webRTCService;
