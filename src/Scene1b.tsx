import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import { color, font, sec } from './theme';
import { Backdrop, Statement, useEntrance, useVisibility, Definitions, BeatAudio } from './components';
import { POSES, StickFigure, useTalkCycle } from './StickFigure';
import { Desk, Mic } from './Scene1';
import { beat, beatFrames, copy, cue } from './cues';

/**
 * SCENE 1b — THE RECORD SCRATCH
 *
 * The one shot that has to cross between the film's two visual registers.
 * It opens still inside the doodle world, buries it under viral clips, then
 * kills it: the hand-drawn "boil" freezes, colour drains, and a hard-edged wipe
 * reveals the precise vector world the rest of the film argues from.
 *
 * The freeze matters more than the wipe. Stopping the line boil is what makes
 * the cut feel like a needle lifting off a record rather than a slide change.
 */

const PAPER = '#FDFDF7';
const GRID = '#C3D6E8';
const INK = '#1A1A1A';
const HAND_FONT = '"Ink Free", "Segoe Print", "Comic Sans MS", cursive';

export const S1B_FRAMES = beatFrames('s1b', 2.0);

/** A doodled phone-shaped clip card, tossed on at an angle. */
const ViralClip: React.FC<{
  x: number;
  y: number;
  rotate: number;
  label: string;
  delay: number;
  scale?: number;
}> = ({ x, y, rotate, label, delay, scale = 1 }) => {
  const e = useEntrance(delay, 150);
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale * (0.6 + e * 0.4)})`}
      opacity={e}
      filter="url(#rough-clip)"
      stroke={INK}
      strokeWidth={4}
      fill="#FFFFFF"
      strokeLinejoin="round"
    >
      <rect x={-100} y={-140} width={200} height={280} rx={18} />
      <path d="M -26 -34 L 34 0 L -26 34 Z" fill={INK} stroke="none" />
      <text
        x={0}
        y={104}
        textAnchor="middle"
        fontFamily={HAND_FONT}
        fontSize={20}
        fill={INK}
        stroke="none"
      >
        {label}
      </text>
    </g>
  );
};

/** Faint field of digits — seeds the vector world's language before Scene 3. */
const MatrixField: React.FC<{ opacity: number }> = ({ opacity }) => {
  const frame = useCurrentFrame();
  const cols = 26;
  const rows = 13;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const seed = r * cols + c;
      // Values tick over at staggered rates so the field breathes.
      const v = random(`${seed}-${Math.floor(frame / (8 + (seed % 11)))}`);
      cells.push(
        <text
          key={seed}
          x={64 + c * 72}
          y={92 + r * 76}
          fontFamily={font.mono}
          fontSize={26}
          fill={color.mechanism}
          opacity={0.1 + random(`o${seed}`) * 0.24}
        >
          {v.toFixed(2).slice(1)}
        </text>,
      );
    }
  }
  return <g opacity={opacity}>{cells}</g>;
};

const Scene1bBody: React.FC = () => {
  const frame = useCurrentFrame();

  const T = {
    clips: 34,
    scratch: cue('s1b', 'notOrganic'),
    fabricated: cue('s1b', 'fabricated'),
    thesis: cue('s1b', 'thesis'),
  };

  const clipLabels = copy<string[]>('s1b', 'clips');

  // The needle lift: a few frames of frozen, drained doodle before the wipe.
  const FREEZE = 7;
  const frozen = frame >= T.scratch;
  const drain = interpolate(frame, [T.scratch, T.scratch + FREEZE], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Hard-edged diagonal wipe revealing the vector world.
  const wipe = interpolate(frame, [T.scratch + FREEZE, T.scratch + FREEZE + 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const wipePct = wipe * 130 - 15;

  // Paper world jolts once on the scratch, then holds still.
  const jolt = frozen
    ? 0
    : Math.sin(frame * 0.9) * interpolate(frame, [T.scratch - 10, T.scratch], [0, 6], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });

  const talk = useTalkCycle(!frozen && frame > 10, 0);
  const talk2 = useTalkCycle(!frozen && frame > 60, 33);

  const curtain = useVisibility(T.thesis, undefined, 10);
  const curtainOpen = interpolate(frame, [T.thesis, T.thesis + 34], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      {/* ---------------------------------------------- vector world (beneath) */}
      <AbsoluteFill>
        <Backdrop />
        <svg viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
          <MatrixField opacity={curtain * 0.9} />
        </svg>

        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ opacity: useVisibility(T.scratch + 14, T.fabricated - 8, 8), position: 'absolute' }}>
            <Statement delay={T.scratch + 14} tint={color.textDim} size={74}>
              {copy<string>('s1b', 'notOrganic')}
            </Statement>
          </div>

          <div style={{ opacity: useVisibility(T.fabricated, T.thesis - 8, 8), position: 'absolute' }}>
            <Statement delay={T.fabricated} size={82}>
              {copy<string>('s1b', 'fabricatedPrefix')}
              <span style={{ color: color.perception, fontWeight: 500 }}>
                {copy<string>('s1b', 'fabricatedEmphasis')}
              </span>
            </Statement>
          </div>

          <div style={{ opacity: curtain, position: 'absolute' }}>
            <Statement delay={T.thesis} size={66}>
              {copy<string>('s1b', 'thesisLead')}{' '}
              <span style={{ color: color.accent }}>{copy<string>('s1b', 'thesisEmphasis')}</span>
              <br />
              <span style={{ fontSize: 44, color: color.textDim }}>
                {copy<string>('s1b', 'thesisClose')}
              </span>
            </Statement>
          </div>
        </AbsoluteFill>

        {/* Literal curtain pull on the line that says it. */}
        {[-1, 1].map((side) => (
          <div
            key={side}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: '50%',
              [side === -1 ? 'left' : 'right']: 0,
              background: color.bgLift,
              borderRight: side === -1 ? `2px solid ${color.rule}` : undefined,
              borderLeft: side === 1 ? `2px solid ${color.rule}` : undefined,
              transform: `translateX(${side * curtainOpen * 102}%)`,
              opacity: curtain,
            } as React.CSSProperties}
          />
        ))}
      </AbsoluteFill>

      {/* ---------------------------------------------- paper world (wiped away) */}
      <AbsoluteFill
        style={{
          clipPath: `polygon(${wipePct}% 0, 200% 0, 200% 100%, ${wipePct - 12}% 100%)`,
          filter: `saturate(${1 - drain}) contrast(${1 + drain * 0.5}) brightness(${1 - drain * 0.12})`,
          transform: `translateX(${jolt}px)`,
        }}
      >
        <AbsoluteFill style={{ background: PAPER }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(${GRID} 1px, transparent 1px),
                                linear-gradient(90deg, ${GRID} 1px, transparent 1px)`,
              backgroundSize: '38px 38px',
              opacity: 0.55,
            }}
          />
        </AbsoluteFill>

        <svg viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <filter id="rough-clip" x="-15%" y="-15%" width="130%" height="130%">
              <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={2} seed={17} />
              <feDisplacementMap in="SourceGraphic" scale={3} xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter id="rough-desk" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves={2} seed={5} />
              <feDisplacementMap in="SourceGraphic" scale={4} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>

          <StickFigure
            x={640}
            y={476}
            scale={1.22}
            seed={2}
            seated
            headphones
            expression="excited"
            pose={POSES.explaining}
            mouthOpen={talk}
            freeze={frozen}
          />
          <StickFigure
            x={1300}
            y={488}
            scale={1.18}
            seed={9}
            flip
            seated
            headphones
            expression="alarmed"
            pose={POSES.handsUp}
            mouthOpen={talk2}
            freeze={frozen}
          />

          <Desk />
          <Mic x={508} dir={1} />
          <Mic x={1442} dir={-1} />

          {/* The clips bury the set as the narration names the viral machine. */}
          {clipLabels.map((label, i) => {
            const spread = [
              { x: 210, y: 250, r: -13 },
              { x: 1690, y: 224, r: 11 },
              { x: 430, y: 760, r: 8 },
              { x: 1500, y: 800, r: -9 },
              { x: 900, y: 190, r: 4 },
              { x: 1180, y: 880, r: -6 },
            ][i % 6];
            return (
              <ViralClip
                key={label}
                x={spread.x}
                y={spread.y}
                rotate={spread.r}
                label={label}
                delay={T.clips + i * 17}
                scale={0.9}
              />
            );
          })}
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Scene1b: React.FC = () => (
  <AbsoluteFill style={{ background: color.bg }}>
    <Sequence from={0} durationInFrames={S1B_FRAMES}>
      <BeatAudio beat="s1b" />
      <Scene1bBody />
      <Definitions beat="s1b" />
    </Sequence>
  </AbsoluteFill>
);
