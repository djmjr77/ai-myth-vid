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
function eerieDrone(seconds, shape = 'opening') {
  // 'closing' is the same instrument returning at the end of the film. Same
  // voices, same tuning — it has to be recognisably the sound from Scene 1 or
  // the bookend does not read as one — but shaped to resolve instead of being
  // guillotined. The opening path is left untouched, so opening.wav stays
  // byte-identical to the take that was reviewed.
  const closing = shape === 'closing';
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
      // The tritone is the dread. It arrives last in the opening and leaves
      // first in the closing: what the ear hears over the final lines is the
      // G# dissolving off a plain open fifth, which is the film landing on
      // "it's just math" rather than trailing off on an unresolved chord.
      const isTritone = v === voices.length - 1;
      const enter =
        closing && isTritone
          ? 1 - ease((p - 0.35) / 0.45)
          : ease((p - (closing ? voice.enter * 0.4 : voice.enter)) / 0.35);
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
    // The opening keeps opening to the last sample; the closing opens, then
    // shuts back down as it fades, so the bed sinks rather than stopping.
    const cutoff = closing
      ? lerp(200, 640, ease(p * 1.8)) - ease((p - 0.55) / 0.45) * 330
      : lerp(180, 780, ease(p * 1.1)) + ease((p - 0.78) / 0.22) * 520;
    l = lpL(l, cutoff);
    r = lpR(r, cutoff);

    l = l * 0.72 + revL(l) * 0.5;
    r = r * 0.72 + revR(r) * 0.5;

    // Fade in from nothing and keep climbing to the very last sample. There is
    // no fade-out: the cut at the record scratch is the ending.
    const CLOSING_FADE_S = 5.0;
    const env = closing
      ? // In under two seconds, because it enters mid-sentence under a line
        // that is already playing, then a long fall to true silence.
        ease(t / 1.8) *
        (1 - ease((t - (seconds - CLOSING_FADE_S)) / CLOSING_FADE_S)) *
        lerp(0.72, 1.0, ease(p / 0.55))
      : ease(t / 2.6) * lerp(0.5, 1.0, ease((p - 0.3) / 0.7));
    left[i] = l * env;
    right[i] = r * env;
  }

  return { left, right };
}

/**
 * A descending Shepard-Risset glissando.
 *
 * The same pitch class stacked across several octaves, sliding downward
 * together. A partial that reaches the bottom of the stack has already faded
 * to nothing, and a new one fades in at the top to replace it, so the slide
 * never arrives anywhere — the ear hears endless descent. (Shepard is the
 * stepped version; Risset's is this continuous one.)
 *
 * Under the middle of the film it is doing an argumentative job, not a
 * decorative one: Scenes 2-4 are the section where the hype keeps escalating
 * and never actually lands on anything, which is exactly what this sound is.
 *
 * Phase is accumulated per partial rather than computed from t, because the
 * frequencies are moving — `sin(2*pi*f(t)*t)` would tear on every sample. When
 * a partial wraps from the bottom of the stack back to the top its frequency
 * jumps by 2^octaves, but its amplitude is zero at both ends of the window, so
 * the jump is silent. That is the whole trick.
 */
function makeShepard({ f0 = 24.5, octaves = 7, period = 22, harmonics = 3 } = {}) {
  const phase = new Float64Array(octaves);
  // Spread the starting phases so the partials do not all begin in lockstep.
  for (let k = 0; k < octaves; k++) phase[k] = (k * 0.6180339887) % 1;

  return (t) => {
    // Descending: the position of each partial in the stack falls with time.
    const slide = (t / period) % 1;
    let out = 0;
    for (let k = 0; k < octaves; k++) {
      const x = (((k - slide) % octaves) + octaves) % octaves; // 0..octaves
      const f = f0 * Math.pow(2, x);
      phase[k] = (phase[k] + f / SR) % 1;
      // Raised cosine over the stack: zero at both ends, so partials enter and
      // leave inaudibly.
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / octaves);
      out += saw(phase[k], harmonics) * w * w;
    }
    return out / (octaves * 0.35);
  };
}

/**
 * The middle bed — Scenes 2 to 4, the explanatory stretch.
 *
 * The dread voices stay (this is still the same instrument) but the tritone is
 * gone: the middle of the film is where the argument is being laid out plainly,
 * and menace under it would be editorialising. What replaces it is the
 * glissando, which supplies motion without ever resolving.
 *
 * Level here is deliberately flat. The dip under the narration is applied in
 * `Full.tsx`, where it stays adjustable without regenerating six minutes of
 * audio — the same reason the ducking lives there.
 */
function middleBed(seconds) {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  const voices = [
    { hz: 36.71, gain: 0.30, detune: 0.04, harmonics: 4, wobble: 0.0010, rate: 0.11 }, // D1
    { hz: 73.42, gain: 0.40, detune: 0.07, harmonics: 5, wobble: 0.0024, rate: 0.17 }, // D2
    { hz: 110.0, gain: 0.16, detune: 0.13, harmonics: 5, wobble: 0.0038, rate: 0.23 }, // A2
    { hz: 146.83, gain: 0.15, detune: 0.10, harmonics: 6, wobble: 0.0032, rate: 0.14 }, // D3
  ];
  const phase = voices.map((_, i) => ({
    l: (i * 0.6180339887) % 1,
    r: (i * 0.4142135624 + 0.37) % 1,
  }));

  // Two glissandi at different rates, one per side. Identical ones hard-panned
  // would collapse to a point in the middle of the head; different periods keep
  // the descent wide and stop it sounding like a synth patch.
  const shepL = makeShepard({ period: 24 });
  const shepR = makeShepard({ period: 31, f0: 24.5 * 1.005 });

  const lpL = makeLowpass();
  const lpR = makeLowpass();
  const revL = makeReverb([37, 53, 71, 97], 0.72);
  const revR = makeReverb([41, 59, 79, 101], 0.72);

  const FADE_IN_S = 3.0;
  const FADE_OUT_S = 2.5;

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const lfo = Math.sin(2 * Math.PI * 0.05 * t) * 0.5 + 0.5;

    let l = 0;
    let r = 0;
    for (let v = 0; v < voices.length; v++) {
      const voice = voices[v];
      const warp =
        voice.wobble *
        (Math.sin(2 * Math.PI * voice.rate * t) +
          0.6 * Math.sin(2 * Math.PI * voice.rate * 1.618 * t + v));
      const fL = voice.hz * (1 - voice.detune / 100) * (1 + warp);
      const fR = voice.hz * (1 + voice.detune / 100) * (1 - warp * 0.85);
      phase[v].l = (phase[v].l + fL / SR) % 1;
      phase[v].r = (phase[v].r + fR / SR) % 1;
      const g = voice.gain * (0.85 + lfo * 0.15);
      l += saw(phase[v].l, voice.harmonics) * g;
      r += saw(phase[v].r, voice.harmonics) * g;
    }

    // The glissando eases in after the drone has established itself, so the
    // ear reads it as something arriving rather than as part of the pad.
    const glide = ease((t - 6) / 10) * 0.26;
    l += shepL(t) * glide;
    r += shepR(t) * glide;

    l = lpL(l, 520);
    r = lpR(r, 520);
    l = l * 0.74 + revL(l) * 0.46;
    r = r * 0.74 + revR(r) * 0.46;

    const env = ease(t / FADE_IN_S) * (1 - ease((t - (seconds - FADE_OUT_S)) / FADE_OUT_S));
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
const HOLD_S = 0.6;
const S1A_TAIL_S = 1.4; // must match Scene1.tsx's beatFrames('s1a', ...)
const S5_TAIL_S = 1.8; // must match Scene5.tsx's TAIL
const S6_TAIL_S = 2.0; // must match Scene6.tsx's beatFrames('s6', ...)
const FILM_TAIL_S = 1.2; // must match the tail in Full.tsx's FULL_FRAMES
const FREEZE_S = 7 / 30; // Scene 1b holds a frozen frame before the wipe
const FPS = 30; //        must match FPS in src/theme.ts
const S1B_TAIL_S = 1.4; // must match Scene1b.tsx's beatFrames('s1b', ...)
const LEAD_IN_S = 0.4; //  must match LEAD_IN in Scenes 2-5
const BEAT_GAP_S = 0.2; // must match BEAT_GAP in Scenes 2-4
const TAIL_S = 1.2; //     must match TAIL in Scenes 2-4
const S2A_TAIL_S = 0.7; // must match Scene2.tsx's beatFrames('s2a', ...)

/**
 * Where things land in the assembled film, in frames.
 *
 * This mirrors the arithmetic in Full.tsx, which is a real duplication — the
 * constants above carry "must match" comments for that reason. It is checked
 * rather than trusted: the script prints the film length it computes, and it
 * must equal what `npx remotion compositions` reports. If those two disagree,
 * one of the constants above is stale and every music cue is in the wrong place.
 */
function layout() {
  const f = (sec) => Math.round(sec * FPS);
  const m = manifest;
  const scenes = [
    f(m.s1a.seconds + S1A_TAIL_S),
    f(m.s1b.seconds + S1B_TAIL_S),
    f(LEAD_IN_S) + f(m.s2a.seconds + S2A_TAIL_S) + f(BEAT_GAP_S) + f(m.s2b.seconds) + f(TAIL_S),
    f(LEAD_IN_S) + f(m.s3a.seconds) + f(BEAT_GAP_S) + f(m.s3b.seconds) + f(TAIL_S),
    f(LEAD_IN_S) + f(m.s4a.seconds) + f(BEAT_GAP_S) + f(m.s4b.seconds) + f(TAIL_S),
    f(LEAD_IN_S) + f(m.s5.seconds) + f(S5_TAIL_S),
    f(m.s6.seconds + S6_TAIL_S),
  ];
  const hold = f(HOLD_S);
  const starts = [];
  scenes.reduce((acc, len, i) => {
    starts[i] = i === 0 ? 0 : acc;
    return starts[i] + len + hold;
  }, 0);
  const total = starts[6] + scenes[6] + f(FILM_TAIL_S);
  // The frame the record scratch guillotines the opening bed.
  const scratch = starts[1] + f(m.s1b.cues.notOrganic) + 7;
  // "Stop falling for the theater" — where the closing bed takes over.
  const turn = starts[5] + f(LEAD_IN_S) + f(m.s5.cues.theater);
  return { scenes, starts, total, scratch, turn, f };
}

const L = layout();

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

  /**
   * The closing bed — the Scene 1 drone returning to see the film out.
   *
   * It comes in on "Stop falling for the theater", not at the top of Scene 5:
   * droning under the whole scene would fight the one passage that is meant to
   * feel level-headed. Entering on the turn instead lets it rise through "It's
   * just math." and carry across the hold into Scene 6, so the sign-off plays
   * over something already moving.
   */
  /**
   * The middle bed — from the record scratch to "Stop falling for the theater".
   *
   * The film asked for something under it the whole way through rather than
   * silence between the two dread cues. It starts the instant the opening bed
   * is cut off, so the scratch stays the only edit the ear notices.
   */
  middle: {
    seconds: () => (L.turn - L.scratch) / FPS,
    render: middleBed,
  },

  /**
   * The closing bed — the Scene 1 drone returning to see the film out.
   *
   * It comes in on "Stop falling for the theater", not at the top of Scene 5:
   * droning under the whole scene would fight the one passage that is meant to
   * feel level-headed. Entering on the turn instead lets it rise through "It's
   * just math." and carry across the hold into Scene 6, so the sign-off plays
   * over something already moving.
   */
  closing: {
    seconds: () => (L.total - L.turn) / FPS,
    render: (seconds) => eerieDrone(seconds, 'closing'),
  },
};

console.log(
  `film layout: ${L.total} frames (${(L.total / FPS).toFixed(2)}s)  ` +
    `scratch@${L.scratch}  turn@${L.turn}`,
);

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
