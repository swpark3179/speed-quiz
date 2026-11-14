import { usePrefs } from '@/stores/prefs';

/**
 * Game-show sound effects synthesized with the Web Audio API — no audio files,
 * no licensing, works offline. Used on the presenter screen only.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function unlockAudio(): void {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function ready(): { ac: AudioContext; out: GainNode } | null {
  const { sound, volume } = usePrefs.getState();
  if (!sound || !ctx || !master || ctx.state !== 'running') return null;
  master.gain.value = volume * 0.6;
  return { ac: ctx, out: master };
}

function tone(
  freq: number,
  start: number,
  duration: number,
  opts: { type?: OscillatorType; gain?: number; slideTo?: number; attack?: number } = {},
): void {
  const r = ready();
  if (!r) return;
  const { ac, out } = r;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + duration);
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noise(start: number, duration: number, gain = 0.2, filterFreq = 1200): void {
  const r = ready();
  if (!r) return;
  const { ac, out } = r;
  const t0 = ac.currentTime + start;
  const len = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(out);
  src.start(t0);
}

export const sfx = {
  pop: () => tone(660, 0, 0.12, { type: 'triangle', gain: 0.18, slideTo: 990 }),
  tick: () => tone(1200, 0, 0.05, { type: 'square', gain: 0.08 }),
  tickUrgent: () => tone(1600, 0, 0.07, { type: 'square', gain: 0.14 }),
  whoosh: () => noise(0, 0.35, 0.25, 900),
  timeUp: () => {
    tone(440, 0, 0.18, { type: 'sawtooth', gain: 0.18 });
    tone(330, 0.2, 0.35, { type: 'sawtooth', gain: 0.18 });
  },
  ding: () => {
    tone(1318.5, 0, 0.6, { type: 'sine', gain: 0.3 });
    tone(1975.5, 0.02, 0.5, { type: 'sine', gain: 0.12 });
  },
  buzz: () => tone(140, 0, 0.35, { type: 'sawtooth', gain: 0.2 }),
  /** rolling snare-ish drumroll for `duration` seconds, with optional crescendo */
  drumroll: (duration = 1.2, crescendo = false) => {
    const hits = Math.floor(duration / 0.045);
    for (let i = 0; i < hits; i++) {
      const g = crescendo ? 0.06 + (0.22 * i) / hits : 0.12;
      noise(i * 0.045, 0.04, g, 1800);
    }
  },
  cymbal: () => noise(0, 1.2, 0.35, 6000),
  fanfare: () => {
    const notes: [number, number, number][] = [
      [523.25, 0, 0.18],
      [659.25, 0.18, 0.18],
      [783.99, 0.36, 0.18],
      [1046.5, 0.54, 0.7],
    ];
    for (const [f, s, d] of notes) {
      tone(f, s, d, { type: 'square', gain: 0.12 });
      tone(f / 2, s, d, { type: 'triangle', gain: 0.1 });
    }
    noise(0.54, 1, 0.2, 5000);
  },
  chime: () => {
    [880, 1108.73, 1318.5].forEach((f, i) => tone(f, i * 0.07, 0.4, { type: 'sine', gain: 0.15 }));
  },
};
