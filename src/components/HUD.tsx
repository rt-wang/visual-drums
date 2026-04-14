import { useStore } from '../store'

const LEGEND_ITEMS = [
  { finger: 'L IDX', inst: 'Kick' },
  { finger: 'L MID', inst: 'Snare' },
  { finger: 'R IDX', inst: 'CH' },
  { finger: 'R MID', inst: 'OH' },
  { finger: 'R PNK', inst: 'Rim' },
]

export default function HUD() {
  const mode = useStore((s) => s.mode)
  const bpm = useStore((s) => s.bpm)
  const isPlaying = useStore((s) => s.isPlaying)
  const modeLabel = mode === 'mix' ? 'Mix Active' : 'Edit Mode'
  const modeCopy =
    mode === 'mix'
      ? 'Live mutes armed. Curl a mapped finger to pull its track out.'
      : 'Aim with either index. Thumb + index pinch writes the highlighted step.'

  return (
    <div className="hud">
      <div className="hud-panel hud-main">
        <div className="hud-heading">
          <div>
            <div className="hud-kicker">Gesture Drum Sequencer</div>
            <div className="hud-copy">{modeCopy}</div>
          </div>
          <div className="hud-top">
            <span className="bpm">
              <strong>{bpm}</strong>
              <small>BPM</small>
            </span>
            <span className={`mode-pill ${mode === 'mix' ? 'mode-pill-mix' : 'mode-pill-edit'}`}>
              {modeLabel}
            </span>
            {!isPlaying && <span className="status">Paused</span>}
          </div>
        </div>
      </div>

      <div className="hud-panel hud-legend">
        {LEGEND_ITEMS.map((item) => (
          <div className="legend-chip" key={item.finger}>
            <span className="legend-finger">{item.finger}</span>
            <span className="legend-inst">{item.inst}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
