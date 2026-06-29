# Contributing to OpenCam Studio

First off, thank you for considering contributing to OpenCam Studio! It's people like you that make this project great.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [What is OpenCam Studio?](#what-is-opencam-studio)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Branching Strategy](#branching-strategy)
- [Pull Request Process](#pull-request-process)
- [Coding Guidelines](#coding-guidelines)
- [Areas Where Help is Needed](#areas-where-help-is-needed)

## Code of Conduct

By participating in this project, you are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## What is OpenCam Studio?

OpenCam Studio is the hybrid of **OBS Studio** + **Loom** + **Kdenlive** — a free, open-source, browser-based screen recorder + video editor + live streamer + webinar tool. It features:

- **6 modes**: Record, Edit, Stream, Webinar, Export, Settings
- **33 video filters**, **13 transitions**, **14 audio effects**
- **3-tier AI assistant** (local regex → Ollama → paid API)
- **YouTube Live streaming** via RTMP relay
- **Scene composition** (OBS-style sources and layers)
- **Docker deployment** with Ollama and RTMP relay

## How Can I Contribute?

### Reporting Bugs

* **Check for existing issues** before opening a new one.
* **Use the bug report template** and provide as much context as possible:
  - Browser and version (Chrome, Edge, Firefox)
  - OS (Windows, macOS, Linux)
  - Steps to reproduce
  - Expected vs actual behavior
  - Console errors (if any)
  - Screenshots or screen recordings

### Suggesting Enhancements

* **Open an issue** with the `enhancement` label.
* Describe the feature, why it would be useful, and which mode it relates to (Record/Edit/Stream/Webinar/Export).
* If possible, reference similar features in OBS Studio, Loom, or Kdenlive.

### Submitting Pull Requests

1. **Fork the repository** and create your branch from `master`.
2. **Install dependencies**: `npm install`
3. **Make your changes** following the coding guidelines below.
4. **Test thoroughly**: `npm run dev` and verify in the browser at localhost:3000.
5. **Build check**: `npm run build` must pass with no errors.
6. **Submit a Pull Request** with a clear description of your changes.

### Other Ways to Contribute

* **Improve documentation** — README, code comments, wiki
* **Add tests** — We currently lack unit tests; help us add them
* **Design feedback** — UI/UX suggestions for the 6 modes
* **Accessibility** — Help make OpenCam Studio usable for everyone
* **Translations** — i18n support is planned

## Development Setup

```bash
# Clone your fork
git clone https://github.com/tajo9128/opencam-studio.git
cd opencam-studio

# Install dependencies
npm install

# Start dev server (port 3000)
npm run dev

# Build for production
npm run build

# Docker (optional — for testing RTMP relay)
docker-compose up --build
```

### Prerequisites

- **Node.js** 18+ and npm 9+
- **Chrome or Edge** (for best WebRTC/MediaRecorder support)
- **Ollama** (optional — for AI features)
- **Docker** (optional — for full stack testing)

### AI Setup (Optional)

1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull llama3.2`
3. The app auto-detects Ollama at localhost:11434

### Streaming Setup (Optional)

1. Start the RTMP relay: `docker-compose up rtmp-relay`
2. Get a stream key from YouTube Studio > Stream
3. Enter the key in Stream mode > Go Live > Stream Key

## Project Structure

```
opencam-studio/
├── src/
│   ├── components/
│   │   ├── AppShell/          # App layout (TopBar + sidebar + main + bottom)
│   │   ├── TopBar/            # Mode tabs (Record/Edit/Stream/Webinar/Export)
│   │   ├── RecordMode/        # Screen recording UI
│   │   ├── EditMode/          # Timeline + filters + AI editing
│   │   ├── Streaming/         # Live streaming (StreamMode, StreamPanel)
│   │   ├── Webinar/           # Webinar mode (camera+screen+lower third)
│   │   ├── ExportMode/        # Export + YouTube upload
│   │   ├── Settings/          # AI provider, recording, streaming config
│   │   ├── Timeline/          # Multi-track timeline with clips
│   │   ├── Filters/           # Filter panel (33 filters)
│   │   ├── Scenes/            # Scene switcher (OBS-style)
│   │   ├── Sources/           # Source panel (add/remove/configure)
│   │   ├── Audio/             # Mixer panel (per-source volume)
│   │   ├── AI/                # Floating AI assistant
│   │   ├── Chat/              # Chat panel (legacy, being replaced by AI)
│   │   ├── Controls/          # ControlBar (recording controls)
│   │   ├── Preview/           # Canvas preview stage
│   │   ├── Sidebar/           # Tool sidebar + history sidebar
│   │   ├── Modals/            # YouTube upload, trim, save modals
│   │   └── ...
│   ├── hooks/
│   │   ├── useScenes.js       # Scene CRUD, switching, persistence
│   │   ├── useStreaming.js    # MediaRecorder → WebSocket → RTMP
│   │   ├── useReplayBuffer.js # Circular buffer, save last N seconds
│   │   ├── useTimeline.js     # Timeline with undo/redo, keyframes, tracks
│   │   ├── useAI.js           # 3-tier AI (regex → Ollama → API)
│   │   ├── useRecording.js    # MediaRecorder wrapper
│   │   ├── useStreams.js      # Screen/camera/mic stream management
│   │   ├── useAnnotation.js   # Draw annotations on canvas
│   │   ├── useYouTube.js      # YouTube upload via GIS + Data API v3
│   │   ├── useSubtitles.js    # Auto subtitles (Whisper / Web Speech)
│   │   └── ...
│   ├── utils/
│   │   ├── FilterEngine.js    # 33 canvas-based video filters
│   │   ├── AudioEngine.js     # 14 Web Audio API effects
│   │   ├── Transitions.js     # 13 canvas-based transitions
│   │   ├── TitleTemplates.js  # Lower third, end card, chapter marker
│   │   ├── ProxyManager.js    # Low-res proxy editing
│   │   ├── CommandExecutor.js # AI command → app action mapping
│   │   ├── MediaManager.js    # MediaRecorder + encoding
│   │   └── ...
│   ├── context/
│   │   └── ThemeContext.jsx    # Dark/light theme
│   └── App.jsx                # Routes: /, /recorder, /editor, /stream, /webinar, /export, /settings
├── server/
│   ├── rtmp-relay.js          # WebSocket → FFmpeg → RTMP relay
│   ├── Dockerfile             # Relay Docker image
│   └── package.json
├── public/
├── docker-compose.yml         # Base: opencam-studio + rtmp-relay
├── docker-compose.vps.yml     # VPS: + Ollama
├── docker-compose.full.yml    # Full: opencam-studio + Ollama + RTMP relay
├── Dockerfile                 # Multi-stage: Node build → Nginx serve
└── vite.config.js             # Vite config (port 3000)
```

## Branching Strategy

* `master` — Stable version. All PRs target this branch.
* `feature/*` — New features (e.g., `feature/chroma-key-ui`)
* `fix/*` — Bug fixes (e.g., `fix/trim-audio-sync`)
* `docs/*` — Documentation changes

## Pull Request Process

1. **Create a descriptive PR title** — e.g., "Add noise suppression audio filter"
2. **Fill out the PR template** with:
   - What changed and why
   - Which mode(s) are affected (Record/Edit/Stream/Webinar/Export)
   - Testing steps
   - Screenshots (for UI changes)
3. **CI must pass** — `npm run build` must succeed
4. **Maintainer review** — @tajo9128 will review all PRs
5. **Approval required** — No code merges to `master` without approval

## Coding Guidelines

### General

* **No TypeScript** — This is a plain JavaScript + JSX project
* **No UI libraries** — Pure CSS with CSS variables (no Tailwind, no MUI)
* **No state management libraries** — React hooks + context only
* **Keep it browser-native** — Web Audio API, Canvas API, MediaRecorder API

### CSS

* Use CSS variables defined in `index.css` (`--primary`, `--glass`, etc.)
* Dark theme is default, light theme via `[data-theme="light"]`
* Component CSS in co-located `.css` files (e.g., `Timeline.jsx` + `Timeline.css`)
* Glassmorphism aesthetic: `backdrop-filter: blur()`, `--glass` backgrounds

### Components

* Functional components with hooks only (no class components)
* Named exports for components, default exports for pages
* Props destructured in function signature
* Keep components under 300 lines — split if larger

### Hooks

* Custom hooks in `src/hooks/` with `use` prefix
* One hook per concern (e.g., `useScenes`, `useStreaming`)
* Return an object with state + actions

### Utilities

* Pure functions in `src/utils/` (no React dependencies)
* Canvas/rendering functions take `(ctx, canvas, params)` signature
* Export named functions, not default objects

### AI Integration

* All AI commands go through `CommandExecutor.js`
* New commands: add regex pattern to `aiPrompts.js` + handler to `CommandExecutor`
* 3-tier fallback: local regex → Ollama → paid API

## Areas Where Help is Needed

### High Priority
* **Unit tests** — We have zero tests. Help us add them with Vitest.
* **Accessibility** — Keyboard navigation, screen reader support, ARIA labels
* **Firefox compatibility** — Some WebRTC features are Chrome-only
* **Performance** — Canvas rendering optimization for 4K sources

### Medium Priority
* **i18n** — Internationalization support
* **More title templates** — Additional overlay designs
* **More audio effects** — Pitch shift, time stretch, noise profiling
* **Keyboard shortcut editor** — Let users customize hotkeys

### Documentation
* **API documentation** — Document all hooks and utils
* **Architecture guide** — Explain the scene/source/filter pipeline
* **Deployment guide** — Docker, VPS, and cloud deployment walkthroughs

## Questions?

Open an issue with the `question` label or start a discussion in the repository.

Thank you for helping build the future of browser-based screen recording, editing, and streaming!
