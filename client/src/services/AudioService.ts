import { AudioService } from '../types';

class AudioServiceImpl implements AudioService {
  private stream: MediaStream | null = null;
  private audioElements: HTMLAudioElement[] = [];

  public async startAudio(): Promise<MediaStream> {
    if (this.stream) {
      return this.stream;
    }

    try {
      console.log('Requesting microphone access...');
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        },
        video: false
      });

      console.log('Microphone access granted:', this.stream);
      return this.stream;
    } catch (error) {
      console.error('Failed to access microphone:', error);
      throw new Error('Не удалось получить доступ к микрофону. Проверьте разрешения браузера.');
    }
  }

  public stopAudio(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.cleanupAudioElements();
  }

  public toggleMute(): void {
    if (this.stream) {
      const audioTracks = this.stream.getAudioTracks();
      const isMuted = audioTracks.every(track => !track.enabled);
      
      audioTracks.forEach(track => {
        track.enabled = isMuted;
      });
      
      console.log(`Audio ${isMuted ? 'unmuted' : 'muted'}`);
    }
  }

  public isMuted(): boolean {
    if (!this.stream) return true;
    const audioTracks = this.stream.getAudioTracks();
    return audioTracks.every(track => !track.enabled);
  }

  public playRemoteAudio(stream: MediaStream, connectionId: string): void {
    console.log(`Playing remote audio for connection: ${connectionId}`);
    
    // Remove existing audio element for this connection
    this.removeAudioElement(connectionId);
    
    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.volume = 1.0;
    audio.style.display = 'none';
    audio.id = `audio-${connectionId}`;
    
    audio.onloadedmetadata = () => {
      console.log(`Audio metadata loaded for: ${connectionId}`);
      audio.play().catch(err => {
        console.error(`Failed to play audio for ${connectionId}:`, err);
      });
    };

    audio.onerror = (error) => {
      console.error(`Audio error for ${connectionId}:`, error);
    };

    document.body.appendChild(audio);
    this.audioElements.push(audio);
  }

  public removeAudioElement(connectionId: string): void {
    const audio = document.getElementById(`audio-${connectionId}`) as HTMLAudioElement;
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
    }
    
    this.audioElements = this.audioElements.filter(el => el.id !== `audio-${connectionId}`);
  }

  private cleanupAudioElements(): void {
    this.audioElements.forEach(audio => {
      audio.pause();
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
    });
    this.audioElements = [];
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  public setMute(muted: boolean): void {
    console.log('=== SETTING MICROPHONE MUTE STATE ===');
    console.log('Requested mute state:', muted);
    
    if (!this.stream) {
      console.error('No audio stream available!');
      return;
    }
    
    const audioTracks = this.stream.getAudioTracks();
    console.log('Found audio tracks:', audioTracks.length);
    
    audioTracks.forEach((track, index) => {
      const wasEnabled = track.enabled;
      track.enabled = !muted;
      console.log(`Track ${index} (${track.id}): ${wasEnabled} -> ${track.enabled}`);
    });
    
    // Verify the change
    const actualMuteState = this.getMuteState();
    console.log('Actual mute state after change:', actualMuteState);
    console.log('=== MICROPHONE MUTE SET COMPLETE ===');
  }

  public getMuteState(): boolean {
    if (!this.stream) return true;
    const audioTracks = this.stream.getAudioTracks();
    const isMuted = audioTracks.every(track => !track.enabled);
    console.log('Current mute state:', isMuted);
    return isMuted;
  }

  public getMicVolume(): number {
    return 100; // Placeholder
  }

  public setMicVolume(volume: number): void {
    // Placeholder for volume control
  }

  public getSpeakerVolume(): number {
    return 100; // Placeholder
  }

  public setSpeakerVolume(volume: number): void {
    // Placeholder for volume control
  }
}

export const audioService = new AudioServiceImpl();
export default audioService;
