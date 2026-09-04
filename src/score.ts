import { FPS } from './theme';
import { beat } from './cues';

/**
 * Music ducking, derived from the measured narration.
 *
 * The manifest already knows exactly when every spoken segment starts and ends,
 * so the bed can drop under speech and lift in the gaps without anyone drawing
 * an automation curve. Rewrite the narration and the ducking re-derives with
 * everything else.
 *
 * Levels live here rather than baked into the stem, so they stay adjustable
 * without regenerating audio.
 */

export type DuckOptions = {
  /** Level in the gaps between spoken segments. */
  base?: number;
  /** Level while narration is playing. */
  under?: number;
  /** Ramp in/out of the duck, in frames. Short enough to feel responsive. */
  ramp?: number;
  /** Lead-in before speech starts, so the duck never clips a first syllable. */
  lead?: number;
};

/** A beat and where it sits, in frames, relative to the music's own frame 0. */
export type DuckSource = { beatId: string; offset: number };

/**
 * Volume for a music bed at `frame`, ducked under every narration segment in
 * `sources`. Takes a list because a bed spans scene boundaries — the opening
 * drone plays across Scene 1a and Scene 1b, which are separate beats at
 * different offsets in the film.
 */
export const duckedVolume = (
  sources: DuckSource[],
  frame: number,
  { base = 0.5, under = 0.15, ramp = 10, lead = 4 }: DuckOptions = {},
): number => {
  let speech = 0;

  for (const { beatId, offset } of sources)
  for (const seg of beat(beatId).segments) {
    const start = offset + seg.start * FPS - lead;
    const end = offset + (seg.start + seg.seconds) * FPS;

    // 0 outside, 1 inside, smooth across the edges.
    let a: number;
    if (frame < start - ramp || frame > end + ramp) a = 0;
    else if (frame < start) a = (frame - (start - ramp)) / ramp;
    else if (frame > end) a = 1 - (frame - end) / ramp;
    else a = 1;

    speech = Math.max(speech, Math.max(0, Math.min(1, a)));
  }

  return base + (under - base) * speech;
};
