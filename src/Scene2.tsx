import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { color, font, sec } from './theme';
import { Backdrop, Definitions, Eyebrow, Statement, useEntrance, useVisibility, BeatAudio } from './components';
import { beat, beatFrames, copy, cue } from './cues';

/**
 * SCENE 2 — CONTEXTS AND SIMULATIONS
 *
 * The film's load-bearing factual claim: the "escape" was a commissioned test.
 * So the scene is built to show authorship — the fixtures appear one at a time,
 * each labelled as something a human put there, and the operator prompt is
 * revealed last, in an editor, with a cursor still in it.
 */

export const LEAD_IN = sec(0.4);
export const BEAT_GAP = sec(0.2);
export const TAIL = sec(1.2);

// Beat A ends on 'It was a red-teaming evaluation.' — the last cue in the beat,
// so no holdAfter can widen it. The extra tail is what gives that line, and the
// definition card under it, time to be read before the cut.
export const BEAT_A = beatFrames('s2a', 0.7);
export const BEAT_B = beatFrames('s2b');
export const SCENE2_FRAMES = LEAD_IN + BEAT_A + BEAT_GAP + BEAT_B + TAIL;
/**
 * Where this scene's narration sits inside it, for film-level ducking.
 * The scene owns its own layout; Full.tsx should not have to know it.
 */
export const BEATS = [
  { id: 's2a', at: LEAD_IN },
  { id: 's2b', at: LEAD_IN + BEAT_A + BEAT_GAP },
];

// ---------------------------------------------------------------- Beat A

const BeatA: React.FC = () => {
  const frame = useCurrentFrame();
  const T = {
    headline: 12,
    context: cue('s2a', 'context'),
    notAutonomous: cue('s2a', 'notAutonomous'),
    redteam: cue('s2a', 'redteam'),
  };

  const headline = useVisibility(T.headline, T.notAutonomous - 10, 10);
  // The headline is struck through as the correction arrives.
  const strike = interpolate(frame, [T.context, T.context + 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const e = useEntrance(T.headline, 170);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ opacity: headline, position: 'absolute' }}>
        <div style={{ position: 'relative', transform: `translateY(${(1 - e) * 24}px)` }}>
          <div
            style={{
              fontFamily: '"Arial Black", Impact, sans-serif',
              fontSize: 76,
              color: color.text,
              letterSpacing: -1,
              padding: '20px 44px',
              border: `3px solid ${color.rule}`,
              background: color.bgLift,
            }}
          >
            {copy<string>('s2a', 'headline')}
          </div>
          {/* Struck through rather than removed: the claim was made, then corrected. */}
          <div
            style={{
              position: 'absolute',
              left: 30,
              right: 30,
              top: '50%',
              height: 7,
              background: color.perception,
              transform: `scaleX(${strike})`,
              transformOrigin: 'left center',
            }}
          />
        </div>
      </div>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: useVisibility(T.notAutonomous, T.redteam - 8, 9), position: 'absolute' }}>
          <Statement delay={T.notAutonomous} tint={color.textDim} size={68}>
            {copy<string>('s2a', 'notAutonomous')}
          </Statement>
        </div>
        <div style={{ opacity: useVisibility(T.redteam, undefined, 9), position: 'absolute' }}>
          <Statement delay={T.redteam} size={72}>
            It was a <span style={{ color: color.mechanism }}>red-teaming evaluation.</span>
          </Statement>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Beat B

/** One thing a human placed in the sandbox, ticked off as it is named. */
const Fixture: React.FC<{ label: string; delay: number }> = ({ label, delay }) => {
  const e = useEntrance(delay, 200);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        opacity: e,
        transform: `translateX(${(1 - e) * -20}px)`,
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 5,
          border: `2px solid ${color.mechanism}`,
          background: color.mechanism,
          color: color.bg,
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: font.mono,
        }}
      >
        ✓
      </span>
      <span style={{ fontFamily: font.sans, fontSize: 32, color: color.text }}>{label}</span>
    </div>
  );
};

const BeatB: React.FC = () => {
  const frame = useCurrentFrame();
  const T = {
    box: 8,
    tools: cue('s2b', 'tools'),
    prompt: cue('s2b', 'prompt'),
    notRebellion: cue('s2b', 'notRebellion'),
    path: cue('s2b', 'path'),
    crash: cue('s2b', 'crash'),
  };

  const fixtures = copy<string[]>('s2b', 'fixtures');
  // Clear of the statement that follows: the fade completes before it arrives.
  const box = useVisibility(T.box, T.notRebellion - 16, 12);
  const boxE = useEntrance(T.box, 190);
  const promptVis = useVisibility(T.prompt, T.notRebellion - 16, 12);
  const caret = Math.floor(frame / 14) % 2 === 0;

  // Pre-defined path: a dotted line drawn through fixed waypoints.
  const pathVis = useVisibility(T.path, T.crash - 8, 10);
  const pathDraw = interpolate(frame, [T.path, T.path + 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* The sandbox: everything inside it was placed by someone. */}
      <div style={{ opacity: box, position: 'absolute' }}>
        <div
          style={{
            width: 1320,
            border: `2px dashed ${color.rule}`,
            borderRadius: 16,
            padding: '38px 46px 46px',
            background: 'rgba(20,27,40,0.55)',
            transform: `scale(${0.96 + boxE * 0.04})`,
          }}
        >
          <Eyebrow delay={T.box} tint={color.textFaint}>
            {copy<string>('s2b', 'sandboxLabel')}
          </Eyebrow>

          <div style={{ display: 'flex', gap: 52, marginTop: 34, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
              {fixtures.map((f, i) => (
                <Fixture key={f} label={f} delay={T.box + 16 + i * 22} />
              ))}
            </div>

            {/* The model: a passive box, not an actor. */}
            <div
              style={{
                width: 210,
                height: 148,
                border: `2px solid ${color.mechanismDim}`,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: font.mono,
                fontSize: 24,
                letterSpacing: 3,
                color: color.mechanism,
                background: 'rgba(76,201,232,0.06)',
                opacity: useEntrance(T.tools),
              }}
            >
              {copy<string>('s2b', 'agentLabel')}
            </div>
          </div>

          {/* The operator prompt — the point of the whole scene. */}
          <div style={{ marginTop: 34, opacity: promptVis }}>
            <Eyebrow delay={T.prompt} tint={color.perception}>
              {copy<string>('s2b', 'promptLabel')}
            </Eyebrow>
            <div
              style={{
                marginTop: 18,
                padding: '24px 28px',
                background: '#0D1119',
                border: `1px solid ${color.rule}`,
                borderLeft: `4px solid ${color.perception}`,
                borderRadius: 8,
                fontFamily: font.mono,
                fontSize: 27,
                lineHeight: 1.55,
                color: color.text,
              }}
            >
              {copy<string>('s2b', 'promptText')}
              <span style={{ color: color.perception, opacity: caret ? 1 : 0 }}>▍</span>
            </div>
          </div>
        </div>
      </div>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: useVisibility(T.notRebellion, T.path - 8, 9), position: 'absolute' }}>
          <Statement delay={T.notRebellion} tint={color.textDim} size={64}>
            {copy<string>('s2b', 'notRebellion')}
          </Statement>
        </div>

        {/* A route someone drew in advance, not a decision. */}
        <div style={{ opacity: pathVis, position: 'absolute' }}>
          <svg width={1400} height={300} viewBox="0 0 1400 300">
            <path
              d="M 90 220 L 380 120 L 700 210 L 1010 96 L 1310 176"
              fill="none"
              stroke={color.mechanism}
              strokeWidth={3}
              strokeDasharray="10 12"
              strokeDashoffset={(1 - pathDraw) * 1400}
              pathLength={1400}
              style={{ strokeDasharray: '10 12' }}
            />
            {[
              [90, 220],
              [380, 120],
              [700, 210],
              [1010, 96],
              [1310, 176],
            ].map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={9}
                fill={color.bg}
                stroke={color.mechanism}
                strokeWidth={3}
                opacity={pathDraw > i / 5 ? 1 : 0}
              />
            ))}
            <text
              x={700}
              y={286}
              textAnchor="middle"
              fontFamily={font.mono}
              fontSize={24}
              letterSpacing={3}
              fill={color.textFaint}
            >
              {copy<string>('s2b', 'pathLabel').toUpperCase()}
            </text>
          </svg>
        </div>

        <div style={{ opacity: useVisibility(T.crash, undefined, 12), position: 'absolute' }}>
          <Statement delay={T.crash} size={66}>
            {copy<string>('s2b', 'crashLead')}
            <span style={{ color: color.accent }}>{copy<string>('s2b', 'crashEmphasis')}</span>
            {copy<string>('s2b', 'crashTail')}
          </Statement>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Scene2: React.FC = () => (
  <AbsoluteFill style={{ background: color.bg }}>
    <Backdrop />
    <Sequence from={LEAD_IN} durationInFrames={BEAT_A}>
      <BeatAudio beat="s2a" />
      <BeatA />
      <Definitions beat="s2a" />
    </Sequence>
    <Sequence from={LEAD_IN + BEAT_A + BEAT_GAP} durationInFrames={BEAT_B}>
      <BeatAudio beat="s2b" />
      <BeatB />
      <Definitions beat="s2b" />
    </Sequence>
  </AbsoluteFill>
);
