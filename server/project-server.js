const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const multer = require('multer');
const { jsonToMlt } = require('./mlt-xml');
const { JobQueue } = require('./job-queue');
const { createRateLimiter } = require('./middleware/rateLimit');
const { validateProjectBody, validateTimelineBody } = require('./middleware/validate');
const { apiKeyAuth } = require('./middleware/auth');

// Path traversal prevention
function safePath(base, ...segments) {
    const resolved = path.resolve(base, ...segments);
    if (!resolved.startsWith(path.resolve(base))) {
        return null;
    }
    return resolved;
}

const PORT = process.env.PORT || 8082;
const VIDEOS_DIR = process.env.VIDEOS_DIR || path.join(__dirname, 'videos');
const PROXIES_DIR = process.env.PROXIES_DIR || path.join(__dirname, 'proxies');
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(__dirname, 'projects');
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, 'output');

for (const dir of [VIDEOS_DIR, PROXIES_DIR, PROJECTS_DIR, OUTPUT_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const app = express();
const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000'];
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(createRateLimiter({ windowMs: 60000, max: 200 }));
app.use(apiKeyAuth);

const upload = multer({
    dest: path.join(VIDEOS_DIR, '.uploads'),
    limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50GB max
});
fs.mkdirSync(path.join(VIDEOS_DIR, '.uploads'), { recursive: true });
const jobQueue = new JobQueue({ loadProject });

// ---------- Project CRUD ----------

app.post('/api/projects', validateProjectBody, (req, res) => {
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

app.get('/api/projects/:id', (req, res) => {
    const filePath = safePath(PROJECTS_DIR, req.params.id, 'project.json');
    if (!filePath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
});

app.put('/api/projects/:id/timeline', validateTimelineBody, (req, res) => {
    const filePath = safePath(PROJECTS_DIR, req.params.id, 'project.json');
    if (!filePath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const project = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    project.timeline = req.body;
    project.updatedAt = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2));
    res.json({ ok: true });
});

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

app.delete('/api/projects/:id', (req, res) => {
    const dir = safePath(PROJECTS_DIR, req.params.id);
    if (!dir) return res.status(400).json({ error: 'Invalid path' });
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
});

// ---------- Upload + Proxy ----------

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const clipId = require('crypto').randomBytes(12).toString('hex');
        const ext = path.extname(req.file.originalname) || '.mp4';
        const sourcePath = path.join(VIDEOS_DIR, `${clipId}${ext}`);
        const proxyPath = path.join(PROXIES_DIR, `${clipId}.mp4`);

        // Move uploaded file to final location
        try {
            fs.renameSync(req.file.path, sourcePath);
        } catch (renameErr) {
            // Cross-device move fallback (Docker volumes)
            fs.copyFileSync(req.file.path, sourcePath);
            fs.unlinkSync(req.file.path);
        }

        const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(1);
        console.log(`[project-server] Upload received: ${req.file.originalname} (${fileSizeMB}MB)`);

        // Get duration immediately (fast, no encoding)
        const duration = await getMediaDuration(sourcePath);

        // For large files (>100MB), return immediately and generate proxy in background
        const isLargeFile = req.file.size > 100 * 1024 * 1024;

        if (isLargeFile) {
            console.log(`[project-server] Large file detected (${fileSizeMB}MB). Returning source URL, generating proxy in background...`);
            
            // Return response immediately with source URL
            res.json({
                clipId,
                originalName: req.file.originalname,
                sourceUrl: `/api/videos/${clipId}/source`,
                proxyUrl: `/api/videos/${clipId}/source`, // Use source until proxy is ready
                duration,
                size: req.file.size,
                proxyGenerating: true,
            });

            // Generate proxy in background (no timeout limit)
            runFfmpeg([
                '-i', sourcePath,
                '-vf', 'scale=854:480',
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '28',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                '-y', proxyPath,
            ], 1800000).then(() => { // 30 min timeout for large files
                console.log(`[project-server] Proxy generated for large file: ${proxyPath}`);
            }).catch(err => {
                console.error(`[project-server] Proxy generation failed for large file:`, err.message);
            });
        } else {
            // Small files: generate proxy synchronously (blocking)
            let proxyGenerated = false;
            try {
                await runFfmpeg([
                    '-i', sourcePath,
                    '-vf', 'scale=854:480',
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '28',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-movflags', '+faststart',
                    '-y', proxyPath,
                ]);
                proxyGenerated = true;
                console.log(`[project-server] Proxy generated: ${proxyPath}`);
            } catch (ffmpegErr) {
                console.error(`[project-server] Proxy generation failed (using source):`, ffmpegErr.message);
            }

            res.json({
                clipId,
                originalName: req.file.originalname,
                sourceUrl: `/api/videos/${clipId}/source`,
                proxyUrl: proxyGenerated ? `/api/videos/${clipId}` : `/api/videos/${clipId}/source`,
                duration,
                size: req.file.size,
            });
        }
    } catch (err) {
        console.error('[project-server] Upload error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- File Serving ----------

app.get('/api/videos/:id', (req, res) => {
    const filePath = safePath(PROXIES_DIR, req.params.id);
    if (!filePath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const mime = filePath.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
    serveFile(req, res, filePath, mime);
});

app.get('/api/videos/:id/source', (req, res) => {
    const id = req.params.id;
    const candidates = fs.readdirSync(VIDEOS_DIR).filter(f => f.startsWith(id));
    if (candidates.length === 0) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(VIDEOS_DIR, candidates[0]);
    const mime = filePath.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
    serveFile(req, res, filePath, mime);
});

function serveFile(req, res, filePath, mimeType) {
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
            'Access-Control-Allow-Origin': req.headers.origin || 'http://localhost:3000',
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': req.headers.origin || 'http://localhost:3000',
        });
        fs.createReadStream(filePath).pipe(res);
    }
}

// ---------- Thumbnail Generation ----------

app.post('/api/thumbnail', async (req, res) => {
    try {
        const { sourceUrl, time = 0, width = 320 } = req.body;
        if (!sourceUrl) return res.status(400).json({ error: 'Missing sourceUrl' });

        const clipId = sourceUrl.match(/\/api\/videos\/([^/]+)/)?.[1];
        if (!clipId) return res.status(400).json({ error: 'Invalid sourceUrl' });

        let sourcePath = safePath(VIDEOS_DIR, clipId + '.mp4');
        if (!sourcePath) return res.status(400).json({ error: 'Invalid path' });
        if (!fs.existsSync(sourcePath)) {
            const files = fs.readdirSync(VIDEOS_DIR).filter(f => f.startsWith(clipId));
            if (files.length === 0) return res.status(404).json({ error: 'Source not found' });
            sourcePath = safePath(VIDEOS_DIR, files[0]);
            if (!sourcePath) return res.status(400).json({ error: 'Invalid path' });
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

app.get('/api/thumbnails/:name', (req, res) => {
    const filePath = safePath(PROXIES_DIR, req.params.name);
    if (!filePath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
});

// ---------- MLT Export ----------

app.get('/api/projects/:id/export-mlt', (req, res) => {
    const filePath = safePath(PROJECTS_DIR, req.params.id, 'project.json');
    if (!filePath) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const project = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const videos = (() => { try { return fs.readdirSync(VIDEOS_DIR); } catch { return []; } })();
    const mltXml = jsonToMlt(project, {
        resolveResource: (clipId) => {
            const base = String(clipId).split('/')[0].replace(/\.[a-z0-9]+$/i, '');
            const match = videos.find(f => f.startsWith(base + '.'));
            return match ? `${VIDEOS_DIR}/${match}` : null;
        },
    });
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${project.name}.mlt"`);
    res.send(mltXml);
});

// ---------- Render Queue ----------

function loadProject(id) {
    const filePath = safePath(PROJECTS_DIR, id, 'project.json');
    if (!filePath || !fs.existsSync(filePath)) return null;
    const project = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { project };
}

app.post('/api/projects/:id/render', (req, res) => {
    const data = loadProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Project not found' });

    const params = req.body || {};
    const job = jobQueue.createJob(req.params.id, params);
    res.json({
        id: job.id,
        projectId: job.projectId,
        status: job.status,
        progress: job.progress,
        createdAt: job.createdAt,
    });
});

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

app.get('/api/projects/:id/jobs', (req, res) => {
    const jobs = jobQueue.getProjectJobs(req.params.id);
    res.json(jobs.map(j => ({
        id: j.id,
        status: j.status,
        progress: j.progress,
        createdAt: j.createdAt,
    })));
});

app.delete('/api/jobs/:jobId', (req, res) => {
    const ok = jobQueue.cancelJob(req.params.jobId);
    res.json({ ok });
});

app.get('/api/jobs/:jobId/output', (req, res) => {
    const job = jobQueue.getJob(req.params.jobId);
    if (!job || job.status !== 'done' || !job.outputPath) {
        return res.status(404).json({ error: 'Output not available' });
    }
    res.setHeader('Content-Disposition', 'attachment; filename="render.mp4"');
    serveFile(req, res, job.outputPath, 'video/mp4');
});

// ---------- AI LLM Proxy ----------
// The browser never talks to LLM providers directly. Endpoints are pinned to a
// provider allowlist here, and API keys are resolved server-side first (env
// vars) so keys can live entirely outside the browser.

const AI_PROVIDERS = {
    openai:     { endpoint: 'https://api.openai.com/v1/chat/completions',      envKey: 'OPENAI_API_KEY',     style: 'openai' },
    anthropic:  { endpoint: 'https://api.anthropic.com/v1/messages',           envKey: 'ANTHROPIC_API_KEY',  style: 'anthropic' },
    groq:       { endpoint: 'https://api.groq.com/openai/v1/chat/completions', envKey: 'GROQ_API_KEY',       style: 'openai' },
    together:   { endpoint: 'https://api.together.xyz/v1/chat/completions',    envKey: 'TOGETHER_API_KEY',   style: 'openai' },
    openrouter: { endpoint: 'https://openrouter.ai/api/v1/chat/completions',   envKey: 'OPENROUTER_API_KEY', style: 'openai' },
};

app.post('/api/ai/chat', async (req, res) => {
    try {
        const { provider: rawProvider, model, messages, apiKey: clientKey, stream } = req.body || {};
        const provider = AI_PROVIDERS[String(rawProvider || 'openai').toLowerCase()];
        if (!provider) return res.status(400).json({ error: `Unknown provider. Allowed: ${Object.keys(AI_PROVIDERS).join(', ')}` });

        // Prefer the server-configured key; fall back to a per-request client key
        // that is used once in-memory and never persisted.
        const apiKey = process.env[provider.envKey] || (typeof clientKey === 'string' ? clientKey.slice(0, 256) : '');
        if (!apiKey) return res.status(401).json({ error: `No API key configured. Set ${provider.envKey} on the server or provide one in Settings.` });

        if (!Array.isArray(messages) || messages.length === 0 || messages.length > 64) {
            return res.status(400).json({ error: 'messages must be a non-empty array (max 64)' });
        }
        for (const m of messages) {
            if (!m || typeof m.content !== 'string' || typeof m.role !== 'string' || m.content.length > 64 * 1024) {
                return res.status(400).json({ error: 'Invalid message format' });
            }
        }
        const rawModel = String(model || '');
        const safeModel = /^[a-zA-Z0-9][a-zA-Z0-9._\/:\-]{0,127}$/.test(rawModel) && !rawModel.includes('..')
            ? rawModel
            : '';
        if (!safeModel) return res.status(400).json({ error: 'model is required (alphanumeric, dot, slash, dash, colon)' });

        let endpoint = provider.endpoint;
        let headers = { 'Content-Type': 'application/json' };
        let body;

        if (provider.style === 'anthropic') {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
            const systemMsgs = messages.filter(m => m.role === 'system');
            const chatMsgs = messages.filter(m => m.role !== 'system');
            body = JSON.stringify({
                model: safeModel,
                max_tokens: 500,
                system: systemMsgs.map(m => m.content).join('\n') || undefined,
                messages: chatMsgs,
            });
        } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
            if (provider === AI_PROVIDERS.openrouter) {
                headers['HTTP-Referer'] = 'https://opencam-studio.app';
                headers['X-Title'] = 'OpenCam Studio';
            }
            body = JSON.stringify({
                model: safeModel,
                messages,
                temperature: 0.1,
                max_tokens: 500,
                ...(stream ? { stream: true } : {}),
            });
        }

        const upstream = await fetch(endpoint, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(120000),
        });

        if (!upstream.ok) {
            const errText = await upstream.text().catch(() => '');
            console.error(`[ai-proxy] ${rawProvider} ${upstream.status}: ${errText.slice(0, 200)}`);
            return res.status(upstream.status === 401 || upstream.status === 403 ? 401 : 502)
                .json({ error: `LLM provider error (${upstream.status})` });
        }

        if (stream && provider.style === 'openai') {
            // Pipe SSE straight through.
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            const reader = upstream.body.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(Buffer.from(value));
                }
            } finally {
                res.end();
            }
            return;
        }

        const data = await upstream.json();
        res.json(data);
    } catch (err) {
        console.error('[ai-proxy] error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'AI proxy failure' });
    }
});

// ---------- Helpers ----------

function runFfmpeg(args, timeoutMs = 600000) {
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', args);
        let stderr = '';
        let killed = false;
        
        const timer = setTimeout(() => {
            killed = true;
            proc.kill('SIGKILL');
        }, timeoutMs);
        
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => {
            clearTimeout(timer);
            if (killed) reject(new Error(`FFmpeg timed out after ${timeoutMs / 1000}s`));
            else if (code === 0) resolve(stderr);
            else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-500)}`));
        });
        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

function getMediaDuration(filePath) {
    return new Promise((resolve) => {
        try {
            const proc = spawn('ffprobe', [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'csv=p=0',
                filePath,
            ]);
            let out = '';
            proc.stdout.on('data', d => out += d.toString());
            proc.on('close', code => {
                if (code === 0 && parseFloat(out.trim()) > 0) {
                    resolve(parseFloat(out.trim()));
                } else {
                    resolve(0);
                }
            });
            proc.on('error', () => resolve(0));
        } catch {
            resolve(0);
        }
    });
}

const server = app.listen(PORT, () => {
    console.log(`[project-server] Running on port ${PORT}`);
    console.log(`  VIDEOS_DIR: ${VIDEOS_DIR}`);
    console.log(`  PROXIES_DIR: ${PROXIES_DIR}`);
    console.log(`  PROJECTS_DIR: ${PROJECTS_DIR}`);
    console.log(`  OUTPUT_DIR: ${OUTPUT_DIR}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
    // Force close after 10s
    setTimeout(() => {
        console.log('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    server.close(() => process.exit(0));
});
