import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { color, sec } from './theme';
import { Backdrop } from './components';
import { cue } from './cues';
import { duckedVolume } from './score';
import { Scene1a, S1A_FRAMES, BEATS as BEATS_1A } from './Scene1';
import { Scene1b, S1B_FRAMES, BEATS as BEATS_1B } from './Scene1b';
import { Scene2, SCENE2_FRAMES, BEATS as BEATS_2 } from './Scene2';
import { Scene3, SCENE3_FRAMES, BEATS as BEATS_3 } from './Scene3';
import { Scene4, SCENE4_FRAMES, BEATS as BEATS_4 } from './Scene4';
import { Scene5, SCENE5_FRAMES, BEATS as BEATS_5, LEAD_IN as SCENE5_LEAD_IN } from './Scene5';
import { Scene6, S6_FRAMES, BEATS as BEATS_6 } from './Scene6';

/**
 * THE FULL FILM
 *
 * Scenes are joined by fading each one down to the dark grid and holding there
 * before the next fades up. The grid is the film's constant — it sits under
 * every scene here, so the "gap" is not black but the surface the explanatory
 * scenes are drawn on. Scene 1's paper world reads as something laid on top of
 * it, which is the point: the doodles are the thing being peeled away.
 *
 * FADE is kept shorter than every scene's tail padding, so a fade never starts
 * while narration is still playing. Opacity does not attenuate audio.
 */

const FADE = sec(0.55);
const HOLD = sec(0.6); // dark grid between scenes

const SCENES = [
  { id: 'scene1a', Component: Scene1a, frames: S1A_FRAMES, beats: BEATS_1A },
  { id: 'scene1b', Component: Scene1b, frames: S1B_FRAMES, beats: BEATS_1B },
  { id: 'scene2', Component: Scene2, frames: SCENE2_FRAMES, beats: BEATS_2 },
  { id: 'scene3', Component: Scene3, frames: SCENE3_FRAMES, beats: BEATS_3 },
  { id: 'scene4', Component: Scene4, frames: SCENE4_FRAMES, beats: BEATS_4 },
  { id: 'scene5', Component: Scene5, frames: SCENE5_FRAMES, beats: BEATS_5 },
  { id: 'scene6', Component: Scene6, frames: S6_FRAMES, beats: BEATS_6 },
] as const;

/** Frame each scene starts at, accounting for the dark hold between them. */
export const SCENE_STARTS = SCENES.reduce<number[]>((acc, s, i) => {
  const prev = i === 0 ? 0 : acc[i - 1] + SCENES[i - 1].frames + HOLD;
  return [...acc, prev];
}, []);

export const FULL_FRAMES =
  SCENE_STARTS[SCENES.length - 1] + SCENES[SCENES.length - 1].frames + sec(1.2);

/**
 * Every narration beat in the film with its absolute start frame.
 *
 * A bed ducks against all of them rather than a hand-picked few: a beat outside
 * the bed's own span contributes nothing, so listing them all costs nothing and
 * removes the chance of forgetting one when a bed is lengthened.
 */
const FILM_BEATS = SCENES.flatMap((s, i) =>
  s.beats.map((b) => ({ beatId: b.id, at: SCENE_STARTS[i] + b.at })),
);

/** Those beats expressed in the frames of a bed that starts at `from`. */
const duckAgainst = (from: number) =>
  FILM_BEATS.map(({ beatId, at }) => ({ beatId, offset: at - from }));

/** The frame the record scratch cuts the opening bed. 7 = Scene 1b's freeze. */
const SCRATCH = SCENE_STARTS[1] + cue('s1b', 'notOrganic') + 7;

/** "Stop falling for the theater" — where the closing bed takes over. */
const TURN = SCENE_STARTS[5] + SCENE5_LEAD_IN + cue('s5', 'theater');

/** Ramps a scene up from and back down to the grid underneath. */
const Crossfade: React.FC<{ duration: number; children: React.ReactNode }> = ({
  duration,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(
    interpolate(frame, [0, FADE], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
    interpolate(frame, [duration - FADE, duration], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

/**
 * The opening bed sits at film level, not inside a scene, and runs from frame 0
 * straight through the dark hold into Scene 1b — ending on the frame the boil
 * freezes. Music that faded with each scene would put a seam at every boundary;
 * this way the only edit the ear hears is the one that is supposed to hurt.
 */
const OpeningScore: React.FC = () => (
  <Sequence from={0} durationInFrames={SCRATCH}>
    <Audio
      src={staticFile('score/opening.wav')}
      volume={(f) => duckedVolume(duckAgainst(0), f, { base: 0.5, under: 0.14 })}
    />
  </Sequence>
);

/**
 * The middle bed — from the record scratch to the turn into the closing lines.
 *
 * Deliberately quieter than the beds either side of it. Scenes 2 to 4 are where
 * the film explains itself, and the music's job there is to keep the room from
 * going dead between scenes, not to comment. The level lives here rather than
 * in the stem so it can be changed without regenerating three minutes of audio.
 */
const MiddleScore: React.FC = () => (
  <Sequence from={SCRATCH} durationInFrames={TURN - SCRATCH}>
    <Audio
      src={staticFile('score/middle.wav')}
      volume={(f) => duckedVolume(duckAgainst(SCRATCH), f, { base: 0.34, under: 0.1 })}
    />
  </Sequence>
);

/**
 * The closing bed — the Scene 1 drone coming back to see the film out.
 *
 * It starts on "Stop falling for the theater", the turn into the closing
 * statements, rather than at the top of Scene 5: the scene's argument is meant
 * to sound level-headed, and a drone under all of it would fight that. From the
 * turn onward it runs unbroken through the dark hold into Scene 6, so the
 * sign-off lands over something already moving, and fades to silence under the
 * final frames.
 *
 * Like the opening it sits at film level rather than inside a scene, for the
 * same reason: a bed that ended with Scene 5 would put a seam exactly where the
 * joke needs continuity.
 */
const ClosingScore: React.FC = () => (
  <Sequence from={TURN} durationInFrames={FULL_FRAMES - TURN}>
    <Audio
      src={staticFile('score/closing.wav')}
      volume={(f) => duckedVolume(duckAgainst(TURN), f, { base: 0.5, under: 0.14 })}
    />
  </Sequence>
);

export const Full: React.FC = () => (
  <AbsoluteFill style={{ background: color.bg }}>
    <Backdrop />
    <OpeningScore />
    <MiddleScore />
    <ClosingScore />
    {SCENES.map((scene, i) => (
      <Sequence key={scene.id} from={SCENE_STARTS[i]} durationInFrames={scene.frames}>
        <Crossfade duration={scene.frames}>
          <scene.Component />
        </Crossfade>
      </Sequence>
    ))}
  </AbsoluteFill>
);
