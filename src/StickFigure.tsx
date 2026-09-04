import React from 'react';
import { useCurrentFrame } from 'remotion';

/**
 * Hand-drawn stick figure system.
 *
 * Deliberately crude, to sit opposite the precise vector language used for the
 * "what is actually happening" scenes. Figures are drawn in a local coordinate
 * space roughly 240 wide x 400 tall, origin at the centre of the head, so a
 * caller only positions and scales them.
 *
 * The wobble filter re-seeds every few frames, which reproduces the "boil" of
 * real hand-drawn animation. Without it the lines look vector-clean and the
 * whole conceit falls apart.
 */

export type Expression =
  | 'neutral'
  | 'alarmed'
  | 'smug'
  | 'excited'
  | 'worried'
  | 'shocked'
  | 'knowing';

export type ArmPose = { shoulder: number; elbow: number };
export type Pose = { left: ArmPose; right: ArmPose };

export const POSES: Record<string, Pose> = {
  rest: { left: { shoulder: 12, elbow: 8 }, right: { shoulder: 12, elbow: 8 } },
  gesturing: { left: { shoulder: 58, elbow: 46 }, right: { shoulder: 66, elbow: 52 } },
  handsUp: { left: { shoulder: 148, elbow: 22 }, right: { shoulder: 148, elbow: 22 } },
  shrug: { left: { shoulder: 96, elbow: 62 }, right: { shoulder: 96, elbow: 62 } },
  pointing: { left: { shoulder: 20, elbow: 10 }, right: { shoulder: 104, elbow: 4 } },
  onHips: { left: { shoulder: 44, elbow: 96 }, right: { shoulder: 44, elbow: 96 } },
  explaining: { left: { shoulder: 74, elbow: 70 }, right: { shoulder: 40, elbow: 88 } },
};

const INK = '#1A1A1A';
const PAPER_FILL = '#FFFFFF';
const SHOULDER_Y = 74;
const UPPER = 50;
const FORE = 46;

/** Joint positions for one arm. Angles are degrees from straight-down, outward-positive. */
const armPoints = (side: -1 | 1, pose: ArmPose) => {
  const sx = 40 * side;
  const a1 = (pose.shoulder * Math.PI) / 180;
  const a2 = ((pose.shoulder + pose.elbow) * Math.PI) / 180;
  const ex = sx + Math.sin(a1) * UPPER * side;
  const ey = SHOULDER_Y + Math.cos(a1) * UPPER;
  const hx = ex + Math.sin(a2) * FORE * side;
  const hy = ey + Math.cos(a2) * FORE;
  return { sx, sy: SHOULDER_Y, ex, ey, hx, hy };
};

const Face: React.FC<{ expression: Expression; mouthOpen: number; ink: string }> = ({
  expression,
  mouthOpen,
  ink,
}) => {
  const brow = (() => {
    switch (expression) {
      case 'alarmed':
      case 'shocked':
        return (
          <>
            <path d="M -30 -22 q 10 -10 20 -4" />
            <path d="M 30 -22 q -10 -10 -20 -4" />
          </>
        );
      case 'smug':
      case 'knowing':
        return (
          <>
            <path d="M -30 -20 q 10 4 20 0" />
            <path d="M 12 -26 q 10 -6 20 0" />
          </>
        );
      case 'worried':
        return (
          <>
            <path d="M -30 -24 q 10 6 20 2" />
            <path d="M 30 -24 q -10 6 -20 2" />
          </>
        );
      case 'excited':
        return (
          <>
            <path d="M -30 -26 q 10 -6 20 -2" />
            <path d="M 30 -26 q -10 -6 -20 -2" />
          </>
        );
      default:
        return null;
    }
  })();

  // Wide eyes read as alarm; the rest stay as simple dots like the reference.
  const wideEyes = expression === 'shocked' || expression === 'alarmed';
  const eyes = wideEyes ? (
    <>
      <circle cx={-16} cy={-4} r={9} fill="none" />
      <circle cx={16} cy={-4} r={9} fill="none" />
      <circle cx={-16} cy={-4} r={3.5} fill={ink} />
      <circle cx={16} cy={-4} r={3.5} fill={ink} />
    </>
  ) : (
    <>
      <circle cx={-16} cy={-4} r={4.5} fill={ink} />
      <circle cx={16} cy={-4} r={4.5} fill={ink} />
    </>
  );

  // Mouth is driven by mouthOpen (0..1) so figures can appear to talk.
  const openH = 4 + mouthOpen * 20;
  const mouth =
    mouthOpen > 0.08 ? (
      <ellipse cx={0} cy={22} rx={11 + mouthOpen * 5} ry={openH / 2} fill={ink} />
    ) : expression === 'smug' || expression === 'knowing' ? (
      <path d="M -12 20 q 12 8 24 -2" />
    ) : expression === 'worried' ? (
      <path d="M -12 26 q 12 -9 24 0" />
    ) : expression === 'excited' ? (
      <path d="M -16 18 q 16 16 32 0" />
    ) : (
      <path d="M -12 22 h 24" />
    );

  return (
    <g strokeWidth={3.4} strokeLinecap="round" fill="none" stroke={ink}>
      {brow}
      {eyes}
      {mouth}
    </g>
  );
};

export const StickFigure: React.FC<{
  x: number;
  y: number;
  scale?: number;
  flip?: boolean;
  expression?: Expression;
  pose?: Pose;
  /** 0..1 mouth opening; drive from a talk cycle. */
  mouthOpen?: number;
  /** Hide legs for seated shots. */
  seated?: boolean;
  headphones?: boolean;
  /** Small vertical bob, in px. */
  bob?: number;
  seed?: number;
  /**
   * Stop the line boil. Used for the record scratch in Scene 1b — a frozen line
   * is what makes the cut read as a needle lifting rather than a slide change.
   */
  freeze?: boolean;
  /** Line colour. Default is ink-on-paper; pass a light value for the dark register. */
  ink?: string;
  /** Body fill, which also hides the lines behind limbs. Match the background. */
  fill?: string;
}> = ({
  x,
  y,
  scale = 1,
  flip = false,
  expression = 'neutral',
  pose = POSES.rest,
  mouthOpen = 0,
  seated = false,
  headphones = false,
  bob = 0,
  seed = 1,
  freeze = false,
  ink = INK,
  fill = PAPER_FILL,
}) => {
  const frame = useCurrentFrame();
  // Re-seed a few times a second: the classic hand-drawn line "boil".
  const boil = freeze ? 0 : Math.floor(frame / 5) % 4;
  const filterId = `rough-${seed}-${boil}`;

  const L = armPoints(-1, pose.left);
  const R = armPoints(1, pose.right);

  return (
    <g
      transform={`translate(${x} ${y + bob}) scale(${(flip ? -scale : scale)} ${scale})`}
    >
      <defs>
        <filter id={filterId} x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.028"
            numOctaves={2}
            seed={seed * 7 + boil}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={3.4}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      <g filter={`url(#${filterId})`} stroke={ink} strokeWidth={4} strokeLinecap="round" fill="none">
        {/* Head */}
        <ellipse cx={0} cy={0} rx={46} ry={52} fill={fill} />
        <Face expression={expression} mouthOpen={mouthOpen} ink={ink} />

        {headphones && (
          <g strokeWidth={5}>
            <path d="M -50 -14 q 0 -56 100 0" />
            <rect x={-62} y={-18} width={20} height={30} rx={7} fill={fill} />
            <rect x={42} y={-18} width={20} height={30} rx={7} fill={fill} />
          </g>
        )}

        {/* Neck + tunic body, matching the reference silhouette */}
        <path d="M 0 52 v 14" />
        <path d="M -40 66 L 40 66 L 50 182 L -50 182 Z" fill={fill} />

        {/* Arms */}
        <path d={`M ${L.sx} ${L.sy} L ${L.ex} ${L.ey} L ${L.hx} ${L.hy}`} />
        <path d={`M ${R.sx} ${R.sy} L ${R.ex} ${R.ey} L ${R.hx} ${R.hy}`} />
        <circle cx={L.hx} cy={L.hy} r={7} fill={fill} />
        <circle cx={R.hx} cy={R.hy} r={7} fill={fill} />

        {!seated && (
          <>
            <path d="M -22 182 L -26 268" />
            <path d="M 22 182 L 26 268" />
            <ellipse cx={-32} cy={272} rx={13} ry={7} fill={fill} />
            <ellipse cx={32} cy={272} rx={13} ry={7} fill={fill} />
          </>
        )}
      </g>
    </g>
  );
};

/** Pseudo-random mouth cycle so a figure reads as mid-sentence. */
export const useTalkCycle = (active: boolean, offset = 0) => {
  const frame = useCurrentFrame();
  if (!active) return 0;
  const t = frame + offset;
  const a = Math.sin(t * 0.55) * 0.5 + 0.5;
  const b = Math.sin(t * 0.31 + 1.7) * 0.5 + 0.5;
  return Math.max(0, Math.min(1, a * 0.65 + b * 0.5 - 0.15));
};
