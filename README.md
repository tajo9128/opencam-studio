# ScreenStudio

<div align="center">
  <h1>Free, Private Screen Recorder + AI Assistant</h1>
  <p><b>100% Private, Local-First, Browser-Based. No login, no limits, no cost.</b></p>
  <p>Records screen + webcam. Edits via AI chat. Uploads to YouTube. All free.</p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
</div>

---

## Why ScreenStudio?

| Feature | Loom ($15/mo) | Tella ($15/mo) | Dadan ($10/mo) | ScreenStudio ($0) |
|---|---|---|---|---|
| Unlimited recording | 5-25 min | paid | yes | yes |
| Local storage | no | no | no | yes |
| AI editing (chat) | no | no | no | yes (Ollama) |
| YouTube upload | no | no | no | yes |
| 2K recording | paid | paid | yes | yes |
| Annotations | no | yes | yes | yes |
| Cursor FX | no | yes | no | yes |
| Open source | no | no | no | yes |
| No login | no | no | no | yes |

---

## Quick Start

```bash
git clone https://github.com/tajo9128/screenstudio.git
cd screenstudio
npm install
npm run dev
```

Open `http://localhost:5173` and click **Launch Studio**.

---

## Docker (with Ollama AI)

```bash
docker compose up -d
```

Opens at `http://localhost:3000` with Ollama AI sidecar on port 11434.

### Pull an Ollama model
```bash
docker exec -it screenstudio-ollama-1 ollama pull gemma3
```

Then open the AI chat panel in the app and start editing with natural language.

---

## Features

### Recording
- Screen + webcam overlay (circle, rounded, square shapes)
- Webcam-only mode (talking head videos)
- 720p / 1080p / 1440p quality presets
- MP4 (H.264), WebM (VP9/VP8), MKV export
- 8 gradient studio backgrounds
- Pause/resume recording
- Recording timer (MM:SS)
- Audio level meter

### Editing
- **AI Chat** — "trim first 5 seconds", "add zoom at 0:30", "set quality to 720p"
- **Annotations** — pen, line, rectangle, arrow, text, eraser with undo/redo
- **Cursor FX** — highlight circle + click ripple effects
- **Zoom & Pan** — scroll to zoom (1x-5x), drag to pan, double-click reset

### Export
- Save to local folder (File System Access API)
- **YouTube upload** — direct from app via Google OAuth2
- GIF export (coming soon)

### AI (Ollama)
- Connects to local Ollama instance (free, private)
- Natural language commands: "trim", "zoom", "add title", etc.
- Falls back to local pattern matching (no Ollama needed for basic commands)
- Optional API key for OpenAI/Anthropic/compatible endpoints

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Start/stop recording |
| `P` | Pause/resume recording |
| `Esc` | Cancel countdown |

---

## Tech Stack

- React 19 + Vite 7
- MediaRecorder API + Canvas compositing
- File System Access API (local storage)
- IndexedDB (settings)
- Ollama API (local AI)
- Google Identity Services (YouTube OAuth)
- nginx + Docker

---

## Build

```bash
npm run build       # Production build
npm run preview     # Preview locally
docker compose up   # Docker with Ollama
```

---

## License

MIT
