# OpenCam Studio - Hybrid Recorder Feature Plan

## Current State Analysis

### Old Features (Must Keep)
1. **Source Cards** - Screen/Camera/Mic with lock/unlock states
2. **Mic Test** - Real-time audio level meter
3. **Camera Preview** - PIP preview when camera active
4. **Template Selector** - 6 recording layouts (Screen Only, Camera Only, PiP Circle, PiP Rect, Side by Side, Stacked)
5. **Webcam Corner Picker** - TL/TR/BL/BR positioning for PiP modes
6. **Quality Selector** - 720p/1080p/1440p/Native
7. **Folder Selector** - Choose save location via File System Access API
8. **Auto-Save** - Save to selected folder on stop (fallback to download)
9. **Start Recording Flow** - Captures both screen+camera based on template
10. **Recording Bar** - Timer, pause/resume, stop buttons
11. **Enhanced Audio** - Audio processing toggle
12. **Toast Notifications** - Success/error messages
13. **Keyboard Shortcuts** - Space to start/stop

### New Dadan.io Features (Added)
1. **Bottom Toolbar** - Clean icon-based controls
2. **Quality Badge** - Top-left corner display
3. **Center Placeholder** - "To Start Recording..." message
4. **Settings Panels** - Ratio, Background, Layout, Prompter, Settings
5. **Aspect Ratio** - 16:9, 9:16, 4:3, 1:1
6. **Background Gradients** - 6 color presets
7. **Teleprompter** - Auto-scrolling script overlay
8. **PIP Toggle** - Quick PiP on/off

## Hybrid Integration Plan

### Layout Structure
```
┌─────────────────────────────────────────────┐
│  [Quality Badge]                    [Rec Indicator] │
│                                             │
│         Canvas Preview Area                 │
│                                             │
│  ┌─ When NO sources active ──────────────┐  │
│  │  Source Cards (Screen/Cam/Mic)        │  │
│  │  Template Selector (6 layouts)        │  │
│  │  Corner Picker (for PiP modes)        │  │
│  │  Start Recording Button               │  │
│  │  Folder Selector                      │  │
│  └───────────────────────────────────────  │
│                                             │
│  ┌─ When sources active (not recording) ─┐  │
│  │  [Bottom Toolbar]                     │  │
│  │  Show Cam | Enable Mic | Show Screen  │  │
│  │  Ratio | Background | Layout | Prompter│  │
│  │  Settings | Record | PIP              │  │
│  └───────────────────────────────────────  │
│                                             │
│  ┌─ When recording ─────────────────────  │
│  │  [Recording Bar]                      │  │
│  │  ● REC 00:45 | Pause | Stop          │  │
│  │  Cam:ON | Mic:ON | [audio level]     │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Feature Mapping

#### Source Management
- **Old**: Source cards with lock/unlock icons
- **New**: Toolbar buttons (Show Cam, Enable Mic, Show Screen)
- **Hybrid**: Show source cards when nothing active → toolbar when any source active
- **Both work**: Click source card OR toolbar button to toggle

#### Template/Layout Selection
- **Old**: Template buttons in start screen
- **New**: Layout panel in toolbar
- **Hybrid**: Template selector in start screen → Layout panel in toolbar (same 6 options)
- **Both work**: Select before recording via start screen, change via toolbar panel

#### Webcam Position
- **Old**: Corner picker below template selector
- **New**: Inside Layout panel
- **Hybrid**: Show corner picker in start screen when PiP selected → corner picker in Layout panel
- **Both work**: Same 4 positions (TL/TR/BL/BR)

#### Quality Selection
- **Old**: Dropdown in controls bar
- **New**: In Settings panel
- **Hybrid**: Quality badge shows current → Settings panel to change
- **Both work**: Same 4 options (720p/1080p/1440p/Native)

#### Folder Selection
- **Old**: Button in start screen
- **New**: In Settings panel
- **Hybrid**: Show folder button in start screen → Settings panel when toolbar active
- **Both work**: Same File System Access API

#### Recording Controls
- **Old**: Recording bar at bottom
- **New**: Record button in toolbar
- **Hybrid**: Toolbar Record button starts → Recording bar appears during recording
- **Both work**: Same pause/resume/stop functionality

#### New Features (Toolbar Only)
- **Aspect Ratio**: 16:9, 9:16, 4:3, 1:1 (new)
- **Background Gradients**: 6 color presets (new)
- **Teleprompter**: Auto-scrolling script (new)
- **PIP Toggle**: Quick PiP on/off (new)

## Implementation Priority

### Phase 1: Core Hybrid (Current)
- [x] Source cards + toolbar hybrid display
- [x] Template selector in start screen + Layout panel
- [x] Corner picker in both locations
- [x] Quality badge + Settings panel
- [x] Folder selector in both locations
- [x] Recording bar during recording

### Phase 2: Enhanced Features
- [ ] Aspect ratio selector (toolbar + canvas sizing)
- [ ] Background gradients (toolbar + canvas rendering)
- [ ] Teleprompter (toolbar + overlay during recording)
- [ ] PIP toggle quick button

### Phase 3: Polish
- [ ] Smooth transitions between states
- [ ] Tooltips on all toolbar buttons
- [ ] Keyboard shortcuts for all features
- [ ] Mobile responsive layout

## Technical Notes

### State Management
- All features use React useState hooks
- No external state management needed
- Props passed to useRecording hook for canvas capture

### Canvas Rendering
- Supports all 6 templates with corner positioning
- Aspect ratio affects canvas dimensions
- Background gradients rendered as canvas fill
- Teleprompter rendered as HTML overlay (not in canvas)

### Recording Flow
1. User enables sources (cards or toolbar)
2. User selects template (start screen or Layout panel)
3. User clicks Start Recording (button or toolbar)
4. System captures screen+camera based on template
5. Canvas renders with selected layout + background
6. MediaRecorder captures canvas stream
7. On stop, saves to folder or downloads

### File Structure
```
src/components/ScreenRecorder.jsx    - Main component
src/components/ScreenRecorder.css    - Styles
src/hooks/useStreams.js              - Screen/camera/mic management
src/hooks/useRecording.js            - MediaRecorder wrapper
src/hooks/useAudioProcessor.js       - Audio enhancement
src/hooks/useAudioLevel.js           - Mic level meter
src/utils/RecordingStore.js          - Recording state
src/utils/StorageManager.js          - Folder persistence
```

## Testing Checklist

- [ ] Source cards enable/disable correctly
- [ ] Toolbar buttons toggle sources
- [ ] Template selector changes layout
- [ ] Corner picker moves webcam
- [ ] Quality selector changes resolution
- [ ] Folder selector saves to chosen location
- [ ] Recording starts with both screen+camera
- [ ] Pause/resume works during recording
- [ ] Stop saves video to folder
- [ ] Aspect ratio changes canvas size
- [ ] Background gradients render correctly
- [ ] Teleprompter scrolls during recording
- [ ] PIP toggle switches layout
- [ ] All keyboard shortcuts work
- [ ] Toast notifications show correctly
