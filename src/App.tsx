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
      {started && <VideoFeed />}
      {started && <OverlayCanvas />}
      {started && <HUD />}
      {!started && (
        <div className="start-screen">
          <h1>Gesture Drum Sequencer</h1>
          <p>
            Program and perform a 5-track drum loop with your hands. Webcam
            required.
          </p>
          <ul className="intro-legend">
            <li>Left index → Kick · Left middle → Snare</li>
            <li>Right index → Closed hat · Right middle → Open hat · Right pinky → Rim</li>
            <li>Pinch thumb to a mapped finger over the grid to toggle a step.</li>
            <li>
              Open both hands (hold ~300 ms) to enter MIX mode — curl a finger
              to mute its track live.
            </li>
          </ul>
          <button onClick={onStart}>Start</button>
        </div>
      )}
    </div>
  )
}
