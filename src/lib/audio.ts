export const playAudio = (type: 'correct' | 'wrong' | 'win' | 'tick') => {
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'correct') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(659.25, now); // E5
            oscillator.frequency.exponentialRampToValueAtTime(1318.51, now + 0.1); // E6
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.5, now + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            oscillator.start(now);
            oscillator.stop(now + 0.3);
        } else if (type === 'wrong') {
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(300, now);
            oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.2);
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            oscillator.start(now);
            oscillator.stop(now + 0.3);
        } else if (type === 'win') {
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(523.25, now); // C5
            oscillator.frequency.setValueAtTime(659.25, now + 0.15); // E5
            oscillator.frequency.setValueAtTime(783.99, now + 0.3); // G5
            oscillator.frequency.setValueAtTime(1046.50, now + 0.45); // C6
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
            gainNode.gain.setValueAtTime(0.3, now + 0.6);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
            oscillator.start(now);
            oscillator.stop(now + 1.0);
        } else if (type === 'tick') {
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(800, now);
            oscillator.frequency.exponentialRampToValueAtTime(400, now + 0.05);
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.1, now + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            oscillator.start(now);
            oscillator.stop(now + 0.1);
        }
    } catch (e) {
        console.error("Audio play failed", e);
    }
};
