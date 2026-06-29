# MLT Docker Video Editor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Docker-backed professional video editor using MLT + melt for rendering, with proxy-based preview in the React frontend.

**Architecture:** React frontend communicates via REST with a Node.js `project-server.js` that manages projects, converts JSON timeline to MLT XML, and spawns `melt` CLI for rendering inside Docker. Shared volumes store source videos, proxies, project files, and output.

**Tech Stack:** React (frontend), Node.js/Express (project-server), MLT/melt (rendering engine), FFmpeg (proxy generation), Docker Compose

**Prerequisites:**
- Existing project with `server/recording-server.js`, `nginx-docker.conf`, `docker-compose.yml`
- Existing React components: `EditMode.jsx`, `useTimeline.js`, `ScreenRecorder.jsx`
- Existing `server/Dockerfile.recording` as reference for Docker image builds

---

### Task 1: Create Dockerfile.project (MLT + Node.js base image)

**Files:**
- Create: `server/Dockerfile.project`
- Reference: `server/Dockerfile.recording`

**Step 1: Create Dockerfile.project**

Write a multi-stage Docker build:
- Stage 1 (builder): `alpine:3.20`, install build deps, compile MLT 7.x from source (or use apk packages if available)
- Stage 2 (runtime): `alpine:3.20`, copy melt binary + libraries, install FFmpeg, frei0r-plugins, Node.js 22

```dockerfile
# Stage 1: Build MLT
FROM alpine:3.20 AS builder
RUN apk add --no-cache \
    build-base git cmake samurai pkgconf \
    ffmpeg-dev ffmpeg-static \
    libxml2-dev sdl2-dev sox-dev \
    libsamplerate-dev jack-dev \
    python3

WORKDIR /build
RUN git clone --depth 1 --branch v7.38.0 https://github.com/mltframework/mlt.git
WORKDIR /build/mlt
RUN mkdir build && cd build && \
    cmake .. -GNinja \
    -DCMAKE_BUILD_TYPE=Release \
    -DMOD_AVFORMAT=ON \
    -DMOD_FREI0R=ON \
    -DMOD_SOX=ON \
    -DMOD_SDL2=ON \
    -DMOD_XML=ON && \
    ninja && \
    DESTDIR=/mlt-runtime ninja install

# Stage 2: Runtime
FROM alpine:3.20
RUN apk add --no-cache \
    ffmpeg frei0r-plugins \
    nodejs npm \
    libstdc++ libgcc \
    sdl2 sox libsamplerate \
    libxml2

COPY --from=builder /mlt-runtime /
ENV MLT_PATH=/usr/local/lib/mlt
ENV PATH=$PATH:/usr/local/bin

WORKDIR /app
EXPOSE 8082
CMD ["node", "project-server.js"]
```

**Step 2: Verify Dockerfile builds**

Run: `docker build -f server/Dockerfile.project -t opencam-project:latest .`
Expected: Build succeeds, `docker run --rm opencam-project:latest melt --version` prints MLT version

**Step 3: Commit**

```bash
git add server/Dockerfile.project
git commit -m "feat: add MLT Docker image with melt + Node.js runtime"
```

---

### Task 2: Create project-server.js skeleton

**Files:**
- Create: `server/project-server.js`
- Reference: `server/recording-server.js` for patterns (range file serving, CORS, etc.)

**Step 1: Create project-server.js with Express + project CRUD**

```javascript
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const PORT = process.env.PORT || 8082;
const VIDEOS_DIR = process.env.VIDEOS_DIR || '/videos';
const PROXIES_DIR = process.env.PROXIES_DIR || '/proxies';
const PROJECTS_DIR = process.env.PROJECTS_DIR || '/projects';
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/output';

for (const dir of [VIDEOS_DIR, PROXIES_DIR, PROJECTS_DIR, OUTPUT_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Create project
app.post('/api/projects', (req, res) => {
    const { name, width = 1920, height = 1080, fps = 30 } = req.body;
    const id = require('crypto').randomBytes(8).toString('hex');
    const projDir = path.join(PROJECTS_DIR, id);
    fs.mkdirSync(projDir, { recursive: true });
    const project = {
        id, name, width, height, fps,
        clips: [],
        timeline: { tracks: [] },
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    fs.writeFileSync(path.join(projDir, 'project.json'), JSON.stringify(project, null, 2));
    res.json(project);
});

// Get project
app.get('/api/projects/:id', (req, res) => {
    const filePath = path.join(PROJECTS_DIR, req.params.id, 'project.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
});

// Save timeline
app.put('/api/projects/:id/timeline', (req, res) => {
    const filePath = path.join(PROJECTS_DIR, req.params.id, 'project.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const project = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    project.timeline = req.body;
    project.updatedAt = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2));
    res.json({ ok: true });
});

// List projects
app.get('/api/projects', (req, res) => {
    const items = fs.readdirSync(PROJECTS_DIR).filter(f => {
        return fs.statSync(path.join(PROJECTS_DIR, f)).isDirectory();
    }).map(id => {
        try {
            const p = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, id, 'project.json'), 'utf8'));
            return { id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt };
        } catch { return null; }
    }).filter(Boolean);
    res.json(items);
});

// Delete project
app.delete('/api/projects/:id', (req, res) => {
    const dir = path.join(PROJECTS_DIR, req.params.id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
});

// File serving for proxies
app.get('/api/videos/:id', (req, res) => {
    const filePath = path.join(PROXIES_DIR, req.params.id);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const mime = filePath.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
    serveFile(res, filePath, mime);
});

// Source file serving
app.get('/api/videos/:id/source', (req, res) => {
    const filePath = path.join(VIDEOS_DIR, req.params.id);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const mime = filePath.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
    serveFile(res, filePath, mime);
});

function serveFile(res, filePath, mimeType) {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': mimeType,
            'Access-Control-Allow-Origin': '*',
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
        });
        fs.createReadStream(filePath).pipe(res);
    }
}

app.listen(PORT, () => {
    console.log(`[project-server] Running on port ${PORT}`);
});
```

**Step 2: Run server and test CRUD**

Run: `cd server && node project-server.js`
Run: `curl -s http://localhost:8082/api/projects | node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d)))"`
Expected: Empty array `[]`

Run: `curl -s -X POST -H 'Content-Type: application/json' -d '{"name":"Test"}' http://localhost:8082/api/projects`
Expected: JSON with `{ id: "...", name: "Test", ... }`

**Step 3: Commit**

```bash
git add server/project-server.js
git commit -m "feat: add project CRUD API server"
```

---

### Task 3: Implement upload endpoint with proxy generation

**Files:**
- Modify: `server/project-server.js`
- Reference: `server/recording-server.js` for FFmpeg spawn patterns

**Step 1: Add upload + proxy generation route**

Add before `app.listen(...)`:

```javascript
const multer = require('multer');

const upload = multer({ dest: path.join(VIDEOS_DIR, '.uploads') });

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const clipId = require('crypto').randomBytes(12).toString('hex');
        const ext = path.extname(req.file.originalname) || '.mp4';
        const sourcePath = path.join(VIDEOS_DIR, `${clipId}${ext}`);
        const proxyPath = path.join(PROXIES_DIR, `${clipId}.mp4`);
        
        // Move uploaded file to videos dir
        fs.renameSync(req.file.path, sourcePath);
        
        // Generate proxy
        await runFfmpeg([
            '-i', sourcePath,
            '-vf', 'scale=854:480',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '28',
            '-an',
            '-movflags', '+faststart',
            '-y', proxyPath,
        ]);
        
        // Get duration
        const duration = await getMediaDuration(sourcePath);
        
        res.json({
            clipId,
            originalName: req.file.originalname,
            sourceUrl: `/api/videos/${clipId}/source`,
            proxyUrl: `/api/videos/${clipId}`,
            duration,
            size: fs.statSync(sourcePath).size,
        });
    } catch (err) {
        console.error('[project-server] Upload error:', err);
        res.status(500).json({ error: err.message });
    }
});

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', args);
        let stderr = '';
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => {
            if (code === 0) resolve(stderr);
            else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-500)}`));
        });
        proc.on('error', reject);
    });
}

function getMediaDuration(filePath) {
    return new Promise((resolve, reject) => {
        const proc = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'csv=p=0',
            filePath,
        ]);
        let out = '';
        proc.stdout.on('data', d => out += d.toString());
        proc.on('close', code => {
            if (code === 0) resolve(parseFloat(out.trim()) || 0);
            else reject(new Error('ffprobe failed'));
        });
        proc.on('error', reject);
    });
}
```

**Step 2: Add multer to dependencies**

Run: `cd server && npm install multer`

**Step 3: Test upload**

Run: `cd server && node project-server.js`
Run: `curl -s -F "file=@test.mp4" http://localhost:8082/api/upload`
Expected: JSON with clipId, proxyUrl, duration

**Step 4: Verify proxy file exists**

Run: `ls "$(dirname "$(curl -s http://localhost:8082/api/projects | ...)")"`
Expected: proxy MP4 in proxies directory

**Step 5: Commit**

```bash
git add server/project-server.js server/package.json server/package-lock.json
git commit -m "feat: add video upload with proxy generation"
```

---

### Task 4: Implement JSON-to-MLT XML converter

**Files:**
- Create: `server/mlt-xml.js`
- Modify: `server/project-server.js` (add export-mlt endpoint)

**Step 1: Create `server/mlt-xml.js`**

```javascript
const { xml } = require('@xmldom/xmldom');

/**
 * Convert project JSON timeline to MLT XML string for melt.
 * 
 * Input timeline format:
 * {
 *   tracks: [
 *     {
 *       id: "track-1",
 *       type: "video",
 *       clips: [
 *         {
 *           clipId: "abc123",
 *           sourceStart: 10,      // seconds
 *           sourceEnd: 30,
 *           trackStart: 0,
 *           speed: 1,
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
function jsonToMlt(project, clips) {
    const { id, name, width, height, fps, timeline } = project;
    
    let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
    xml += '<mlt LC_NUMERIC="C">\n';
    
    // Profile
    xml += `  <profile description="HD ${height}p" width="${width}" height="${height}" 
               progressive="1" frame_rate_num="${fps}" frame_rate_den="1"
               display_aspect_num="16" display_aspect_den="9"
               colorspace="bt709"/>\n`;
    
    if (!timeline || !timeline.tracks || timeline.tracks.length === 0) {
        xml += '</mlt>';
        return xml;
    }
    
    // Collect all unique clip references
    const addedClips = new Set();
    
    // Create producers for each unique clip
    for (const track of timeline.tracks) {
        for (const clip of (track.clips || [])) {
            if (clip.clipId && !addedClips.has(clip.clipId)) {
                addedClips.add(clip.clipId);
                const clipInfo = clips[clip.clipId] || {};
                const resource = clipInfo.sourceUrl || `/videos/${clip.clipId}.mp4`;
                xml += `  <producer id="clip-${clip.clipId}">
                <property name="resource">${escapeXml(resource)}</property>
                <property name="mlt_service">avformat</property>
              </producer>\n`;
            }
        }
    }
    
    // Create playlists for each track
    for (const track of timeline.tracks) {
        xml += `  <playlist id="track-${track.id}">\n`;
        for (const clip of (track.clips || [])) {
            const inFrames = Math.round((clip.sourceStart || 0) * fps);
            const outFrames = Math.round((clip.sourceEnd || 10) * fps);
            const startFrame = Math.round((clip.trackStart || 0) * fps);
            xml += `    <entry producer="clip-${clip.clipId}" in="${inFrames}" out="${outFrames}">
              <property name="start">${startFrame}</property>
            </entry>\n`;
        }
        xml += `  </playlist>\n`;
    }
    
    // Create tractor (timeline)
    xml += `  <tractor id="maintractor" global_feed="1">\n`;
    xml += `    <multitrack>\n`;
    for (const track of timeline.tracks) {
        xml += `      <track producer="track-${track.id}"/>\n`;
    }
    xml += `    </multitrack>\n`;
    
    // Video transition (composite for multi-track)
    if (timeline.tracks.length > 1) {
        for (let i = 1; i < timeline.tracks.length; i++) {
            xml += `    <transition id="trans-${i}">
              <property name="a_track">0</property>
              <property name="b_track">${i}</property>
              <property name="mlt_service">composite</property>
              <property name="always_active">1</property>
            </transition>\n`;
        }
    }
    
    xml += `  </tractor>\n`;
    xml += '</mlt>';
    
    return xml;
}

function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { jsonToMlt };
```

**Step 2: Add export-mlt endpoint to project-server.js**

```javascript
const { jsonToMlt } = require('./mlt-xml');

app.get('/api/projects/:id/export-mlt', (req, res) => {
    const filePath = path.join(PROJECTS_DIR, req.params.id, 'project.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const project = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Load clip info
    const clips = {};
    for (const clip of (project.clips || [])) {
        clips[clip.clipId] = clip;
    }
    
    const mltXml = jsonToMlt(project, clips);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${project.name}.mlt"`);
    res.send(mltXml);
});
```

**Step 3: Install dependency**

Run: `cd server && npm install @xmldom/xmldom`

**Step 4: Test converter**

Create a test script or test via API:
- Create a project
- Add clips + timeline
- Call GET /api/projects/:id/export-mlt
- Verify valid MLT XML output

**Step 5: Commit**

```bash
git add server/mlt-xml.js server/project-server.js server/package.json
git commit -m "feat: add JSON-to-MLT XML converter"
```

---

### Task 5: Implement render job system

**Files:**
- Modify: `server/project-server.js`
- Create: `server/job-queue.js`

**Step 1: Create `server/job-queue.js`**

```javascript
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { jsonToMlt } = require('./mlt-xml');

class JobQueue {
    constructor() {
        this.jobs = new Map();
        this.queue = [];
        this.active = null;
    }

    createJob(projectId, params, project, clips) {
        const jobId = require('crypto').randomBytes(8).toString('hex');
        const job = {
            id: jobId,
            projectId,
            status: 'queued',
            progress: 0,
            params,
            createdAt: Date.now(),
            outputPath: null,
            error: null,
        };
        this.jobs.set(jobId, job);
        this.queue.push({ jobId, project, clips });
        this.processNext();
        return job;
    }

    getJob(jobId) {
        return this.jobs.get(jobId) || null;
    }

    getProjectJobs(projectId) {
        return Array.from(this.jobs.values()).filter(j => j.projectId === projectId);
    }

    cancelJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job || job.status === 'done') return false;
        job.status = 'cancelled';
        if (this.active && this.active.jobId === jobId) {
            this.active.proc.kill('SIGTERM');
        }
        this.queue = this.queue.filter(q => q.jobId !== jobId);
        return true;
    }

    processNext() {
        if (this.active || this.queue.length === 0) return;
        
        const next = this.queue.shift();
        const job = this.jobs.get(next.jobId);
        if (!job) { this.processNext(); return; }
        
        this.active = next;
        job.status = 'rendering';
        
        const { PROJECTS_DIR, OUTPUT_DIR } = require('./config');
        const mltXml = jsonToMlt(next.project, next.clips);
        const mltPath = path.join(PROJECTS_DIR, next.projectId, `render-${job.id}.mlt`);
        const ext = job.params.format === 'webm' ? 'webm' : 'mp4';
        const outPath = path.join(OUTPUT_DIR, `${next.projectId}-${job.id}.${ext}`);
        
        fs.writeFileSync(mltPath, mltXml);
        
        const meltArgs = [
            mltPath,
            '-consumer', `avformat:${outPath}`,
            `crf=${job.params.crf || 23}`,
            `preset=${job.params.preset || 'medium'}`,
            `width=${job.params.width || next.project.width || 1920}`,
            `height=${job.params.height || next.project.height || 1080}`,
        ];
        
        if (job.params.format === 'webm') {
            meltArgs.push('mlt_service=avformat', 'vcodec=libvpx', 'acodec=libvorbis');
        } else {
            meltArgs.push('mlt_service=avformat', 'vcodec=libx264', 'acodec=aac');
        }
        
        const proc = spawn('melt', meltArgs);
        this.active.proc = proc;
        
        let stderr = '';
        let lastFrame = 0;
        
        proc.stderr.on('data', d => {
            stderr += d.toString();
            // Parse frame count from melt output
            const match = d.toString().match(/Current frame:\s*(\d+)/);
            if (match) lastFrame = parseInt(match[1], 10);
        });
        
        proc.on('close', code => {
            this.active = null;
            if (code === 0) {
                job.status = 'done';
                job.progress = 100;
                job.outputPath = outPath;
            } else {
                job.status = 'error';
                job.error = stderr.slice(-500);
            }
            this.processNext();
        });
        
        proc.on('error', err => {
            this.active = null;
            job.status = 'error';
            job.error = err.message;
            this.processNext();
        });
        
        // Progress polling
        job._progressInterval = setInterval(() => {
            if (job.status === 'rendering') {
                // Estimate total frames from duration * fps
                if (!job._totalFrames) {
                    const totalSec = next.project.timeline?.tracks?.[0]?.clips?.reduce((sum, c) => {
                        return sum + (c.sourceEnd || 0) - (c.sourceStart || 0);
                    }, 0) || 30;
                    const fps = next.project.fps || 30;
                    job._totalFrames = totalSec * fps;
                }
                job.progress = Math.min(99, Math.round((lastFrame / job._totalFrames) * 100));
            }
        }, 1000);
        
        proc.on('close', () => {
            clearInterval(job._progressInterval);
        });
    }
}

module.exports = { JobQueue };
```

**Step 2: Add render endpoints to project-server.js**

```javascript
const { JobQueue } = require('./job-queue');
const jobQueue = new JobQueue();

// Helper to load project + clips
function loadProject(id) {
    const filePath = path.join(PROJECTS_DIR, id, 'project.json');
    if (!fs.existsSync(filePath)) return null;
    const project = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const clips = {};
    for (const clip of (project.clips || [])) {
        clips[clip.clipId] = clip;
    }
    return { project, clips };
}

// Queue render
app.post('/api/projects/:id/render', (req, res) => {
    const data = loadProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Project not found' });
    
    const params = req.body || {};
    const job = jobQueue.createJob(req.params.id, params, data.project, data.clips);
    res.json(job);
});

// Get job status
app.get('/api/jobs/:jobId', (req, res) => {
    const job = jobQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({
        id: job.id,
        projectId: job.projectId,
        status: job.status,
        progress: job.progress,
        error: job.error,
        createdAt: job.createdAt,
        outputUrl: job.status === 'done' ? `/api/jobs/${job.id}/output` : null,
    });
});

// List project jobs
app.get('/api/projects/:id/jobs', (req, res) => {
    const jobs = jobQueue.getProjectJobs(req.params.id);
    res.json(jobs.map(j => ({
        id: j.id,
        status: j.status,
        progress: j.progress,
        createdAt: j.createdAt,
    })));
});

// Cancel job
app.delete('/api/jobs/:jobId', (req, res) => {
    const ok = jobQueue.cancelJob(req.params.jobId);
    res.json({ ok });
});

// Download output
app.get('/api/jobs/:jobId/output', (req, res) => {
    const job = jobQueue.getJob(req.params.jobId);
    if (!job || job.status !== 'done' || !job.outputPath) {
        return res.status(404).json({ error: 'Output not available' });
    }
    serveFile(res, job.outputPath, 'video/mp4');
});
```

**Step 3: Test render**

Run: `cd server && node project-server.js`
- Create project with timeline
- POST /api/projects/:id/render
- Poll GET /api/jobs/:jobId until status === "done"
- Verify output file exists

**Step 4: Commit**

```bash
git add server/job-queue.js server/project-server.js
git commit -m "feat: add render job queue with melt execution"
```

---

### Task 6: Add thumbnail generation endpoint

**Files:**
- Modify: `server/project-server.js`

**Step 1: Add thumbnail endpoint**

```javascript
app.post('/api/thumbnail', async (req, res) => {
    try {
        const { sourceUrl, time = 0, width = 320 } = req.body;
        if (!sourceUrl) return res.status(400).json({ error: 'Missing sourceUrl' });
        
        // sourceUrl is like /api/videos/clipId/source -> map to filesystem path
        const clipId = sourceUrl.match(/\/api\/videos\/([^/]+)/)?.[1];
        if (!clipId) return res.status(400).json({ error: 'Invalid sourceUrl' });
        
        const sourcePath = path.join(VIDEOS_DIR, clipId + '.mp4');
        if (!fs.existsSync(sourcePath)) {
            // Try with potential extensions
            const files = fs.readdirSync(VIDEOS_DIR).filter(f => f.startsWith(clipId));
            if (files.length === 0) return res.status(404).json({ error: 'Source not found' });
            sourcePath = path.join(VIDEOS_DIR, files[0]);
        }
        
        const thumbId = require('crypto').randomBytes(6).toString('hex');
        const thumbPath = path.join(PROXIES_DIR, `${thumbId}.jpg`);
        
        await runFfmpeg([
            '-ss', String(time),
            '-i', sourcePath,
            '-vf', `scale=${width}:-1`,
            '-vframes', '1',
            '-q:v', '5',
            '-y', thumbPath,
        ]);
        
        res.json({ thumbId, url: `/api/thumbnails/${thumbId}.jpg` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve thumbnails
app.get('/api/thumbnails/:name', (req, res) => {
    const filePath = path.join(PROXIES_DIR, req.params.name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
});
```

**Step 2: Test thumbnail generation**

Run: `curl -s -X POST -H 'Content-Type: application/json' -d '{"sourceUrl":"/api/videos/<clipId>/source","time":5}' http://localhost:8082/api/thumbnail`
Expected: JSON with thumb URL pointing to a JPEG

**Step 3: Commit**

```bash
git add server/project-server.js
git commit -m "feat: add thumbnail generation from video source"
```

---

### Task 7: Docker compose + nginx integration

**Files:**
- Modify: `docker-compose.yml` (or `docker-compose.full.yml`)
- Modify: `nginx-docker.conf`

**Step 1: Add project-server service to docker-compose.yml**

```yaml
project-server:
  build:
    context: ./server
    dockerfile: Dockerfile.project
  ports:
    - "8082:8082"
  volumes:
    - videos:/videos
    - proxies:/proxies
    - projects:/projects
    - output:/output
  environment:
    - PORT=8082
    - VIDEOS_DIR=/videos
    - PROXIES_DIR=/proxies
    - PROJECTS_DIR=/projects
    - OUTPUT_DIR=/output
  restart: unless-stopped

volumes:
  videos:
  proxies:
  projects:
  output:
```

**Step 2: Add nginx routes**

```nginx
# Project API
location /api/projects/ {
    proxy_pass http://project-server:8082;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    client_max_body_size 0;
}

location /api/upload {
    proxy_pass http://project-server:8082;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    client_max_body_size 0;
}

location /api/jobs/ {
    proxy_pass http://project-server:8082;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}

location /api/videos/ {
    proxy_pass http://project-server:8082;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_buffering off;
}

location /api/thumbnails/ {
    proxy_pass http://project-server:8082;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    expires 7d;
    add_header Cache-Control "public, immutable";
}
```

**Step 3: Build and test**

Run: `docker compose -f docker-compose.full.yml build project-server`
Run: `docker compose -f docker-compose.full.yml up -d project-server`
Run: `curl http://localhost:8082/api/projects`
Expected: `[]`

**Step 4: Commit**

```bash
git add docker-compose.yml docker-compose.full.yml nginx-docker.conf
git commit -m "feat: add project-server service to Docker Compose + nginx"
```

---

### Task 8: Create frontend ProjectManager component

**Files:**
- Create: `src/components/ProjectManager/ProjectManager.jsx`
- Create: `src/components/ProjectManager/ProjectManager.css`

**Step 1: Create ProjectManager component**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProjectManager.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

export default function ProjectManager() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const navigate = useNavigate();

    const loadProjects = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/projects`);
            if (res.ok) setProjects(await res.json());
        } catch (e) {
            console.error('Failed to load projects', e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadProjects(); }, [loadProjects]);

    const createProject = async () => {
        const name = newName.trim() || `Project ${Date.now()}`;
        try {
            const res = await fetch(`${API_BASE}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (res.ok) {
                const project = await res.json();
                navigate(`/editor/${project.id}`);
            }
        } catch (e) {
            console.error('Failed to create project', e);
        }
    };

    const deleteProject = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm('Delete this project?')) return;
        await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
        loadProjects();
    };

    return (
        <div className="project-manager">
            <h1>OpenCam Studio</h1>
            <div className="project-actions">
                <input
                    type="text"
                    placeholder="Project name..."
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createProject()}
                />
                <button onClick={createProject}>New Project</button>
            </div>
            {loading ? (
                <div className="loading">Loading...</div>
            ) : projects.length === 0 ? (
                <div className="empty">No projects yet. Create one to get started.</div>
            ) : (
                <div className="project-list">
                    {projects.map(p => (
                        <div
                            key={p.id}
                            className="project-card"
                            onClick={() => navigate(`/editor/${p.id}`)}
                        >
                            <div className="project-name">{p.name}</div>
                            <div className="project-meta">
                                {new Date(p.updatedAt).toLocaleDateString()}
                            </div>
                            <button
                                className="delete-btn"
                                onClick={e => deleteProject(p.id, e)}
                            >
                                Delete
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
```

**Step 2: Create ProjectManager.css**

Write clean CSS matching existing app styling.

**Step 3: Add route**

In App.jsx (or router config):
```jsx
<Route path="/" element={<ProjectManager />} />
<Route path="/editor/:projectId" element={<EditMode />} />
```

**Step 4: Verify component renders**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/ProjectManager/ProjectManager.jsx src/components/ProjectManager/ProjectManager.css src/App.jsx
git commit -m "feat: add ProjectManager component with create/list/delete"
```

---

### Task 9: Create UploadZone component

**Files:**
- Create: `src/components/UploadZone/UploadZone.jsx`
- Create: `src/components/UploadZone/UploadZone.css`

**Step 1: Create UploadZone**

```jsx
import React, { useState, useRef, useCallback } from 'react';
import './UploadZone.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

export default function UploadZone({ projectId, onClipUploaded }) {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const inputRef = useRef(null);

    const uploadFile = useCallback(async (file) => {
        setUploading(true);
        setProgress(0);
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const res = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                body: formData,
            });
            if (res.ok) {
                const result = await res.json();
                onClipUploaded(result);
            }
        } catch (e) {
            console.error('Upload failed', e);
        }
        setUploading(false);
    }, [onClipUploaded]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files).filter(f =>
            f.type.startsWith('video/')
        );
        for (const file of files) uploadFile(file);
    }, [uploadFile]);

    return (
        <div
            className={`upload-zone ${dragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
        >
            <input
                ref={inputRef}
                type="file"
                accept="video/*"
                multiple
                hidden
                onChange={e => {
                    for (const f of e.target.files) uploadFile(f);
                    e.target.value = '';
                }}
            />
            {uploading ? (
                <div className="upload-progress">
                    <div className="spinner" />
                    <span>Processing video...</span>
                </div>
            ) : (
                <div className="upload-prompt">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <p>Drop video files here or click to browse</p>
                    <small>Files are uploaded to Docker backend for processing</small>
                </div>
            )}
        </div>
    );
}
```

**Step 2: Create UploadZone.css**

Match existing app styling.

**Step 3: Build test**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/UploadZone/UploadZone.jsx src/components/UploadZone/UploadZone.css
git commit -m "feat: add UploadZone component for drag-drop video upload"
```

---

### Task 10: Update EditMode for server-based editing

**Files:**
- Modify: `src/components/EditMode/EditMode.jsx`
- Modify: `src/hooks/useTimeline.js`

**Step 1: Update EditMode to accept projectId param**

```jsx
// At top of component
const { projectId } = useParams();
const [project, setProject] = useState(null);
const [clips, setClips] = useState([]);
const [loading, setLoading] = useState(true);

// Load project on mount
useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch(`/api/projects/${projectId}`)
        .then(r => r.json())
        .then(p => {
            setProject(p);
            setClips(p.clips || []);
            // If timeline has state, restore it
            if (p.timeline) {
                // Restore timeline tracks/clips
            }
            setLoading(false);
        })
        .catch(() => setLoading(false));
}, [projectId]);
```

**Step 2: Auto-save timeline on changes**

```jsx
// Debounced save
const saveTimeoutRef = useRef(null);
const saveTimeline = useCallback((timelineData) => {
    if (!projectId) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
        fetch(`/api/projects/${projectId}/timeline`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(timelineData),
        });
    }, 2000);
}, [projectId]);
```

**Step 3: Wire proxy URLs for preview**

Replace blob URL usage with proxy URLs:
```jsx
const proxyUrl = clipState?.proxyUrl || `/api/videos/${clipId}`;
```

**Step 4: Build test**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/EditMode/EditMode.jsx src/hooks/useTimeline.js
git commit -m "feat: wire EditMode to project-server API for timeline save/load"
```

---

### Task 11: Create RenderDialog component

**Files:**
- Create: `src/components/RenderDialog/RenderDialog.jsx`
- Create: `src/components/RenderDialog/RenderDialog.css`

**Step 1: Create RenderDialog**

```jsx
import React, { useState, useEffect, useRef } from 'react';
import './RenderDialog.css';

export default function RenderDialog({ projectId, onClose }) {
    const [preset, setPreset] = useState('mp4-1080p');
    const [status, setStatus] = useState('idle'); // idle | queued | rendering | done | error
    const [jobId, setJobId] = useState(null);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const pollRef = useRef(null);

    const presets = {
        'mp4-1080p': { label: 'MP4 1080p', format: 'mp4', width: 1920, height: 1080, crf: 23, preset: 'medium' },
        'mp4-720p': { label: 'MP4 720p', format: 'mp4', width: 1280, height: 720, crf: 23, preset: 'medium' },
        'mp4-480p': { label: 'MP4 480p', format: 'mp4', width: 854, height: 480, crf: 28, preset: 'fast' },
        'webm-1080p': { label: 'WebM 1080p', format: 'webm', width: 1920, height: 1080, crf: 10, preset: 'medium' },
    };

    const startRender = async () => {
        setStatus('queued');
        setProgress(0);
        const p = presets[preset];
        try {
            const res = await fetch(`/api/projects/${projectId}/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p),
            });
            if (!res.ok) { setStatus('error'); setError('Failed to start render'); return; }
            const job = await res.json();
            setJobId(job.id);
            setStatus('queued');
        } catch (e) {
            setStatus('error');
            setError(e.message);
        }
    };

    useEffect(() => {
        if (!jobId) return;
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/jobs/${jobId}`);
                const job = await res.json();
                setStatus(job.status);
                setProgress(job.progress);
                if (job.status === 'done' || job.status === 'error') {
                    clearInterval(pollRef.current);
                    if (job.error) setError(job.error);
                }
            } catch {}
        }, 1000);
        return () => clearInterval(pollRef.current);
    }, [jobId]);

    const download = () => {
        window.open(`/api/jobs/${jobId}/output`, '_blank');
    };

    return (
        <div className="render-overlay" onClick={onClose}>
            <div className="render-dialog" onClick={e => e.stopPropagation()}>
                <h2>Render Project</h2>
                
                <div className="render-presets">
                    {Object.entries(presets).map(([key, val]) => (
                        <label key={key} className={`preset-option ${preset === key ? 'selected' : ''}`}>
                            <input type="radio" name="preset" value={key}
                                checked={preset === key} onChange={() => setPreset(key)} />
                            <span className="preset-label">{val.label}</span>
                            <span className="preset-desc">{val.width}x{val.height}</span>
                        </label>
                    ))}
                </div>

                <div className="render-status">
                    {status === 'idle' && (
                        <button className="render-btn" onClick={startRender}>Start Render</button>
                    )}
                    {status === 'queued' && <div className="status-text">Waiting in queue...</div>}
                    {(status === 'rendering') && (
                        <div className="render-progress">
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                            <div className="progress-text">{progress}%</div>
                        </div>
                    )}
                    {status === 'done' && (
                        <div className="render-done">
                            <div className="status-text success">Render complete!</div>
                            <button className="download-btn" onClick={download}>Download</button>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="render-error">
                            <div className="status-text error">Error: {error}</div>
                            <button className="render-btn" onClick={startRender}>Retry</button>
                        </div>
                    )}
                    {status === 'cancelled' && (
                        <div className="status-text">Cancelled</div>
                    )}
                </div>

                <button className="close-btn" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
```

**Step 2: Create RenderDialog.css**

**Step 3: Build test**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/RenderDialog/
git commit -m "feat: add RenderDialog with preset selection and progress tracking"
```

---

### Task 12: End-to-end integration test

**Step 1: Start all services**

Run: `docker compose -f docker-compose.full.yml up -d`

**Step 2: Create project**

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"name":"E2E Test"}' \
  http://localhost:3000/api/projects
```
Expected: Project JSON returned with `id`

**Step 3: Upload a video**

```bash
curl -s -F "file=@test-video.mp4" \
  http://localhost:3000/api/upload
```
Expected: JSON with `clipId`, `proxyUrl`, `duration`

**Step 4: Add clip to timeline**

```bash
# Get project
curl -s http://localhost:3000/api/projects/<projectId> > project.json

# Modify project.json to add timeline with clip
# Save via PUT
curl -s -X PUT -H 'Content-Type: application/json' \
  -d '{"tracks": [{"id": "track-1", "type": "video", "clips": [{"clipId":"<clipId>", "sourceStart": 0, "sourceEnd": 5}]}]}' \
  http://localhost:3000/api/projects/<projectId>/timeline
```
Expected: `{ "ok": true }`

**Step 5: Render**

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{}' \
  http://localhost:3000/api/projects/<projectId>/render
```
Expected: Job JSON with `id`, `status: "queued"`

**Step 6: Poll until done**

```bash
while true; do
    status=$(curl -s http://localhost:3000/api/jobs/<jobId> | node -e "
        let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
            const j=JSON.parse(d); console.log(j.status, j.progress);
        })
    ")
    echo "$status"
    [[ "$status" == *"done"* ]] && break
    sleep 2
done
```
Expected: Progress increases, status reaches "done"

**Step 7: Download output**

```bash
curl -o rendered.mp4 http://localhost:3000/api/jobs/<jobId>/output
file rendered.mp4
```
Expected: Valid MP4 file

---

## Summary of Files

| Task | Files | Type |
|------|-------|------|
| 1 | `server/Dockerfile.project` | Create |
| 2 | `server/project-server.js` | Create |
| 3 | `server/project-server.js`, `server/package.json` | Modify |
| 4 | `server/mlt-xml.js`, `server/project-server.js` | Create + Modify |
| 5 | `server/job-queue.js`, `server/project-server.js` | Create + Modify |
| 6 | `server/project-server.js` | Modify |
| 7 | `docker-compose.yml`, `nginx-docker.conf` | Modify |
| 8 | `src/components/ProjectManager/*`, `App.jsx` | Create + Modify |
| 9 | `src/components/UploadZone/*` | Create |
| 10 | `src/components/EditMode/EditMode.jsx`, `src/hooks/useTimeline.js` | Modify |
| 11 | `src/components/RenderDialog/*` | Create |
| 12 | (manual test) | |
