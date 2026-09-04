/**
 * Design tokens for the documentary.
 *
 * The palette carries the argument of the film: cyan is *mechanism* (math, tokens,
 * probability), red is *perception* (the threat humans think they are reading), and
 * amber marks the moment the two are put side by side. Keeping these meanings
 * consistent across scenes is what makes the visuals feel authored rather than decorative.
 */

export const color = {
  bg: '#0A0D13',
  bgLift: '#111621',
  panel: '#141B28',
  grid: '#161D2B',
  rule: '#233044',

  text: '#E8EDF5',
  textDim: '#8394AB',
  textFaint: '#4E5C72',

  mechanism: '#4CC9E8', // math, tokens, probability
  mechanismDim: '#1E5A6B',
  perception: '#FF4D5E', // the perceived threat
  accent: '#F5B942', // the reveal
  affirm: '#3DD68C',
} as const;

export const font = {
  sans: '"Segoe UI Variable Display", "Segoe UI", Inter, system-ui, sans-serif',
  mono: '"Cascadia Code", "JetBrains Mono", Consolas, ui-monospace, monospace',
} as const;

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Seconds -> frames. Scene timing is derived from measured narration length. */
export const sec = (s: number) => Math.round(s * FPS);
