// Web Audio API Sound Synthesizer for Vehicle Tracking Alarms
// Compatible with Mobile Web (iOS Safari / Android Chrome) and Desktop Browsers

let audioCtx: AudioContext | null = null;
let currentAlarmOscillators: { osc1?: OscillatorNode; osc2?: OscillatorNode; gain?: GainNode } | null = null;
let alarmLoopInterval: any = null;
let isUnlocked = false;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Call on any user gesture (click/touchstart) to unlock audio playback on mobile devices
 */
export function unlockAudio(): boolean {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'running') {
      isUnlocked = true;
      return true;
    }
    ctx.resume().then(() => {
      isUnlocked = true;
    }).catch(() => {});
  } catch (e) {
    console.warn('Could not unlock AudioContext:', e);
  }
  return isUnlocked;
}

// Auto-unlock on first user interaction on window
if (typeof window !== 'undefined') {
  const unlockEvents = ['click', 'touchstart', 'touchend', 'keydown'];
  const handleUserGesture = () => {
    unlockAudio();
    unlockEvents.forEach(evt => window.removeEventListener(evt, handleUserGesture));
  };
  unlockEvents.forEach(evt => window.addEventListener(evt, handleUserGesture, { passive: true }));
}

/**
 * Stop any currently playing audio nodes without stopping loop timer if not requested
 */
function stopCurrentOscillators() {
  if (currentAlarmOscillators) {
    try {
      if (currentAlarmOscillators.gain) {
        currentAlarmOscillators.gain.gain.setValueAtTime(0, getAudioContext().currentTime);
      }
      if (currentAlarmOscillators.osc1) currentAlarmOscillators.osc1.stop();
      if (currentAlarmOscillators.osc2) currentAlarmOscillators.osc2.stop();
    } catch (e) {}
    currentAlarmOscillators = null;
  }
}

/**
 * Stop any currently active alarm loop and sound
 */
export function stopAlarmSound() {
  if (alarmLoopInterval) {
    clearInterval(alarmLoopInterval);
    alarmLoopInterval = null;
  }
  stopCurrentOscillators();
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(0);
    } catch (e) {}
  }
  console.log('🔇 Alarm sound stopped');
}

/**
 * Play a single audio burst cycle
 */
function playSirenCycle(durationMs = 2800) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    stopCurrentOscillators();

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, now); // 100% Maximum volume
    masterGain.connect(ctx.destination);

    // Trigger mobile vibration at max pattern if supported
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([600, 200, 600, 200, 600, 200]);
      } catch (e) {}
    }

    // Emergency Police / Security Siren (Alternating 750Hz and 1550Hz sweep)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();

    osc1.type = 'sawtooth';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(750, now);
    osc2.frequency.setValueAtTime(1100, now);

    let high = false;
    const stepTime = 0.25;
    const totalSteps = Math.floor(durationMs / 250);

    for (let i = 0; i < totalSteps; i++) {
      const time = now + i * stepTime;
      if (high) {
        osc1.frequency.linearRampToValueAtTime(750, time + 0.1);
        osc2.frequency.linearRampToValueAtTime(1100, time + 0.1);
      } else {
        osc1.frequency.linearRampToValueAtTime(1250, time + 0.1);
        osc2.frequency.linearRampToValueAtTime(1550, time + 0.1);
      }
      high = !high;
    }

    const endTime = now + (durationMs / 1000);
    osc1.connect(masterGain);
    osc2.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(endTime);

    currentAlarmOscillators = { osc1, osc2, gain: masterGain };
  } catch (e) {
    console.error('Error playing siren cycle:', e);
  }
}

/**
 * Play continuous alarm on INFINITE loop until stopAlarmSound is called
 */
export function startLoopingAlarmSound() {
  stopAlarmSound();
  unlockAudio();
  playSirenCycle(2800);
  alarmLoopInterval = setInterval(() => {
    playSirenCycle(2800);
  }, 2850);
  console.log('🚨 Infinite alarm loop started');
}

/**
 * Play audible alarm sound on phone / browser once or for a fixed duration
 */
export function playAlarmSound(type: 'siren' | 'beep' | 'warning' | 'critical' = 'siren', durationMs = 3500) {
  if (type === 'siren' || type === 'critical') {
    startLoopingAlarmSound();
    return;
  }

  stopAlarmSound();
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);
    masterGain.connect(ctx.destination);

    // Rapid Alert Beeps
    const pulseCount = 4;
    const pulseDuration = 0.15;
    const gap = 0.1;

    for (let i = 0; i < pulseCount; i++) {
      const startTime = now + i * (pulseDuration + gap);
      const stopTime = startTime + pulseDuration;

      const osc = ctx.createOscillator();
      const pulseGain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(type === 'warning' ? 1000 : 880, startTime);

      pulseGain.gain.setValueAtTime(0.7, startTime);
      pulseGain.gain.exponentialRampToValueAtTime(0.01, stopTime);

      osc.connect(pulseGain);
      pulseGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(stopTime);
    }
  } catch (e) {
    console.error('Error playing alarm sound:', e);
  }
}

export function isAlarmPlaying() {
  return alarmLoopInterval !== null || currentAlarmOscillators !== null;
}

export function playAmbientNoise(volumeGainMultiplier: number = 1.0, isSpeakerphoneMode: boolean = false) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    stopCurrentOscillators();

    // Clean crystal-clear audio channel (no white/pink static noise)
    // Gentle warm acoustic resonance simulating clean room/cabin environment without static
    const cabinOsc = ctx.createOscillator();
    cabinOsc.type = 'sine';
    cabinOsc.frequency.value = 110; // Warm low ambient frequency

    const acousticOsc = ctx.createOscillator();
    acousticOsc.type = 'sine';
    acousticOsc.frequency.value = 220; // Clean harmonic 

    const speakerBoost = isSpeakerphoneMode ? 2.2 : 1.0;

    const mainGain = ctx.createGain();
    mainGain.gain.value = 0.35 * volumeGainMultiplier * speakerBoost;

    const cabinGain = ctx.createGain();
    cabinGain.gain.value = 0.02 * volumeGainMultiplier;

    const acousticGain = ctx.createGain();
    acousticGain.gain.value = 0.01 * volumeGainMultiplier;

    // Dynamics compressor for ultra-clean distortion-free sound
    const compressorNode = ctx.createDynamicsCompressor();
    compressorNode.threshold.setValueAtTime(-24, ctx.currentTime);
    compressorNode.knee.setValueAtTime(12, ctx.currentTime);
    compressorNode.ratio.setValueAtTime(4, ctx.currentTime);
    compressorNode.attack.setValueAtTime(0.005, ctx.currentTime);
    compressorNode.release.setValueAtTime(0.2, ctx.currentTime);

    cabinOsc.connect(cabinGain);
    acousticOsc.connect(acousticGain);

    cabinGain.connect(compressorNode);
    acousticGain.connect(compressorNode);
    compressorNode.connect(mainGain);

    mainGain.connect(ctx.destination);

    cabinOsc.start();
    acousticOsc.start();

    return {
      setVolume: (newVolume: number, speakerphone: boolean = false) => {
        try {
          const boost = speakerphone ? 2.2 : 1.0;
          mainGain.gain.value = 0.35 * newVolume * boost;
        } catch (e) {}
      },
      stop: () => {
        try {
          cabinOsc.stop();
          cabinOsc.disconnect();
          acousticOsc.stop();
          acousticOsc.disconnect();
          cabinGain.disconnect();
          acousticGain.disconnect();
          compressorNode.disconnect();
          mainGain.disconnect();
        } catch (e) {}
      }
    };
  } catch (e) {
    console.error('Error playing ambient noise:', e);
    return { setVolume: () => {}, stop: () => {} };
  }
}

/**
 * Play dual-tone multi-frequency (DTMF) sound tone for keypad digits (0-9, *, #)
 */
export function playDtmfTone(digit: string, durationMs = 150) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const dtmfFreqs: Record<string, [number, number]> = {
      '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
      '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
      '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
      '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
    };

    const pair = dtmfFreqs[digit] || [941, 1336];
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (durationMs / 1000));

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(pair[0], now);
    osc2.frequency.setValueAtTime(pair[1], now);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + (durationMs / 1000));
    osc2.stop(now + (durationMs / 1000));
  } catch (e) {
    console.warn('DTMF sound error:', e);
  }
}

/**
 * Play calling/ringback tone inside browser for softphone (440Hz + 480Hz telephone ring)
 */
export function playRingbackTone(durationMs = 1500) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.setValueAtTime(0.2, now + (durationMs / 1000) - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (durationMs / 1000));

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(440, now);
    osc2.frequency.setValueAtTime(480, now);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + (durationMs / 1000));
    osc2.stop(now + (durationMs / 1000));
  } catch (e) {}
}

let ringbackIntervalHandle: any = null;

export function startRingbackLoop() {
  stopRingbackLoop();
  stopCurrentOscillators();
  unlockAudio();
  playRingbackTone(1500);
  ringbackIntervalHandle = setInterval(() => {
    playRingbackTone(1500);
  }, 3500);
}

export function stopRingbackLoop() {
  if (ringbackIntervalHandle) {
    clearInterval(ringbackIntervalHandle);
    ringbackIntervalHandle = null;
  }
  stopCurrentOscillators();
}


