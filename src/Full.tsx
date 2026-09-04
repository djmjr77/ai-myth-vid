import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { color, sec } from './theme';
import { Backdrop } from './components';
import { cue } from './cues';
import { duckedVolume } from './score';
import { Scene1a, S1A_FRAMES } from './Scene1';
import { Scene1b, S1B_FRAMES } from './Scene1b';
import { Scene2, SCENE2_FRAMES } from './Scene2';
import { Scene3, SCENE3_FRAMES } from './Scene3';
import { Scene4, SCENE4_FRAMES } from './Scene4';
import { Scene5, SCENE5_FRAMES } from './Scene5';
import { Scene6, S6_FRAMES } from './Scene6';

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
const HOLD = sec(0.8); // dark grid between scenes

const SCENES = [
  { id: 'scene1a', Component: Scene1a, frames: S1A_FRAMES },
  { id: 'scene1b', Component: Scene1b, frames: S1B_FRAMES },
  { id: 'scene2', Component: Scene2, frames: SCENE2_FRAMES },
  { id: 'scene3', Component: Scene3, frames: SCENE3_FRAMES },
  { id: 'scene4', Component: Scene4, frames: SCENE4_FRAMES },
  { id: 'scene5', Component: Scene5, frames: SCENE5_FRAMES },
  { id: 'scene6', Component: Scene6, frames: S6_FRAMES },
] as const;

/** Frame each scene starts at, accounting for the dark hold between them. */
export const SCENE_STARTS = SCENES.reduce<number[]>((acc, s, i) => {
  const prev = i === 0 ? 0 : acc[i - 1] + SCENES[i - 1].frames + HOLD;
  return [...acc, prev];
}, []);

export const FULL_FRAMES =
  SCENE_STARTS[SCENES.length - 1] + SCENES[SCENES.length - 1].frames + sec(1.2);

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
const OpeningScore: React.FC = () => {
  const end = SCENE_STARTS[1] + cue('s1b', 'notOrganic') + 7; // 7 = Scene 1b's freeze
  return (
    <Sequence from={0} durationInFrames={end}>
      <Audio
        src={staticFile('score/opening.wav')}
        volume={(f) =>
          duckedVolume(
            [
              { beatId: 's1a', offset: 0 },
              { beatId: 's1b', offset: SCENE_STARTS[1] },
            ],
            f,
            { base: 0.5, under: 0.14 },
          )
        }
      />
    </Sequence>
  );
};

export const Full: React.FC = () => (
  <AbsoluteFill style={{ background: color.bg }}>
    <Backdrop />
    <OpeningScore />
    {SCENES.map((scene, i) => (
      <Sequence key={scene.id} from={SCENE_STARTS[i]} durationInFrames={scene.frames}>
        <Crossfade duration={scene.frames}>
          <scene.Component />
        </Crossfade>
      </Sequence>
    ))}
  </AbsoluteFill>
);
