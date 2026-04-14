# Gesture Drum Sequencer

A browser-based drum sequencer controlled with a webcam and hand gestures. The app overlays a 5x16 step grid on top of mirrored live video, uses MediaPipe Hand Landmarker for tracking, and schedules sound with Tone.js.

This is a Vite + React + TypeScript sketch focused on live gestural interaction rather than timeline editing with mouse and keyboard controls.

## What It Does

- Starts audio and camera from a user gesture.
- Tracks up to two hands in the browser.
- Lets either index finger aim at any cell in the grid.
- Uses a thumb-to-index pinch to toggle steps on and off.
- Plays a looping 16-step pattern across five drum voices.
- Enters a live mute mode when both hands are opened and held briefly.

## Instruments

The sequencer has five rows:

| Row | Instrument | Mix-mode finger |
| --- | --- | --- |
| 1 | Kick | Left index |
| 2 | Snare | Left middle |
| 3 | Closed hat | Right index |
| 4 | Open hat | Right middle |
| 5 | Rim | Right pinky |

## Controls

### Edit Mode

This is the default mode after startup.

- Move either index finger over the grid to aim.
- Pinch thumb + index on the same hand to toggle the highlighted cell.
- The current implementation uses fingertip position to choose both row and step, so either hand can write anywhere on the grid.

### Mix Mode

- Open both hands and hold for about 300 ms to enter mix mode.
- Keep both thumbs extended to stay in mix mode.
- Curl a mapped finger to mute its instrument.
- Re-extend that finger to bring the track back.
- Dropping out of mix mode clears all mutes.

## Running Locally

```bash
npm install
npm run dev
```

Then open the local Vite URL in a browser and allow camera access.

To create a production build:

```bash
npm run build
npm run preview
```

## Runtime Notes

- Camera access is required for interaction.
- Audio starts only after clicking the start button because browsers block autoplayed audio contexts.
- Hand tracking assets are loaded at runtime from MediaPipe-hosted URLs, so the app is not fully offline in its current form.
- The default BPM is fixed at `100`.
- Drum sounds are synthesized with Tone.js rather than loaded from sample files.

## Stack

- React 18
- TypeScript
- Vite
- Zustand
- Tone.js
- `@mediapipe/tasks-vision`

## Project Structure

```text
src/
  App.tsx                     app shell and start screen
  audio/AudioEngine.ts        Tone.js transport and synth voices
  components/VideoFeed.tsx    webcam setup
  components/OverlayCanvas.tsx sequencer and pointer rendering
  components/HUD.tsx          mode, BPM, and legend UI
  vision/useHandLandmarker.ts MediaPipe lifecycle and frame loop
  vision/gestureProcessor.ts  gesture interpretation and mode logic
  vision/geometry.ts          hand geometry helpers
  store.ts                    Zustand sequencer state
  types.ts                    shared app types and constants
```

## How It Works

The app runs two independent loops:

- A vision loop driven by `requestAnimationFrame`, which reads webcam frames, runs MediaPipe hand detection, interprets gestures, and updates UI state.
- An audio loop driven by `Tone.Transport`, which advances the playhead every sixteenth note and triggers any active, unmuted steps.

That separation keeps playback timing stable even when tracking jitter changes frame-to-frame.

## Current Limitations

- No pattern persistence.
- No BPM control in the UI.
- No sample loading or kit selection.
- No automated tests yet.
- Production build currently emits a large JS chunk warning from Vite.

## Reference

The repo also includes [gesture-sequencer-design.md](./gesture-sequencer-design.md), which captures the broader interaction design that this implementation is based on.
