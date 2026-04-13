import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

type LM = NormalizedLandmark

// Landmark indices per MediaPipe Hand Landmarker.
export const WRIST = 0
export const THUMB_CMC = 1
export const THUMB_MCP = 2
export const THUMB_IP = 3
export const THUMB_TIP = 4
export const INDEX_MCP = 5
export const INDEX_PIP = 6
export const INDEX_DIP = 7
export const INDEX_TIP = 8
export const MIDDLE_MCP = 9
export const MIDDLE_PIP = 10
export const MIDDLE_DIP = 11
export const MIDDLE_TIP = 12
export const RING_MCP = 13
export const RING_PIP = 14
export const RING_DIP = 15
export const RING_TIP = 16
export const PINKY_MCP = 17
export const PINKY_PIP = 18
export const PINKY_DIP = 19
export const PINKY_TIP = 20

export type FingerId = 'index' | 'middle' | 'ring' | 'pinky'

export function dist(a: LM, b: LM): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

export function angleAtDeg(a: LM, b: LM, c: LM): number {
  const v1x = a.x - b.x
  const v1y = a.y - b.y
  const v2x = c.x - b.x
  const v2y = c.y - b.y
  const dot = v1x * v2x + v1y * v2y
  const m1 = Math.hypot(v1x, v1y)
  const m2 = Math.hypot(v2x, v2y)
  const cos = dot / (m1 * m2 + 1e-9)
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

export function fingerIndices(f: FingerId) {
  switch (f) {
    case 'index':
      return { mcp: INDEX_MCP, pip: INDEX_PIP, dip: INDEX_DIP, tip: INDEX_TIP }
    case 'middle':
      return { mcp: MIDDLE_MCP, pip: MIDDLE_PIP, dip: MIDDLE_DIP, tip: MIDDLE_TIP }
    case 'ring':
      return { mcp: RING_MCP, pip: RING_PIP, dip: RING_DIP, tip: RING_TIP }
    case 'pinky':
      return { mcp: PINKY_MCP, pip: PINKY_PIP, dip: PINKY_DIP, tip: PINKY_TIP }
  }
}

export function palmRef(lms: LM[]): number {
  return dist(lms[WRIST], lms[MIDDLE_MCP])
}

export function isExtended(lms: LM[], f: FingerId): boolean {
  const idx = fingerIndices(f)
  const dTip = dist(lms[WRIST], lms[idx.tip])
  const dPip = dist(lms[WRIST], lms[idx.pip])
  const ang = angleAtDeg(lms[idx.mcp], lms[idx.pip], lms[idx.tip])
  return dTip > dPip * 1.1 && ang > 160
}

export function isCurled(lms: LM[], f: FingerId): boolean {
  const idx = fingerIndices(f)
  const ratio = dist(lms[idx.tip], lms[idx.mcp]) / (palmRef(lms) + 1e-9)
  const threshold = f === 'pinky' ? 0.5 : 0.45
  return ratio < threshold
}

export function isThumbExtended(lms: LM[]): boolean {
  const dTip = dist(lms[WRIST], lms[THUMB_TIP])
  const dIp = dist(lms[WRIST], lms[THUMB_IP])
  const ang = angleAtDeg(lms[THUMB_MCP], lms[THUMB_IP], lms[THUMB_TIP])
  return dTip > dIp * 1.05 && ang > 150
}

export function pinchRatio(lms: LM[], f: FingerId): number {
  const idx = fingerIndices(f)
  return dist(lms[THUMB_TIP], lms[idx.tip]) / (palmRef(lms) + 1e-9)
}

export function handFullyOpen(lms: LM[]): boolean {
  return (
    isExtended(lms, 'index') &&
    isExtended(lms, 'middle') &&
    isExtended(lms, 'ring') &&
    isExtended(lms, 'pinky') &&
    isThumbExtended(lms)
  )
}
