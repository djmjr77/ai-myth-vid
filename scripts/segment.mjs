// Shared narration segmenting, used by both tts.mjs (to synthesize) and
// check.mjs (to review). Keeping one implementation means the review sheet
// always reflects exactly what was spoken.

export const CUE_RE = /\[\[([A-Za-z][A-Za-z0-9_]*)\]\]/g;

/** Smart punctuation SAPI would otherwise read aloud literally. */
export function normalize(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, ', ');
}

/**
 * Split narration into segments at cue markers.
 * Returns [{ cue, text }] where `cue` names the moment that segment starts.
 * Text before the first marker has cue === null.
 */
export function segment(raw) {
  const parts = raw.split(CUE_RE); // [text, name, text, name, text, ...]
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const cue = i === 0 ? null : parts[i - 1];
    const text = parts[i].trim();
    if (text) out.push({ cue, text });
    else if (cue) {
      // A marker with no following text would have no time of its own.
      throw new Error(`cue [[${cue}]] is not followed by any narration text`);
    }
  }
  return out;
}
