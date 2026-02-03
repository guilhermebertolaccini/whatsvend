import { useCallback, useRef } from 'react';

type SoundType = 'message' | 'success' | 'error' | 'warning';

// Get settings from localStorage (can't use hook here for the context)
const getSettings = () => {
  try {
    const stored = localStorage.getItem('vend-settings');
    if (stored) {
      return JSON.parse(stored).notifications;
    }
  } catch (e) {
    console.warn('Failed to load settings');
  }
  return { soundEnabled: true, volume: 50, messageSound: true, successSound: true, errorSound: true };
};

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playSound = useCallback(async (type: SoundType = 'message') => {
    const settings = getSettings();
    
    // Check if sounds are enabled
    if (!settings.soundEnabled) return;
    
    // Check individual sound type settings
    if (type === 'message' && !settings.messageSound) return;
    if (type === 'success' && !settings.successSound) return;
    if ((type === 'error' || type === 'warning') && !settings.errorSound) return;

    try {
      // Initialize AudioContext on first use
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;
      
      // Resume context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const now = audioContext.currentTime;
      const volumeMultiplier = settings.volume / 100;

      // Different frequencies for different sound types
      const frequencies: Record<SoundType, number[]> = {
        message: [880, 1100],
        success: [523, 659, 784],
        error: [330, 262],
        warning: [440, 440]
      };

      const freqs = frequencies[type];
      const duration = type === 'success' ? 0.3 : 0.15;

      freqs.forEach((freq, index) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.frequency.setValueAtTime(freq, now + index * (duration / freqs.length));
        osc.type = type === 'error' ? 'sawtooth' : 'sine';
        
        const maxGain = 0.2 * volumeMultiplier;
        gain.gain.setValueAtTime(0, now + index * (duration / freqs.length));
        gain.gain.linearRampToValueAtTime(maxGain, now + index * (duration / freqs.length) + 0.01);
        gain.gain.linearRampToValueAtTime(0, now + (index + 1) * (duration / freqs.length));
        
        osc.start(now + index * (duration / freqs.length));
        osc.stop(now + (index + 1) * (duration / freqs.length) + 0.1);
      });

    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  }, []);

  const playMessageSound = useCallback(() => playSound('message'), [playSound]);
  const playSuccessSound = useCallback(() => playSound('success'), [playSound]);
  const playErrorSound = useCallback(() => playSound('error'), [playSound]);
  const playWarningSound = useCallback(() => playSound('warning'), [playSound]);

  return {
    playSound,
    playMessageSound,
    playSuccessSound,
    playErrorSound,
    playWarningSound
  };
}
