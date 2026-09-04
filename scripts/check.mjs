// Narration/caption consistency review.
//
//   node scripts/check.mjs          lint + write the review sheet
//   node scripts/check.mjs --quiet  lint only, no sheet
//
// WHAT THIS CAN AND CANNOT DO
//
// It cannot detect contradiction in general — that is a reading-comprehension
// problem, not a lint. What it does is:
//
//   1. Pair each on-screen copy key with the narration segment of the SAME NAME
//      and run mechanical checks on the pair (grammatical person, numbers,
//      negation). That is the class that produced "only they can afford" spoken
//      against "only you can afford" on screen.
//   2. Emit REVIEW.md putting every spoken segment beside the copy that appears
//      at that moment, so a human can scan the whole film in one pass instead of
//      watching it. Anything semantic is caught here, by eye — but at least the
//      two halves are finally next to each other.
//
// The convention that makes (1) work: name a copy key after the cue whose moment
// it belongs to. Unpaired copy still appears in the sheet, just unchecked.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, segment } from './segment.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(ROOT, 'scripts', 'narration.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(ROOT, 'src', 'audio-manifest.json'), 'utf8'));

const findings = [];
const flag = (beatId, key, kind, detail) =>
  findings.push({ beatId, key, kind, detail });

// ------------------------------------------------------------------ probes

const SECOND_PERSON = /\b(you|your|yours|you're|yourself)\b/gi;
const THIRD_PERSON = /\b(they|their|theirs|them|it|its|he|she|his|her)\b/gi;
const NEGATION = /\b(not|no|never|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|can't|won't|nothing|none)\b/gi;

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, hundred: 100, thousand: 1000, million: 1e6, billion: 1e9,
};

const hits = (text, re) => (text.match(re) ?? []).map((s) => s.toLowerCase());

/** Numbers in either notation, so "100%" and "one hundred percent" compare equal. */
function numbers(text) {
  const out = new Set();
  for (const m of text.matchAll(/\b\d[\d,.]*\b/g)) {
    out.add(Number(m[0].replace(/[,.]$/, '').replace(/,/g, '')));
  }
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}s?\\b`, 'i').test(text)) out.add(value);
  }
  return out;
}

/** Flatten a copy value to the text a viewer actually reads. */
function copyText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'object' && v ? Object.values(v).join(' ') : v)).join(' ');
  }
  if (value && typeof value === 'object') return Object.values(value).join(' ');
  return String(value ?? '');
}

/**
 * Compare one caption against the line being spoken underneath it.
 * Deliberately conservative: these fire on mismatches that are almost always
 * real, and stay quiet on paraphrase, which is the normal and desirable case.
 */
const STOPWORDS = new Set([
  'this','that','with','from','their','there','have','will','your','about','which',
  'they','them','then','than','into','only','just','been','were','what','when',
  // Pronoun contractions are function words; a caption may dramatize a pitch as
  // direct speech without the narration containing the contraction itself.
  "it's","that's","they're","we're","you're","there's","what's","here's","he's","she's",
]);

/**
 * Text a caption shows in quotes should survive intact in the narration.
 * Catches a misquote — "ruin your career" on screen over "ruin your reputation"
 * spoken — which no grammatical check would notice.
 */
function checkQuotes(beatId, key, spoken, shown) {
  const spokenLower = spoken.toLowerCase();
  for (const m of shown.matchAll(/[“"]([^“”"]{8,})[”"]/g)) {
    const missing = m[1]
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
      // Compare on a short stem so plurals and tenses do not trip it.
      .filter((w) => !spokenLower.includes(w.slice(0, Math.max(4, w.length - 2))));
    if (missing.length) {
      flag(beatId, key, 'quote', `quoted on screen but not spoken here: ${missing.join(', ')}`);
    }
  }
}

function comparePair(beatId, key, spoken, shown, skip = [], single = true) {
  if (skip.includes('all')) return;
  checkQuotes(beatId, key, spoken, shown);
  if (skip.includes('all')) return;
  if (skip.includes('person')) return;
  const spokenYou = hits(spoken, SECOND_PERSON);
  const shownYou = hits(shown, SECOND_PERSON);

  // The Scene 4b bug: narration in third person, caption in second.
  if (shownYou.length && !spokenYou.length && hits(spoken, THIRD_PERSON).length) {
    flag(
      beatId,
      key,
      'person',
      `caption addresses "${shownYou[0]}" but the narration is third person`,
    );
  }
  if (spokenYou.length && !shownYou.length && hits(shown, THIRD_PERSON).length) {
    flag(beatId, key, 'person', `narration addresses "${spokenYou[0]}" but the caption is third person`);
  }

  const spokenNums = numbers(spoken);
  const shownNums = numbers(shown);
  const onlyShown = [...shownNums].filter((n) => !spokenNums.has(n));
  if (onlyShown.length && spokenNums.size) {
    flag(beatId, key, 'number', `caption shows ${onlyShown.join(', ')}, not spoken in this segment`);
  }

  // Only meaningful when one caption restates one line. A panel of mixed labels
  // drops negations legitimately, and checking it just produces noise. The
  // reverse direction (narration negates, caption doesn't) was dropped for the
  // same reason: captions compress, and that is not an error.
  if (single && !skip.includes('negation')) {
    const spokenNeg = hits(spoken, NEGATION).length;
    const shownNeg = hits(shown, NEGATION).length;
    if (spokenNeg === 0 && shownNeg > 0) {
      flag(beatId, key, 'negation', `caption negates ("${hits(shown, NEGATION)[0]}") where the narration does not`);
    }
  }
}

// ------------------------------------------------------------------ run

/**
 * Copy keys belonging to a cue's moment. Three ways to pair, cheapest first:
 *   1. exact name           lobby          -> cue "lobby"
 *   2. camelCase prefix      fabricatedEmphasis -> cue "fabricated"
 *   3. explicit `_at` map    { "split": ["perceptionQuote", ...] }
 * (3) exists because some captions have no natural name relation to their cue,
 * and an unpaired caption is an unchecked one.
 */
function keysForCue(cue, copyForBeat) {
  const explicit = copyForBeat._at?.[cue];
  if (explicit) return explicit.filter((k) => k in copyForBeat);
  if (cue === '_open') return [];
  return Object.keys(copyForBeat).filter(
    (k) =>
      !k.startsWith('_') &&
      (k === cue || (k.startsWith(cue) && /[A-Z]/.test(k[cue.length] ?? ''))),
  );
}

const copyTable = config.copy ?? {};
const beatIds = new Set(config.beats.map((b) => b.id));
let unpairedTotal = 0;
let decorativeTotal = 0;

for (const orphan of Object.keys(copyTable).filter((id) => !beatIds.has(id))) {
  flag(orphan, '—', 'orphan', 'copy block has no matching beat');
}

const sheet = ['# Narration / caption review', ''];
sheet.push('Generated by `node scripts/check.mjs`. Each row is a moment in the film:');
sheet.push('what is spoken, and what is on screen while it is spoken.', '');

for (const beat of config.beats) {
  const segments = segment(normalize(beat.text));
  const copyForBeat = copyTable[beat.id] ?? {};
  const paired = new Set();

  sheet.push(`## ${beat.id}  ·  scene ${beat.scene}`, '');
  sheet.push('| cue | spoken | on screen |');
  sheet.push('| --- | --- | --- |');

  for (const seg of segments) {
    const key = seg.cue;
    const keys = keysForCue(key ?? '_open', copyForBeat);
    if (keys.length) {
      keys.forEach((k) => paired.add(k));
      // Keys sharing a cue render together, so compare them as one caption.
      const shownText = keys.map((k) => copyText(copyForBeat[k])).join(' ');
      const skip = keys.flatMap((k) => copyForBeat._ignore?.[k] ?? []);
      comparePair(beat.id, keys.join('+'), seg.text, shownText, skip, keys.length === 1);
    }
    const shown = keys.map((k) => copyText(copyForBeat[k])).join(' ').replace(/\|/g, '\\|');
    sheet.push(`| ${key ?? '_(open)_'} | ${seg.text.replace(/\|/g, '\\|')} | ${shown} |`);
  }

  const decorative = new Set(copyForBeat._decorative ?? []);
  const unpaired = Object.keys(copyForBeat).filter(
    (k) => !k.startsWith('_') && !paired.has(k) && !decorative.has(k),
  );
  unpairedTotal += unpaired.length;
  decorativeTotal += decorative.size;
  if (unpaired.length) {
    sheet.push('', '**Copy not tied to a cue** (review by eye):', '');
    for (const k of unpaired) {
      sheet.push(`- \`${k}\` — ${copyText(copyForBeat[k]).replace(/\n/g, ' ')}`);
    }
  }
  sheet.push('');
}

if (!process.argv.includes('--quiet')) {
  writeFileSync(join(ROOT, 'REVIEW.md'), sheet.join('\n'));
}


// ------------------------------------------------------------- readability

/**
 * On-screen text must be readable while the narrator talks over it, and a faster
 * voice shortens every window without shortening the words.
 *
 * Model: 15 characters per second plus 0.7s to find and fixate on new text.
 * Subtitle guidance runs 17-20 cps when the text is the only thing on screen;
 * this is deliberately slower, because a viewer here is also listening and
 * usually watching an animation at the same time.
 *
 * The window is the gap to the next cue, which is what governs how long most
 * elements actually stay up.
 */
const READ_CPS = 15;
const ACQUIRE_S = 0.7;
const readingTime = (text) => text.trim().length / READ_CPS + ACQUIRE_S;

const tight = [];
for (const b of config.beats) {
  const audio = manifest[b.id];
  if (!audio) continue;
  const entries = Object.entries(audio.cues).sort((a, z) => a[1] - z[1]);
  const copyForBeat = copyTable[b.id] ?? {};
  const decorative = new Set(copyForBeat._decorative ?? []);

  entries.forEach(([name, at], i) => {
    const next = i + 1 < entries.length ? entries[i + 1][1] : audio.seconds;
    const window = next - at;
    for (const key of keysForCue(name, copyForBeat)) {
      if (decorative.has(key)) continue;
      const text = copyText(copyForBeat[key]);
      const need = readingTime(text);
      if (need > window) {
        tight.push({ beat: b.id, key, window, need,
          preview: text.length > 46 ? text.slice(0, 43) + '...' : text });
      }
    }
  });
}

tight.sort((a, z) => (z.need - z.window) - (a.need - a.window));
if (tight.length) {
  console.log(`\n${tight.length} caption(s) shown for less time than they need to be read:\n`);
  for (const t of tight) {
    console.log(
      `  ${(t.beat + '.' + t.key).padEnd(32)} shown ${t.window.toFixed(1)}s, ` +
        `needs ${t.need.toFixed(1)}s  (short ${(t.need - t.window).toFixed(1)}s)`,
    );
    console.log(`      "${t.preview}"`);
  }
} else {
  console.log('\nall captions have time to be read');
}

if (findings.length === 0) {
  console.log('no mechanical mismatches found');
} else {
  console.log(`${findings.length} finding(s):\n`);
  for (const f of findings) {
    console.log(`  [${f.kind}] ${f.beatId}.${f.key}`);
    console.log(`      ${f.detail}\n`);
  }
}
// Say plainly how much went unchecked. A green run over mostly-unpaired copy
// is worse than a red one, because it reads as a guarantee it isn't.
console.log(
  `${unpairedTotal} copy key(s) not tied to a cue — unchecked, listed in REVIEW.md.` +
    ` ${decorativeTotal} marked decorative.` +
    (unpairedTotal ? ' Pair them by naming or an `_at` map to include them.' : ''),
);
if (!process.argv.includes('--quiet')) {
  console.log('REVIEW.md written — scan it for anything a lint cannot see.');
}
process.exit(findings.length ? 1 : 0);
