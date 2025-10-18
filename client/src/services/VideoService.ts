import { VideoService } from '../types';

class VideoServiceImpl implements VideoService {
  private videoStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;

  public async startVideo(): Promise<MediaStream> {
    if (this.videoStream) {
      return this.videoStream;
    }

    try {
      console.log('Requesting camera access...');
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      console.log('Camera access granted:', this.videoStream);
      return this.videoStream;
    } catch (error) {
      console.error('Failed to access camera:', error);
      throw new Error('Не удалось получить доступ к камере. Проверьте разрешения браузера.');
    }
  }

  public stopVideo(): void {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
  }

  public async startScreenShare(): Promise<MediaStream> {
    if (this.screenStream) {
      return this.screenStream;
    }

    try {
      console.log('Requesting screen share access...');
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      console.log('Screen share access granted:', this.screenStream);
      
      // Handle screen share stop
      this.screenStream.getVideoTracks()[0].onended = () => {
        console.log('Screen share ended by user');
        this.stopScreenShare();
        // Emit to server that screen share stopped
        if ((window as any).socketRef && (window as any).socketRef.current) {
          (window as any).socketRef.current.emit('user-screen-share-stopped');
        }
      };

      return this.screenStream;
    } catch (error) {
      console.error('Failed to access screen share:', error);
      if (error.name === 'NotAllowedError') {
        throw new Error('Демонстрация экрана отклонена пользователем');
      } else {
        throw new Error('Не удалось начать демонстрацию экрана: ' + error.message);
      }
    }
  }

  public stopScreenShare(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
  }

  public isVideoOn(): boolean {
    return this.videoStream !== null && this.videoStream.getVideoTracks().some(track => track.enabled);
  }

  public isScreenSharing(): boolean {
    return this.screenStream !== null;
  }

  public getVideoStream(): MediaStream | null {
    return this.videoStream;
  }

  public getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  public setVideoElement(element: HTMLVideoElement | null): void {
    this.videoElement = element;
  }

  public playRemoteVideo(stream: MediaStream): void {
    console.log('Playing remote video stream:', stream);
    
    // Find or create video element
    let videoElement = document.getElementById('main-video') as HTMLVideoElement;
    if (!videoElement) {
      videoElement = document.createElement('video');
      videoElement.id = 'main-video';
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = false; // Unmute for screen share
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'cover';
      videoElement.style.backgroundColor = '#000';
      
      const container = document.querySelector('.video-container');
      if (container) {
        // Clear existing content
        container.innerHTML = '';
        container.appendChild(videoElement);
      }
    }
    
    videoElement.srcObject = stream;
    videoElement.play().then(() => {
      console.log('Video playing successfully');
    }).catch(err => {
      console.error('Failed to play video:', err);
    });
    
    this.videoElement = videoElement;
  }

  public stopRemoteVideo(): void {
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  public setVideoMute(muted: boolean): void {
    if (this.videoStream) {
      this.videoStream.getVideoTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }
}

export const videoService = new VideoServiceImpl();
export default videoService;
