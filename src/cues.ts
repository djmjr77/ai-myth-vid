import { FPS } from './theme';
import manifestJson from './audio-manifest.json';
import narrationJson from '../scripts/narration.json';

/**
 * Timing and copy lookup.
 *
 * Cue times are measured from the synthesized audio (see scripts/tts.mjs), so
 * rewriting narration and re-running the script re-times every scene. On-screen
 * copy lives beside the narration too, so wording changes need only a re-render.
 *
 * Both lookups throw on a missing key. A cue silently defaulting to 0 would put
 * an element on screen at the wrong moment and still render a plausible video,
 * which is far harder to notice than a crash.
 */

export type AudioSegment = { src: string; start: number; seconds: number };

export type Beat = {
  seconds: number;
  scene: number;
  cues: Record<string, number>;
  /** Narration is stored one file per segment; the scene schedules them. */
  segments: AudioSegment[];
};

const manifest = manifestJson as unknown as Record<string, Beat>;
const copyTable = (narrationJson as { copy?: Record<string, Record<string, unknown>> }).copy ?? {};

export const beat = (id: string): Beat => {
  const b = manifest[id];
  if (!b) throw new Error(`no audio for beat "${id}" — run: node scripts/tts.mjs`);
  return b;
};

/** Frames from the start of the beat to a named cue, plus an optional nudge. */
export const cue = (beatId: string, name: string, offsetSeconds = 0): number => {
  const { cues } = beat(beatId);
  const t = cues?.[name];
  if (t === undefined) {
    const known = Object.keys(cues ?? {}).join(', ') || '(none)';
    throw new Error(
      `beat "${beatId}" has no cue "${name}". Add [[${name}]] to its narration text. Known: ${known}`,
    );
  }
  return Math.round((t + offsetSeconds) * FPS);
};

/** Beat length in frames, optionally padded with a tail. */
export const beatFrames = (beatId: string, tailSeconds = 0): number =>
  Math.round((beat(beatId).seconds + tailSeconds) * FPS);

/** On-screen copy, authored in scripts/narration.json under `copy`. */
export const copy = <T>(beatId: string, key: string): T => {
  const value = copyTable[beatId]?.[key];
  if (value === undefined) {
    throw new Error(`no copy for "${beatId}.${key}" in scripts/narration.json`);
  }
  return value as T;
};

/**
 * Optional cue/copy lookup, for content a scene supports but does not require.
 *
 * Unlike `cue`/`copy` these return undefined rather than throwing, so a scene can
 * render an extra line only when the narration actually contains it. That makes
 * additions like Scene 2's red-teaming definition a pure narration.json edit:
 * add the `[[name]]` marker and a matching copy key, and it appears; remove both,
 * and it does not.
 */
export const maybeCue = (beatId: string, name: string): number | undefined => {
  const t = beat(beatId).cues?.[name];
  return t === undefined ? undefined : Math.round(t * FPS);
};

export const maybeCopy = <T>(beatId: string, key: string): T | undefined =>
  copyTable[beatId]?.[key] as T | undefined;

/**
 * On-screen definitions, declared entirely in narration.json.
 *
 * A copy key named `<cue>Def` is shown while `<cue>` is being spoken — so
 * `redteamDef` appears as the narrator says "red-teaming evaluation". The
 * definition is never spoken; it exists for terms the audience may not know.
 *
 * Adding one anywhere in the film is two lines of JSON and no code: the scene
 * renders `<Definitions beat="..." />` and everything else follows from the name.
 */
export type Definition = { cue: string; at: number; until: number; text: string };

/**
 * How long a viewer needs to read something, in seconds.
 * 15 characters per second plus 0.7s to find and fixate — deliberately slower
 * than subtitle guidance (17-20 cps), because a viewer here is also listening
 * and usually watching an animation at the same time.
 * Kept in step with the readability audit in scripts/check.mjs.
 */
export const readingSeconds = (text: string) => text.trim().length / 15 + 0.7;

/** How far a definition may run past its beat, into the scene's tail. */
const DEF_OVERHANG_S = 1.6;

export const definitions = (beatId: string): Definition[] => {
  const b = beat(beatId);
  const table = copyTable[beatId] ?? {};
  const times = Object.values(b.cues ?? {}).sort((a, z) => a - z);

  return Object.keys(table)
    .filter((k) => k.endsWith('Def') && k.length > 3 && !k.startsWith('_'))
    .map((key) => {
      const cueName = key.slice(0, -3);
      const at = b.cues?.[cueName];
      if (at === undefined) {
        throw new Error(
          `copy "${beatId}.${key}" defines a term for cue "${cueName}", which does not exist. ` +
            `Add [[${cueName}]] to the narration, or rename the copy key.`,
        );
      }
      // Hold for as long as the text takes to read, or until the next cue,
      // whichever is longer. A fixed minimum was the wrong model: a definition
      // is longer than the line that triggers it, and a faster narrator makes
      // every cue window shorter without making the words fewer.
      const text = String(table[key]);
      const need = readingSeconds(text);
      const next = times.find((t) => t > at) ?? b.seconds;

      // A definition may overhang the end of its beat slightly, into the scene's
      // tail, but must not survive into the next beat and sit over a different shot.
      const latest = b.seconds + DEF_OVERHANG_S;
      const until = Math.min(Math.max(next, at + need), latest);

      // If there still isn't room after the cue, start early instead of being
      // cut off mid-read. A definition is context, so arriving just before the
      // term is spoken reads fine — being truncated does not.
      const start = Math.max(0, Math.min(at, until - need));

      return {
        cue: cueName,
        at: Math.round(start * FPS),
        until: Math.round(until * FPS),
        text,
      };
    })
    .sort((a, z) => a.at - z.at);
};
