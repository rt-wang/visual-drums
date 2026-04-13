import type {
  HandLandmarkerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import {
  FingerId,
  INDEX_TIP,
  MIDDLE_TIP,
  PINKY_TIP,
  handFullyOpen,
  isCurled,
  isExtended,
  isThumbExtended,
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
const PINCH_ENTER_RATIO = 0.35
// Hysteresis: need a clearly wider gap to count as "released" so tiny hand
// jitter near the threshold doesn't re-arm a held pinch.
const PINCH_RELEASE_RATIO = 0.5
const GLOBAL_COMMIT_COOLDOWN_MS = 100

const emptyMuted = (): Record<Instrument, boolean> =>
  INSTRUMENTS.reduce((acc, inst) => {
    acc[inst] = false
    return acc
  }, {} as Record<Instrument, boolean>)

export class GestureProcessor {
  private tracks: Record<FingerKey, FingerTrack>
  private mixHoldFrames = 0
  private lastGlobalCommitAt = 0
  private currentMode: 'edit' | 'mix' = 'edit'

  constructor() {
    this.tracks = FINGER_KEYS.reduce((acc, k) => {
      acc[k] = {
        extendedFrames: 0,
        curledFrames: 0,
        pinchFrames: 0,
        pinchLatched: false,
        smoothed: null,
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

    type PinchCandidate = { key: FingerKey; ratio: number }
    const pinchCandidates: PinchCandidate[] = []

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
      const rawTip: Point = { x: 1 - tipLm.x, y: tipLm.y }
      if (!track.smoothed) {
        track.smoothed = rawTip
      } else {
        track.smoothed = {
          x: EMA_ALPHA * rawTip.x + (1 - EMA_ALPHA) * track.smoothed.x,
          y: EMA_ALPHA * rawTip.y + (1 - EMA_ALPHA) * track.smoothed.y,
        }
      }

      const instrument = FINGER_TO_INSTRUMENT[key]

      if (this.currentMode === 'mix') {
        if (stableCurled) muted[instrument] = true
      }

      let pinching = false
      if (this.currentMode === 'edit' && stableExtended) {
        const ratio = pinchRatio(handLms, fid)
        if (ratio < PINCH_ENTER_RATIO) {
          track.pinchFrames += 1
          pinching = true
        } else {
          track.pinchFrames = 0
          // Released cleanly: re-arm for the next pinch.
          if (ratio > PINCH_RELEASE_RATIO) track.pinchLatched = false
        }

        const tip = track.smoothed
        const { x0, y0, x1, y1 } = GRID_BBOX
        if (tip.x >= x0 && tip.x <= x1 && tip.y >= y0 && tip.y <= y1) {
          const u = (tip.x - x0) / (x1 - x0)
          const step = Math.max(0, Math.min(STEPS - 1, Math.floor(u * STEPS)))
          hovers.push({ instrument, step })

          // Edge-triggered: only commit on the rising edge of a pinch.
          // After firing, track.pinchLatched blocks re-commits until the
          // user fully releases (ratio > PINCH_RELEASE_RATIO).
          if (
            track.pinchFrames >= PINCH_ENTER_FRAMES &&
            !track.pinchLatched
          ) {
            pinchCandidates.push({ key, ratio })
          }
        }
      } else {
        track.pinchFrames = 0
        track.pinchLatched = false
      }

      overlays.push({
        key,
        instrument,
        tip: track.smoothed,
        extended: stableExtended,
        curled: stableCurled,
        pinching,
      })
    }

    // Global cooldown: allow only one commit per ~100 ms window across all
    // fingers. Pick the highest-confidence pinch (lowest ratio).
    if (
      pinchCandidates.length > 0 &&
      nowMs - this.lastGlobalCommitAt >= GLOBAL_COMMIT_COOLDOWN_MS
    ) {
      pinchCandidates.sort((a, b) => a.ratio - b.ratio)
      const chosen = pinchCandidates[0]
      const chosenTrack = this.tracks[chosen.key]
      const tip = chosenTrack.smoothed!
      const { x0, x1 } = GRID_BBOX
      const u = (tip.x - x0) / (x1 - x0)
      const step = Math.max(0, Math.min(STEPS - 1, Math.floor(u * STEPS)))
      toggles.push({ instrument: FINGER_TO_INSTRUMENT[chosen.key], step })
      chosenTrack.pinchLatched = true
      // Any non-chosen candidates this frame also latch, so they don't fire
      // on the next frame and cause a burst.
      for (let i = 1; i < pinchCandidates.length; i++) {
        this.tracks[pinchCandidates[i].key].pinchLatched = true
      }
      this.lastGlobalCommitAt = nowMs
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
