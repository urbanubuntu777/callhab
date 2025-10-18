export class ScreenShareService {
  private screenWindow: Window | null = null;
  private screenStream: MediaStream | null = null;
  private thumbnailElement: HTMLVideoElement | null = null;
  private isSharing: boolean = false;

  public async startScreenShare(): Promise<MediaStream> {
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
      this.isSharing = true;
      
      // Create separate window for screen share
      this.createScreenWindow();
      
      // Create thumbnail in main window
      this.createThumbnail();
      
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
        throw new Error('Доступ к демонстрации экрана отклонен');
      } else if (error.name === 'NotFoundError') {
        throw new Error('Нет доступных источников для демонстрации экрана');
      } else {
        throw new Error('Не удалось получить доступ к демонстрации экрана');
      }
    }
  }

  private createScreenWindow(): void {
    if (this.screenWindow && !this.screenWindow.closed) {
      this.screenWindow.close();
    }

    const width = 800;
    const height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    this.screenWindow = window.open(
      '',
      'screenShare',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
    );

    if (this.screenWindow) {
      this.screenWindow.document.title = 'Демонстрация экрана - CallHub';
      this.screenWindow.document.body.style.margin = '0';
      this.screenWindow.document.body.style.padding = '0';
      this.screenWindow.document.body.style.backgroundColor = '#000';
      this.screenWindow.document.body.style.overflow = 'hidden';

      const video = this.screenWindow.document.createElement('video');
      video.srcObject = this.screenStream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = false;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
      video.style.backgroundColor = '#000';

      video.onloadedmetadata = () => {
        video.play().catch(err => {
          console.error('Failed to play screen share video:', err);
        });
      };

      this.screenWindow.document.body.appendChild(video);

      // Handle window close
      this.screenWindow.onbeforeunload = () => {
        this.stopScreenShare();
      };
    }
  }

  private createThumbnail(): void {
    // Remove existing thumbnail
    const existingThumbnail = document.getElementById('screen-thumbnail');
    if (existingThumbnail) {
      existingThumbnail.remove();
    }

    // Create thumbnail video element
    this.thumbnailElement = document.createElement('video');
    this.thumbnailElement.id = 'screen-thumbnail';
    this.thumbnailElement.srcObject = this.screenStream;
    this.thumbnailElement.autoplay = true;
    this.thumbnailElement.playsInline = true;
    this.thumbnailElement.muted = true; // Mute thumbnail
    this.thumbnailElement.style.width = '100%';
    this.thumbnailElement.style.height = '100%';
    this.thumbnailElement.style.objectFit = 'cover';
    this.thumbnailElement.style.borderRadius = '8px';
    this.thumbnailElement.style.cursor = 'pointer';

    // Add click handler to open full screen
    this.thumbnailElement.onclick = () => {
      if (this.screenWindow && !this.screenWindow.closed) {
        this.screenWindow.focus();
      } else {
        this.createScreenWindow();
      }
    };

    // Add to main video container
    const container = document.querySelector('.video-container');
    if (container) {
      container.innerHTML = '';
      container.appendChild(this.thumbnailElement);
    }
  }

  public stopScreenShare(): void {
    console.log('Stopping screen share');
    this.isSharing = false;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    if (this.screenWindow && !this.screenWindow.closed) {
      this.screenWindow.close();
      this.screenWindow = null;
    }

    if (this.thumbnailElement) {
      this.thumbnailElement.remove();
      this.thumbnailElement = null;
    }

    // Clear video container
    const container = document.querySelector('.video-container');
    if (container) {
      container.innerHTML = '<div class="no-video">Нет активной демонстрации экрана</div>';
    }
  }

  public isScreenSharing(): boolean {
    return this.isSharing;
  }

  public getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  public playRemoteScreenShare(stream: MediaStream): void {
    console.log('Playing remote screen share:', stream);
    
    // Create thumbnail for remote screen share
    const existingThumbnail = document.getElementById('screen-thumbnail');
    if (existingThumbnail) {
      existingThumbnail.remove();
    }

    this.thumbnailElement = document.createElement('video');
    this.thumbnailElement.id = 'screen-thumbnail';
    this.thumbnailElement.srcObject = stream;
    this.thumbnailElement.autoplay = true;
    this.thumbnailElement.playsInline = true;
    this.thumbnailElement.muted = false;
    this.thumbnailElement.style.width = '100%';
    this.thumbnailElement.style.height = '100%';
    this.thumbnailElement.style.objectFit = 'cover';
    this.thumbnailElement.style.borderRadius = '8px';
    this.thumbnailElement.style.cursor = 'pointer';

    // Add click handler to open full screen
    this.thumbnailElement.onclick = () => {
      this.openFullScreen(stream);
    };

    // Add to main video container
    const container = document.querySelector('.video-container');
    if (container) {
      container.innerHTML = '';
      container.appendChild(this.thumbnailElement);
    }
  }

  private openFullScreen(stream: MediaStream): void {
    if (this.screenWindow && !this.screenWindow.closed) {
      this.screenWindow.close();
    }

    const width = screen.width * 0.9;
    const height = screen.height * 0.9;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    this.screenWindow = window.open(
      '',
      'screenShare',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
    );

    if (this.screenWindow) {
      this.screenWindow.document.title = 'Демонстрация экрана - CallHub';
      this.screenWindow.document.body.style.margin = '0';
      this.screenWindow.document.body.style.padding = '0';
      this.screenWindow.document.body.style.backgroundColor = '#000';
      this.screenWindow.document.body.style.overflow = 'hidden';

      const video = this.screenWindow.document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = false;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
      video.style.backgroundColor = '#000';

      video.onloadedmetadata = () => {
        video.play().catch(err => {
          console.error('Failed to play screen share video:', err);
        });
      };

      this.screenWindow.document.body.appendChild(video);
    }
  }

  public stopRemoteScreenShare(): void {
    if (this.thumbnailElement) {
      this.thumbnailElement.remove();
      this.thumbnailElement = null;
    }

    if (this.screenWindow && !this.screenWindow.closed) {
      this.screenWindow.close();
      this.screenWindow = null;
    }

    // Clear video container
    const container = document.querySelector('.video-container');
    if (container) {
      container.innerHTML = '<div class="no-video">Нет активной демонстрации экрана</div>';
    }
  }
}

export const screenShareService = new ScreenShareService();
export default screenShareService;
