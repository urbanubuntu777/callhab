import { useCallback, useEffect, useRef } from 'react';
import { webRTCService } from '../services/WebRTCService';
import { audioService } from '../services/AudioService';
import { videoService } from '../services/VideoService';

export function useWebRTC() {
  const connectionsRef = useRef(new Map<string, any>());

  const createAudioConnection = useCallback(async (targetId: string, isInitiator: boolean) => {
    try {
      console.log(`Creating audio connection: ${targetId}, initiator: ${isInitiator}`);
      
      const config = {
        initiator: isInitiator,
        trickle: false,
        stream: isInitiator ? audioService.getStream() || undefined : undefined
      };
      
      const connection = await webRTCService.createConnection(config);
      connectionsRef.current.set(targetId, connection);
      
      // Set up event handlers
      connection.on('signal', (data) => {
        console.log(`Audio signal from ${targetId}:`, 'type' in data ? data.type : 'candidate');
        // Signal will be handled by the parent component
      });
      
      connection.on('stream', (stream) => {
        console.log(`Received audio stream from ${targetId}`);
        audioService.playRemoteAudio(stream, targetId);
      });
      
      connection.on('error', (error) => {
        console.error(`Audio connection error for ${targetId}:`, error);
      });
      
      connection.on('close', () => {
        console.log(`Audio connection closed for ${targetId}`);
        connectionsRef.current.delete(targetId);
        audioService.removeAudioElement(targetId);
      });
      
      return connection;
    } catch (error) {
      console.error(`Failed to create audio connection for ${targetId}:`, error);
      throw error;
    }
  }, []);

  const createVideoConnection = useCallback(async (targetId: string, isInitiator: boolean, stream?: MediaStream) => {
    try {
      console.log(`Creating video connection: ${targetId}, initiator: ${isInitiator}`);
      
      const config = {
        initiator: isInitiator,
        trickle: false,
        stream: stream || (isInitiator ? videoService.getScreenStream() || undefined : undefined)
      };
      
      const connection = await webRTCService.createConnection(config);
      connectionsRef.current.set(`video-${targetId}`, connection);
      
      // Set up event handlers
      connection.on('signal', (data) => {
        console.log(`Video signal from ${targetId}:`, 'type' in data ? data.type : 'candidate');
        // Signal will be handled by the parent component
      });
      
      connection.on('stream', (stream) => {
        console.log(`Received video stream from ${targetId}`);
        videoService.playRemoteVideo(stream);
      });
      
      connection.on('error', (error) => {
        console.error(`Video connection error for ${targetId}:`, error);
      });
      
      connection.on('close', () => {
        console.log(`Video connection closed for ${targetId}`);
        connectionsRef.current.delete(`video-${targetId}`);
        videoService.stopRemoteVideo();
      });
      
      return connection;
    } catch (error) {
      console.error(`Failed to create video connection for ${targetId}:`, error);
      throw error;
    }
  }, []);

  const destroyConnection = useCallback((targetId: string) => {
    const connection = connectionsRef.current.get(targetId);
    if (connection) {
      connection.destroy();
      connectionsRef.current.delete(targetId);
    }
  }, []);

  const destroyAllConnections = useCallback(() => {
    console.log('Destroying all WebRTC connections');
    connectionsRef.current.forEach(connection => connection.destroy());
    connectionsRef.current.clear();
  }, []);

  const getConnection = useCallback((targetId: string) => {
    return connectionsRef.current.get(targetId);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyAllConnections();
    };
  }, [destroyAllConnections]);

  return {
    createAudioConnection,
    createVideoConnection,
    destroyConnection,
    destroyAllConnections,
    getConnection
  };
}
