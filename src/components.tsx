import React from 'react';
import {
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { color, font } from './theme';
import { beat as beatData, definitions, type Definition } from './cues';

/**
 * Standard entrance: a short spring the whole film shares, so every element
 * arrives with the same weight. `delay` is in frames from the sequence start.
 */
export const useEntrance = (delay: number, damping = 200) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.6 } });
};

/** Fade that also holds an exit, so elements can leave without a second component. */
export const useVisibility = (inAt: number, outAt?: number, fadeFrames = 12) => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [inAt, inAt + fadeFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (outAt === undefined) return appear;
  const leave = interpolate(frame, [outAt, outAt + fadeFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return Math.min(appear, leave);
};

/** Faint technical grid — establishes the "clean explainer" register without noise. */
export const Backdrop: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <div style={{ position: 'absolute', inset: 0, background: color.bg, opacity }}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `linear-gradient(${color.grid} 1px, transparent 1px),
                          linear-gradient(90deg, ${color.grid} 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
      }}
    />
    {/* Vignette keeps the eye centered on 1920x1080. */}
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at 50% 45%, transparent 40%, ${color.bg} 88%)`,
      }}
    />
  </div>
);

/** Small uppercase eyebrow used to name what the viewer is looking at. */
export const Eyebrow: React.FC<{
  children: React.ReactNode;
  tint?: string;
  delay?: number;
}> = ({ children, tint = color.textFaint, delay = 0 }) => {
  const e = useEntrance(delay);
  return (
    <div
      style={{
        fontFamily: font.mono,
        fontSize: 20,
        letterSpacing: 4,
        textTransform: 'uppercase',
        color: tint,
        opacity: e,
        transform: `translateY(${(1 - e) * 8}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <span style={{ width: 26, height: 1, background: tint, opacity: 0.6 }} />
      {children}
    </div>
  );
};

/** A token as the model sees it: fixed-width, boxed, quietly technical. */
export const Token: React.FC<{
  text: string;
  delay: number;
  tint?: string;
  emphasis?: number; // 0 = resting, 1 = fully highlighted
}> = ({ text, delay, tint = color.mechanism, emphasis = 0 }) => {
  const e = useEntrance(delay);
  return (
    <div
      style={{
        fontFamily: font.mono,
        fontSize: 44,
        padding: '18px 30px',
        borderRadius: 10,
        border: `1.5px solid ${tint}`,
        background: `rgba(76, 201, 232, ${0.06 + emphasis * 0.16})`,
        color: emphasis > 0.5 ? '#FFFFFF' : color.text,
        boxShadow: emphasis > 0 ? `0 0 ${emphasis * 42}px rgba(76,201,232,${emphasis * 0.5})` : 'none',
        opacity: e,
        transform: `translateY(${(1 - e) * 22}px) scale(${0.94 + e * 0.06})`,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
};

/** One row of the next-token distribution. Width encodes probability. */
export const ProbabilityRow: React.FC<{
  token: string;
  probability: number; // 0..1
  maxProbability: number;
  delay: number;
  highlight?: boolean;
}> = ({ token, probability, maxProbability, delay, highlight = false }) => {
  const e = useEntrance(delay, 220);
  const tint = highlight ? color.mechanism : color.mechanismDim;
  const barWidth = (probability / maxProbability) * 100 * e;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        opacity: e,
        transform: `translateX(${(1 - e) * -18}px)`,
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 30,
          width: 130,
          textAlign: 'right',
          color: highlight ? color.text : color.textDim,
        }}
      >
        {token}
      </div>
      <div style={{ width: 620, height: 42, background: color.bgLift, borderRadius: 5 }}>
        <div
          style={{
            width: `${barWidth}%`,
            height: '100%',
            borderRadius: 5,
            background: highlight
              ? `linear-gradient(90deg, ${color.mechanismDim}, ${color.mechanism})`
              : tint,
            boxShadow: highlight ? `0 0 26px rgba(76,201,232,0.45)` : 'none',
          }}
        />
      </div>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 30,
          width: 110,
          color: highlight ? color.mechanism : color.textFaint,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {(probability * 100 * e).toFixed(1)}%
      </div>
    </div>
  );
};

/** Full-width statement card for the film's assertions. */
export const Statement: React.FC<{
  children: React.ReactNode;
  delay: number;
  tint?: string;
  size?: number;
}> = ({ children, delay, tint = color.text, size = 78 }) => {
  const e = useEntrance(delay, 190);
  return (
    <div
      style={{
        fontFamily: font.sans,
        fontSize: size,
        fontWeight: 300,
        letterSpacing: -1,
        color: tint,
        textAlign: 'center',
        lineHeight: 1.18,
        opacity: e,
        transform: `translateY(${(1 - e) * 26}px)`,
      }}
    >
      {children}
    </div>
  );
};

/**
 * Glossary layer. Renders every `<cue>Def` copy key for a beat as a lower-third
 * card, on screen for exactly as long as its cue is being spoken.
 *
 * Sits below the action so it never collides with a centred Statement, and is
 * deliberately quiet: it is a footnote for an unfamiliar term, not a point being
 * made. A scene opts in once with `<Definitions beat="s2a" />`; everything after
 * that is narration.json.
 */
export const Definitions: React.FC<{ beat: string; offset?: number }> = ({
  beat,
  offset = 0,
}) => (
  <>
    {definitions(beat).map((d) => (
      <DefinitionCard key={d.cue} {...d} at={d.at + offset} until={d.until + offset} />
    ))}
  </>
);

const DefinitionCard: React.FC<Definition> = ({ at, until, text }) => {
  const visible = useVisibility(at, until - 12, 12);
  const e = useEntrance(at, 210);
  if (visible <= 0) return null;

  // Lead the term if the text is written as "Term: explanation".
  const split = text.indexOf(':');
  const term = split > 0 ? text.slice(0, split) : null;
  const body = split > 0 ? text.slice(split + 1).trim() : text;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 96,
        display: 'flex',
        justifyContent: 'center',
        opacity: visible,
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          display: 'flex',
          gap: 20,
          alignItems: 'baseline',
          padding: '22px 34px',
          background: 'rgba(20,27,40,0.72)',
          border: `1px solid ${color.rule}`,
          borderLeft: `3px solid ${color.mechanism}`,
          borderRadius: 10,
          transform: `translateY(${(1 - e) * 16}px)`,
        }}
      >
        {term && (
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 22,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: color.mechanism,
              whiteSpace: 'nowrap',
            }}
          >
            {term}
          </span>
        )}
        <span
          style={{
            fontFamily: font.sans,
            fontSize: 30,
            fontWeight: 300,
            lineHeight: 1.4,
            color: color.textDim,
          }}
        >
          {body}
        </span>
      </div>
    </div>
  );
};


/**
 * Narration playback for one beat.
 *
 * Segments are separate files rather than one joined track, because the voice
 * server returns MP3 and joining would mean decoding it. Scheduling them at
 * their measured offsets gets the same result and keeps the pipeline agnostic
 * about the container — WAV from SAPI, MP3 from Chatterbox, either works.
 *
 * The silence between segments is real elapsed time here, not padding baked
 * into the audio, so the gaps stay tunable in narration.json.
 */
export const BeatAudio: React.FC<{ beat: string }> = ({ beat }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {beatData(beat).segments.map((s) => (
        <Sequence
          key={s.src}
          from={Math.round(s.start * fps)}
          durationInFrames={Math.max(1, Math.round(s.seconds * fps))}
        >
          <Audio src={staticFile(s.src)} />
        </Sequence>
      ))}
    </>
  );
};
