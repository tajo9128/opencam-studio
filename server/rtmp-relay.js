// RTMP Relay Server — WebSocket → FFmpeg → RTMP (supports multi-destination)
// Receives WebM chunks from browser, fans out to N FFmpeg processes for simulcasting
const WebSocket = require('ws');
const http = require('http');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    const origin = req.headers.origin || 'http://localhost:3000';
    if (req.url === '/health' || req.url.endsWith('/health')) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin });
        res.end(JSON.stringify({ status: 'ok', activeStreams: wss.clients.size }));
        return;
    }
    res.writeHead(404);
    res.end();
});

const ALLOWED_RTMP_HOSTS = [
    'a.rtmp.youtube.com',
    'b.rtmp.youtube.com',
    'contribute.live-video.net',
    'live.twitch.tv',
    'live.kick.com',
    'live-api-s.facebook.com',
    'liveprdclam.net',
    'rtmp-api.facebook.com',
    'ingest.w.sony.com',
    'ingest.pscp.tv',
    'global-ingest.mux.com',
    'rtmp.live.vimeo.com',
    'live.restream.io',
];

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function isValidRtmpUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'rtmp:') return false;
        // Always allow if hostname is valid (expanded allowlist above)
        return ALLOWED_RTMP_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
    } catch { return false; }
}

function log(level, ...args) {
    const ts = new Date().toISOString();
    console[level](`[${ts}]`, ...args);
}

const wss = new WebSocket.Server({ server });

function createFfmpegProcess(dest, globalCfg) {
    const [w, h] = (globalCfg.resolution || '1080p') === '1440p' ? [2560, 1440] :
                   (globalCfg.resolution || '1080p') === '720p' ? [1280, 720] : [1920, 1080];

    const proc = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', `${globalCfg.bitrate || 6000000}`,
        '-maxrate', `${globalCfg.bitrate || 6000000}`,
        '-bufsize', `${(globalCfg.bitrate || 6000000) * 2}`,
        '-g', '60',
        '-r', `${globalCfg.framerate || 30}`,
        '-s', `${w}x${h}`,
        '-c:a', 'aac',
        '-b:a', `${globalCfg.audioBitrate || 128000}`,
        '-ar', '44100',
        '-f', 'flv',
        dest.rtmpUrl,
    ]);

    return proc;
}

wss.on('connection', (ws) => {
    log('info', 'Client connected');
    let config = null;
    let ffmpegProcesses = [];
    let pendingChunks = [];
    let maxRetriesReached = false;

    function validateDestination(dest) {
        if (!dest.rtmpUrl) return 'Missing RTMP URL';
        if (!dest.platform) return 'Missing platform';
        if (!isValidRtmpUrl(dest.rtmpUrl)) return `RTMP URL not in allowlist: ${dest.rtmpUrl}. Add host to ALLOWED_RTMP_HOSTS`;
        return null;
    }

    function spawnAllFfmpeg() {
        ffmpegProcesses.forEach(p => {
            if (p.proc) { p.proc.stdin.end(); p.proc.kill('SIGTERM'); }
        });
        ffmpegProcesses = [];

        config.destinations.forEach((dest) => {
            const entry = { dest, proc: null, retryCount: 0, retryTimer: null };
            ffmpegProcesses.push(entry);

            function startProc() {
                entry.proc = createFfmpegProcess(dest, {
                    resolution: config.resolution || '1080p',
                    bitrate: config.bitrate || 6000000,
                    framerate: config.framerate || 30,
                    audioBitrate: config.audioBitrate || 128000,
                });

                entry.proc.stdin.on('error', () => {
                    log('error', `[${dest.platform}] FFmpeg stdin error`);
                });

                entry.proc.stderr.on('data', (chunk) => {
                    const msg = chunk.toString();
                    if (msg.includes('bitrate') || msg.includes('speed')) return; // ignore progress
                    if (msg.includes('error') || msg.includes('Error')) {
                        log('error', `[${dest.platform}] ${msg.trim().slice(0, 200)}`);
                    }
                });

                entry.proc.on('close', (code) => {
                    if (maxRetriesReached) return;
                    if (code !== 0 && code !== null && entry.retryCount < MAX_RETRIES) {
                        entry.retryCount++;
                        log('info', `[${dest.platform}] Restart #${entry.retryCount}`);
                        ws.send(JSON.stringify({
                            type: 'dest_status',
                            platform: dest.platform,
                            status: 'reconnecting',
                            attempt: entry.retryCount,
                        }));
                        entry.retryTimer = setTimeout(startProc, RETRY_DELAY_MS);
                    } else if (code !== 0 && code !== null) {
                        log('error', `[${dest.platform}] Failed after ${MAX_RETRIES} retries`);
                        ws.send(JSON.stringify({
                            type: 'dest_status',
                            platform: dest.platform,
                            status: 'failed',
                            reason: `Exited with code ${code} after ${MAX_RETRIES} retries`,
                        }));
                    }
                });
            }

            startProc();
            ws.send(JSON.stringify({ type: 'dest_status', platform: dest.platform, status: 'connected' }));
        });
    }

    ws.on('message', (data, isBinary) => {
        const text = isBinary ? null : data.toString();
        // First message is config JSON
        if (!config && text) {
            try {
                config = JSON.parse(data);
                if (config.type === 'config') {
                    // Support both single-destination (legacy) and multi-destination (simulcasting)
                    const dests = config.destinations;
                    if (!dests || !Array.isArray(dests) || dests.length === 0) {
                        ws.send(JSON.stringify({ type: 'error', error: 'Missing destinations array' }));
                        return;
                    }

                    for (const dest of dests) {
                        const err = validateDestination(dest);
                        if (err) {
                            ws.send(JSON.stringify({ type: 'error', error: err, platform: dest.platform || 'unknown' }));
                            ws.close();
                            return;
                        }
                    }

                    log('info', `Simulcasting to ${dests.length} destination(s): ${dests.map(d => d.platform).join(', ')}`);
                    spawnAllFfmpeg();
                    ws.send(JSON.stringify({ type: 'started', count: dests.length }));
                    return;
                }
            } catch (err) {
                log('error', 'Config parse error:', err.message);
                ws.send(JSON.stringify({ type: 'error', error: 'Invalid config JSON' }));
                return;
            }
        }

        // Stop command
        if (text) {            try {
                const msg = JSON.parse(text);
                if (msg.type === 'stop') {
                    maxRetriesReached = true;
                    ffmpegProcesses.forEach(p => {
                        if (p.retryTimer) clearTimeout(p.retryTimer);
                        if (p.proc?.stdin.writable) p.proc.stdin.end();
                        p.proc?.kill('SIGTERM');
                    });
                    ffmpegProcesses = [];
                    ws.close();
                    return;
                }
            } catch {}
        }

        // Binary data → fan out to ALL FFmpeg processes
        if (Buffer.isBuffer(data)) {
            for (const p of ffmpegProcesses) {
                if (p.proc && p.proc.stdin.writable) {
                    p.proc.stdin.write(data);
                }
            }
            // Also buffer chunks for any restarting processes
            pendingChunks.push(data);
            if (pendingChunks.length > 500) pendingChunks.shift();
        }
    });

    ws.on('close', () => {
        log('info', 'Client disconnected');
        maxRetriesReached = true;
        pendingChunks = [];
        ffmpegProcesses.forEach(p => {
            if (p.retryTimer) clearTimeout(p.retryTimer);
            if (p.proc && p.proc.stdin.writable) p.proc.stdin.end();
            p.proc?.kill('SIGTERM');
        });
        ffmpegProcesses = [];
    });

    ws.on('error', (err) => {
        log('error', 'WebSocket error:', err.message);
    });
});

server.listen(PORT, () => {
    console.log(`RTMP Relay Server running on port ${PORT}`);
    console.log(`WebSocket:   ws://localhost:${PORT}`);
    console.log(`Health:      http://localhost:${PORT}/health`);
    console.log(`Simulcasting: supports N destinations with individual FFmpeg fan-out`);
});
