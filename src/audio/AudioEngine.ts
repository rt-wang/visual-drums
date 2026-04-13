import * as Tone from 'tone'
import { Instrument, INSTRUMENTS, STEPS } from '../types'
import { useStore } from '../store'

type Voice = { trigger: (time: number) => void }

function makeKick(): Voice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.4 },
  }).toDestination()
  synth.volume.value = -4
  return { trigger: (t) => synth.triggerAttackRelease('C1', '8n', t) }
}

function makeSnare(): Voice {
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.2, sustain: 0 },
  })
  const filter = new Tone.Filter(1800, 'highpass').toDestination()
  noise.connect(filter)
  noise.volume.value = -8
  return { trigger: (t) => noise.triggerAttackRelease('8n', t) }
}

function makeClosedHat(): Voice {
  const synth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.08, release: 0.02 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  }).toDestination()
  synth.volume.value = -24
  return { trigger: (t) => synth.triggerAttackRelease('C5', '32n', t) }
}

function makeOpenHat(): Voice {
  const synth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.3, release: 0.1 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  }).toDestination()
  synth.volume.value = -26
  return { trigger: (t) => synth.triggerAttackRelease('C5', '8n', t) }
}

function makeRim(): Voice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.08, sustain: 0 },
  }).toDestination()
  synth.volume.value = -10
  return { trigger: (t) => synth.triggerAttackRelease('G3', '32n', t) }
}

export class AudioEngine {
  private voices: Record<Instrument, Voice>
  private loopId: number | null = null
  private started = false

  constructor() {
    this.voices = {
      kick: makeKick(),
      snare: makeSnare(),
      ch: makeClosedHat(),
      oh: makeOpenHat(),
      rim: makeRim(),
    }
  }

  async start(bpm: number) {
    if (this.started) return
    await Tone.start()
    Tone.Transport.bpm.value = bpm
    useStore.getState().setPlayhead(-1)

    this.loopId = Tone.Transport.scheduleRepeat((time) => {
      const state = useStore.getState()
      const step = (state.playheadStep + 1) % STEPS
      useStore.setState({ playheadStep: step })
      for (const inst of INSTRUMENTS) {
        if (state.grid[inst][step] && !state.muted[inst]) {
          this.voices[inst].trigger(time)
        }
      }
    }, '16n')

    Tone.Transport.start()
    this.started = true
  }

  stop() {
    Tone.Transport.stop()
    if (this.loopId !== null) {
      Tone.Transport.clear(this.loopId)
      this.loopId = null
    }
    this.started = false
  }
}
