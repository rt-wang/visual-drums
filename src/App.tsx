import { useRef, useState } from 'react'
import VideoFeed from './components/VideoFeed'
import OverlayCanvas from './components/OverlayCanvas'
import HUD from './components/HUD'
import { AudioEngine } from './audio/AudioEngine'
import { useStore } from './store'

export default function App() {
  const [started, setStarted] = useState(false)
  const audioRef = useRef<AudioEngine | null>(null)

  const onStart = async () => {
    if (!audioRef.current) audioRef.current = new AudioEngine()
    await audioRef.current.start(useStore.getState().bpm)
    useStore.getState().setPlaying(true)
    setStarted(true)
  }

  return (
    <div className="app">
      <div className="app-backdrop" />
      <div className="app-noise" />
      {started && <VideoFeed />}
      {started && <div className="stage-vignette" />}
      {started && <OverlayCanvas />}
      {started && <HUD />}
      {!started && (
        <div className="start-screen">
          <div className="start-card">
            <div className="start-kicker">Sketch 3 / Gesture Language</div>
            <h1>Gesture Drum Sequencer</h1>
            <p>
              Program and perform a five-track loop in midair. The grid stays on
              screen, your hands become the syntax, and the camera becomes the
              runtime.
            </p>

            <div className="intro-grid">
              <article className="intro-panel">
                <span className="intro-label">Edit</span>
                <p>Move either index across the grid to aim.</p>
                <p>Pinch that thumb and index to drop or remove a step.</p>
              </article>

              <article className="intro-panel">
                <span className="intro-label">Mix</span>
                <p>Open both hands and hold for a beat to enter live mix mode.</p>
                <p>Curl mapped fingers to mute tracks, relax to bring them back.</p>
              </article>

              <article className="intro-panel intro-panel-wide">
                <span className="intro-label">Finger Map</span>
                <p>
                  L index = Kick · L middle = Snare · R index = Closed hat · R
                  middle = Open hat · R pinky = Rim
                </p>
              </article>
            </div>

            <button className="start-button" onClick={onStart}>
              Start Camera + Audio
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
