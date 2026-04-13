# Gesture Drum Sequencer — Design Doc

A webcam-driven 16-step drum sequencer. Hand landmarks from MediaPipe drive a transparent sequencer UI overlaid on live video. Tone.js handles audio scheduling.

---

## 1. Goal

Build a browser app where the user programs a 5-instrument, 16-step drum loop using only hand gestures in front of their webcam. Each of 5 fingers maps to one drum voice. The user hovers horizontally to pick a step and pinches to toggle the note. Two views: single-track and 5-row panel.

---

## 2. Tech stack

- **Vite + React + TypeScript**
- **@mediapipe/tasks-vision** — Hand Landmarker (primary input)
- **Tone.js** — transport, scheduling, sample playback
- **Canvas API** — overlay rendering (grid, playhead, hover ring, fingertip markers)
- **Zustand** — app state (optional but recommended)

Use Hand Landmarker, not Gesture Recognizer. We derive intent from raw landmark geometry (finger identity + extension + pinch), not from a classifier.

---

## 3. Finger → instrument mapping

Fixed for the MVP:

| Hand  | Finger | Instrument   | Key  |
|-------|--------|--------------|------|
| Left  | Index  | Kick         | kick |
| Left  | Middle | Snare        | snare|
| Right | Index  | Closed hat   | ch   |
| Right | Middle | Open hat     | oh   |
| Right | Ring   | Rim          | rim  |

Thumbs and pinkies are intentionally unused — less stable, less separable on webcam.

---

## 4. Interaction model

Three interpretation layers on top of MediaPipe landmarks:

**Layer 1 — Finger identity.** From handedness + landmark index, identify which of the 5 mapped fingertips is visible.

**Layer 2 — Armed state.** A mapped finger is "armed" when extended, stable across N frames, and confidence is high. The armed finger implies the active instrument.

**Layer 3 — Command gestures.**

- **Place/remove note** — armed fingertip hovers over a step, pinch thumb-to-that-finger to toggle.
- **View switch** — both palms open, all 5 mapped fingers extended, held 500 ms.
- **Track selection in single-track view** — implicit: whichever mapped finger is currently armed becomes the selected track. No separate select gesture.

---

## 5. Views

### Single-track view
- One instrument's row, 16 large cells, centered horizontal strip.
- Instrument label on left, mini row of 5 instrument chips above.
- Playhead moves left→right.
- Active finger determines which track is shown. If multiple armed fingers, prefer the one with highest extension/confidence.
- Fingertip x → step index. Pinch toggles.

### Panel view
- 5 rows × 16 columns, all instruments visible.
- Row order: kick, snare, ch, oh, rim.
- **Row is determined by finger identity, not fingertip y.** Fingertip x → step. This is the single most important interaction rule — do not try to select rows by vertical pointing.
- Only one commit per short window even if multiple fingers pinch simultaneously.

---

## 6. State model

```ts
type Instrument = "kick" | "snare" | "ch" | "oh" | "rim";

type SequencerState = {
  steps: 16;
  bpm: number;                       // fixed for MVP, e.g. 100
  isPlaying: boolean;
  currentView: "single" | "panel";
  selectedInstrument: Instrument;    // for single-track view
  grid: Record<Instrument, boolean[]>; // each array length 16
  hover: {
    instrument: Instrument | null;
    step: number | null;
  };
};

type FingerState = {
  instrument: Instrument;
  visible: boolean;
  extended: boolean;
  pinching: boolean;
  stableFrames: number;
  hoverStep: number | null;
  lastCommitAt: number;              // ms timestamp, for cooldown
  smoothedTip: { x: number; y: number };
};
```

Initial grid: all false for all 5 instruments.

---

## 7. Architecture

```
App
├── VideoFeed           // <video> element, mirrored
├── OverlayCanvas       // grid, playhead, hover, fingertip markers
├── GestureEngine       // MediaPipe landmarks → events
├── SequencerEngine     // state + grid mutations
├── AudioEngine         // Tone.js transport + samples
└── HUD                 // BPM, view indicator, finger legend
```

**GestureEngine**
- In: MediaPipe landmark results per frame.
- Out: `{ activeInstrument, hoverStep, toggleEvent, viewSwitchEvent }`.

**SequencerEngine**
- In: toggle events, view switch events.
- Out: updated `grid`, `currentView`, `selectedInstrument`.

**AudioEngine**
- In: grid, bpm, isPlaying.
- Scheduled via `Tone.Transport`, fires samples on active steps.

**OverlayCanvas**
- In: view, grid, playhead step, hover, fingertip positions.
- Draws everything above the mirrored video element.

---

## 8. Two decoupled loops

**Vision loop** — runs on `requestAnimationFrame`:
1. Grab video frame.
2. `HandLandmarker.detectForVideo()`.
3. Resolve handedness + finger identity for the 5 mapped fingers.
4. Update per-finger `FingerState` (visibility, extension, pinch, stable frames, smoothed tip).
5. Compute hover step from smoothed fingertip x.
6. Detect commits (pinch rising edge past threshold + cooldown).
7. Emit events to SequencerEngine.
8. Push overlay state to canvas.

**Audio loop** — driven by `Tone.Transport` at 16th-note resolution:
1. Advance playhead step (0–15).
2. For each instrument, trigger sample if `grid[inst][step]` is true.
3. Notify UI of playhead step for highlight.

Keep them fully decoupled. Vision jitter must not affect timing.

---

## 9. Geometry — finger extension and pinch

**Finger extension.** For finger F with landmarks MCP, PIP, DIP, TIP:
- Extended when TIP is farther from the wrist than PIP along the MCP→TIP direction, and the MCP–PIP–TIP angle is close to straight (e.g. > 160°).
- Cheap alternative: `dist(wrist, TIP) > dist(wrist, PIP) * k` with k ≈ 1.1.

**Pinch detection.** For each hand:
1. `raw = dist(thumbTip, fingerTip)`.
2. Normalize by hand size: `palmRef = dist(wrist, middleMCP)`.
3. `ratio = raw / palmRef`.
4. Pinch when `ratio < 0.35` (tune; thresholds differ per finger — ring will need a slightly looser threshold).
5. Require ratio below threshold for 2–3 consecutive frames before registering.

**Smoothing.** EMA on fingertip position: `smoothed = α·current + (1-α)·prev`, α ≈ 0.4.

**Cooldown.** After a toggle commits, suppress further commits on that finger for ~250 ms.

**Stability.** Require 3–5 stable frames of visibility+extension before treating a finger as armed.

---

## 10. Coordinate mapping

- Mirror the video horizontally (selfie view). Mirror landmark x accordingly so `fingertip.x` matches what the user sees.
- Map `fingertip.x ∈ [0,1]` → step index `floor(x * 16)`, clamped to `[0, 15]`.
- In single-track view, the grid occupies a centered horizontal band; clamp hover detection to the grid's bounding box so idle hands outside the grid don't register hover.

---

## 11. Audio

- 5 samples: kick, snare, closed hat, open hat, rim. Short one-shots.
- Preload with `Tone.Players` or one `Tone.Player` per voice.
- `Tone.Transport.scheduleRepeat(tick, "16n")` where `tick(time)` reads the current step and triggers active voices with `player.start(time)`.
- BPM fixed (e.g. 100) for MVP; expose later.
- Must be started from a user gesture (click "Start") — browser autoplay policy.

---

## 12. Visual language

**Layers, bottom to top:**
1. Mirrored webcam video, full screen, lightly darkened (translucent black veil, ~20% opacity) for contrast.
2. Transparent sequencer UI — rgba panels around 0.20–0.28, thin bright borders, backdrop-blur where supported.
3. Fingertip markers, hover ring on targeted cell, small glow/trail on the armed finger.

**Per-instrument cell shape (panel view readability):**
- Kick → filled circle
- Snare → filled square
- Closed hat → short dash
- Open hat → hollow ring
- Rim → diamond

**Active cell** — bright filled center + thin glowing outline.
**Playhead column** — vertical bar, slightly brighter than surrounding cells.

**HUD** — finger legend ("L index = Kick", etc.) visible at all times, at least during MVP.

---

## 13. Failure modes and mitigations

| Problem | Mitigation |
|---|---|
| Hand disappears briefly | Keep last known state for ~200 ms before clearing armed status |
| Handedness swaps when hands cross | Require 3+ stable frames before accepting a handedness change |
| Ring finger detection weaker | Looser pinch threshold for ring; require slightly longer stability |
| Accidental pinches in resting pose | Require armed state + hover inside grid before commit is accepted |
| Camera mirror confusion | Mirror video and landmark x together, consistently |
| Multiple simultaneous pinches | One commit per ~100 ms window; pick highest-confidence pinch |

---

## 14. Build milestones

**Phase 1 — Static sequencer.** 5×16 grid, mouse click to toggle, Tone.js loop plays back. No camera yet.

**Phase 2 — Webcam + landmarks.** Show mirrored video, overlay fingertip dots, distinguish L/R hands, identify the 5 mapped fingers.

**Phase 3 — Hover targeting.** Armed finger highlights the cell under it. No commits yet.

**Phase 4 — Pinch to toggle.** Wire up pinch detection with smoothing and cooldown. Single-track view usable end-to-end.

**Phase 5 — Panel view.** Render all 5 rows. Row fixed by finger identity.

**Phase 6 — View switching.** Both-palms-open hold gesture, animated crossfade.

**Phase 7 — Polish.** Glass panels, playhead, per-instrument cell shapes, hand trails, latency tuning, on-screen finger legend.

---

## 15. Non-goals for MVP

Explicitly out of scope until the core works:
- Velocity from pinch depth
- Mute/solo poses
- Live tap-record with quantization
- Swing
- Sample swapping
- Variable BPM UI
- Mobile support

---

## 16. Demo script (end-to-end behavior)

1. User clicks Start. Webcam opens, mirrored.
2. Transparent single-track sequencer appears over video, kick row shown.
3. User extends left index → kick row is selected.
4. User moves fingertip horizontally; hover ring tracks the step under it.
5. Pinch thumb to left index → kick placed on that step. Loop plays it back next bar.
6. User extends left middle → snare row selected; program snare.
7. Right index/middle/ring → closed hat, open hat, rim.
8. User opens both hands, all 5 mapped fingers extended, holds 500 ms → crossfade to panel view.
9. Full 5×16 grid visible. User keeps editing by finger identity while the loop plays.
10. Open both hands again → back to single-track.

---

## 17. Open questions for the implementer

- Canvas vs SVG for the overlay — canvas is recommended for animation smoothness, but SVG may be easier for the per-instrument cell shapes. Pick one and stay consistent.
- Where to source the 5 drum samples. Any small CC0 drum kit is fine for MVP.
- Whether to gate audio start behind an explicit "Start" button (required by autoplay policy) or a gesture (e.g. both palms open once on load).
