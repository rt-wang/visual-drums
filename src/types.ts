export type Instrument = 'kick' | 'snare' | 'ch' | 'oh' | 'rim'

export const INSTRUMENTS: Instrument[] = ['kick', 'snare', 'ch', 'oh', 'rim']

export const INSTRUMENT_LABELS: Record<Instrument, string> = {
  kick: 'KICK',
  snare: 'SNARE',
  ch: 'CH',
  oh: 'OH',
  rim: 'RIM',
}

export const STEPS = 16

export type FingerKey =
  | 'L_index'
  | 'L_middle'
  | 'R_index'
  | 'R_middle'
  | 'R_pinky'

export const FINGER_KEYS: FingerKey[] = [
  'L_index',
  'L_middle',
  'R_index',
  'R_middle',
  'R_pinky',
]

export const FINGER_TO_INSTRUMENT: Record<FingerKey, Instrument> = {
  L_index: 'kick',
  L_middle: 'snare',
  R_index: 'ch',
  R_middle: 'oh',
  R_pinky: 'rim',
}

export type Mode = 'edit' | 'mix'

// Grid bounding box in normalized viewport coordinates (x is mirrored display x).
export const GRID_BBOX = { x0: 0.04, y0: 0.14, x1: 0.96, y1: 0.92 }

export type Point = { x: number; y: number }

export type HoverTarget = { instrument: Instrument; step: number }

export type FingerOverlay = {
  key: FingerKey
  instrument: Instrument
  tip: Point
  extended: boolean
  curled: boolean
  pinching: boolean
}
