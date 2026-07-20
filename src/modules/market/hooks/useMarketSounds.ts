// ============================================================================
// MARKET SOUNDS HOOK
// Audio feedback for scanning operations (success/error beeps)
// ============================================================================

import { useRef, useCallback, useEffect } from 'react';

const SOUND_URLS = {
  success: '/sounds/scan-success.mp3',
  error: '/sounds/scan-error.mp3',
};

// Fallback: Generate beep sounds using Web Audio API if files don't exist
function createBeep(frequency: number, duration: number, type: OscillatorType = 'sine'): Promise<void> {
  return new Promise((resolve) => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
      
      setTimeout(() => {
        audioContext.close();
        resolve();
      }, duration * 1000);
    } catch (e) {
      console.warn('Web Audio API not available:', e);
      resolve();
    }
  });
}

export interface UseMarketSoundsReturn {
  /** Play success beep */
  playSuccess: () => void;
  /** Play error buzz */
  playError: () => void;
  /** Whether sounds are muted */
  isMuted: boolean;
  /** Toggle mute */
  toggleMute: () => void;
}

export function useMarketSounds(): UseMarketSoundsReturn {
  const successAudioRef = useRef<HTMLAudioElement | null>(null);
  const errorAudioRef = useRef<HTMLAudioElement | null>(null);
  const isMutedRef = useRef(false);
  const audioLoadedRef = useRef({ success: false, error: false });

  // Initialize audio elements
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Try to load success sound
    const successAudio = new Audio(SOUND_URLS.success);
    successAudio.volume = 0.5;
    successAudio.preload = 'auto';
    
    successAudio.addEventListener('canplaythrough', () => {
      audioLoadedRef.current.success = true;
    });
    
    successAudio.addEventListener('error', () => {
      console.warn('Success sound file not found, will use fallback beep');
      audioLoadedRef.current.success = false;
    });
    
    successAudioRef.current = successAudio;

    // Try to load error sound
    const errorAudio = new Audio(SOUND_URLS.error);
    errorAudio.volume = 0.5;
    errorAudio.preload = 'auto';
    
    errorAudio.addEventListener('canplaythrough', () => {
      audioLoadedRef.current.error = true;
    });
    
    errorAudio.addEventListener('error', () => {
      console.warn('Error sound file not found, will use fallback beep');
      audioLoadedRef.current.error = false;
    });
    
    errorAudioRef.current = errorAudio;

    return () => {
      successAudioRef.current = null;
      errorAudioRef.current = null;
    };
  }, []);

  const playSuccess = useCallback(() => {
    if (isMutedRef.current) return;

    if (audioLoadedRef.current.success && successAudioRef.current) {
      successAudioRef.current.currentTime = 0;
      successAudioRef.current.play().catch(() => {
        // Fallback to Web Audio beep
        createBeep(1000, 0.1);
      });
    } else {
      // Fallback: High-pitched short beep
      createBeep(1000, 0.1);
    }
  }, []);

  const playError = useCallback(() => {
    if (isMutedRef.current) return;

    if (audioLoadedRef.current.error && errorAudioRef.current) {
      errorAudioRef.current.currentTime = 0;
      errorAudioRef.current.play().catch(() => {
        // Fallback to Web Audio buzz
        createBeep(200, 0.3, 'sawtooth');
      });
    } else {
      // Fallback: Low-pitched buzz
      createBeep(200, 0.3, 'sawtooth');
    }
  }, []);

  const toggleMute = useCallback(() => {
    isMutedRef.current = !isMutedRef.current;
  }, []);

  return {
    playSuccess,
    playError,
    isMuted: isMutedRef.current,
    toggleMute,
  };
}
