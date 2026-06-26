const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.SIGNALING_PORT || 8083;

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }));
        return;
    }
    if (req.url === '/api/room' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { hostId } = JSON.parse(body);
                const roomId = crypto.randomBytes(8).toString('hex');
                rooms.set(roomId, { hostId, guests: new Map() });
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ roomId, url: `/guest/${roomId}` }));
            } catch {
                res.writeHead(400);
                res.end('Invalid request');
            }
        });
        return;
    }
    res.writeHead(404);
    res.end();
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

wss.on('connection', (ws) => {
    let currentRoom = null;
    let peerId = null;

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());

            switch (msg.type) {
                case 'join': {
                    currentRoom = msg.roomId;
                    peerId = msg.peerId || crypto.randomBytes(4).toString('hex');
                    const room = rooms.get(currentRoom);
                    if (!room) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
                        return;
                    }
                    room.guests.set(peerId, { ws, name: msg.name || 'Guest' });
                    ws.send(JSON.stringify({ type: 'joined', peerId, role: msg.role }));
                    if (msg.role === 'guest') {
                        const host = room.guests.get(room.hostId);
                        if (host && host.ws.readyState === WebSocket.OPEN) {
                            host.ws.send(JSON.stringify({
                                type: 'guest-joined',
                                peerId,
                                name: msg.name || 'Guest',
                            }));
                        }
                    }
                    break;
                }

                case 'offer':
                case 'answer':
                case 'ice-candidate': {
                    const room = rooms.get(currentRoom);
                    if (!room) return;
                    const target = room.guests.get(msg.targetId);
                    if (target && target.ws.readyState === WebSocket.OPEN) {
                        target.ws.send(JSON.stringify({
                            ...msg,
                            fromId: peerId,
                        }));
                    }
                    break;
                }

                case 'remove-guest': {
                    const room = rooms.get(currentRoom);
                    if (!room) return;
                    const target = room.guests.get(msg.targetId);
                    if (target) {
                        target.ws.send(JSON.stringify({ type: 'removed' }));
                        target.ws.close();
                        room.guests.delete(msg.targetId);
                    }
                    break;
                }
            }
        } catch {
            // Ignore malformed messages
        }
    });

    ws.on('close', () => {
        if (currentRoom && peerId) {
            const room = rooms.get(currentRoom);
            if (room) {
                room.guests.delete(peerId);
                const host = room.guests.get(room.hostId);
                if (host && host.ws.readyState === WebSocket.OPEN) {
                    host.ws.send(JSON.stringify({ type: 'guest-left', peerId }));
                }
                if (room.guests.size === 0) {
                    rooms.delete(currentRoom);
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
