# Gesture Drum Sequencer — Design Doc

A webcam-driven 16-step drum sequencer. Hand landmarks from MediaPipe drive a transparent sequencer UI overlaid on live video. Tone.js handles audio. One view, two modes: edit (default) and mix (while both hands are fully open).

---

## 1. Goal

Browser app where the user programs and performs a 5-instrument, 16-step drum loop using only hand gestures. Each of 5 fingers maps to one drum voice. The full 5×16 grid is always visible.

- **Edit mode (default):** pinch thumb-to-mapped-finger to toggle notes on that finger's row at the step under the fingertip.
- **Mix mode (while both hands are fully open):** each extended mapped finger = track unmuted; each fully-curled mapped finger = muted. Mix state is live-held, not latched — relax your hands and all 5 tracks play again.

---

## 2. Tech stack

- **Vite + React + TypeScript**
- **@mediapipe/tasks-vision** — Hand Landmarker (primary input)
- **Tone.js** — transport, scheduling, sample playback
- **Canvas API** — overlay rendering
- **Zustand** — app state (recommended)

Use Hand Landmarker, not Gesture Recognizer. Intent is derived from raw landmark geometry (finger identity + extension + curl + pinch).

---

## 3. Finger → instrument mapping

| Hand  | Finger | Instrument  | Key   |
|-------|--------|-------------|-------|
| Left  | Index  | Kick        | kick  |
| Left  | Middle | Snare       | snare |
| Right | Index  | Closed hat  | ch    |
| Right | Middle | Open hat    | oh    |
| Right | Pinky  | Rim         | rim   |

**Why pinky for rim, not ring.** Ring and middle fingers share a tendon sheath — most people cannot curl ring independently of middle. Mix mode requires per-finger curl detection, so ring is unusable. Pinky has independent control. We pay a small tracking-stability cost on pinky for the big anatomical win of independence.

Thumbs are reserved for pinching and not mapped to instruments. Ring fingers are unmapped and their state is ignored.

---

## 4. The single view: 5×16 panel

- Always visible, no view switching.
- 5 rows × 16 columns, rows top-to-bottom: kick, snare, ch, oh, rim.
- Playhead column highlighted, moving left→right in sync with Tone.Transport.
- Transparent panels over mirrored webcam video.
- Row is always determined by **finger identity**, never by fingertip y-position. Fingertip x picks the step.

---

## 5. Modes

### 5.1 Edit mode (default)

Active whenever the user is **not** holding both hands fully open.

- Mapped finger extended + visible + stable → "armed."
- Armed fingertip x → step index (0–15) on that finger's row. Hover ring drawn on targeted cell.
- Pinch thumb-to-armed-finger → toggle that cell. ~250 ms cooldown per finger.
- Multiple fingers may be armed simultaneously, but only one pinch commit per ~100 ms window across all fingers (pick highest-confidence pinch).
- All 5 tracks play whatever is in the grid.

### 5.2 Mix mode (held)

Entered while **both hands are fully open** — all 5 mapped fingers extended + both thumbs extended, held stable for ~300 ms. Exited the instant the pose breaks.

- **No pinches commit while in mix mode.** Editing is suppressed to prevent accidents during performance.
- For each mapped finger F:
  - F **extended** → F's track unmuted (plays as programmed).
  - F **fully curled** (strict threshold) → F's track muted.
- Mutes are **live** — uncurling a finger immediately returns its track. Relaxing out of mix mode clears all mutes.
- Visual: muted rows dim to ~30% opacity; playhead continues across all rows.

### 5.3 Mode transition

HUD shows a "MIX" badge when active. No long animation — just a 150 ms fade on row dimming.

---

## 6. State model

```ts
type Instrument = "kick" | "snare" | "ch" | "oh" | "rim";

type SequencerState = {
  steps: 16;
  bpm: number;                         // fixed for MVP, e.g. 100
  isPlaying: boolean;
  mode: "edit" | "mix";
  grid: Record<Instrument, boolean[]>; // each length 16
  muted: Record<Instrument, boolean>;  // only non-default in mix mode
  hover: { instrument: Instrument | null; step: number | null };
  playheadStep: number;
};

type FingerState = {
  instrument: Instrument;
  visible: boolean;
  extended: boolean;        // armed detection + mix-mode unmute
  curled: boolean;          // strict curl, mix-mode mute
  pinching: boolean;
  stableFrames: number;
  hoverStep: number | null;
  lastCommitAt: number;
  smoothedTip: { x: number; y: number };
};

type HandState = {
  handedness: "Left" | "Right";
  visible: boolean;
  fullyOpen: boolean;       // all 4 fingers + thumb extended
  fingers: Record<string, FingerState>;
};
```

Initial grid: all false. Initial muted: all false.

---

## 7. Architecture

```
App
├── VideoFeed           // mirrored <video>
├── OverlayCanvas       // grid, playhead, hover, fingertip markers, mute dimming
├── GestureEngine       // landmarks → events + mode detection
├── SequencerEngine     // grid + mode state
├── AudioEngine         // Tone.js transport + samples, respects muted[]
└── HUD                 // BPM, MIX badge, finger legend
```

**GestureEngine** — in: MediaPipe landmarks per frame. Out: `{ mode, armedFingers[], hoverTargets[], toggleEvents[], muteState }`.

**SequencerEngine** — in: toggle events, mode, mute state. Out: updated `grid`, `mode`, `muted`.

**AudioEngine** — in: grid, bpm, isPlaying, muted. `Tone.Transport` drives 16th-note ticks. Trigger sample if `grid[inst][step] && !muted[inst]`.

**OverlayCanvas** — in: mode, grid, muted, playhead, hover, fingertip positions. Draws grid, dims muted rows in mix mode, shows hover ring and fingertip markers in edit mode.

---

## 8. Two decoupled loops

**Vision loop** (`requestAnimationFrame`):
1. Grab video frame.
2. `HandLandmarker.detectForVideo()`.
3. Per hand: handedness, `fullyOpen`, per-finger `extended`/`curled`/`pinching`, smoothed tip.
4. Determine mode: `fullyOpen` on both hands stable for 300 ms → mix; else edit.
5. Edit mode: resolve armed fingers, hover steps, emit pinch commits.
6. Mix mode: compute per-track mute from per-finger curl.
7. Push state.

**Audio loop** (`Tone.Transport`, 16n):
1. Advance `playheadStep`.
2. Trigger samples where `grid[inst][step] && !muted[inst]`.

Fully decoupled — vision jitter never affects timing.

---

## 9. Geometry — extension, curl, pinch

Normalize distances by hand size: `palmRef = dist(wrist, middleMCP)`.

**Extension** (armed + unmuted).
For finger F with MCP/PIP/DIP/TIP:
- Extended when `dist(wrist, TIP) > dist(wrist, PIP) * 1.1` AND angle at PIP > 160°.

**Curl** (mix-mode mute, strict).
- Curled when `dist(TIP, MCP) / palmRef < 0.45`.
- Pinky threshold looser (~0.50) because pinky is shorter.
- Must hold 4+ frames to trigger (avoids transition flicker).

**Pinch** (edit mode only).
1. `raw = dist(thumbTip, fingerTip)` same hand.
2. `ratio = raw / palmRef`.
3. Pinch when `ratio < 0.35` for 2–3 consecutive frames.
4. ~250 ms cooldown on that finger after commit.

**Hand fully open** (mix-mode entry).
- All 4 non-thumb fingers extended + thumb extended.
- Both hands satisfy this for 300 ms continuous before entering mix.

**Smoothing.** EMA on fingertip: `smoothed = α·current + (1-α)·prev`, α ≈ 0.4.

**Stability.** 3–5 frames of consistent state before treating a transition as real.

---

## 10. Coordinate mapping

- Mirror video horizontally. Mirror landmark x accordingly.
- `fingertip.x ∈ [0,1]` → `floor(x * 16)`, clamped `[0, 15]`.
- Grid is a centered rectangle. Hover only registers when fingertip is inside grid bbox.

---

## 11. Audio

- 5 short one-shot samples.
- Preload via `Tone.Players`.
- `Tone.Transport.scheduleRepeat(tick, "16n")`. In `tick(time)`, for each instrument: `if (grid[inst][step] && !muted[inst]) player.start(time)`.
- BPM fixed (e.g. 100) for MVP.
- Transport must start from a user gesture — use a "Start" button.

---

## 12. Visual language

**Layers:**
1. Mirrored webcam, full screen, darkened with ~20% black veil.
2. Transparent 5×16 grid — rgba ~0.22, thin bright borders, backdrop-blur if supported.
3. Overlays: playhead column, fingertip markers, hover ring (edit mode only).

**Per-row cell shape:**
- Kick → filled circle
- Snare → filled square
- Closed hat → short dash
- Open hat → hollow ring
- Rim → diamond

**Cell states:**
- Empty → outline only.
- Active → bright filled center + glowing outline.
- On playhead + active → brighter flash.

**Mute dimming (mix mode):**
- Muted row → cells and outline at ~30% opacity.
- Unmuted row → full brightness.
- 150 ms fade.

**HUD:**
- Finger legend always visible in MVP: "L idx=Kick · L mid=Snare · R idx=CH · R mid=OH · R pinky=Rim".
- BPM readout.
- "MIX" badge when mode == "mix".

---

## 13. Failure modes and mitigations

| Problem | Mitigation |
|---|---|
| Hand disappears briefly | Keep last state ~200 ms before clearing |
| Handedness swaps on crossing | 3+ stable frames before accepting swap |
| Pinky tracking less stable | Looser curl threshold, longer stability window |
| Accidental pinches at rest | Require armed + hover inside grid bbox + stable |
| Accidental mix entry | 300 ms hold on both-hands-open |
| Pinches inside mix mode | Suppress all commits while mode == "mix" |
| Camera mirror confusion | Mirror video and landmark x together consistently |
| Ring sags when middle curls | Ring is unmapped; state ignored |

---

## 14. Build milestones

**Phase 1 — Static sequencer.** 5×16 grid, mouse toggle, Tone.js loop. No camera.

**Phase 2 — Webcam + landmarks.** Mirrored video, fingertip dots, L/R distinction, identify L idx, L mid, R idx, R mid, R pinky.

**Phase 3 — Hover targeting.** Armed finger highlights cell on its row. No commits.

**Phase 4 — Edit mode.** Pinch commits, smoothing, cooldown. Full editing works.

**Phase 5 — Mix mode.** Detect both-hands-open, enter/exit on held pose, per-finger curl → mute, suppress commits in mix, AudioEngine respects `muted[]`.

**Phase 6 — Polish.** Glass panels, per-instrument cell shapes, playhead flash, mute-dim transitions, finger legend, latency tuning.

---

## 15. Non-goals for MVP

- Velocity from pinch depth
- Explicit solo gesture (effective solo = curl 4 fingers in mix mode)
- Live tap-record with quantization
- Swing
- Sample swapping
- Variable BPM UI
- Mobile support
- Latched mix mode
- Multi-user

---

## 16. Demo script

1. Click Start. Webcam opens mirrored. Empty 5×16 grid over video.
2. Loop starts (silent).
3. Left index: pinch at steps 1, 5, 9, 13 → four-on-the-floor kick.
4. Right index: hats on off-beats.
5. Left middle: snares on 5 and 13.
6. Groove in motion.
7. Open both hands, hold 300 ms → MIX badge appears.
8. Curl left index → kick row dims, drops out live.
9. Extend left index again → kick returns. Curl left middle → snare drops.
10. Relax hands → exit mix mode, all tracks return.
11. Back in edit mode seamlessly; keep programming.

---

## 17. Open questions for the implementer

- Canvas vs SVG for the overlay — canvas recommended; SVG easier for per-row shapes. Pick one.
- Source of 5 drum samples — any CC0 kit.
- Palm-facing-camera check for mix entry — nice-to-have, skip if it complicates landmark math.
- Grid auto-scale vs fixed pixel size — fixed is simpler for MVP.
