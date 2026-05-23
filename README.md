<p align="center">
  <strong>ScreenStudio</strong>
</p>

<p align="center">
  The perfect hybrid of <strong>OBS Studio</strong> + <strong>Loom</strong> + <strong>Kdenlive</strong> — all in your browser.
</p>

<p align="center">
  Free &bull; Open Source &bull; Docker-Ready &bull; AI-Powered
</p>

---

## What is ScreenStudio?

ScreenStudio combines the best of three worlds into one seamless browser-based application:

| From **OBS Studio** | From **Loom** | From **Kdenlive** |
|---|---|---|
| Scene composition | One-click recording | Multi-track timeline |
| Live streaming (RTMP) | Instant shareable links | 33 video filters |
| Audio mixer per source | Webcam overlay (PiP) | 13 transitions |
| Replay buffer | Cloud-ready export | Keyframe animation |
| Virtual camera concepts | Browser-native (no install) | Audio effects & EQ |
| Multi-source compositing | YouTube direct upload | Unlimited tracks |
| Stream to YouTube Live | Folder auto-save | Speed ramping |

---

## 5 Modes, 1 App

```
[ Record ]  [ Edit ]  [ Stream ]  [ Export ]  [ Settings ]
```

### Record Mode
> *Loom-quality recording with OBS-level control*

- Screen / Window / Tab capture
- Webcam overlay with circle, rounded-rect, or square shape
- System audio + microphone
- Source selector: Full Screen, Window, Browser Tab
- Adjustable webcam scale (S/M/L) and screen scale
- Background presets and drag-to-reposition webcam
- Countdown timer before recording
- Cursor highlight + click ripple effects
- Real-time annotations (pen, line, rectangle, arrow, text)
- Zoom (1x-5x) with scroll wheel + pan
- Auto-save to selected folder (File System Access API)
- Quality presets: 720p / 1080p / 2K / Native
- Format: WebM (VP9/VP8/H264) or MP4 (H264)

### Edit Mode
> *Kdenlive-level editing with a modern UI*

**Timeline:**
- Multi-track timeline with unlimited dynamic tracks
- Add / remove / rename tracks
- Per-track mute and lock controls
- Clip splitting at playhead (S key)
- Clip moving between tracks (drag)
- Clip resizing by edge dragging
- Speed control per clip (0.25x to 4x)
- Undo / redo (50-snapshot stack)
- Zoomable timeline (Ctrl+Scroll or +/- buttons)
- Transport controls: Play, Pause, Stop, Seek
- Clip context menu: Split, Duplicate, Speed, Filters, Keyframes, Delete
- Keyboard shortcuts: S=split, Delete=remove, Space=play/pause

**33 Video Filters (Canvas-based):**

| Color & Tone | Effects | Transform |
|---|---|---|
| Brightness | Blur | Mirror |
| Contrast | Grayscale | Flip |
| Saturation | Sepia | Rotate |
| Hue Rotate | Invert | Crop |
| Temperature | Noise | Vignette |
| Tint | Pixelate | Opacity |
| White Balance | Sharpen | Border |
| Color Grade (3-way) | Emboss | Posterize |
| Curves (R/G/B) | Charcoal | Lift / Gamma / Gain |
| Levels | Film Grain | Cartoon |
| | Old Film | Glow |
| | Chroma Key (green screen) | |

**13 Transitions:**
Crossfade, Fade to Black, Wipe (Left/Right/Up/Down), Slide Left, Zoom In, Dissolve, Barn Door, Iris, Clock Wipe, Push

**Keyframe Animation System:**
- Add/remove keyframes per filter parameter
- Interpolation: Linear, Ease-In, Ease-Out, Ease-In-Out
- Visual keyframe dots on clips in timeline
- Parameter animation over time

**14 Audio Effects (Web Audio API):**

| Dynamics | EQ / Filters | Time / Modulation |
|---|---|---|
| Noise Gate | High-Pass Filter | Delay / Echo |
| De-Esser | Low-Pass Filter | Reverb (convolution) |
| Limiter | 3-Band EQ (Low/Mid/High) | Chorus |
| Compressor | | Stereo Widener |
| Volume + Fade In/Out | | |

**Audio Scopes:**
- Real-time waveform visualization
- Frequency spectrum (64-band bar graph)
- Luminance histogram

**Title Templates:**
- Lower Third (professional name/title bar)
- End Card (closing call-to-action)
- Chapter Marker (section break overlay)
- Title Card (centered text on dark background)
- Watermark (semi-transparent corner overlay)

**Other Editing Features:**
- Trim with audio preservation (Web Audio API extraction)
- Auto subtitles via Ollama Whisper or Web Speech API fallback
- Chroma key (green screen removal with HSV distance + alpha)
- Proxy editing (360p for smooth editing, full-res on export)
- Text overlays with fade in/out, rotation, shadow
- Draw annotations (pen, line, rect, arrow, text)

### Stream Mode
> *OBS-quality live streaming from the browser*

- **Stream to YouTube Live** via RTMP relay server
- **Stream to Twitch** or any custom RTMP endpoint
- Platform selector: YouTube / Twitch / Custom
- Stream key configuration with show/hide toggle
- Bitrate control (2.5 Mbps to 12 Mbps)
- Resolution: 720p / 1080p / 1440p
- Real-time stream stats: uptime, bitrate, FPS, bytes sent
- Live indicator badge with pulse animation
- Relay server health check
- WebSocket-based media transport to RTMP bridge
- Scene composition during streaming (switch layouts live)
- All 33 filters and 13 transitions work during stream

**Docker RTMP Relay:**
```
Browser (MediaRecorder) → WebSocket → rtmp-relay (FFmpeg) → YouTube Live
```

### Export Mode
> *One-click export with format/quality control*

- Format selector: WebM (VP9), MP4 (H264), MKV
- Quality presets: 720p / 1080p / 2K
- Direct download to local machine
- **YouTube upload** via Google Identity Services OAuth + YouTube Data API v3
  - Resumable upload with progress bar
  - AI-generated metadata (title, description, tags)
  - Privacy: Public / Unlisted / Private
  - 7 category options
  - Client ID setup flow (user provides their own)
- MP4 conversion via FFmpeg.wasm (planned)

### Settings Page
> *Configure everything in one place*

**Recording Defaults:**
- Default quality (720p / 1080p / 1440p)
- Default format (WebM / MP4 / MKV)

**Editing Preferences:**
- Default transition type
- Timeline snap on/off
- Auto-save on/off

**AI Provider:**
- Ollama connection status + model selector (auto-detects local models)
- Paid API: OpenAI / Anthropic / Custom endpoint
- API key storage (localStorage)
- API endpoint URL
- Model name

**YouTube Upload:**
- Google Cloud OAuth Client ID

---

## 3-Tier AI Assistant

A floating AI assistant available in Edit and Stream modes.

```
Tier 1: Local Regex     → Instant, no LLM needed
Tier 2: Ollama (free)   → Local LLM, runs on your machine
Tier 3: Paid API        → OpenAI / Anthropic / any OpenAI-compatible
```

**17 AI Commands (local regex, instant):**
- Trim, Zoom, Title, Cursor effects, Annotations
- Quality/Format selection, Recording control
- Filter apply/remove, Text overlay, Speed control
- Help, Export, Thumbnail, Description

**Ollama Integration:**
- Auto-discovers running Ollama instances (Docker proxy or localhost)
- Model selector from available models
- System prompt with editing context
- JSON command parsing with fallback regex

**Paid API Fallback:**
- Falls back to OpenAI/Anthropic when Ollama is offline
- Configurable endpoint, key, and model
- Temperature 0.1, max 300 tokens

---

## Docker Deployment

### Quick Start (Docker Desktop)
```bash
docker-compose up --build
# Open http://localhost:3000
```

### With Ollama (AI)
```bash
docker-compose -f docker-compose.vps.yml up --build
# Includes Ollama service with persistent storage
```

### With RTMP Relay (Streaming)
```bash
docker-compose -f docker-compose.full.yml up --build
# Includes screenstudio + ollama + rtmp-relay
```

**3 Compose Files:**
| File | Use Case |
|---|---|
| `docker-compose.yml` | Base app (Ollama on host) |
| `docker-compose.desktop.yml` | Docker Desktop (Ollama on host) |
| `docker-compose.vps.yml` | VPS with Ollama in container |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   TopBar (48px)                       │
│   Logo  |  Record  Edit  Stream  Export  |  Settings  │
├─────────────────────────────────────────────────────┤
│        │                            │                │
│ Tool   │      Canvas / Preview      │   Right        │
│ Side   │      (composited)          │   Panel        │
│ bar    │                            │   (filters,    │
│ (56px) │                            │    properties) │
│        │                            │                │
├────────┴────────────────────────────┴────────────────┤
│              Timeline / Controls (200px)              │
│   tracks | clips | transport | zoom | scopes         │
├─────────────────────────────────────────────────────┤
│            [AI Floating Button]  ↘                    │
│            [AI Chat Drawer]                          │
└─────────────────────────────────────────────────────┘
```

**Tech Stack:**
- React 19 + React Router 7
- Vite 7 (dev server on port 3000)
- Web Audio API (audio effects, mixing, analysis)
- Canvas API (filters, transitions, compositing)
- MediaRecorder API (recording, streaming)
- File System Access API (folder selection)
- Google Identity Services (YouTube OAuth)
- YouTube Data API v3 (resumable upload)
- WebSockets (streaming relay)
- Docker + Nginx (deployment)

---

## Feature Comparison

| Feature | OBS Studio | Loom | Kdenlive | **ScreenStudio** |
|---|---|---|---|---|
| Screen recording | Native app | Browser | - | **Browser** |
| Webcam overlay | Yes | Yes | - | **Yes** |
| Scene composition | Yes | - | - | **Yes** |
| Live streaming (RTMP) | Yes | - | - | **Yes** |
| Multi-track timeline | - | - | Yes | **Yes** |
| Video filters | 50+ | - | 232 | **33** |
| Audio effects | 10+ | - | 242 | **14** |
| Transitions | Yes | - | 20+ | **13** |
| Keyframe animation | - | - | Yes | **Yes** |
| AI assistant | - | - | - | **Yes** |
| YouTube upload | - | Yes | - | **Yes** |
| Shareable links | - | Yes | - | Planned |
| Install required | Yes | No | Yes | **No** |
| Docker support | No | N/A | No | **Yes** |
| Free & open source | Yes | Freemium | Yes | **Yes** |

---

## Getting Started

```bash
# Clone
git clone https://github.com/tajo9128/screenstudio.git
cd screenstudio

# Install
npm install

# Run (port 3000)
npm run dev

# Build
npm run build

# Docker
docker-compose up --build
```

Open **http://localhost:3000** in Chrome/Edge.

---

## License

MIT
