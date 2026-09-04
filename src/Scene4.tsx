import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { color, font, sec } from './theme';
import { Backdrop, Eyebrow, Statement, useEntrance, useVisibility, Definitions, BeatAudio } from './components';
import { POSES, StickFigure, useTalkCycle } from './StickFigure';
import { beat, beatFrames, copy, cue } from './cues';

/**
 * SCENE 4 — THE INCENTIVE
 *
 * Beat A is about people performing, so the stick figures return — but drawn
 * light-on-dark rather than on graph paper. Same actors, now seen from inside
 * the film's own register instead of the hype one.
 * Beat B is structural rather than personal, so the figures leave entirely.
 */

export const LEAD_IN = sec(0.5);
export const BEAT_GAP = sec(0.2);
export const TAIL = sec(2.0);

export const BEAT_A = beatFrames('s4a');
export const BEAT_B = beatFrames('s4b');
export const SCENE4_FRAMES = LEAD_IN + BEAT_A + BEAT_GAP + BEAT_B + TAIL;

/** Two pitches, same product, opposite outcomes. */
const Pitch: React.FC<{
  label: string;
  quote: string;
  result: string;
  tint: string;
  delay: number;
  rising: boolean;
}> = ({ label, quote, result, tint, delay, rising }) => {
  const e = useEntrance(delay, 200);
  const frame = useCurrentFrame();
  const grow = interpolate(frame, [delay + 14, delay + 54], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        width: 700,
        opacity: e,
        transform: `translateY(${(1 - e) * 26}px)`,
      }}
    >
      <Eyebrow delay={delay} tint={tint}>
        {label}
      </Eyebrow>
      <div
        style={{
          marginTop: 24,
          fontFamily: font.sans,
          fontSize: 40,
          fontWeight: 300,
          lineHeight: 1.35,
          color: color.text,
          minHeight: 110,
        }}
      >
        {quote}
      </div>

      {/* A sparkline that goes the way the money goes. */}
      <svg width={640} height={160} viewBox="0 0 640 160" style={{ marginTop: 14 }}>
        <path
          d={
            rising
              ? 'M 10 140 L 150 118 L 300 96 L 450 48 L 630 12'
              : 'M 10 26 L 150 54 L 300 74 L 450 112 L 630 138'
          }
          fill="none"
          stroke={tint}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={900}
          strokeDashoffset={(1 - grow) * 900}
        />
      </svg>

      <div
        style={{
          fontFamily: font.mono,
          fontSize: 30,
          color: tint,
          letterSpacing: 1,
          opacity: grow,
        }}
      >
        {result}
      </div>
    </div>
  );
};

const BeatA: React.FC = () => {
  const frame = useCurrentFrame();
  const T = {
    question: 10,
    money: cue('s4a', 'money'),
    spreadsheet: cue('s4a', 'spreadsheet'),
    conquer: cue('s4a', 'conquer'),
    godlike: cue('s4a', 'godlike'),
  };

  const question = useVisibility(T.question, T.money - 8, 9);
  const money = useVisibility(T.money, T.spreadsheet - 8, 9);
  const pitches = useVisibility(T.spreadsheet, T.godlike - 10, 12);
  const godlike = useVisibility(T.godlike, undefined, 12);

  // The exec leans in and whispers as the hyped pitch lands.
  const whisper = interpolate(frame, [T.conquer - 16, T.conquer + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const talk = useTalkCycle(frame > T.conquer - 16 && frame < T.godlike, 0);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: question, position: 'absolute' }}>
          <Statement delay={T.question} tint={color.textDim} size={66}>
            {copy<string>('s4a', 'question')}
          </Statement>
        </div>
        <div style={{ opacity: money, position: 'absolute' }}>
          <Statement delay={T.money} size={92}>
            <span style={{ color: color.accent }}>{copy<string>('s4a', 'money')}</span>
          </Statement>
        </div>
      </AbsoluteFill>

      <div
        style={{
          display: 'flex',
          gap: 90,
          opacity: pitches,
          position: 'absolute',
          alignItems: 'flex-start',
        }}
      >
        <Pitch
          label={copy<string>('s4a', 'honestLabel')}
          quote={copy<string>('s4a', 'honestQuote')}
          result={copy<string>('s4a', 'honestResult')}
          tint={color.textDim}
          delay={T.spreadsheet}
          rising={false}
        />
        <div style={{ width: 1, alignSelf: 'stretch', background: color.rule }} />
        <Pitch
          label={copy<string>('s4a', 'hypedLabel')}
          quote={copy<string>('s4a', 'hypedQuote')}
          result={copy<string>('s4a', 'hypedResult')}
          tint={color.accent}
          delay={T.conquer}
          rising
        />
      </div>

      {/* The pitch being made, by people, in the film's own register. */}
      <svg
        viewBox="0 0 1920 1080"
        style={{ position: 'absolute', inset: 0, opacity: whisper * pitches }}
      >
        <StickFigure
          x={1420}
          y={790}
          scale={0.62}
          seed={4}
          seated
          expression="knowing"
          pose={POSES.explaining}
          mouthOpen={talk}
          ink={color.accent}
          fill={color.bg}
        />
        <StickFigure
          x={1650}
          y={800}
          scale={0.6}
          seed={12}
          flip
          seated
          expression="excited"
          pose={POSES.rest}
          ink={color.textDim}
          fill={color.bg}
        />
      </svg>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: godlike, position: 'absolute' }}>
          <Statement delay={T.godlike} size={72}>
            An illusion of <span style={{ color: color.accent }}>god-like capability.</span>
          </Statement>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Beat B

const BeatB: React.FC = () => {
  const frame = useCurrentFrame();
  const T = {
    capture: 8,
    monster: cue('s4b', 'monster'),
    lobby: cue('s4b', 'lobby'),
    crush: cue('s4b', 'crush'),
  };

  const locked = copy<string[]>('s4b', 'locked');
  const stage = useVisibility(T.capture + 6, undefined, 14);

  // The gate drops on the lobbying line and stays down.
  const gate = interpolate(frame, [T.lobby, T.lobby + 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // A short settle so it lands with weight rather than easing to a stop.
  const bounce = frame > T.lobby + 22 && frame < T.lobby + 34 ? Math.sin((frame - T.lobby - 22) * 0.9) * 5 : 0;
  const dim = interpolate(frame, [T.crush, T.crush + 20], [1, 0.32], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: 150, opacity: useEntrance(T.capture) }}>
        <Eyebrow delay={T.capture} tint={color.perception}>
          {copy<string>('s4b', 'captureLabel')}
        </Eyebrow>
      </div>

      <div style={{ opacity: stage, position: 'absolute' }}>
        <svg width={1560} height={620} viewBox="0 0 1560 620">
          {/* The incumbent, inside. */}
          <g>
            <rect
              x={1040}
              y={150}
              width={300}
              height={400}
              fill="rgba(76,201,232,0.07)"
              stroke={color.mechanism}
              strokeWidth={3}
            />
            <text
              x={1190}
              y={382}
              textAnchor="middle"
              fontFamily={font.mono}
              fontSize={26}
              letterSpacing={3}
              fill={color.mechanism}
            >
              {copy<string>('s4b', 'incumbent')}
            </text>
          </g>

          {/* Everyone else, outside, dimming once the gate is down. */}
          <g opacity={dim}>
            {locked.map((label, i) => (
              <g key={label} transform={`translate(${90 + i * 250} ${330 + (i % 2) * 40})`}>
                <rect
                  width={210}
                  height={150}
                  fill="rgba(131,148,171,0.06)"
                  stroke={color.textFaint}
                  strokeWidth={2.5}
                />
                <text
                  x={105}
                  y={84}
                  textAnchor="middle"
                  fontFamily={font.sans}
                  fontSize={28}
                  fill={color.textDim}
                >
                  {label}
                </text>
              </g>
            ))}
          </g>

          {/* The track the gate runs in, so a raised gate reads as a mechanism
              rather than a stray shape floating above the frame. */}
          <g opacity={0.5}>
            <line x1={946} y1={40} x2={946} y2={572} stroke={color.rule} strokeWidth={2} />
            <line x1={1024} y1={40} x2={1024} y2={572} stroke={color.rule} strokeWidth={2} />
            <rect x={938} y={558} width={94} height={14} fill={color.rule} />
          </g>

          {/* Portcullis: bars descend between the two. */}
          <g transform={`translate(0 ${-580 + gate * 580 + bounce})`} clipPath="url(#gate-track)">
            <rect x={950} y={60} width={70} height={500} fill={color.bgLift} stroke={color.rule} strokeWidth={3} />
            {Array.from({ length: 8 }).map((_, i) => (
              <rect
                key={i}
                x={958}
                y={80 + i * 56}
                width={54}
                height={28}
                fill={color.rule}
                opacity={0.85}
              />
            ))}
          </g>
          <defs>
            <clipPath id="gate-track">
              <rect x={938} y={40} width={94} height={532} />
            </clipPath>
          </defs>
        </svg>
      </div>

      {/* Captions share one bottom-anchored band so they swap in place.
          A zero-height wrapper let the text run off the bottom of frame. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 96,
          height: 130,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ position: 'absolute', opacity: useVisibility(T.monster, T.lobby - 8, 9) }}>
          <Statement delay={T.monster} tint={color.textDim} size={46}>
            {copy<string>('s4b', 'monster')}
          </Statement>
        </div>
        <div style={{ position: 'absolute', opacity: useVisibility(T.lobby, T.crush - 8, 9) }}>
          <Statement delay={T.lobby} tint={color.textDim} size={46}>
            {copy<string>('s4b', 'lobby')}
          </Statement>
        </div>
        <div style={{ position: 'absolute', opacity: useVisibility(T.crush, undefined, 10) }}>
          <Statement delay={T.crush} size={54}>
            <span style={{ color: color.perception }}>{copy<string>('s4b', 'crush')}</span>
          </Statement>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Scene4: React.FC = () => (
  <AbsoluteFill style={{ background: color.bg }}>
    <Backdrop />
    <Sequence from={LEAD_IN} durationInFrames={BEAT_A}>
      <BeatAudio beat="s4a" />
      <BeatA />
      <Definitions beat="s4a" />
    </Sequence>
    <Sequence from={LEAD_IN + BEAT_A + BEAT_GAP} durationInFrames={BEAT_B}>
      <BeatAudio beat="s4b" />
      <BeatB />
      <Definitions beat="s4b" />
    </Sequence>
  </AbsoluteFill>
);
