// Score generation — synthesized music beds, written as WAV.
//
//   node scripts/score.mjs          generate every cue
//   node scripts/score.mjs s1a      just one
//
// This is synthesis, not composition. A drone is oscillators, a filter sweep and
// an interval choice; that is squarely something to write directly rather than
// ask a model for, and it buys exact timing — the swell can peak on the frame
// the record scratch lands, which no library track will do.
//
// Stems are written clean. Ducking under narration happens at render time from
// the measured segment times (see src/score.ts), so levels stay adjustable
// without regenerating audio.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'score');
const SR = 44100;

// ------------------------------------------------------------------ WAV out

function writeWav(path, left, right) {
  const n = left.length;
  const data = Buffer.alloc(n * 4); // 16-bit stereo
  for (let i = 0; i < n; i++) {
    // Soft clip rather than hard wrap, so an overshoot saturates instead of tearing.
    const l = Math.tanh(left[i]);
    const r = Math.tanh(right[i]);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l * 32767))), i * 4);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r * 32767))), i * 4 + 2);
  }

  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); // PCM
  fmt.writeUInt16LE(2, 2); // channels
  fmt.writeUInt32LE(SR, 4);
  fmt.writeUInt32LE(SR * 4, 8); // byte rate
  fmt.writeUInt16LE(4, 12); // block align
  fmt.writeUInt16LE(16, 14); // bits

  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(4 + 8 + fmt.length + 8 + data.length, 4);
  head.write('WAVE', 8, 'ascii');
  const fh = Buffer.alloc(8);
  fh.write('fmt ', 0, 'ascii');
  fh.writeUInt32LE(fmt.length, 4);
  const dh = Buffer.alloc(8);
  dh.write('data', 0, 'ascii');
  dh.writeUInt32LE(data.length, 4);

  writeFileSync(path, Buffer.concat([head, fh, fmt, dh, data]));
}

// ------------------------------------------------------------------ synthesis

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
/** Smoothstep — no corners in the envelopes, which is what makes a swell breathe. */
const ease = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/** Band-limited-ish saw: a few harmonics summed, cheap and free of harsh aliasing. */
function saw(phase, harmonics = 8) {
  let v = 0;
  for (let h = 1; h <= harmonics; h++) v += Math.sin(2 * Math.PI * phase * h) / h;
  return v * 0.55;
}

/** One-pole low-pass with a per-sample cutoff, for the filter sweep. */
function makeLowpass() {
  let z = 0;
  return (x, cutoffHz) => {
    const c = Math.max(20, Math.min(SR / 2.2, cutoffHz));
    const a = 1 - Math.exp((-2 * Math.PI * c) / SR);
    z += a * (x - z);
    return z;
  };
}

/** Schroeder-ish smear. Enough space that the drone sits in a room. */
function makeReverb(delaysMs, feedback) {
  const lines = delaysMs.map((ms) => ({
    buf: new Float32Array(Math.round((ms / 1000) * SR)),
    i: 0,
  }));
  return (x) => {
    let out = 0;
    for (const l of lines) {
      const y = l.buf[l.i];
      l.buf[l.i] = x + y * feedback;
      l.i = (l.i + 1) % l.buf.length;
      out += y;
    }
    return out / lines.length;
  };
}

/**
 * The Scene 1 bed: a rising, unstable drone.
 *
 * D2 and D3 hold the floor, A3 gives it something stable to sit on, and a
 * tritone (G#) fades in over the top — the interval that makes it read as dread
 * rather than as ambience. The low-pass opens across the whole cue, so the
 * "swell" is brightness arriving, not just volume.
 */
function eerieDrone(seconds) {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  // Everything an octave down from the first pass, and the shimmer gone. Dread
  // lives in the low mids; the earlier version climbed into a register that read
  // as sci-fi decoration rather than menace.
  //
  // `wobble` is the depth of a slow tape-warp drift, per voice at its own rate,
  // so the detuning is never uniform and the pitch is never quite settled.
  const voices = [
    { hz: 36.71, gain: 0.30, detune: 0.04, enter: 0.0, harmonics: 4, wobble: 0.0008, rate: 0.13 }, // D1, felt not heard
    { hz: 73.42, gain: 0.44, detune: 0.07, enter: 0.0, harmonics: 6, wobble: 0.0022, rate: 0.19 }, // D2
    { hz: 110.0, gain: 0.20, detune: 0.13, enter: 0.22, harmonics: 6, wobble: 0.0035, rate: 0.27 }, // A2, the fifth
    { hz: 146.83, gain: 0.22, detune: 0.10, enter: 0.10, harmonics: 7, wobble: 0.0030, rate: 0.16 }, // D3
    { hz: 103.83, gain: 0.19, detune: 0.26, enter: 0.42, harmonics: 6, wobble: 0.0070, rate: 0.29 }, // G#2 — low enough to beat against D2 rather than sound like a separate note
  ];

  // Fixed starting phases rather than Math.random(): regenerating the score must
  // produce byte-identical audio, or a re-render silently differs from the take
  // that was reviewed. The offsets just need to be mutually irrational-ish so the
  // voices do not start in lockstep.
  const phase = voices.map((_, i) => ({
    l: (i * 0.6180339887) % 1,
    r: (i * 0.4142135624 + 0.37) % 1,
  }));
  const lpL = makeLowpass();
  const lpR = makeLowpass();
  const revL = makeReverb([37, 53, 71, 97], 0.72);
  const revR = makeReverb([41, 59, 79, 101], 0.72);

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / seconds; // 0..1 through the cue

    // Slow breathing across the whole bed.
    const lfo = Math.sin(2 * Math.PI * 0.06 * t) * 0.5 + 0.5;

    let l = 0;
    let r = 0;
    for (let v = 0; v < voices.length; v++) {
      const voice = voices[v];
      const enter = ease((p - voice.enter) / 0.35);
      if (enter <= 0) continue;

      // Tape-warp drift: two incommensurate slow sines, so it never repeats
      // audibly and the pitch keeps sagging and recovering.
      const warp =
        voice.wobble *
        (Math.sin(2 * Math.PI * voice.rate * t) +
          0.6 * Math.sin(2 * Math.PI * voice.rate * 1.618 * t + v));

      // Detune split across the stereo field: the beating is the width.
      const fL = voice.hz * (1 - voice.detune / 100) * (1 + warp);
      const fR = voice.hz * (1 + voice.detune / 100) * (1 - warp * 0.85);
      phase[v].l = (phase[v].l + fL / SR) % 1;
      phase[v].r = (phase[v].r + fR / SR) % 1;

      const g = voice.gain * enter * (0.82 + lfo * 0.18);
      l += saw(phase[v].l, voice.harmonics) * g;
      r += saw(phase[v].r, voice.harmonics) * g;
    }

    // Kept deliberately dark. The swell is weight and motion arriving, not
    // brightness — opening the filter is what made the first pass sound thin.
    const cutoff = lerp(180, 780, ease(p * 1.1)) + ease((p - 0.78) / 0.22) * 520;
    l = lpL(l, cutoff);
    r = lpR(r, cutoff);

    l = l * 0.72 + revL(l) * 0.5;
    r = r * 0.72 + revR(r) * 0.5;

    // Fade in from nothing and keep climbing to the very last sample. There is
    // no fade-out: the cut at the record scratch is the ending.
    const env = ease(t / 2.6) * lerp(0.5, 1.0, ease((p - 0.3) / 0.7));
    left[i] = l * env;
    right[i] = r * env;
  }

  return { left, right };
}

// ------------------------------------------------------------------ main

const manifest = JSON.parse(readFileSync(join(ROOT, 'src', 'audio-manifest.json'), 'utf8'));

// Must match HOLD in src/Full.tsx — the dark grid the film rests on between
// scenes. The bed plays straight through it, which is the whole point: music
// that fades with the picture would put a seam at every scene boundary.
const HOLD_S = 0.8;
const S1A_TAIL_S = 2.0; // must match Scene1.tsx's beatFrames('s1a', ...)
const FREEZE_S = 7 / 30; // Scene 1b holds a frozen frame before the wipe

const CUES = {
  /**
   * The opening bed. Spans Scene 1a, the dark hold, and Scene 1b up to the
   * moment the boil freezes — then stops dead. The swell is shaped to peak
   * exactly there, so the record scratch guillotines it mid-rise.
   */
  opening: {
    seconds: () =>
      manifest.s1a.seconds + S1A_TAIL_S + HOLD_S + manifest.s1b.cues.notOrganic + FREEZE_S + 0.4,
    render: eerieDrone,
  },
};

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const selected = Object.keys(CUES).filter((k) => !only.length || only.includes(k));

mkdirSync(OUT_DIR, { recursive: true });
for (const id of selected) {
  const spec = CUES[id];
  const seconds = spec.seconds();
  const { left, right } = spec.render(seconds);
  const path = join(OUT_DIR, `${id}.wav`);
  writeWav(path, left, right);
  console.log(`${id.padEnd(5)} ${seconds.toFixed(2)}s  -> public/score/${id}.wav`);
}
