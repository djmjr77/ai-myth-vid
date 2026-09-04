import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { color, font, sec } from './theme';
import {
  Backdrop,
  Definitions,
  Eyebrow,
  ProbabilityRow,
  Statement,
  Token,
  useEntrance,
  useVisibility, BeatAudio } from './components';
import { beat, beatFrames, copy, cue } from './cues';

/**
 * SCENE 3 — MATH VS. EMOTION
 *
 * Beat A: a sentence is consumed token by token and the model emits a probability
 * distribution over the next one. The argument is made by the mechanism itself.
 * Beat B: the training corpus explains where "threatening" language comes from,
 * then a split screen puts perception and mechanism next to each other.
 *
 * Beat lengths come from the measured narration in audio-manifest.json, so the
 * visuals re-time automatically when the voice backend changes.
 */

export const LEAD_IN = sec(0.4);
export const BEAT_GAP = sec(0.2);
export const TAIL = sec(1.2);

export const BEAT_A = beatFrames('s3a');
export const BEAT_B = beatFrames('s3b');
export const SCENE3_FRAMES = LEAD_IN + BEAT_A + BEAT_GAP + BEAT_B + TAIL;
/**
 * Where this scene's narration sits inside it, for film-level ducking.
 * The scene owns its own layout; Full.tsx should not have to know it.
 */
export const BEATS = [
  { id: 's3a', at: LEAD_IN },
  { id: 's3b', at: LEAD_IN + BEAT_A + BEAT_GAP },
];

// ---------------------------------------------------------------- Beat A

type Row = { token: string; p: number };

const BeatA: React.FC = () => {
  const frame = useCurrentFrame();

  // Cue times are measured from the narration audio, not placed by ear.
  const T = {
    input: 10,
    tokens: 34,
    notAMind: cue('s3a', 'notAMind'),
    engine: cue('s3a', 'engine'),
    predict: cue('s3a', 'predict'),
  };

  const words = copy<string[]>('s3a', 'tokens');
  const distribution = copy<Row[]>('s3a', 'distribution');

  // The upper half lifts out of the way once the distribution takes over.
  const shift = interpolate(frame, [T.predict - 14, T.predict + 16], [0, -132], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const notAMind = useVisibility(T.notAMind, T.engine - 6, 9);
  const engine = useVisibility(T.engine, T.predict - 6, 9);
  const cursorOn = Math.floor(frame / 12) % 2 === 0;

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          transform: `translateY(${shift}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 34,
        }}
      >
        <Eyebrow delay={T.input} tint={color.textFaint}>
          {copy<string>('s3a', 'inputLabel')}
        </Eyebrow>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {words.map((w, i) => (
            <Token key={w} text={w} delay={T.tokens + i * 26} />
          ))}
          {/* The slot the model is being asked to fill. */}
          <div
            style={{
              width: 128,
              height: 84,
              borderRadius: 10,
              border: `1.5px dashed ${color.textFaint}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: useEntrance(T.tokens + words.length * 26),
            }}
          >
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 44,
                color: color.mechanism,
                opacity: cursorOn ? 1 : 0.15,
              }}
            >
              _
            </span>
          </div>
        </div>
      </div>

      {/* Two assertions that hand off to each other in the same screen position. */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: 150 }}>
        <div style={{ opacity: notAMind, position: 'absolute' }}>
          <Statement delay={T.notAMind} tint={color.textDim} size={70}>
            It isn't a mind.
          </Statement>
        </div>
        <div style={{ opacity: engine, position: 'absolute' }}>
          <Statement delay={T.engine} size={70}>
            It is an <span style={{ color: color.mechanism }}>autocomplete engine.</span>
          </Statement>
        </div>
      </AbsoluteFill>

      {/* The payoff: an actual distribution, not a metaphor for one. */}
      <AbsoluteFill
        style={{ alignItems: 'center', justifyContent: 'center', top: 210 }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            opacity: useVisibility(T.predict, undefined, 14),
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <Eyebrow delay={T.predict} tint={color.mechanism}>
              {copy<string>('s3a', 'distributionLabel')}
            </Eyebrow>
          </div>
          {distribution.map((row, i) => (
            <ProbabilityRow
              key={row.token}
              token={row.token}
              probability={row.p}
              maxProbability={distribution[0].p}
              delay={T.predict + 12 + i * 9}
              highlight={i === 0}
            />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Beat B

const CorpusCard: React.FC<{
  label: string;
  note: string;
  delay: number;
  drain: number; // 0..1, how far this card has been pulled into the model
}> = ({ label, note, delay, drain }) => {
  const e = useEntrance(delay, 210);
  return (
    <div
      style={{
        width: 430,
        padding: '30px 32px',
        borderRadius: 12,
        background: color.panel,
        border: `1px solid ${color.rule}`,
        opacity: e * (1 - drain * 0.75),
        transform: `translateY(${(1 - e) * 30 + drain * 46}px) scale(${1 - drain * 0.1})`,
      }}
    >
      <div style={{ fontFamily: font.sans, fontSize: 34, color: color.text, fontWeight: 400 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 21,
          color: color.textFaint,
          marginTop: 12,
          letterSpacing: 0.4,
        }}
      >
        {note}
      </div>
    </div>
  );
};

/** One token of the "threatening" sentence, shown as what it actually is. */
const ThreatToken: React.FC<{ token: string; probability: number; delay: number }> = ({
  token,
  probability,
  delay,
}) => {
  const e = useEntrance(delay);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: e }}>
      <span style={{ fontFamily: font.mono, fontSize: 27, color: color.text, width: 190 }}>
        {token}
      </span>
      <span style={{ width: 250, height: 10, background: color.bgLift, borderRadius: 5 }}>
        <span
          style={{
            display: 'block',
            width: `${probability * 100 * e}%`,
            height: '100%',
            borderRadius: 5,
            background: color.mechanism,
          }}
        />
      </span>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 25,
          color: color.mechanism,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        p={probability.toFixed(2)}
      </span>
    </div>
  );
};

const BeatB: React.FC = () => {
  const frame = useCurrentFrame();

  // Every cue below is measured from the narration audio, so a card arrives
  // exactly as its source is named.
  const T = {
    corpus: 12,
    cards: [cue('s3b', 'card1'), cue('s3b', 'card2'), cue('s3b', 'card3')],
    knows: cue('s3b', 'knows'),
    split: cue('s3b', 'split'),
    math: cue('s3b', 'math'),
    close: cue('s3b', 'close'),
  };

  const corpus = copy<{ label: string; note: string }[]>('s3b', 'corpus');
  const threatTokens = copy<Row[]>('s3b', 'threatTokens');

  const drain = interpolate(frame, [T.knows, T.knows + 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const corpusGone = useVisibility(T.corpus, T.knows + 6, 10);
  const knows = useVisibility(T.knows, T.split - 8, 10);
  const split = useVisibility(T.split, T.close - 8, 12);
  const close = useVisibility(T.close, undefined, 14);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* Where the vocabulary of menace actually comes from. */}
      <AbsoluteFill
        style={{ alignItems: 'center', justifyContent: 'center', opacity: corpusGone }}
      >
        <div style={{ marginBottom: 46 }}>
          <Eyebrow delay={T.corpus} tint={color.textFaint}>
            {copy<string>('s3b', 'corpusLabel')}
          </Eyebrow>
        </div>
        <div style={{ display: 'flex', gap: 26 }}>
          {corpus.map((c, i) => (
            <CorpusCard
              key={c.label}
              label={c.label}
              note={c.note}
              delay={T.cards[i]}
              drain={drain}
            />
          ))}
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: knows }}>
        <Statement delay={T.knows} size={66}>
          So it knows exactly what a threat{' '}
          <span style={{ color: color.textDim }}>looks like.</span>
        </Statement>
      </AbsoluteFill>

      {/* The core comparison: same sentence, two readings. */}
      <AbsoluteFill
        style={{ alignItems: 'center', justifyContent: 'center', opacity: split }}
      >
        <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
          <Panel
            side="left"
            eyebrow={copy<string>('s3b', 'perceptionLabel')}
            tint={color.perception}
            delay={T.split}
          >
            <div
              style={{
                fontFamily: font.sans,
                fontSize: 52,
                fontWeight: 400,
                color: color.perception,
                lineHeight: 1.3,
                textShadow: `0 0 44px rgba(255,77,94,0.35)`,
              }}
            >
              {copy<string>('s3b', 'perceptionQuote')}
            </div>
            <div
              style={{
                marginTop: 30,
                fontFamily: font.mono,
                fontSize: 23,
                color: color.textDim,
                letterSpacing: 1,
              }}
            >
              {copy<string>('s3b', 'perceptionTags')}
            </div>
          </Panel>

          {/* The divide is the point of the shot, so give it a real presence. */}
          <div
            style={{
              width: 1,
              alignSelf: 'stretch',
              margin: '-40px 0',
              background: `linear-gradient(180deg, transparent, ${color.rule} 18%, ${color.rule} 82%, transparent)`,
            }}
          />

          <Panel
            side="right"
            eyebrow={copy<string>('s3b', 'mechanismLabel')}
            tint={color.mechanism}
            delay={T.split + 14}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {threatTokens.map((row, i) => (
                <ThreatToken
                  key={row.token}
                  token={row.token}
                  probability={row.p}
                  delay={T.split + 26 + i * 8}
                />
              ))}
            </div>
            <div
              style={{
                marginTop: 30,
                fontFamily: font.mono,
                fontSize: 23,
                color: color.textDim,
                letterSpacing: 1,
                opacity: useVisibility(T.math, undefined, 10),
              }}
            >
              {copy<string>('s3b', 'mechanismTags')}
            </div>
          </Panel>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: close }}>
        <Statement delay={T.close} size={64}>
          Humans mistake sophisticated language generation
          <br />
          for <span style={{ color: color.accent }}>actual intent.</span>
        </Statement>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Panel: React.FC<{
  side: 'left' | 'right';
  eyebrow: string;
  tint: string;
  delay: number;
  children: React.ReactNode;
}> = ({ side, eyebrow, tint, delay, children }) => {
  const e = useEntrance(delay, 200);
  return (
    <div
      style={{
        width: 720,
        padding: '54px 58px',
        opacity: e,
        transform: `translateX(${(1 - e) * (side === 'left' ? -30 : 30)}px)`,
      }}
    >
      <div style={{ marginBottom: 34 }}>
        <Eyebrow delay={delay} tint={tint}>
          {eyebrow}
        </Eyebrow>
      </div>
      {children}
    </div>
  );
};

// ---------------------------------------------------------------- Scene

export const Scene3: React.FC = () => (
  <AbsoluteFill style={{ background: color.bg }}>
    <Backdrop />

    <Sequence from={LEAD_IN} durationInFrames={BEAT_A}>
      <BeatAudio beat="s3a" />
      <BeatA />
      <Definitions beat="s3a" />
    </Sequence>

    <Sequence from={LEAD_IN + BEAT_A + BEAT_GAP} durationInFrames={BEAT_B}>
      <BeatAudio beat="s3b" />
      <BeatB />
      <Definitions beat="s3b" />
    </Sequence>
  </AbsoluteFill>
);
