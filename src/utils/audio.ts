// Simple oscillator-based beep using Web Audio API
// No external files needed

let audioContext: AudioContext | null = null;

export const playBeep = (frequency = 1000, duration = 100, type: OscillatorType = 'square') => {
  try {
    if (!audioContext) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency; // Hz

    gainNode.gain.value = 0.1; // Volume (10%)

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
    }, duration);
  } catch (e) {
    console.error('Audio play failed', e);
  }
};

export const playError = () => {
  // Low pitch double beep
  playBeep(200, 150, 'sawtooth');
  setTimeout(() => playBeep(200, 150, 'sawtooth'), 200);
};

export const playSuccess = () => {
  // High pitch single beep (standard scanner sound)
  playBeep(1200, 100, 'square');
};
