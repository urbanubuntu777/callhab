import React, { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';

interface VolumeControlsProps {
  className?: string;
}

export function VolumeControls({ className = '' }: VolumeControlsProps) {
  const { user } = useApp();
  const [micVolume, setMicVolume] = useState(100);
  const [speakerVolume, setSpeakerVolume] = useState(100);
  const [showControls, setShowControls] = useState(false);

  // Update audio elements volume when speaker volume changes
  useEffect(() => {
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
      audio.volume = speakerVolume / 100;
    });
  }, [speakerVolume]);

  const handleMicVolumeChange = (value: number) => {
    setMicVolume(value);
    // Here you would typically adjust the microphone gain
    // This is a placeholder for future implementation
    console.log('Mic volume set to:', value);
  };

  const handleSpeakerVolumeChange = (value: number) => {
    setSpeakerVolume(value);
  };

  if (user.role !== 'admin') {
    return null; // Only show for admin
  }

  return (
    <div className={`volume-controls ${className}`}>
      <button
        className="volume-toggle"
        onClick={() => setShowControls(!showControls)}
        title="Настройки громкости"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
      </button>
      
      {showControls && (
        <div className="volume-panel">
          <div className="volume-item">
            <label>Микрофон</label>
            <div className="volume-slider-container">
              <input
                type="range"
                min="0"
                max="100"
                value={micVolume}
                onChange={(e) => handleMicVolumeChange(Number(e.target.value))}
                className="volume-slider"
              />
              <span className="volume-value">{micVolume}%</span>
            </div>
          </div>
          
          <div className="volume-item">
            <label>Динамики</label>
            <div className="volume-slider-container">
              <input
                type="range"
                min="0"
                max="100"
                value={speakerVolume}
                onChange={(e) => handleSpeakerVolumeChange(Number(e.target.value))}
                className="volume-slider"
              />
              <span className="volume-value">{speakerVolume}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
