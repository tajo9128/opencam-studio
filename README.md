# ScreenStudio

<div align="center">
  <h1>Free, Private Screen Recorder</h1>
  <p><b>100% Private, Local-First, Browser-Based Screen Studio. No login, no limits, no cost.</b></p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
  [![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()
</div>

---

## Why ScreenStudio?

| Feature | Loom / Tella / Cap | ScreenStudio |
| :--- | :--- | :--- |
| **Price** | $12-15/mo | **$0 (Free forever)** |
| **Privacy** | Cloud-stored | **Local-first** |
| **Login** | Required | **No login** |
| **Install** | Required | **Zero install** |
| **Quality** | Paid for 2K | **Free 2K** |

---

## Features

- **Screen + Webcam overlay** — circle, rounded, or square webcam shapes
- **2K recording** — 720p, 1080p, 1440p quality presets
- **Multiple formats** — MP4 (H.264), WebM (VP9/VP8), MKV
- **Studio backgrounds** — 8 gradient presets
- **Pause/resume** recording
- **Audio level meter** — real-time mic visualization
- **Keyboard shortcuts** — Space (record/stop), P (pause), Esc (cancel)
- **Local file library** — browse, rename, delete recordings
- **Dark/light theme**

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

## Tech Stack

- React 19 + Vite 7
- MediaRecorder API + Canvas compositing
- File System Access API (local storage)
- IndexedDB (settings)
- Deployed on Vercel

---

## Build

```bash
npm run build
npm run preview
```

---

## License

MIT
