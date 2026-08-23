// WebRTC signaling server for guest streaming.
//
// Auth model:
//   - POST /api/room creates a room and returns { roomId, hostToken }.
//   - Joining as host REQUIRES the hostToken; the server forces the host's
//     peerId to the registered hostId so it cannot be spoofed.
//   - Guests join with the roomId only; peer ids are validated against the
//     room roster (no impersonation of the host or other guests).
//   - remove-guest is accepted only from the authenticated host connection.
//   - Guests may exchange offer/answer/ICE only with the host, never directly
//     with other guests.
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.SIGNALING_PORT || 8083;
const BASE_PATH = process.env.SIGNALING_BASE_PATH || ''; // e.g. '/signaling' behind nginx
const MAX_GUESTS = parseInt(process.env.MAX_GUESTS, 10) || 8;
const MAX_ROOMS = parseInt(process.env.MAX_ROOMS, 10) || 100;

const rooms = new Map(); // roomId -> { hostId, hostToken, guests: Map<peerId, {ws,name,role,authed}> }

// Normalize request path so the same handlers work direct or behind a prefix.
function normalizePath(req) {
    let p = req.url.split('?')[0];
    if (BASE_PATH && p.startsWith(BASE_PATH)) p = p.slice(BASE_PATH.length) || '/';
    return p;
}

function cors(res, origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
}

const server = http.createServer((req, res) => {
    const origin = req.headers.origin || 'http://localhost:3000';
    const path = normalizePath(req);

    if (path === '/health') {
        cors(res, origin);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }));
        return;
    }

    if (path === '/api/room' && req.method === 'POST') {
        let body = '';
        let bodySize = 0;
        req.on('data', chunk => {
            bodySize += chunk.length;
            if (bodySize > 64 * 1024) { // room creation payload is tiny
                cors(res, origin);
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Request body too large' }));
                req.destroy();
                return;
            }
            body += chunk;
        });
        req.on('end', () => {
            try {
                if (rooms.size >= MAX_ROOMS) {
                    cors(res, origin);
                    res.writeHead(429, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Too many active rooms' }));
                    return;
                }
                const { hostId } = JSON.parse(body);
                if (!hostId || typeof hostId !== 'string' || hostId.length > 64) {
                    cors(res, origin);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid hostId' }));
                    return;
                }
                const roomId = crypto.randomBytes(8).toString('hex');
                const hostToken = crypto.randomBytes(24).toString('hex');
                rooms.set(roomId, { hostId, hostToken, createdAt: Date.now(), guests: new Map() });
                console.log(`[${new Date().toISOString()}] room ${roomId} created`);
                cors(res, origin);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ roomId, hostToken }));
            } catch {
                cors(res, origin);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return;
    }
    res.writeHead(404);
    res.end();
});

const wss = new WebSocket.Server({ server });

function safeSend(ws, obj) {
    try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); } catch { /* */ }
}

wss.on('connection', (ws) => {
    let currentRoom = null;
    let peerId = null;
    let myRole = null;

    ws.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        if (!msg || typeof msg.type !== 'string') return;

        switch (msg.type) {
            case 'join': {
                if (currentRoom) { safeSend(ws, { type: 'error', message: 'Already joined' }); return; }
                const room = rooms.get(msg.roomId);
                if (!room) { safeSend(ws, { type: 'error', message: 'Room not found' }); return; }
                if (typeof msg.hostToken !== 'string') msg.hostToken = '';
                const wantsHost = msg.role === 'host';

                if (wantsHost) {
                    // Host must prove ownership of the room.
                    if (msg.hostToken !== room.hostToken) {
                        safeSend(ws, { type: 'error', message: 'Invalid host token' });
                        return;
                    }
                    peerId = room.hostId;
                    myRole = 'host';
                } else {
                    // Guest: validate identity against the roster.
                    const requested = typeof msg.peerId === 'string' ? msg.peerId.slice(0, 64) : crypto.randomBytes(4).toString('hex');
                    if (requested === room.hostId || room.guests.has(requested)) {
                        safeSend(ws, { type: 'error', message: 'Peer ID unavailable' });
                        return;
                    }
                    const guestCount = Array.from(room.guests.values()).filter(g => g.role === 'guest').length;
                    if (guestCount >= MAX_GUESTS) {
                        safeSend(ws, { type: 'error', message: 'Room is full' });
                        return;
                    }
                    peerId = requested;
                    myRole = 'guest';
                }

                currentRoom = msg.roomId;
                room.guests.set(peerId, { ws, name: String(msg.name || 'Guest').slice(0, 64), role: myRole });
                safeSend(ws, { type: 'joined', peerId, role: myRole });

                if (myRole === 'guest') {
                    const host = room.guests.get(room.hostId);
                    safeSend(host && host.ws, {
                        type: 'guest-joined',
                        peerId,
                        name: String(msg.name || 'Guest').slice(0, 64),
                    });
                }
                break;
            }

            case 'offer':
            case 'answer':
            case 'ice-candidate': {
                const room = currentRoom && rooms.get(currentRoom);
                if (!room || !myRole) return;
                const targetId = typeof msg.targetId === 'string' ? msg.targetId : '';
                // Guests may only talk to the host; host may talk to anyone in the room.
                if (myRole === 'guest' && targetId !== room.hostId) return;
                const target = room.guests.get(targetId);
                if (target && target.ws.readyState === WebSocket.OPEN) {
                    safeSend(target.ws, { ...msg, fromId: peerId });
                }
                break;
            }

            case 'remove-guest': {
                const room = currentRoom && rooms.get(currentRoom);
                if (!room || !myRole) return;
                if (myRole !== 'host') { safeSend(ws, { type: 'error', message: 'Host only' }); return; }
                const targetId = typeof msg.targetId === 'string' ? msg.targetId : '';
                if (targetId === room.hostId) return; // cannot kick self
                const target = room.guests.get(targetId);
                if (target) {
                    safeSend(target.ws, { type: 'removed' });
                    try { target.ws.close(); } catch { /* */ }
                    room.guests.delete(targetId);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        if (!currentRoom || !peerId) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        const wasHost = peerId === room.hostId;
        room.guests.delete(peerId);

        if (wasHost) {
            // Host left: tear down the whole room so guests are never stranded.
            for (const [, g] of room.guests) {
                safeSend(g.ws, { type: 'error', message: 'Host disconnected' });
                try { g.ws.close(); } catch { /* */ }
            }
            rooms.delete(currentRoom);
            console.log(`[${new Date().toISOString()}] room ${currentRoom} closed (host left)`);
        } else {
            const host = room.guests.get(room.hostId);
            safeSend(host && host.ws, { type: 'guest-left', peerId });
            if (room.guests.size === 0) rooms.delete(currentRoom);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}${BASE_PATH ? ` (base path ${BASE_PATH})` : ''}`);
});

