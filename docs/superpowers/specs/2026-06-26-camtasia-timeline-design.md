# Camtasia-Level Timeline — Design Spec

## Goal
Make OpenCam Studio's timeline editing interface comparable to Camtasia's screencast-optimized NLE.

## Architecture Decisions
- **Rendering:** Keep DOM for clip blocks, add HTML5 Canvas overlay for waveforms/keyframes/rubber-bands
- **State:** Migrate to Zustand store (replaces useState in useTimeline.js)
- **J/L Cuts:** Add `audioOffset` and `audioDuration` fields to clip model (one clip, two trim zones)

## Phase 1: Core Timeline UX (Keyboard, Trimming, Markers, Magnetic Behavior)
- Full keyboard: Space, S/C, Delete, J/K/L, Q/W, M, Ctrl+Z/Shift+Z
- Magnetic timeline with toggle
- J/L cuts with audioOffset
- Playhead snapping to clip edges, markers, keyframes
- Markers/Chapters (colored flags, named, visible on ruler)
- Ripple, Roll, Slip, Slide trim modes

## Phase 2: Inline Visual Keyframing
- Keyframe diamonds on clips (click to drop)
- Visual interpolation lines between diamonds
- Audio volume envelope (rubber band)
- Inline keyframe editing (double-click diamond)

## Phase 3: Screencast Tracks
- Zoom-n-Pan Track (draw rectangles for zoom regions)
- Cursor Track (click markers, smoothing/highlighting)
- Annotations Track (callout blocks)
- Animations Track (Enter/Emphasis/Exit blocks)

## Phase 4: Transitions Library & Drag-Drop Effects
- Between-clip transitions (drag from library to cut line)
- Clip-level effects (drag onto clip, 'fx' badge)
- Transition preview on hover

## Phase 5: Waveform Scaling & Polish
- Waveform height scales with zoom
- Syllable-level zoom for precise cutting
