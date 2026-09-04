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
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const selected = only.length ? beats.filter((b) => only.includes(b.id)) : beats;
if (only.length) {
  const unknown = only.filter((id) => !beats.some((b) => b.id === id));
  if (unknown.length) throw new Error(`unknown beat id(s): ${unknown.join(', ')}`);
}

const MANIFEST_PATH = join(ROOT, 'src', 'audio-manifest.json');
const manifest =
  only.length && existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    : {};

mkdirSync(AUDIO_DIR, { recursive: true });

for (const beat of selected) {
  const voice = resolveVoice(beat, config);
  const segments = segment(normalize(beat.text));
  const cues = {};
  const files = [];
  let elapsed = 0;

  for (const [i, seg] of segments.entries()) {
    // Each segment stays its own file. Remotion schedules them at the offsets
    // recorded here, so nothing needs decoding or concatenating and any container
    // the browser can play works — WAV from SAPI, MP3 from Chatterbox.
    const stem = join(AUDIO_DIR, `${beat.id}-${String(i).padStart(2, '0')}`);
    // Drop any earlier take in another container, or the old one lingers unused.
    for (const ext of ['wav', 'mp3', 'ogg', 'flac']) rmSync(`${stem}.${ext}`, { force: true });
    const { path, seconds } = await synthesize(seg.text, stem, voice);
    if (seconds === undefined) {
      throw new Error(`${beat.id}[${i}]: provider returned no duration for ${path}`);
    }

    if (seg.cue) {
      if (seg.cue in cues) throw new Error(`${beat.id}: duplicate cue [[${seg.cue}]]`);
      cues[seg.cue] = elapsed;
    }

    files.push({ src: `audio/${basename(path)}`, start: elapsed, seconds });
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

  const via =
    voice.provider === 'sapi'
      ? `sapi:${voice.sapiName}`
      : `${voice.provider}:${voice.voiceId ?? 'default'}`;
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
  `\nwrote ${selected.length} of ${beats.length} beat(s) -> src/audio-manifest.json` +
    (only.length ? '  (others left untouched)' : ''),
);
