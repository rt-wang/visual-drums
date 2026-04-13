import type {
  HandLandmarkerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import {
  INDEX_MCP,
  INDEX_PIP,
  FingerId,
  INDEX_TIP,
  MIDDLE_TIP,
  PINKY_TIP,
  THUMB_TIP,
  angleAtDeg,
  dist,
  handFullyOpen,
  isCurled,
  isExtended,
  isThumbExtended,
  palmRef,
  pinchRatio,
} from './geometry'
import {
  FINGER_KEYS,
  FINGER_TO_INSTRUMENT,
  FingerKey,
  GRID_BBOX,
  Instrument,
  INSTRUMENTS,
  Point,
  STEPS,
} from '../types'

type FingerTrack = {
  extendedFrames: number
  curledFrames: number
  pinchFrames: number
  pinchLatched: boolean // true after a commit, cleared when pinch releases
  smoothed: Point | null
  pointerSmoothed: Point | null
}

export type GestureFrameOut = {
  mode: 'edit' | 'mix'
  hovers: { instrument: Instrument; step: number }[]
  toggles: { instrument: Instrument; step: number }[]
  muted: Record<Instrument, boolean>
  overlays: {
    key: FingerKey
    instrument: Instrument
    tip: Point
    extended: boolean
    curled: boolean
    pinching: boolean
  }[]
}

const fingerIdOf = (k: FingerKey): FingerId => {
  if (k.endsWith('index')) return 'index'
  if (k.endsWith('middle')) return 'middle'
  return 'pinky'
}

const tipIdxOf = (k: FingerKey): number => {
  if (k.endsWith('index')) return INDEX_TIP
  if (k.endsWith('middle')) return MIDDLE_TIP
  return PINKY_TIP
}

const EMA_ALPHA = 0.4
const STABLE_EXTEND_FRAMES = 3
const STABLE_CURL_FRAMES = 4
const MIX_HOLD_FRAMES = 18 // ~300 ms at 60 fps
const PINCH_ENTER_FRAMES = 2
const PINCH_ENTER_RATIO = 0.38
// Hysteresis: need a clearly wider gap to count as "released" so tiny hand
// jitter near the threshold doesn't re-arm a held pinch.
const PINCH_RELEASE_RATIO = 0.5
const PINCH_POINTER_SPAN_RATIO = 0.68
const PINCH_POINTER_ANGLE_DEG = 105
const PINCH_CURSOR_BLEND = 0.6
const COMMIT_COOLDOWN_MS = 100

const EDIT_POINTER_KEYS: FingerKey[] = ['L_index', 'R_index']

const emptyMuted = (): Record<Instrument, boolean> =>
  INSTRUMENTS.reduce((acc, inst) => {
    acc[inst] = false
    return acc
  }, {} as Record<Instrument, boolean>)

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const smoothPoint = (prev: Point | null, next: Point): Point =>
  prev
    ? {
        x: EMA_ALPHA * next.x + (1 - EMA_ALPHA) * prev.x,
        y: EMA_ALPHA * next.y + (1 - EMA_ALPHA) * prev.y,
      }
    : next

const mirrorPoint = (lm: NormalizedLandmark): Point => ({ x: 1 - lm.x, y: lm.y })

const blendPoint = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

const isInGrid = (point: Point): boolean => {
  const { x0, y0, x1, y1 } = GRID_BBOX
  return point.x >= x0 && point.x <= x1 && point.y >= y0 && point.y <= y1
}

const stepFromPoint = (point: Point): number => {
  const { x0, x1 } = GRID_BBOX
  const u = (point.x - x0) / (x1 - x0)
  return clamp(Math.floor(u * STEPS), 0, STEPS - 1)
}

const instrumentFromPoint = (point: Point): Instrument => {
  const { y0, y1 } = GRID_BBOX
  const v = (point.y - y0) / (y1 - y0)
  const row = clamp(Math.floor(v * INSTRUMENTS.length), 0, INSTRUMENTS.length - 1)
  return INSTRUMENTS[row]
}

// A thumb-index pinch folds the index sideways, so the old wrist-distance
// "extended" test becomes unreliable. Treat a long, mostly straight index as
// a valid edit pointer even when it is no longer pointing away from the wrist.
const pinchPointerReady = (lms: NormalizedLandmark[]): boolean => {
  const reach = dist(lms[INDEX_TIP], lms[INDEX_MCP]) / (palmRef(lms) + 1e-9)
  const angle = angleAtDeg(lms[INDEX_MCP], lms[INDEX_PIP], lms[INDEX_TIP])
  return reach > PINCH_POINTER_SPAN_RATIO && angle > PINCH_POINTER_ANGLE_DEG
}

export class GestureProcessor {
  private tracks: Record<FingerKey, FingerTrack>
  private mixHoldFrames = 0
  private lastCommitAt = 0
  private currentMode: 'edit' | 'mix' = 'edit'

  constructor() {
    this.tracks = FINGER_KEYS.reduce((acc, k) => {
      acc[k] = {
        extendedFrames: 0,
        curledFrames: 0,
        pinchFrames: 0,
        pinchLatched: false,
        smoothed: null,
        pointerSmoothed: null,
      }
      return acc
    }, {} as Record<FingerKey, FingerTrack>)
  }

  process(result: HandLandmarkerResult, nowMs: number): GestureFrameOut {
    // Split hands by handedness. MediaPipe assumes a mirrored/selfie input and
    // its labels already match the user's physical hand, so route directly.
    let leftLms: NormalizedLandmark[] | null = null
    let rightLms: NormalizedLandmark[] | null = null

    const hands = result.landmarks ?? []
    const handedness = result.handedness ?? []
    for (let i = 0; i < hands.length; i++) {
      const lms = hands[i]
      if (!lms) continue
      const label = handedness[i]?.[0]?.categoryName
      if (label === 'Left') leftLms = lms
      else if (label === 'Right') rightLms = lms
    }

    // Mix mode entry: both hands present AND fully open, held for MIX_HOLD_FRAMES.
    // Mix mode sustain: both hands present AND both thumbs extended. Thumbs are
    // unmapped, so they act as a "mode anchor" that lets mapped fingers curl
    // freely to mute their tracks without dropping out of mix.
    const bothVisible = leftLms !== null && rightLms !== null
    const bothFullyOpen =
      bothVisible && handFullyOpen(leftLms!) && handFullyOpen(rightLms!)
    const bothThumbsOut =
      bothVisible && isThumbExtended(leftLms!) && isThumbExtended(rightLms!)

    if (bothFullyOpen) {
      this.mixHoldFrames = Math.min(this.mixHoldFrames + 1, MIX_HOLD_FRAMES + 30)
    } else if (this.currentMode !== 'mix') {
      this.mixHoldFrames = 0
    }

    if (this.currentMode === 'mix') {
      // Exit the instant the sustain pose breaks.
      if (!bothThumbsOut) {
        this.currentMode = 'edit'
        this.mixHoldFrames = 0
      }
    } else if (this.mixHoldFrames >= MIX_HOLD_FRAMES) {
      this.currentMode = 'mix'
    }

    const overlays: GestureFrameOut['overlays'] = []
    const hovers: GestureFrameOut['hovers'] = []
    const toggles: GestureFrameOut['toggles'] = []
    const muted = emptyMuted()

    for (const key of FINGER_KEYS) {
      const track = this.tracks[key]
      const handLms = key.startsWith('L_') ? leftLms : rightLms
      if (!handLms) {
        track.extendedFrames = 0
        track.curledFrames = 0
        track.pinchFrames = 0
        // Losing the hand counts as a release — re-arm so the next pinch
        // after the hand reappears fires cleanly.
        track.pinchLatched = false
        track.smoothed = null
        track.pointerSmoothed = null
        continue
      }

      const fid = fingerIdOf(key)
      const ext = isExtended(handLms, fid)
      const cur = isCurled(handLms, fid)

      track.extendedFrames = ext ? track.extendedFrames + 1 : 0
      track.curledFrames = cur ? track.curledFrames + 1 : 0

      const stableExtended = track.extendedFrames >= STABLE_EXTEND_FRAMES
      const stableCurled = track.curledFrames >= STABLE_CURL_FRAMES

      // Smoothed fingertip. Mirror x to match displayed (flipped) video.
      const tipLm = handLms[tipIdxOf(key)]
      const rawTip = mirrorPoint(tipLm)
      track.smoothed = smoothPoint(track.smoothed, rawTip)

      const instrument = FINGER_TO_INSTRUMENT[key]

      if (this.currentMode === 'mix') {
        if (stableCurled) muted[instrument] = true
      }

      let pinching = false
      let overlayTip: Point = track.smoothed!

      if (EDIT_POINTER_KEYS.includes(key)) {
        const ratio = pinchRatio(handLms, 'index')
        const pointerActive = stableExtended || pinchPointerReady(handLms)
        const thumbTip = mirrorPoint(handLms[THUMB_TIP])
        const pinchMidpoint = {
          x: (rawTip.x + thumbTip.x) * 0.5,
          y: (rawTip.y + thumbTip.y) * 0.5,
        }
        const pinchBlend = clamp(
          (PINCH_RELEASE_RATIO - ratio) / (PINCH_RELEASE_RATIO - PINCH_ENTER_RATIO),
          0,
          1
        )
        const rawPointer = blendPoint(rawTip, pinchMidpoint, pinchBlend * PINCH_CURSOR_BLEND)
        track.pointerSmoothed = smoothPoint(track.pointerSmoothed, rawPointer)

        if (this.currentMode === 'edit') {
          overlayTip = track.pointerSmoothed!
          const pointerTip = track.pointerSmoothed!
          const canAim = pointerActive || ratio < PINCH_RELEASE_RATIO
          const insideGrid = isInGrid(pointerTip)
          const offCooldown = nowMs - this.lastCommitAt >= COMMIT_COOLDOWN_MS
          const writeReady = canAim && insideGrid && !track.pinchLatched && offCooldown
          pinching = ratio < PINCH_ENTER_RATIO && writeReady

          if (canAim && insideGrid) {
            const step = stepFromPoint(pointerTip)
            const targetInstrument = instrumentFromPoint(pointerTip)
            hovers.push({ instrument: targetInstrument, step })

            if (ratio < PINCH_ENTER_RATIO) {
              track.pinchFrames += 1
            } else {
              track.pinchFrames = 0
              if (ratio > PINCH_RELEASE_RATIO) track.pinchLatched = false
            }

            if (
              track.pinchFrames >= PINCH_ENTER_FRAMES &&
              !track.pinchLatched &&
              offCooldown
            ) {
              toggles.push({ instrument: targetInstrument, step })
              track.pinchLatched = true
              this.lastCommitAt = nowMs
            }
          } else {
            track.pinchFrames = 0
            if (ratio > PINCH_RELEASE_RATIO) track.pinchLatched = false
          }
        } else {
          track.pinchFrames = 0
          track.pinchLatched = false
        }
      } else {
        track.pinchFrames = 0
        track.pinchLatched = false
      }

      overlays.push({
        key,
        instrument,
        tip: overlayTip,
        extended: stableExtended,
        curled: stableCurled,
        pinching,
      })
    }

    return {
      mode: this.currentMode,
      hovers,
      toggles,
      muted,
      overlays,
    }
  }
}
