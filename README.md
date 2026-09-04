# The AI Sentience Myth — video pipeline

Programmatic documentary built from `ai_myth_documentary_script.txt`.
Narration is synthesized to WAV, its **measured** duration drives scene timing,
and the visuals are rendered as motion graphics via Remotion (React → MP4).

## Quick start

```bash
npm install
node scripts/tts.mjs                                  # narration -> public/audio + manifest
npx remotion studio src/index.ts                      # interactive preview
npx remotion render src/index.ts Scene3 out/scene3.mp4
```

## How timing works

Narration text carries inline **cue markers**. A marker names the moment the text
that follows it begins:

```
"...actually is. [[notAMind]] It isn't a mind. [[engine]] It is an autocomplete engine."
```

`scripts/tts.mjs` synthesizes each segment separately, measures it from its RIFF
header, joins the segments into one WAV, and writes both the total duration and
every cue offset to `src/audio-manifest.json`. Scenes then ask for cues by name:

```tsx
const T = { notAMind: cue('s3a', 'notAMind'), engine: cue('s3a', 'engine') };
```

So **rewriting narration re-times the video automatically** — beat lengths and
individual cues both. Edit `scripts/narration.json`, re-run `tts.mjs`, re-render.
Nothing is placed by ear.

`cue()` throws on an unknown name rather than defaulting to 0: a cue silently
firing at frame 0 still renders a plausible video, which is much harder to spot
than a crash.

### Splitting and prosody

Segments are synthesized independently, so the pause the voice would naturally
have produced is re-inserted as silence — `gaps.sentence` after `. ! ?`, the
shorter `gaps.clause` after `, ; :` (both in `narration.json`). Put markers at
punctuation for this reason; a marker mid-clause will sound clipped, more so on a
neural voice than on SAPI.

## Changing on-screen text

Copy shown in the video — speech bubbles, chyrons, card labels, token tables —
lives in the `copy` block of `scripts/narration.json`, keyed by beat. Editing it
needs only a re-render, not a re-synthesis. Layout stays in the scene components.

## Swapping in your TTS server

The voice backend is pluggable. Currently defaulting to Windows SAPI as a draft voice.

```bash
TTS_PROVIDER=http \
TTS_ENDPOINT=https://your-server/api/tts \
TTS_API_KEY=... \
TTS_VOICE=narrator \
node scripts/tts.mjs
```

The `http` provider currently POSTs:

```json
{ "text": "...", "voice": "<TTS_VOICE>", "format": "wav" }
```

and expects **WAV bytes** in the response body. If your server's contract differs,
`synthHttp()` in `scripts/tts.mjs` is the only function that needs changing.

> Note: duration is measured by parsing a RIFF/PCM header. If your server returns
> MP3 or a JSON envelope with base64 audio, `synthHttp` and `wavDurationSeconds`
> both need adjusting.

## Design language

Defined once in `src/theme.ts`. The palette carries the film's argument:

| Token | Meaning |
| --- | --- |
| `mechanism` (cyan) | math, tokens, probability — what is actually happening |
| `perception` (red) | the threat humans believe they are reading |
| `accent` (amber) | the reveal, where the two are contrasted |

Keeping these meanings consistent across scenes is what makes the visuals read as
authored rather than decorative.

## Layout

```
scripts/narration.json    narration text + cue markers + on-screen copy
scripts/tts.mjs           synthesis, segment measurement, cue extraction
src/cues.ts               cue()/copy()/beatFrames() lookup, throws on typos
src/theme.ts              design tokens, fps, dimensions
src/components.tsx        vector primitives (Token, ProbabilityRow, Statement, …)
src/StickFigure.tsx       hand-drawn figure system (poses, expressions, talk cycle)
src/Scene1.tsx            Scene 1a — the podcast hook
src/Scene3.tsx            Scene 3 — Math vs. Emotion
src/Root.tsx              composition registry
public/audio/*.wav        generated narration (regenerable, not source)
out/                      renders and stills
```

## Two visual registers

The film argues its case through style before the narrator does.

| | Hype | Reality |
| --- | --- | --- |
| Scenes | 1a (podcast hook) | 3 (and the explainers) |
| Surface | graph paper, hand-drawn | near-black, precise vector |
| Line | wobbling "boil", re-seeded every 5 frames | crisp, static |
| Type | handwriting | mono + grotesk |

The record scratch in the script is where the film crosses between them.

## Status

All six scenes built. Not yet stitched into one film.

| Scene | Length | Notes |
| --- | --- | --- |
| 1a — podcast hook | 25.2s | stick figures; avoids footage of real people |
| 1b — record scratch | 26.3s | the crossing between the two registers |
| 2 — sandbox | 51.0s | the load-bearing factual claim |
| 3 — math vs. emotion | 51.4s | reference for the vector language |
| 4 — the incentive | 48.6s | figures return, drawn light-on-dark |
| 5 — conclusion | 28.3s | strips back to a bare frame |
| 6 — sign-off | 8.8s | 8-bit sprite; carries the synthetic-media disclosure |

Scene 6 uses a generic terminal sprite, not any real product's mark: a first-person
endorsement under a real company's branding would function as a genuine endorsement
claim regardless of intent, and the film's own argument is that the model has no
opinions to give.

## Per-beat voice

`voice` at the top of `narration.json` is the default; any beat may override it:

```json
{ "id": "s6", "voice": { "provider": "sapi", "sapiName": "Microsoft David Desktop" } }
```

`s6` is pinned this way on purpose. When the documentary moves to a neural voice,
the sign-off keeps the flat robotic delivery, where it is the joke rather than a
limitation.

Pass beat ids to re-synthesize only those and leave the rest of the manifest alone:

```bash
node scripts/tts.mjs s6            # one beat
node scripts/tts.mjs s4a s4b       # a scene
node scripts/tts.mjs               # everything
```

## Checking narration against captions

```bash
node scripts/check.mjs        # lint + write REVIEW.md
node scripts/check.mjs --quiet
```

The failure it exists for: narration said "only **they** can afford", the caption
said "only **you** can afford". Nothing crashed, nothing looked wrong in a still,
and it only surfaced because someone watched and read at the same time.

**What it does.** Pairs each on-screen copy key with the narration segment playing
underneath it, then checks grammatical person, numbers, negation, and quote
fidelity. Pairing is by exact name, camelCase prefix (`fabricatedEmphasis` → cue
`fabricated`), or an explicit `_at` map for captions with no name relation to
their cue.

**What it cannot do.** Detect contradiction in general — that is reading
comprehension, not linting. So it also writes `REVIEW.md`, which puts every spoken
line beside the copy on screen at that moment. Scanning that sheet is what caught
"Academia" appearing in the gate visual when the narration only says "open-source
competition".

**Three buckets, reported separately.** Checked; `_decorative` (deliberately not a
restatement — the fake view counts in Scene 1b); and unpaired, which is copy that
is accidentally unchecked. A clean run over mostly-unpaired copy would be worse
than a failing one, because it reads as a guarantee it isn't — so the count is
always printed. It currently reports 0 unpaired.

Escape hatches: `_ignore: { key: ["person"] }` for a single check, or `["all"]`.
Scene 2's operator prompt uses this — it is a verbatim artifact, and its second
person is the point.

## Gotchas worth knowing

- **Beat gaps.** `BEAT_GAP` between a scene's two beats was 0.6s, which reads as a
  dropout rather than a breath. It is 0.2s now. If you add a scene, sample a frame
  *inside* the gap — a still from the middle of a beat will never show the problem.
- **Bottom-anchored captions** need a wrapper with real height. A zero-height
  absolute wrapper lets absolutely-positioned children run off the bottom of frame.
- **Name copy keys after the cue they appear at.** It is what lets `check.mjs`
  pair them automatically. Cue `crashTest` with keys `crashLead`/`crashEmphasis`
  did not pair until the cue was renamed to `crash`.
