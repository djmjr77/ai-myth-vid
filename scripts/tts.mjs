// Narration synthesis with a pluggable voice backend and script-driven cue timing.
//
//   TTS_PROVIDER=sapi            -> local Windows SAPI (offline draft voice)
//   TTS_PROVIDER=transit-voice   -> the Piper server (TTS_ENDPOINT=http://host:8010)
//   TTS_PROVIDER=http            -> any server returning WAV bytes from one POST
//
// The provider is resolved PER BEAT: top-level `voice` in narration.json is the
// default, and any beat may override it with its own `voice` block. That lets the
// documentary run on a neural voice while Scene 6 keeps the flat SAPI one.
//
// Pass beat ids to re-synthesize only those: `node scripts/tts.mjs s6`
//
// Two flags avoid needless re-synthesis, which matters because the neural
// backend is stochastic: re-running a beat re-rolls every take in it, so a
// one-word fix silently discards performances that were already reviewed.
//
//   --retime   recompute the timeline from the audio already on disk, never
//              calling the voice server. Gaps and holds are pure timing config
//              and do not alter a single sample of narration, so
//              `node scripts/tts.mjs --retime s4a` applies a new hold in
//              milliseconds instead of minutes, and works with the server down.
//              Anything it cannot reuse is a hard error.
//   --repair   synthesize only the segments that are missing or whose line
//              changed, and keep the rest. The everyday flag after a script
//              edit; `--retime`'s strictness is for when nothing changed but
//              the timing.
//
// A beat may also carry `holdAfter: { "<cue>": seconds }` to hold silence after
// the segment starting at that cue — for giving the viewer time to read
// something, or to set a line up with a beat of silence. Use "_open" for the
// segment before the first cue marker.
//
// Narration text may carry inline cue markers:
//
//   "...actually is. [[notAMind]] It isn't a mind. [[engine]] It is an autocomplete engine."
//
// A marker names the moment its FOLLOWING text begins. Each segment is synthesized
// and measured separately, then the segments are joined into one WAV, so cue times
// are derived from the real audio rather than placed by ear. Rewrite the narration,
// re-run this script, and every cue moves with it.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, segment } from './segment.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO_DIR = join(ROOT, 'public', 'audio');

// ------------------------------------------------------------------ WAV utils

/** Split a RIFF/WAVE file into its fmt chunk and raw PCM payload. */
function parseWav(buf, label) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`not a RIFF/WAVE file: ${label}`);
  }
  let fmt = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + size);
    if (id === 'fmt ') fmt = body;
    else if (id === 'data') data = body;
    offset += 8 + size + (size % 2); // RIFF chunks are word-aligned
  }
  if (!fmt || !data) throw new Error(`missing fmt or data chunk: ${label}`);
  const byteRate = fmt.readUInt32LE(8);
  return {
    fmt,
    data,
    byteRate,
    blockAlign: fmt.readUInt16LE(12),
    bitsPerSample: fmt.readUInt16LE(14),
    seconds: data.length / byteRate,
  };
}

/** Identify the container from magic bytes, so any engine's output just works. */
function audioExt(buf) {
  const ascii = (a, b) => buf.toString('ascii', a, b);
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
  if (ascii(0, 3) === 'ID3') return 'mp3';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 4) === 'fLaC') return 'flac';
  throw new Error(`unrecognized audio container (starts ${JSON.stringify(ascii(0, 4))})`);
}

// ------------------------------------------------------------------ providers

// PowerShell single-quoted strings take backslashes literally, so Windows paths
// need no escaping here -- only an embedded apostrophe must be doubled.
const psLiteral = (s) => `'${String(s).split("'").join("''")}'`;

function synthSapi(text, outPath, voice) {
  // Route text through a temp file so quoting and newlines cannot corrupt it.
  const scratch = mkdtempSync(join(tmpdir(), 'tts-'));
  const textFile = join(scratch, 'line.txt');
  writeFileSync(textFile, text, 'utf8');

  const ps = [
    `$ErrorActionPreference = 'Stop'`,
    `Add-Type -AssemblyName System.Speech`,
    `$text = [System.IO.File]::ReadAllText(${psLiteral(textFile)}, [System.Text.Encoding]::UTF8)`,
    `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer`,
    `$s.SelectVoice(${psLiteral(voice.sapiName)})`,
    `$s.Rate = ${Number(voice.rate)}`,
    `$s.SetOutputToWaveFile(${psLiteral(outPath + '.wav')})`,
    `$s.Speak($text)`,
    `$s.Dispose()`,
  ].join('\n');

  const path = `${outPath}.wav`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  rmSync(scratch, { recursive: true, force: true });
  return { path, seconds: parseWav(readFileSync(path), path).seconds };
}

/**
 * Retry a request a couple of times. Synthesis can take 30s+ per segment, and a
 * busy or restarting box drops the odd connection — losing a whole batch to one
 * dropped request is a bad trade when a run is dozens of segments long.
 */
async function withRetry(fn, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < attempts - 1) {
        const wait = 2000 * (i + 1);
        console.warn(`  ! ${err.cause?.code ?? err.name}: retrying in ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw last;
}

const baseUrl = (voice) => {
  const base = (voice.endpoint ?? process.env.TTS_ENDPOINT ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('set TTS_ENDPOINT or voice.endpoint (e.g. http://192.168.0.23:8010)');
  return base;
};

// transit-voice reads X-API-Key; it is a no-op unless the server has TV_API_KEY set.
const authHeaders = (voice) => {
  const key = process.env[voice.apiKeyEnv ?? 'TTS_API_KEY'];
  return key ? { 'X-API-Key': key } : {};
};

/**
 * transit-voice (Piper). Two steps: POST the text to get metadata plus a
 * content-addressed audio URL, then GET the audio.
 *
 * `normalize` defaults to FALSE here. The server's normalizer is built for GTFS
 * strings — it turns "N Main St" into "North Main Street" — which is exactly
 * wrong for documentary prose. Set `normalize: true` on a voice to opt in.
 *
 * Voice options, all optional: voiceId, language, role, normalize, effect.
 * `GET /voices` and `GET /effects` on the server list what is available.
 */
async function synthTransitVoice(text, outPath, voice) {
  const base = baseUrl(voice);
  const speed = voice.speed ?? 1.0;
  if (speed < 0.5 || speed > 2.0) {
    throw new Error(`voice.speed ${speed} is outside the server's 0.5-2.0 range`);
  }
  if (text.length > 1000) {
    throw new Error(
      `segment is ${text.length} chars; the server caps text at 1000. Split it with another [[cue]].`,
    );
  }

  const res = await withRetry(() => fetch(`${base}/synthesize/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(voice) },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      text,
      language: voice.language ?? undefined,
      voice_id: voice.voiceId ?? process.env.TTS_VOICE ?? undefined,
      role: voice.role ?? 'standalone',
      normalize: voice.normalize ?? false,
      // Signal processing, applied server-side after synthesis. This is how
      // Scene 6 gets its robot voice: ring modulation and band limiting are
      // artifacts a speech model cannot produce, so effects beat cloning a
      // robot recording — and being pure DSP, they are deterministic.
      effect: voice.effect ?? 'none',
      // Pitch-preserving time stretch applied after synthesis. The server's own
      // guidance is that 0.8-1.25 sounds natural; outside that it sounds processed.
      speed: voice.speed ?? 1.0,
    }),
  }));
  if (!res.ok) throw new Error(`transit-voice ${res.status}: ${await res.text()}`);

  const meta = await res.json();
  for (const w of meta.warnings ?? []) console.warn(`  ! ${w}`);

  const audio = await withRetry(() =>
    fetch(`${base}${meta.audio_url}`, {
      headers: authHeaders(voice),
      signal: AbortSignal.timeout(120_000),
    }),
  );
  if (!audio.ok) throw new Error(`transit-voice audio ${audio.status}: ${meta.audio_url}`);
  const buf = Buffer.from(await audio.arrayBuffer());
  const path = `${outPath}.${audioExt(buf)}`;
  writeFileSync(path, buf);
  // The server measured it; trust that over guessing at a container we may not parse.
  return { path, seconds: meta.duration_s };
}

/** Generic fallback: POST {text, voice, format} and get WAV bytes straight back. */
async function synthHttp(text, outPath, voice) {
  const res = await fetch(baseUrl(voice), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(voice) },
    body: JSON.stringify({ text, voice: voice.voiceId ?? process.env.TTS_VOICE, format: 'wav' }),
  });
  if (!res.ok) throw new Error(`TTS server ${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = `${outPath}.${audioExt(buf)}`;
  writeFileSync(path, buf);
  return { path, seconds: audioExt(buf) === 'wav' ? parseWav(buf, path).seconds : undefined };
}

/**
 * A beat's voice = top-level `voice`, overridden by the beat's own `voice`.
 * Lets one beat keep a different narrator — Scene 6's sign-off stays on the
 * flat SAPI voice, where the robotic delivery is the joke, while the rest of
 * the film moves to a neural backend.
 */
function resolveVoice(beat, config) {
  const voice = { ...(config.voice ?? {}), ...(beat.voice ?? {}) };
  const provider = voice.provider ?? process.env.TTS_PROVIDER ?? 'sapi';
  if (provider === 'sapi' && !voice.sapiName) {
    throw new Error(`beat "${beat.id}": provider 'sapi' needs voice.sapiName`);
  }
  return { ...voice, provider };
}

const PROVIDERS = {
  sapi: synthSapi,
  'transit-voice': synthTransitVoice,
  http: synthHttp,
};

const synthesize = async (text, outPath, voice) => {
  const fn = PROVIDERS[voice.provider];
  if (!fn) {
    throw new Error(
      `unknown provider "${voice.provider}" — expected one of: ${Object.keys(PROVIDERS).join(', ')}`,
    );
  }
  return fn(text, outPath, voice);
};

/** A segment ends its sentence if it closes on terminal punctuation. */
const SENTENCE_END = /[.!?]["')\]]*$/;

/**
 * Where this segment sits in its sentence — 'leading' | 'medial' | 'final' |
 * 'standalone'.
 *
 * The server calls this the single most important knob for concatenation
 * quality, and it is right: a fragment synthesized as 'standalone' gets
 * sentence-final falling intonation, so a cue marker dropped mid-sentence made
 * the model read "hacking forums," as a finished utterance. Splitting on cues
 * is this pipeline's whole design, so almost every list and clause was hitting
 * that. Derived from punctuation rather than authored, for the same reason cue
 * times are measured rather than typed.
 */
function roleFor(segments, i) {
  const ends = SENTENCE_END.test(segments[i].text.trim());
  const starts = i === 0 || SENTENCE_END.test(segments[i - 1].text.trim());
  if (starts) return ends ? 'standalone' : 'leading';
  return ends ? 'final' : 'medial';
}

/**
 * Fingerprint of everything about a voice that changes the samples produced.
 * Recorded per segment so --repair can tell that a beat's voice was re-pointed
 * even though its text is untouched — the intercom-scope change was exactly
 * that, and without this it would have silently kept the old takes.
 */
const voiceKey = (v) =>
  [
    v.provider,
    v.voiceId ?? v.sapiName ?? '',
    v.effect ?? 'none',
    v.speed ?? 1,
    v.normalize ? 'normalized' : 'raw',
    v.language ?? '',
  ].join('|');

/**
 * Splitting removes the pause the voice would naturally have produced, so put it
 * back — a full stop earns more silence than a comma.
 */
function gapAfter(text, gaps) {
  const last = text.trim().slice(-1);
  if ('.!?'.includes(last)) return gaps.sentence;
  if (',;:'.includes(last)) return gaps.clause;
  return 0;
}

// ------------------------------------------------------------------ main

const config = JSON.parse(readFileSync(join(ROOT, 'scripts', 'narration.json'), 'utf8'));
const { beats } = config;
const gaps = { sentence: 0.26, clause: 0.13, ...(config.gaps ?? {}) };

// `node scripts/tts.mjs s6 s3a` re-synthesizes only those beats and leaves the
// rest of the manifest intact — re-running every beat against a remote server
// to change one line is slow and pointless.
const flags = process.argv.slice(2).filter((a) => a.startsWith('-'));
const RETIME = flags.includes('--retime');
const REPAIR = flags.includes('--repair');
const KNOWN_FLAGS = ['--retime', '--repair'];
const unknownFlag = flags.find((f) => !KNOWN_FLAGS.includes(f));
if (unknownFlag) {
  throw new Error(`unknown flag ${unknownFlag} — expected one of: ${KNOWN_FLAGS.join(', ')}`);
}
if (RETIME && REPAIR) {
  throw new Error('--retime and --repair contradict each other: one refuses to synthesize, the other exists to');
}
const REUSING = RETIME || REPAIR;

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const selected = only.length ? beats.filter((b) => only.includes(b.id)) : beats;
if (only.length) {
  const unknown = only.filter((id) => !beats.some((b) => b.id === id));
  if (unknown.length) throw new Error(`unknown beat id(s): ${unknown.join(', ')}`);
}

const MANIFEST_PATH = join(ROOT, 'src', 'audio-manifest.json');
// Retiming reads every beat's measured durations back out, so the manifest is
// required rather than merely merged into.
const manifest =
  (only.length || REUSING) && existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    : {};
if (REUSING && !existsSync(MANIFEST_PATH)) {
  throw new Error('--retime/--repair need src/audio-manifest.json; synthesize at least once first');
}

/**
 * Can this segment's existing audio stand in for a fresh take?
 *
 * The checks are the whole point. Reusing a measurement is only sound if the
 * audio it measured still exists and still says what the script says. Returns
 * a reason instead of a boolean so the caller can either report it (--repair)
 * or refuse (--retime) — the two modes differ only in what they do with it.
 */
function reusable(beat, i, seg, prior, role, key) {
  const rec = prior?.segments?.[i];
  if (!rec) return { ok: false, why: 'not in the manifest' };
  if (typeof rec.seconds !== 'number') return { ok: false, why: 'no measured duration' };
  const path = join(ROOT, 'public', rec.src);
  if (!existsSync(path)) return { ok: false, why: `${rec.src} is missing from disk` };
  if (rec.text !== undefined && rec.text !== seg.text) {
    return { ok: false, why: 'the line changed', was: rec.text };
  }
  if (rec.role !== undefined && rec.role !== role) {
    return { ok: false, why: `the fragment role changed (${rec.role} -> ${role})` };
  }
  if (rec.voice !== undefined && rec.voice !== key) {
    return { ok: false, why: 'the voice changed' };
  }
  // `text` is recorded from now on; entries written before that can only be
  // taken on trust. Say so rather than implying a check that did not run.
  return {
    ok: true,
    path,
    seconds: rec.seconds,
    unverified: rec.text === undefined || rec.voice === undefined,
  };
}

mkdirSync(AUDIO_DIR, { recursive: true });

for (const beat of selected) {
  const segments = segment(normalize(beat.text));
  // A beat may change voice partway through, keyed by cue exactly like
  // holdAfter. Scene 1b needs it: the narration is on the podcast's intercom
  // until the record scratch, then in the film's own voice for the dark world
  // the scratch reveals — one beat, two registers, because the cut lands
  // mid-beat and splitting the beat would put a seam in the narration.
  const voiceOverride = {};
  const voiceAtCue = (cue) => {
    if (cue && beat.voiceAt?.[cue]) Object.assign(voiceOverride, beat.voiceAt[cue]);
    return resolveVoice({ ...beat, voice: { ...(beat.voice ?? {}), ...voiceOverride } }, config);
  };
  for (const cue of Object.keys(beat.voiceAt ?? {})) {
    if (!segments.some((sg) => sg.cue === cue)) {
      throw new Error(`${beat.id}: voiceAt names cue "${cue}", which is not in the narration`);
    }
  }
  let voice = voiceAtCue(null);
  const cues = {};
  const files = [];
  let elapsed = 0;

  const prior = manifest[beat.id];
  // Segments are matched by index, so a changed cue count silently repoints
  // every later segment at the wrong audio. Refuse rather than guess.
  if (REUSING && prior?.segments?.length !== segments.length) {
    const had = prior?.segments?.length ?? 0;
    if (RETIME) {
      throw new Error(
        `${beat.id}: the script now splits into ${segments.length} segment(s) but the manifest ` +
          `has ${had} — the cue markers changed, so this beat needs synthesizing in full`,
      );
    }
    console.warn(`  ! ${beat.id}: cue markers changed (${had} -> ${segments.length} segments); synthesizing the whole beat`);
  }
  let unverified = 0;
  let fresh = 0;

  for (const [i, seg] of segments.entries()) {
    // Each segment stays its own file. Remotion schedules them at the offsets
    // recorded here, so nothing needs decoding or concatenating and any container
    // the browser can play works — WAV from SAPI, MP3 from Chatterbox.
    const stem = join(AUDIO_DIR, `${beat.id}-${String(i).padStart(2, '0')}`);
    voice = voiceAtCue(seg.cue);
    const role = roleFor(segments, i);
    const key = voiceKey(voice);
    let path;
    let seconds;
    const keep =
      REUSING && prior?.segments?.length === segments.length
        ? reusable(beat, i, seg, prior, role, key)
        : { ok: false, why: 'not reusing' };
    if (RETIME && !keep.ok) {
      throw new Error(
        `${beat.id}[${i}]: ${keep.why} — --retime cannot cover that. ` +
          'Use --repair to synthesize just what changed.',
      );
    }
    if (keep.ok) {
      ({ path, seconds } = keep);
      if (keep.unverified) unverified++;
    } else {
      if (REPAIR) {
        console.log(`  + ${beat.id}[${i}] ${keep.why} -> synthesizing`);
        fresh++;
      }
      // Drop any earlier take in another container, or the old one lingers unused.
      for (const ext of ['wav', 'mp3', 'ogg', 'flac']) rmSync(`${stem}.${ext}`, { force: true });
      ({ path, seconds } = await synthesize(seg.text, stem, { ...voice, role }));
    }
    if (seconds === undefined) {
      throw new Error(`${beat.id}[${i}]: provider returned no duration for ${path}`);
    }

    if (seg.cue) {
      if (seg.cue in cues) throw new Error(`${beat.id}: duplicate cue [[${seg.cue}]]`);
      cues[seg.cue] = elapsed;
    }

    // Storing the line alongside its measurement is what lets a later --retime
    // prove the audio still matches the script. Only record it when this run
    // actually established the pairing — either by synthesizing the line, or by
    // checking it against a text the manifest already carried. Writing it after
    // reusing an unverified segment would launder a guess into a guarantee.
    const certified = !keep.ok || !keep.unverified;
    files.push({
      src: `audio/${basename(path)}`,
      start: elapsed,
      seconds,
      role,
      ...(certified ? { text: seg.text, voice: key } : {}),
    });
    elapsed += seconds;

    // Restore the pause the voice would have produced reading straight through,
    // plus any deliberate hold authored for this cue.
    //
    // These are inserted between independently synthesized segments, so unlike
    // an inline [pause:] marker they cannot disturb the prosody of the line
    // before them — each segment keeps its own full stop and reads as one.
    if (i < segments.length - 1) {
      elapsed += gapAfter(seg.text, gaps);
      // '_open' addresses the segment before the first cue marker.
      const hold = beat.holdAfter?.[seg.cue ?? '_open'] ?? 0;
      if (hold < 0) throw new Error(`${beat.id}: holdAfter.${seg.cue} must not be negative`);
      elapsed += hold;
    }
  }

  manifest[beat.id] = { scene: beat.scene, seconds: elapsed, cues, segments: files };

  const engine =
    voice.provider === 'sapi'
      ? `sapi:${voice.sapiName}`
      : `${voice.provider}:${voice.voiceId ?? 'default'}`;
  const via = RETIME
    ? 'retimed (no synthesis)'
    : REPAIR
      ? `${engine} (${fresh}/${segments.length} fresh)`
      : engine;
  if (unverified) {
    console.warn(
      `  ! ${beat.id}: ${unverified} segment(s) were synthesized before the manifest recorded ` +
        `its text, so the audio was reused on trust rather than verified`,
    );
  }
  const cueList = Object.entries(cues)
    .map(([k, v]) => `${k}@${v.toFixed(1)}`)
    .join('  ');
  console.log(
    `${beat.id.padEnd(5)} ${elapsed.toFixed(2)}s  ${String(segments.length).padStart(2)} seg  ` +
      `${via.padEnd(26)} ${cueList}`,
  );
}

writeFileSync(join(ROOT, 'src', 'audio-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(
  `\n${RETIME ? 'retimed' : 'wrote'} ${selected.length} of ${beats.length} beat(s) -> ` +
    'src/audio-manifest.json' +
    (only.length ? '  (others left untouched)' : ''),
);
