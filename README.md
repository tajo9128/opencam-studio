<p align="center">
  <img src="public/favicon.svg" width="80" alt="OpenCam Studio Logo">
</p>

<h1 align="center">OpenCam Studio</h1>

<p align="center">
  <strong>Record. Edit. Stream. Export. &mdash; All in your browser.</strong>
</p>

<p align="center">
  Free &bull; Open Source &bull; Docker-Ready &bull; AI-Powered &bull; No Install Required
</p>

<p align="center">
  <a href="https://github.com/tajo9128/opencam-studio/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/platform-Chrome%20%7C%20Edge%20%7C%20Firefox-brightgreen" alt="Platforms">
  <img src="https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker Ready">
</p>

---

## What is OpenCam Studio?

OpenCam Studio is a **browser-based screen recorder, video editor, and live streamer** &mdash; no downloads, no installs, no accounts required. It runs entirely in your browser, or as a Docker container on your server.

| | Feature | Details |
|---|---|---|
| **Record** | Screen + Webcam + Audio | One-click capture with PiP overlay, cursor effects, annotations |
| **Record (Server)** | Docker-backed recording | WebSocket chunk streaming, server-side FFmpeg conversion, 480p proxy |
| **Edit** | Multi-track timeline | Split, trim, move clips. 33 filters, 13 transitions, keyframes |
| **Edit (Server)** | MLT-powered editing | Project CRUD, video upload, proxy-based preview, melt CLI rendering |
| **Stream** | YouTube Live / Twitch | RTMP relay with FFmpeg, scene composition, real-time stats |
| **Export** | YouTube upload + local download | OAuth flow, AI-generated metadata, resumable upload |
| **AI** | 3-tier assistant | Regex commands, Ollama (local LLM), paid API fallback |

---

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Pull and run
docker run -p 3000:80 tajo9128/opencam-studio:v1.0.0

# Open http://localhost:3000
```

### Option 2: Docker Compose (Full Stack)

```bash
# Clone the repo
git clone https://github.com/tajo9128/opencam-studio.git
cd opencam-studio

# Start everything (app + RTMP relay + recording server + project server)
docker compose -f docker-compose.full.yml up -d

# Open http://localhost:3000
```

### Option 3: Development

```bash
git clone https://github.com/tajo9128/opencam-studio.git
cd opencam-studio
npm install

# Start the project server (needed for MLT editing)
cd server && npm install && cd ..

npm run dev

# Open http://localhost:3000
```

---

## Docker Architecture

The app uses three microservices behind an Nginx reverse proxy:

```
Browser ──> Nginx (:3000)
                │
                ├──> Frontend (static files)
                ├──> recording-server (:8081) — WebSocket chunk receiver + FFmpeg converter
                ├──> project-server (:8082) — Project CRUD + proxy gen + melt renderer
                └──> ollama (:11434) — Local LLM (optional)
```

### recording-server

Handles the **live recording** pipeline:

1. Browser streams WebM chunks via WebSocket (`/ws/record`)
2. Server reassembles chunks into a raw WebM file
3. On stop, FFmpeg converts WebM → MP4 (source) + 480p MP4 (proxy)
4. Video served via HTTP range requests (browser never downloads the full file)

### project-server

Handles the **video editing** pipeline using MLT framework + melt CLI:

1. Upload video → server generates 480p proxy (FFmpeg) → stores source + proxy
2. Frontend edits timeline (JSON) → server auto-saves via REST
3. On render → converts JSON timeline to MLT XML → spawns `melt` CLI → serial job queue
4. Output download or re-use as source for further editing

---

## Docker Images

| Image | Description | Tag |
|---|---|---|
| `tajo9128/opencam-studio` | Frontend (Nginx) | `v1.0.0` |
| `tajo9128/opencam-studio-relay` | RTMP relay server | `v1.0.0` |
| `opencam-recording:latest` | Recording server (FFmpeg + Node) | Build locally |
| `opencam-project:latest` | MLT + Node.js project server | Build locally |

### Docker Compose Files

| File | Use Case |
|---|---|
| `docker-compose.yml` | Base: App + RTMP Relay + Recording Server + Project Server |
| `docker-compose.desktop.yml` | Docker Desktop (Ollama on host) |
| `docker-compose.vps.yml` | VPS with Ollama in container |
| `docker-compose.full.yml` | Full stack: App + Ollama + RTMP Relay + Recording + Project |

### Network Ports

| Port | Service |
|---|---|
| `3000` | Nginx (frontend + API proxy) |
| `8080` | RTMP relay server |
| `8081` | Recording server |
| `8082` | Project server (MLT) |
| `11434` | Ollama (local LLM) |

---

## 6 Modes

### 1. Record

> One-click screen recording with professional features

- Screen / Window / Tab capture
- Webcam overlay (circle, rounded-rect, square shapes)
- System audio + microphone recording
- Cursor highlight + click ripple effects
- Real-time annotations (pen, line, rectangle, arrow, text)
- Zoom (1x&ndash;5x) with scroll wheel + pan
- Auto-save to selected folder
- Quality: 720p / 1080p / 2K / Native
- Format: WebM (VP9/VP8/H264) or MP4

#### Server Recording (New)

When running inside Docker, recording can be delegated to the server:

- Browser streams chunks via WebSocket instead of assembling a full blob in memory
- Server converts WebM → MP4 with FFmpeg post-recording
- 480p proxy generated automatically for fast preview in the editor
- Videos served via HTTP range requests — browser never downloads the full file
- Supports large files (10GB+) that would crash browser memory

### 2. Edit

> Multi-track timeline with 33 filters and 13 transitions, plus server-backed rendering

#### Browser Editing

**Timeline:**
- Unlimited tracks with mute/lock
- Clip split (S key), move, resize, speed (0.25x&ndash;4x)
- Undo/redo (50-snapshot stack)
- Keyboard: Space = play/pause, S = split, Delete = remove

**33 Video Filters:**

| Color & Tone | Effects | Transform |
|---|---|---|
| Brightness, Contrast | Blur, Sharpen | Mirror, Flip |
| Saturation, Hue | Grayscale, Sepia | Rotate, Crop |
| Temperature, Tint | Noise, Pixelate | Vignette, Opacity |
| White Balance | Posterize, Cartoon | Border |
| Color Grade (3-way) | Film Grain, Old Film | Lift/Gamma/Gain |
| Curves (R/G/B), Levels | Chroma Key (green screen) | Emboss, Glow |

**13 Transitions:**
Crossfade, Fade to Black, Wipe (L/R/U/D), Slide, Zoom, Dissolve, Barn Door, Iris, Clock Wipe, Push

**Keyframe Animation:**
- Per-parameter keyframes with interpolation (Linear, Ease-In/Out)
- Visual keyframe dots on timeline clips

**14 Audio Effects:**
Noise Gate, De-Esser, Limiter, Compressor, 3-Band EQ, High/Low-Pass, Delay/Echo, Reverb, Chorus, Stereo Widener, Fade In/Out

#### Server Editing (New)

When connected to the project-server (Docker), the editor gains:

- **Project system** — Create, list, delete projects via `/projects` page
- **Upload** — Drag-and-drop video upload to Docker backend
- **Proxy-based preview** — 480p proxy for smooth playback, thumbnail extraction
- **Auto-save** — Timeline changes saved to server every 2 seconds
- **Render queue** — Select preset (MP4 1080p/720p/480p, WebM 1080p), spawn melt CLI render
- **MLT rendering** — JSON timeline converted to MLT XML, rendered via melt with progress tracking

### 3. Stream

> Live stream to YouTube Live or Twitch from your browser

- RTMP relay with automatic reconnection (3 retries)
- Platform presets: YouTube Live, Twitch, Custom RTMP
- Configurable bitrate (2.5&ndash;12 Mbps) and resolution (720p/1080p/1440p)
- Real-time stats: uptime, bitrate, FPS, bytes sent
- Scene composition during stream
- Simultaneous record + stream

### 4. Webinar

> Present with scenes, Q&A, and audience engagement

- 4 default scenes (Screen Only, Camera+Screen PiP, Full Camera, Side-by-Side)
- Lower Third name/title overlay
- Audio mixer with per-source volume
- Replay buffer (15s/30s/60s)

### 5. Export

> Download or upload your recording

- Format selection: WebM, MP4, MKV
- Quality presets: 720p / 1080p / 2K
- Direct YouTube upload with OAuth
- AI-generated metadata (title, description, tags)

### 6. Settings

> Configure AI providers, recording defaults, and YouTube OAuth

---

## AI Assistant

A floating AI assistant available in Edit and Stream modes.

```
Tier 1: Regex Commands  -->  Instant, no LLM needed (17 commands)
Tier 2: Ollama (Free)   -->  Local LLM on your machine
Tier 3: Paid API        -->  OpenAI / Anthropic / any OpenAI-compatible API
```

**Supported Commands:** Trim, Zoom, Title, Cursor, Annotations, Quality, Format, Filter, Text, Speed, Export, Help

---

## Browser Support

| Browser | Recording | Editing | Streaming |
|---|---|---|---|---|
| Chrome 90+ | Full | Full | Full |
| Edge 90+ | Full | Full | Full |
| Firefox 90+ | Full | Full | Full |
| Safari 17+ | Partial | Partial | No |

> Screen capture requires `getDisplayMedia` API. Safari has limited support.

---

## Tech Stack

- **Frontend:** React 19 + React Router 7 + Vite 7
- **Recording:** MediaRecorder API + Canvas API + Web Audio API
- **Editing:** Canvas compositing, Web Audio offline processing
- **Server Recording:** Node.js + WebSocket + FFmpeg (WebM → MP4 + proxy)
- **Server Editing:** Node.js + Express + MLT 7.26 (melt CLI) + FFmpeg
- **Streaming:** WebSocket + FFmpeg (RTMP relay server)
- **AI:** Ollama integration + OpenAI/Anthropic fallback
- **Deployment:** Docker + Nginx + Node.js (3 microservices)

---

## Server Files

| File | Purpose |
|---|---|
| `server/recording-server.js` | WebSocket chunk receiver, FFmpeg conversion, HTTP range serving |
| `server/project-server.js` | Express API: project CRUD, upload, thumbnail, MLT export, render queue |
| `server/mlt-xml.js` | JSON timeline → MLT XML converter |
| `server/job-queue.js` | Serial melt CLI render queue with frame progress tracking |
| `server/Dockerfile.recording` | FFmpeg + Node.js Docker image for recording server |
| `server/Dockerfile.project` | MLT 7.26 (built from source) + FFmpeg + Node.js Docker image |

---

## Contributing

```bash
# Fork, clone, install
git clone https://github.com/tajo9128/opencam-studio.git
cd opencam-studio
npm install
cd server && npm install && cd ..

# Create feature branch
git checkout -b feature/my-feature

# Make changes, test
npm run dev     # Frontend dev server
node server/project-server.js   # Project server (for MLT editing)
node server/recording-server.js # Recording server (for server recording)

npm run build
npm run lint

# Push and open PR
git push origin feature/my-feature
```

---

## License

[MIT](LICENSE) &mdash; free for personal and commercial use.

---

<p align="center">
  Made with &hearts; for creators, educators, and streamers worldwide.
</p>
