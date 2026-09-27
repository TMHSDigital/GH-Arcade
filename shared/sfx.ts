// Tiny WebAudio synth so games get retro sound effects without shipping audio files.
// The AudioContext is created lazily on first play, which happens after a user gesture.
// Volume and mute come from the arcade settings, so they carry across games and visits.

import { getSettings, updateSettings } from './settings';

let ctx: AudioContext | null = null;

/** Master volume multiplier, or 0 when muted. */
function master(): number {
  const s = getSettings();
  return s.muted ? 0 : Math.max(0, Math.min(1, s.volume));
}

function audio(): AudioContext | null {
  if (master() <= 0) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export interface ToneOptions {
  freq: number;
  /** Frequency to slide to over the duration. */
  toFreq?: number;
  duration?: number;
  type?: OscillatorType;
  volume?: number;
}

export function tone({ freq, toFreq, duration = 0.1, type = 'square', volume = 0.08 }: ToneOptions): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, t + duration);
  gain.gain.setValueAtTime(volume * master(), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration);
}

/** Short burst of filtered noise, for explosions and impacts. */
export function noise(duration = 0.2, volume = 0.1): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume * master(), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(gain).connect(ac.destination);
  src.start(t);
}

export function setMuted(value: boolean): void {
  updateSettings({ muted: value });
}

export function isMuted(): boolean {
  return getSettings().muted;
}
