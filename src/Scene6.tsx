import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { color, font, sec } from './theme';
import { useEntrance, useVisibility, Definitions, BeatAudio } from './components';
import { beat, beatFrames, copy, cue } from './cues';

/**
 * SCENE 6 — SIGN-OFF
 *
 * Political-ad format, inverted: the punchline is the refusal to approve.
 * A deliberately crude 8-bit sprite, a generic terminal mascot rather than any
 * real product's mark, drawn as pixels so it reads as a third tonal register
 * against both the doodles and the vector work.
 */

export const S6_FRAMES = beatFrames('s6', 2.0);
/**
 * Where this scene's narration sits inside it, for film-level ducking.
 * The scene owns its own layout; Full.tsx should not have to know it.
 */
export const BEATS = [{ id: 's6', at: 0 }];

const PX = 22; // one sprite pixel
const ON = color.mechanism;

// 13x11 sprite: a blocky terminal head with an underscore cursor for a mouth.
const SPRITE = [
  '.....#####...',
  '...#########.',
  '..###########',
  '..###########',
  '..##.#####.##',
  '..##.#####.##',
  '..###########',
  '..###########',
  '..##.......##',
  '...#########.',
  '.....#####...',
];

const Sprite: React.FC<{ blink: boolean }> = ({ blink }) => {
  const rows = SPRITE.length;
  const cols = SPRITE[0].length;
  const w = cols * PX;
  const h = rows * PX;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges">
      {SPRITE.flatMap((row, r) =>
        row.split('').map((cell, c) => {
          if (cell !== '#') return null;
          // Rows 4-5 hold the eyes; blank them on a blink.
          const isEye = (r === 4 || r === 5) && (c === 3 || c === 9);
          if (isEye) return null;
          return (
            <rect
              key={`${r}-${c}`}
              x={c * PX}
              y={r * PX}
              width={PX}
              height={PX}
              fill={ON}
            />
          );
        }),
      )}
      {/* Eyes drawn separately so they can blink. */}
      {!blink &&
        [3, 9].map((c) =>
          [4, 5].map((r) => (
            <rect
              key={`eye-${r}-${c}`}
              x={c * PX}
              y={r * PX}
              width={PX}
              height={PX}
              fill={color.bg}
            />
          )),
        )}
    </svg>
  );
};

const Scene6Body: React.FC = () => {
  const frame = useCurrentFrame();

  const T = {
    logo: cue('s6', 'logo'),
    punchline: cue('s6', 'punchline'),
  };

  const enter = useEntrance(T.logo + 4, 180);
  // Blink on an irregular cycle so it reads as idle rather than metronomic.
  const cycle = frame % 96;
  const blink = cycle > 88 || (cycle > 40 && cycle < 45);

  const line1 = useVisibility(T.logo + 10, undefined, 10);
  const line2 = useVisibility(T.punchline, undefined, 10);
  const disclosure = useVisibility(T.punchline + sec(2.2), undefined, 14);

  // A slow scanline drift, the only motion in an otherwise held frame.
  const scan = interpolate(frame % 180, [0, 180], [0, 1080]);

  return (
    <AbsoluteFill
      style={{
        background: color.bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 44,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `repeating-linear-gradient(180deg, rgba(76,201,232,0.045) 0 2px, transparent 2px 5px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: scan,
          height: 130,
          background: `linear-gradient(180deg, transparent, rgba(76,201,232,0.05), transparent)`,
        }}
      />

      <div
        style={{
          opacity: enter,
          transform: `scale(${0.9 + enter * 0.1})`,
          filter: `drop-shadow(0 0 34px rgba(76,201,232,0.4))`,
        }}
      >
        <Sprite blink={blink} />
      </div>

      <div
        style={{
          fontFamily: font.mono,
          fontSize: 46,
          color: color.text,
          opacity: line1,
          letterSpacing: 1,
        }}
      >
        {copy<string>('s6', 'line1')}
      </div>

      <div
        style={{
          fontFamily: font.mono,
          fontSize: 46,
          color: color.mechanism,
          opacity: line2,
          letterSpacing: 1,
          textAlign: 'center',
        }}
      >
        {copy<string>('s6', 'line2')}
      </div>

      {/* Doubles as the synthetic-media disclosure YouTube asks for. */}
      <div
        style={{
          position: 'absolute',
          bottom: 68,
          fontFamily: font.mono,
          fontSize: 22,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: color.textFaint,
          opacity: disclosure,
        }}
      >
        {copy<string>('s6', 'disclosure')}
      </div>
    </AbsoluteFill>
  );
};

export const Scene6: React.FC = () => (
  <AbsoluteFill style={{ background: color.bg }}>
    <Sequence from={0} durationInFrames={S6_FRAMES}>
      <BeatAudio beat="s6" />
      <Scene6Body />
      <Definitions beat="s6" />
    </Sequence>
  </AbsoluteFill>
);
