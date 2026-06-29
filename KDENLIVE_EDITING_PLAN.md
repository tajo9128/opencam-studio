# OpenCam Studio Editing Improvement Plan — Based on Kdenlive Analysis

## Kdenlive: What It Has (232 video effects, 242 audio effects)

### Video Effects (232 total, 15 categories)
Alpha/Mask/Keying, Blur/Sharpen, Color/Correction, Generate, Grain/Noise, Image Adjust, Misc, Motion, On Master, Stylize, Transform/Distort, Utility, VR360, Deprecated

### Audio Effects (242 total, 13 categories)
Audio, Channels, CMT, EQ/Filters, LADSPA, Modulators, Pitch/Time, Reverb/Delay, SWH, Stereo/Binaural, TAP, Tools, Volume/Dynamics

### Core Features
- Unlimited tracks, 3-point editing, multi-cam
- Keyframeable effects (linear, discrete, smooth curves)
- Proxy editing (low-res edit → full-res render)
- Audio scopes: histogram, waveform, vectorscope, RGB parade
- Title editor with scrolling, typewriter effect
- Glaxnimate SVG animation integration
- Auto subtitles (VOSK/Whisper)
- Timeline preview render
- Auto backup
- Export presets + custom profiles

---

## OpenCam Studio Current State vs Kdenlive

| Feature Area | OpenCam Studio | Kdenlive | Gap |
|---|---|---|---|
| **Filters** | 18 (brightness→crop) | 232 | Massive |
| **Transitions** | 8 (crossfade, fades, wipes, slide, zoom) | 20+ | Moderate |
| **Tracks** | 3 fixed (Screen, Webcam, Audio) | Unlimited | Big |
| **Keyframes** | None | Full (linear/discrete/curves) | Critical |
| **Audio editing** | Volume, fade, 3-band EQ, compressor | 242 effects | Massive |
| **Speed control** | Data model exists, no UI | Full speed ramping | Moderate |
| **Color correction** | White balance, color grade (basic) | Curves, levels, lift/gamma/gain, scopes | Big |
| **Scopes** | None | Histogram, waveform, vectorscope, RGB parade | Big |
| **Undo/redo** | None at timeline level | Full | Critical |
| **Proxy editing** | None | Auto low-res proxy | Moderate |
| **Title editor** | Text overlays (basic) | Full 2D editor, typewriter, scroll | Moderate |
| **Export presets** | 9 presets | Custom profiles + hardware encoding | Small |
| **Trim** | Exists (broken audio) | Full trim with audio | Small fix |
| **Subtitles** | None | Auto (VOSK/Whisper) | Big |

---

## Prioritized Improvement Tiers

### TIER 1 — Critical Fixes & High-Impact (Do First)

#### 1.1 Merge Filter Engines (Consolidate)
- **Problem**: Two competing filter engines (`FilterEngine.js` 18 filters, `FilterPipeline.js` 19 filters) with different APIs
- **Fix**: Merge into single `FilterEngine.js`, remove `FilterPipeline.js`
- **Effort**: Small — mostly deletion + import updates
- **Impact**: Eliminates confusion, one canonical filter system

#### 1.2 Fix Timeline → Export Pipeline
- **Problem**: Timeline exists but clips don't connect to actual rendering/export
- **Fix**: Wire timeline clips into the canvas render loop so edits actually apply to exported video
- **Effort**: Medium
- **Impact**: Makes the entire editing system functional

#### 1.3 Fix Trim Audio Preservation
- **Problem**: `useTrim.js` `getAudioTracks()` returns empty array — trimmed video has no audio
- **Fix**: Extract audio from source blob, trim it with Web Audio API, merge back
- **Effort**: Medium
- **Impact**: Critical bug fix

#### 1.4 Timeline Undo/Redo
- **Problem**: No undo at timeline level
- **Fix**: Snapshot-based undo (store timeline state snapshots, max 50)
- **Effort**: Small
- **Impact**: Essential for usability

### TIER 2 — Kdenlive-Inspired Filters (High Value)

#### 2.1 Add 10 New Canvas Filters
These are browser-feasible via Canvas API `getImageData` pixel manipulation:

| Filter | Kdenlive Equivalent | Implementation |
|---|---|---|
| **Curves** | Curves | Canvas LUT + bezier control points |
| **Levels** | Levels, Color Levels | Histogram-based input/output levels |
| **Lift/Gamma/Gain** | Lift/Gamma/Gain | 3-way color correction via pixel math |
| **Posterize** | Posterize | Reduce color levels per channel |
| **Cartoon** | Cartoon | Edge detection + posterize combo |
| **Glow** | Soft Glow, Glow | Blur + screen blend |
| **Emboss** | Emboss | Convolution kernel |
| **Charcoal** | Charcoal | Edge detection + grayscale + invert |
| **Film Grain** | Film Grain | Animated noise with clamping |
| **Old Film** | Old Film Simulator | Sepia + scratches + vignette + grain |

**Effort**: Each filter is ~30-80 lines of Canvas pixel manipulation. Total ~500 lines.

#### 2.2 Add 5 More Transitions

| Transition | Kdenlive Equivalent |
|---|---|
| **Dissolve** (random pixel reveal) | Dissolve |
| **Barn Door** (horizontal split) | Barn Door |
| **Iris** (circle reveal from center) | Iris |
| **Clock Wipe** (clock hand sweep) | Clock Wipe |
| **Push** (slide both clips) | Push |

**Effort**: Each ~20-40 lines of canvas drawing. Total ~150 lines.

### TIER 3 — Audio Effects (High Value, Web Audio API)

#### 3.1 Add Audio Effects to AudioEngine
Using Web Audio API nodes — all browser-native:

| Effect | Implementation | Nodes |
|---|---|---|
| **Noise Gate** | Gate below threshold | DynamicsCompressor + GainNode |
| **Noise Suppression** | Spectral subtraction | BiquadFilter (highpass) + compressor |
| **De-Esser** | Sibilance reduction | BiquadFilter (bandpass 4-8kHz) + compressor |
| **Reverb** | Convolution reverb | ConvolverNode with impulse response |
| **Delay/Echo** | Feedback delay | DelayNode + GainNode feedback loop |
| **Chorus** | Modulated delay | DelayNode + LFO modulation |
| **Pitch Shift** | Frequency scaling | Playback rate (simple) or AudioWorklet |
| **High-Pass / Low-Pass** | Frequency filtering | BiquadFilterNode |
| **Stereo Widener** | M/S processing | ChannelSplitter + gain |
| **Limiter** | Peak limiting | DynamicsCompressor (ratio=20) |

**Effort**: Each ~20-50 lines using Web Audio API. Total ~300 lines.

### TIER 4 — Workflow Features (Medium Priority)

#### 4.1 Audio Scopes
- **Waveform**: Real-time canvas visualization of audio amplitude
- **Histogram**: Pixel luminance distribution
- Implementation: Canvas 2D drawing from AudioAnalyserNode data
- **Effort**: ~200 lines each

#### 4.2 Speed Control UI
- Data model already supports `speed` on clips
- Add UI: speed slider (0.25x–4x) in clip context menu
- Apply via `playbackRate` during canvas rendering
- **Effort**: ~100 lines

#### 4.3 Unlimited Tracks
- Change from fixed 3 tracks to dynamic add/remove
- Track header with + button, drag-to-reorder
- **Effort**: ~200 lines

#### 4.4 Clip Context Menu
- Right-click clip → Split, Delete, Duplicate, Speed, Filters, Properties
- **Effort**: ~150 lines

### TIER 5 — Advanced Features (Lower Priority)

#### 5.1 Keyframe Animation System
- Store `{time, value}` keyframes per filter parameter
- Interpolation: linear, ease-in, ease-out, bezier
- Timeline keyframe editor with draggable points
- **Effort**: ~500 lines (biggest single feature)

#### 5.2 Proxy Editing
- On import, generate low-res version (360p) via canvas + MediaRecorder
- Edit on proxy, render at full resolution
- **Effort**: ~300 lines

#### 5.3 Auto Subtitles (Whisper)
- Use Whisper.cpp via WebAssembly or call Ollama with Whisper model
- Display as text overlays on timeline
- **Effort**: ~400 lines

#### 5.4 Chroma Key (Green Screen)
- HSV-based color distance → alpha mask
- Spill suppression for edges
- **Effort**: ~150 lines

#### 5.5 Title Templates
- Pre-built title card styles (lower third, end card, chapter marker)
- SVG-based for crisp rendering at any resolution
- **Effort**: ~200 lines + design

---

## Implementation Priority Order

```
Phase 1 — Fix What's Broken (1-2 days)
  [1.1] Merge filter engines
  [1.2] Wire timeline to export
  [1.3] Fix trim audio
  [1.4] Timeline undo/redo

Phase 2 — Expand Filters + Audio (3-4 days)
  [2.1] Add 10 new canvas filters
  [2.2] Add 5 new transitions
  [3.1] Add 10 Web Audio effects

Phase 3 — Workflow (2-3 days)
  [4.1] Audio scopes (waveform + histogram)
  [4.2] Speed control UI
  [4.3] Unlimited tracks
  [4.4] Clip context menu

Phase 4 — Advanced (3-5 days)
  [5.1] Keyframe animation
  [5.2] Proxy editing
  [5.3] Auto subtitles
  [5.4] Chroma key
  [5.5] Title templates
```

---

## Total Kdenlive Features → Browser-Feasible

| Category | Kdenlive Count | Browser-Feasible | Already in OpenCam Studio |
|---|---|---|---|
| Video filters | 232 | ~40 (canvas-based) | 18 |
| Audio effects | 242 | ~15 (Web Audio API) | 4 |
| Transitions | 20+ | ~13 (canvas-based) | 8 |
| Scopes | 5 | 3 (canvas viz) | 0 |
| Timeline features | 15+ | 12 | 6 |
| **Total** | **514+** | **~83** | **36** |

Target: **83 features** matching Kdenlive's browser-feasible subset.
