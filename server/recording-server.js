const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const crypto = require('crypto');

const PORT = process.env.PORT || 8081;
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || '/recordings';
const PROXIES_DIR = process.env.PROXIES_DIR || '/proxies';
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/output';

for (const dir of [RECORDINGS_DIR, PROXIES_DIR, OUTPUT_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const sessions = new Map(); // sessionId -> { chunks: [], ws: null, filePath, state, timer }

const MIME_TYPES = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
};

function log(level, ...args) {
    const ts = new Date().toISOString();
    console[level](`[recording] [${ts}]`, ...args);
}

// === HTTP Range File Server ===
function serveFile(res, filePath, mimeType) {
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const fileSize = stat.size;
        const range = res.req && res.req.headers && res.req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;
            const stream = fs.createReadStream(filePath, { start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': mimeType,
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
            });
            stream.pipe(res);
            stream.on('error', () => { if (!res.headersSent) { res.writeHead(500); res.end(); } });
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
    });
}

function generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
}

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', args);
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => {
            if (code === 0) resolve(stderr);
            else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-500)}`));
        });
        proc.on('error', reject);
    });
}

// === Recording WebSocket Server ===
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Health
    if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }));
        return;
    }

    // === Recording API ===
    // POST /api/record/start
    if (pathname === '/api/record/start' && req.method === 'POST') {
        const sessionId = generateSessionId();
        const filePath = path.join(RECORDINGS_DIR, `${sessionId}.webm`);
        const tempStream = fs.createWriteStream(filePath);
        sessions.set(sessionId, {
            chunks: [], ws: null, filePath,
            tempStream, state: 'recording', timer: null,
            totalBytes: 0, createdAt: Date.now(),
        });
        log('info', `Session ${sessionId} started -> ${filePath}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sessionId, wsUrl: `/ws/record/${sessionId}` }));
        return;
    }

    // POST /api/record/stop/{sessionId}
    const stopMatch = pathname.match(/^\/api\/record\/stop\/([a-f0-9]+)$/);
    if (stopMatch && req.method === 'POST') {
        const sessionId = stopMatch[1];
        const session = sessions.get(sessionId);
        if (!session) {
            res.writeHead(404);
            res.end('Session not found');
            return;
        }
        session.state = 'finalizing';
        session.tempStream.end();

        const webmPath = session.filePath;
        const mp4Path = webmPath.replace('.webm', '.mp4');
        const proxyPath = path.join(PROXIES_DIR, `${sessionId}_proxy.mp4`);

        log('info', `Session ${sessionId}: ${session.totalBytes} bytes received`);

        // Convert WebM → MP4 via FFmpeg
        runFfmpeg([
            '-i', webmPath,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y', mp4Path,
        ]).then(() => {
            log('info', `Session ${sessionId}: MP4 created`);

            // Generate 480p proxy
            return runFfmpeg([
                '-i', mp4Path,
                '-vf', 'scale=854:480',
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '28',
                '-an',
                '-movflags', '+faststart',
                '-y', proxyPath,
            ]);
        }).then(() => {
            log('info', `Session ${sessionId}: proxy created`);
            session.state = 'ready';

            // Delete raw WebM to save space
            try { fs.unlinkSync(webmPath); } catch {}

            const cursorUrl = session.cursorTelemetryPath
                ? `/api/video/${sessionId}/cursor`
                : null;

            // Send status to WebSocket if connected
            if (session.ws && session.ws.readyState === WebSocket.OPEN) {
                session.ws.send(JSON.stringify({
                    type: 'ready',
                    videoUrl: `/api/video/${sessionId}`,
                    proxyUrl: `/api/video/${sessionId}/proxy`,
                    cursorUrl,
                    duration: 0,
                }));
            }

            // Clean up session after 1 hour
            session.timer = setTimeout(() => {
                sessions.delete(sessionId);
            }, 3600000);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                sessionId,
                videoUrl: `/api/video/${sessionId}`,
                proxyUrl: `/api/video/${sessionId}/proxy`,
                cursorUrl,
            }));
        }).catch(err => {
            log('error', `Session ${sessionId} conversion failed:`, err.message);
            session.state = 'error';
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        });
        return;
    }

    // GET /api/record/status/{sessionId}
    const statusMatch = pathname.match(/^\/api\/record\/status\/([a-f0-9]+)$/);
    if (statusMatch && req.method === 'GET') {
        const sessionId = statusMatch[1];
        const session = sessions.get(sessionId);
        if (!session) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Session not found' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            sessionId,
            state: session.state,
            totalBytes: session.totalBytes,
            createdAt: session.createdAt,
            videoUrl: `/api/video/${sessionId}`,
            proxyUrl: `/api/video/${sessionId}/proxy`,
        }));
        return;
    }

    // === File Serving ===
    // GET /api/video/{id}
    const videoMatch = pathname.match(/^\/api\/video\/([a-f0-9]+)$/);
    if (videoMatch && req.method === 'GET') {
        const id = videoMatch[1];
        let filePath = path.join(RECORDINGS_DIR, `${id}.mp4`);
        let mimeType = 'video/mp4';
        if (!fs.existsSync(filePath)) {
            filePath = path.join(RECORDINGS_DIR, `${id}.webm`);
            mimeType = 'video/webm';
            if (!fs.existsSync(filePath)) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
        }
        serveFile(res, filePath, mimeType);
        return;
    }

    // GET /api/video/{id}/proxy
    const proxyMatch = pathname.match(/^\/api\/video\/([a-f0-9]+)\/proxy$/);
    if (proxyMatch && req.method === 'GET') {
        const id = proxyMatch[1];
        const filePath = path.join(PROXIES_DIR, `${id}_proxy.mp4`);
        if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end('Proxy not found');
            return;
        }
        serveFile(res, filePath, 'video/mp4');
        return;
    }

    // GET /api/video/{id}/cursor
    const cursorMatch = pathname.match(/^\/api\/video\/([a-f0-9]+)\/cursor$/);
    if (cursorMatch && req.method === 'GET') {
        const id = cursorMatch[1];
        const session = sessions.get(id);
        if (session && session.cursorTelemetryPath && fs.existsSync(session.cursorTelemetryPath)) {
            const data = fs.readFileSync(session.cursorTelemetryPath, 'utf-8');
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(data);
            return;
        }
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'No cursor telemetry found' }));
        return;
    }

    // === Edit API ===
    // POST /api/edit/trim
    if (pathname === '/api/edit/trim' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { sourceId, start, end } = JSON.parse(body);
                if (!sourceId) { res.writeHead(400); res.end('Missing sourceId'); return; }

                const srcPath = path.join(RECORDINGS_DIR, `${sourceId}.mp4`);
                if (!fs.existsSync(srcPath)) { res.writeHead(404); res.end('Source not found'); return; }

                const outId = generateSessionId();
                const outPath = path.join(OUTPUT_DIR, `${outId}.mp4`);

                const args = ['-i', srcPath, '-ss', String(start || 0), '-to', String(end || 999999)];
                args.push('-c', 'copy', '-y', outPath);

                runFfmpeg(args).then(() => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ outputId: outId, url: `/api/video/${outId}` }));
                }).catch(err => {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: err.message }));
                });
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
        return;
    }

    // POST /api/edit/render
    if (pathname === '/api/edit/render' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { sourceId, edl } = JSON.parse(body);
                if (!sourceId || !edl) { res.writeHead(400); res.end('Missing sourceId or edl'); return; }

                const srcPath = path.join(RECORDINGS_DIR, `${sourceId}.mp4`);
                if (!fs.existsSync(srcPath)) { res.writeHead(404); res.end('Source not found'); return; }

                const outId = generateSessionId();
                const outPath = path.join(OUTPUT_DIR, `${outId}.mp4`);

                // Build FFmpeg filter complex from EDL
                const clips = edl.tracks?.[0]?.clips || [];
                if (clips.length === 0) {
                    res.writeHead(400);
                    res.end('No clips in EDL');
                    return;
                }

                const filterParts = [];
                const mapParts = [];
                let concatInputs = [];

                clips.forEach((clip, i) => {
                    const ss = clip.sourceStart || 0;
                    const dur = (clip.sourceEnd || 10) - ss;
                    const speed = clip.speed || 1;
                    const actualDur = dur / speed;

                    filterParts.push(
                        `[0:v]trim=start=${ss}:duration=${dur},setpts=PTS/${speed}[v${i}]`
                    );
                    concatInputs.push(`[v${i}]`);
                });

                if (concatInputs.length === 1) {
                    // Single clip: just trim
                    const args = [
                        '-i', srcPath,
                        '-filter_complex', filterParts.join(';'),
                        '-map', `[v0]`,
                        '-preset', 'medium',
                        '-crf', '23',
                        '-y', outPath,
                    ];
                    runFfmpeg(args).then(() => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ outputId: outId, url: `/api/video/${outId}` }));
                    }).catch(err => {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: err.message }));
                    });
                } else {
                    // Multiple clips: concat
                    const concatFilter = `${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=0[out]`;
                    const args = [
                        '-i', srcPath,
                        '-filter_complex', [...filterParts, concatFilter].join(';'),
                        '-map', '[out]',
                        '-preset', 'medium',
                        '-crf', '23',
                        '-y', outPath,
                    ];
                    runFfmpeg(args).then(() => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ outputId: outId, url: `/api/video/${outId}` }));
                    }).catch(err => {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: err.message }));
                    });
                }
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
        return;
    }

    // 404
    res.writeHead(404);
    res.end('Not found');
});

// === WebSocket for streaming chunks ===
const wss = new WebSocket.Server({ server, path: '/ws/record' });

wss.on('connection', (ws, req) => {
    let sessionId = null;
    let session = null;

    // Extract session ID from URL query params
    const url = new URL(req.url, `http://${req.headers.host}`);
    sessionId = url.searchParams.get('session');
    if (!sessionId) {
        ws.send(JSON.stringify({ type: 'error', error: 'Missing session parameter' }));
        ws.close();
        return;
    }

    session = sessions.get(sessionId);
    if (!session) {
        ws.send(JSON.stringify({ type: 'error', error: 'Session not found. Call /api/record/start first' }));
        ws.close();
        return;
    }

    session.ws = ws;
    log('info', `WebSocket connected for session ${sessionId}`);

    ws.on('message', (data) => {
        if (Buffer.isBuffer(data)) {
            // Binary chunk
            if (session.state === 'recording' && session.tempStream.writable) {
                session.tempStream.write(data);
                session.totalBytes += data.length;
            }
        } else {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'cursor-telemetry') {
                    const telemetryPath = path.join(RECORDINGS_DIR, `${sessionId}_cursor.json`);
                    fs.writeFileSync(telemetryPath, msg.data);
                    session.cursorTelemetryPath = telemetryPath;
                } else if (msg.type === 'stop') {
                    // Client requesting stop
                    session.state = 'finalizing';
                    session.tempStream.end();

                    const webmPath = session.filePath;
                    const mp4Path = webmPath.replace('.webm', '.mp4');
                    const proxyPath = path.join(PROXIES_DIR, `${sessionId}_proxy.mp4`);

                    runFfmpeg([
                        '-i', webmPath,
                        '-c:v', 'libx264',
                        '-preset', 'fast',
                        '-crf', '23',
                        '-c:a', 'aac',
                        '-b:a', '128k',
                        '-movflags', '+faststart',
                        '-y', mp4Path,
                    ]).then(() => {
                        return runFfmpeg([
                            '-i', mp4Path,
                            '-vf', 'scale=854:480',
                            '-c:v', 'libx264',
                            '-preset', 'fast',
                            '-crf', '28',
                            '-an',
                            '-movflags', '+faststart',
                            '-y', proxyPath,
                        ]);
                    }).then(() => {
                        log('info', `Session ${sessionId}: ready`);
                        session.state = 'ready';
                        try { fs.unlinkSync(webmPath); } catch {}

                        if (ws.readyState === WebSocket.OPEN) {
                            const cursorUrl = session.cursorTelemetryPath
                                ? `/api/video/${sessionId}/cursor`
                                : null;
                            ws.send(JSON.stringify({
                                type: 'ready',
                                sessionId,
                                videoUrl: `/api/video/${sessionId}`,
                                proxyUrl: `/api/video/${sessionId}/proxy`,
                                cursorUrl,
                            }));
                        }

                        session.timer = setTimeout(() => {
                            sessions.delete(sessionId);
                        }, 3600000);
                    }).catch(err => {
                        log('error', `Session ${sessionId} error:`, err.message);
                        session.state = 'error';
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'error', error: err.message }));
                        }
                    });
                }
            } catch {}
        }
    });

    ws.on('close', () => {
        log('info', `WebSocket disconnected for session ${sessionId}`);
        if (session && session.state === 'recording') {
            // Connection lost during recording — auto-finalize after timeout
            setTimeout(() => {
                const s = sessions.get(sessionId);
                if (s && s.state === 'recording') {
                    log('info', `Auto-finalizing session ${sessionId} after disconnect`);
                    s.state = 'finalizing';
                    s.tempStream.end();
                }
            }, 10000);
        }
    });

    ws.on('error', () => {});
});

server.listen(PORT, () => {
    log('info', `Recording server running on port ${PORT}`);
    log('info', `Recordings: ${RECORDINGS_DIR}`);
    log('info', `Proxies: ${PROXIES_DIR}`);
    log('info', `Output: ${OUTPUT_DIR}`);
});
