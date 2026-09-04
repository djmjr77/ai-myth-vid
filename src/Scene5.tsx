import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { color, font, sec } from './theme';
import { Backdrop, Eyebrow, Statement, useEntrance, useVisibility, Definitions, BeatAudio } from './components';
import { beat, beatFrames, copy, cue } from './cues';

/**
 * SCENE 5 — CONCLUSION
 *
 * Strips back rather than builds up. The grid fades, the ornament goes, and the
 * last two lines land on near-empty frames — the quietest images in the film,
 * so the closing claim isn't competing with anything.
 */

export const LEAD_IN = sec(0.5);
export const TAIL = sec(2.6);
export const SCENE5_FRAMES = LEAD_IN + beatFrames('s5') + TAIL;

const Body: React.FC = () => {
  const frame = useCurrentFrame();
  const T = {
    danger: 12,
    distracted: cue('s5', 'distracted'),
    theater: cue('s5', 'theater'),
    notMagic: cue('s5', 'notMagic'),
    justMath: cue('s5', 'justMath'),
  };

  const real = copy<string[]>('s5', 'real');

  const danger = useVisibility(T.danger, T.distracted - 8, 10);
  const list = useVisibility(T.distracted, T.theater - 10, 12);
  const theater = useVisibility(T.theater, T.notMagic - 8, 9);
  const notMagic = useVisibility(T.notMagic, T.justMath - 8, 9);
  const justMath = useVisibility(T.justMath, undefined, 14);

  // Everything quiets down for the last two lines.
  const settle = interpolate(frame, [T.theater, T.notMagic], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <AbsoluteFill style={{ opacity: settle }}>
        <Backdrop />
      </AbsoluteFill>

      <div style={{ opacity: danger, position: 'absolute' }}>
        <Statement delay={T.danger} tint={color.textDim} size={62}>
          {copy<string>('s5', 'dangerLead')}
        </Statement>
      </div>

      {/* The actual agenda, stated plainly. */}
      <div style={{ opacity: list, position: 'absolute' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
          <Eyebrow delay={T.distracted} tint={color.textFaint}>
            {copy<string>('s5', 'realLabel')}
          </Eyebrow>
          <div style={{ display: 'flex', gap: 26, marginTop: 14 }}>
            {real.map((item, i) => (
              <RealItem key={item} label={item} delay={T.distracted + 18 + i * 20} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ opacity: theater, position: 'absolute' }}>
        <Statement delay={T.theater} size={74}>
          {copy<string>('s5', 'theater')}
        </Statement>
      </div>

      <div style={{ opacity: notMagic, position: 'absolute' }}>
        <Statement delay={T.notMagic} tint={color.textDim} size={86}>
          {copy<string>('s5', 'notMagic')}
        </Statement>
      </div>

      <div style={{ opacity: justMath, position: 'absolute' }}>
        <Statement delay={T.justMath} size={104}>
          It's just <span style={{ color: color.mechanism }}>math.</span>
        </Statement>
      </div>
    </AbsoluteFill>
  );
};

const RealItem: React.FC<{ label: string; delay: number }> = ({ label, delay }) => {
  const e = useEntrance(delay, 200);
  return (
    <div
      style={{
        padding: '28px 40px',
        border: `1px solid ${color.rule}`,
        borderRadius: 12,
        background: color.panel,
        fontFamily: font.sans,
        fontSize: 36,
        color: color.text,
        opacity: e,
        transform: `translateY(${(1 - e) * 24}px)`,
      }}
    >
      {label}
    </div>
  );
};

export const Scene5: React.FC = () => (
  <AbsoluteFill style={{ background: color.bg }}>
    <Sequence from={LEAD_IN} durationInFrames={beatFrames('s5') + TAIL}>
      <BeatAudio beat="s5" />
      <Body />
      <Definitions beat="s5" />
    </Sequence>
  </AbsoluteFill>
);
