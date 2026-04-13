import { create } from 'zustand'
import {
  Instrument,
  INSTRUMENTS,
  STEPS,
  Mode,
  HoverTarget,
  FingerOverlay,
} from './types'

type Grid = Record<Instrument, boolean[]>
type MuteMap = Record<Instrument, boolean>

const emptyGrid = (): Grid =>
  INSTRUMENTS.reduce((acc, inst) => {
    acc[inst] = Array(STEPS).fill(false)
    return acc
  }, {} as Grid)

export const emptyMutes = (): MuteMap =>
  INSTRUMENTS.reduce((acc, inst) => {
    acc[inst] = false
    return acc
  }, {} as MuteMap)

type State = {
  bpm: number
  isPlaying: boolean
  mode: Mode
  grid: Grid
  muted: MuteMap
  hovers: HoverTarget[]
  fingerOverlays: FingerOverlay[]
  playheadStep: number

  setPlaying: (v: boolean) => void
  setMode: (m: Mode) => void
  toggleCell: (inst: Instrument, step: number) => void
  setMuted: (m: MuteMap) => void
  clearMutes: () => void
  setHovers: (h: HoverTarget[]) => void
  setFingerOverlays: (f: FingerOverlay[]) => void
  setPlayhead: (s: number) => void
}

export const useStore = create<State>((set) => ({
  bpm: 100,
  isPlaying: false,
  mode: 'edit',
  grid: emptyGrid(),
  muted: emptyMutes(),
  hovers: [],
  fingerOverlays: [],
  playheadStep: -1,

  setPlaying: (v) => set({ isPlaying: v }),
  setMode: (m) => set({ mode: m }),
  toggleCell: (inst, step) =>
    set((s) => {
      const row = s.grid[inst].slice()
      row[step] = !row[step]
      return { grid: { ...s.grid, [inst]: row } }
    }),
  setMuted: (m) => set({ muted: m }),
  clearMutes: () => set({ muted: emptyMutes() }),
  setHovers: (h) => set({ hovers: h }),
  setFingerOverlays: (f) => set({ fingerOverlays: f }),
  setPlayhead: (s) => set({ playheadStep: s }),
}))
