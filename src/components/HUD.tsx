import { useStore } from '../store'

export default function HUD() {
  const mode = useStore((s) => s.mode)
  const bpm = useStore((s) => s.bpm)
  const isPlaying = useStore((s) => s.isPlaying)
  const legend =
    mode === 'mix'
      ? 'MIX fingers: L idx = Kick · L mid = Snare · R idx = CH · R mid = OH · R pinky = Rim'
      : 'EDIT: move R index across the grid, pinch R thumb + index to toggle'

  return (
    <div className="hud">
      <div className="hud-top">
        <span className="bpm">{bpm} BPM</span>
        {mode === 'mix' && <span className="mix-badge">MIX</span>}
        {!isPlaying && <span className="status">PAUSED</span>}
      </div>
      <div className="legend">{legend}</div>
    </div>
  )
}
