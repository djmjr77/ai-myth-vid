import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import { sec } from './theme';
import { useEntrance, useVisibility, Definitions, BeatAudio } from './components';
import { POSES, StickFigure, useTalkCycle } from './StickFigure';
import { beat, beatFrames, copy, cue } from './cues';

/**
 * SCENE 1a — THE HOOK (podcast montage)
 *
 * Stands in for the scripted montage of real podcast clips. Drawing it as doodles
 * avoids using footage of real people, and sets up the film's central contrast:
 * the hype world is hand-drawn and sloppy, the explanation is precise vector work.
 */

const PAPER = '#FDFDF7';
const GRID = '#C3D6E8';
const INK = '#1A1A1A';

export const S1A_FRAMES = beatFrames('s1a', 2.0);

const HAND_FONT = '"Ink Free", "Segoe Print", "Comic Sans MS", cursive';

/** Graph paper, to read as a doodle pad rather than a designed surface. */
const GraphPaper: React.FC = () => (
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
);

/** Wobbly speech balloon with a tail pointing back at its speaker. */
const SpeechBubble: React.FC<{
  x: number;
  y: number;
  width: number;
  lines: string[];
  tailTo: 'left' | 'right';
  delay: number;
  out?: number;
  fontSize?: number;
  seed?: number;
}> = ({ x, y, width, lines, tailTo, delay, out, fontSize = 40, seed = 3 }) => {
  const e = useEntrance(delay, 170);
  const vis = useVisibility(delay, out, 8);
  const height = 44 + lines.length * (fontSize + 14);
  const tailX = tailTo === 'left' ? 60 : width - 60;
  const dir = tailTo === 'left' ? -1 : 1;

  return (
    <g
      transform={`translate(${x} ${y}) scale(${0.86 + e * 0.14})`}
      opacity={vis}
      style={{ transformOrigin: `${tailX}px ${height}px` }}
    >
      <g filter="url(#rough-bubble)">
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          rx={26}
          fill="#FFFFFF"
          stroke={INK}
          strokeWidth={4}
        />
        <path
          d={`M ${tailX} ${height - 4} L ${tailX + 26 * dir} ${height + 46} L ${tailX + 46 * dir} ${height - 4} Z`}
          fill="#FFFFFF"
          stroke={INK}
          strokeWidth={4}
          strokeLinejoin="round"
        />
        <rect
          x={tailX + Math.min(0, 46 * dir) + 4}
          y={height - 7}
          width={38}
          height={7}
          fill="#FFFFFF"
        />
      </g>
      {lines.map((line, i) => (
        <text
          key={line}
          x={width / 2}
          y={40 + i * (fontSize + 14)}
          textAnchor="middle"
          fontFamily={HAND_FONT}
          fontSize={fontSize}
          fill={INK}
        >
          {line}
        </text>
      ))}
    </g>
  );
};

/** Chyron strip along the bottom, the way clip accounts caption everything. */
const Chyron: React.FC<{ text: string; delay: number; out: number }> = ({
  text,
  delay,
  out,
}) => {
  const vis = useVisibility(delay, out, 5);
  const e = useEntrance(delay, 160);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 74,
        display: 'flex',
        justifyContent: 'center',
        opacity: vis,
        transform: `translateY(${(1 - e) * 26}px)`,
      }}
    >
      <div
        style={{
          background: '#D62436',
          color: '#FFFFFF',
          fontFamily: '"Arial Black", Impact, sans-serif',
          fontSize: 42,
          letterSpacing: 1,
          padding: '16px 40px',
          transform: 'rotate(-0.7deg)',
          boxShadow: '7px 7px 0 rgba(26,26,26,0.85)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

export const DESK_Y = 706;

/** Desk runs off the bottom of frame, so the figures read as seated behind it. */
export const Desk: React.FC = () => (
  <g filter="url(#rough-desk)" stroke={INK} strokeWidth={5} fill="#FFFFFF" strokeLinejoin="round">
    <path d={`M 210 ${DESK_Y} L 1710 ${DESK_Y} L 1760 1120 L 160 1120 Z`} />
    {/* A mug, so the surface is not a blank slab. */}
    <g strokeWidth={4}>
      <path d="M 1516 800 h 92 l -10 92 h -72 Z" />
      <path d="M 1610 818 q 34 22 -6 50" fill="none" />
    </g>
  </g>
);

/**
 * Boom mic: stand on the desk, arm angling in toward the speaker, capsule head.
 * `dir` points the boom at the figure it belongs to.
 */
export const Mic: React.FC<{ x: number; dir: -1 | 1 }> = ({ x, dir }) => (
  <g
    transform={`translate(${x} ${DESK_Y})`}
    filter="url(#rough-desk)"
    stroke={INK}
    strokeWidth={5}
    fill="#FFFFFF"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <ellipse cx={0} cy={2} rx={40} ry={11} />
    <path d={`M 0 0 L 0 -96 L ${dir * 62} -140`} fill="none" />
    <g transform={`translate(${dir * 78} -152) rotate(${dir * 34})`}>
      <rect x={-26} y={-34} width={52} height={68} rx={26} />
      <path d="M -16 -18 h 32 M -16 -2 h 32 M -16 14 h 32" strokeWidth={3} fill="none" />
    </g>
  </g>
);

const PodcastSet: React.FC = () => {
  const frame = useCurrentFrame();

  // Cues measured from the narration audio; chyrons trail their claim slightly.
  const T = {
    figures: 6,
    // Bubbles lead their line — the visual arrives before the narrator names it,
    // which is normal, and it is the only way to give 40 characters time to be
    // read inside a 2s cue window. Chyrons punctuate instead, landing just
    // before the claim and holding until the next one needs the slot.
    bubble1: cue('s1a', 'gurus', 1.0),
    bubble2: cue('s1a', 'claimBlackmail'),
    chyron1: cue('s1a', 'claimEscape', -0.6),
    chyron2: cue('s1a', 'claimBlackmail', 0.35),
    camera: cue('s1a', 'camera'),
  };

  // Host talks first, guest takes over on the second claim.
  const hostTalking = frame > T.figures && frame < cue('s1a', 'claimBlackmail') - 20;
  const guestTalking = frame >= cue('s1a', 'claimBlackmail') - 20;
  const hostMouth = useTalkCycle(hostTalking, 0);
  const guestMouth = useTalkCycle(guestTalking, 40);

  // A slow push-in keeps an otherwise static two-shot alive.
  const zoom = interpolate(frame, [0, S1A_FRAMES], [1, 1.09]);
  const lean = interpolate(frame, [T.camera - 20, T.camera + 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const bob = (phase: number) => Math.sin((frame + phase) * 0.11) * 4;

  return (
    <AbsoluteFill>
      <GraphPaper />

      <svg
        viewBox="0 0 1920 1080"
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${zoom})`,
          transformOrigin: '50% 62%',
        }}
      >
        <defs>
          {/* Shared wobble for props; figures carry their own re-seeding filters. */}
          <filter id="rough-bubble" x="-15%" y="-15%" width="130%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves={2} seed={11} />
            <feDisplacementMap in="SourceGraphic" scale={3} xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="rough-desk" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves={2} seed={5} />
            <feDisplacementMap in="SourceGraphic" scale={4} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>

        {/* Host — leans toward camera on the final line. */}
        <StickFigure
          x={640}
          y={476}
          scale={1.22 + lean * 0.12}
          seed={2}
          seated
          headphones
          expression={lean > 0.5 ? 'knowing' : 'excited'}
          pose={POSES.explaining}
          mouthOpen={hostMouth}
          bob={bob(0)}
        />

        {/* Guest — the one who says the scarier thing. */}
        <StickFigure
          x={1300}
          y={488}
          scale={1.18 + lean * 0.1}
          seed={9}
          flip
          seated
          headphones
          expression={guestTalking ? 'alarmed' : 'worried'}
          pose={guestTalking ? POSES.handsUp : POSES.gesturing}
          mouthOpen={guestMouth}
          bob={bob(22)}
        />

        <Desk />
        <Mic x={508} dir={1} />
        <Mic x={1442} dir={-1} />

        <SpeechBubble
          x={210}
          y={110}
          width={560}
          lines={copy<string[]>('s1a', 'bubbleEscape')}
          tailTo="right"
          delay={T.bubble1}
          out={T.bubble2 - 6}
          seed={3}
        />
        <SpeechBubble
          x={1130}
          y={92}
          width={600}
          lines={copy<string[]>('s1a', 'bubbleBlackmail')}
          tailTo="left"
          delay={T.bubble2}
          out={T.camera + 45}
          seed={7}
        />
      </svg>

      <Chyron text={copy<string>('s1a', 'chyronEscape')} delay={T.chyron1} out={T.chyron2 - 6} />
      <Chyron text={copy<string>('s1a', 'chyronBlackmail')} delay={T.chyron2} out={T.camera + 45} />
    </AbsoluteFill>
  );
};

export const Scene1a: React.FC = () => (
  <AbsoluteFill style={{ background: PAPER }}>
    <Sequence from={0} durationInFrames={S1A_FRAMES}>
      <BeatAudio beat="s1a" />
      <PodcastSet />
      <Definitions beat="s1a" />
    </Sequence>
  </AbsoluteFill>
);
