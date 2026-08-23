import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

// Location-relative signaling endpoint so the app works behind any host,
// not just localhost. Can be overridden for advanced setups.
function defaultSignalingUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/signaling`;
}

export const useGuests = (signalingUrl) => {
    const resolvedUrl = signalingUrl || defaultSignalingUrl();
    const [guests, setGuests] = useState([]);
    const [roomId, setRoomId] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const peerConnections = useRef(new Map());
    const localStreamRef = useRef(null);
    const hostTokenRef = useRef(null);

    const createRoom = useCallback(async (localStream) => {
        localStreamRef.current = localStream;
        setIsHost(true);

        const ws = new WebSocket(resolvedUrl);
        wsRef.current = ws;

        return new Promise((resolve, reject) => {
            const failTimer = setTimeout(() => reject(new Error('Signaling server unreachable')), 10000);
            ws.onopen = async () => {
                try {
                    // Relative URL - goes through nginx to the signaling server.
                    const res = await fetch('/signaling/api/room', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hostId: 'host' }),
                    });
                    if (!res.ok) throw new Error(`Room creation failed (${res.status})`);
                    const { roomId: id, hostToken } = await res.json();
                    hostTokenRef.current = hostToken;
                    setRoomId(id);
                    setConnected(true);
                    clearTimeout(failTimer);

                    ws.send(JSON.stringify({
                        type: 'join',
                        roomId: id,
                        peerId: 'host',
                        role: 'host',
                        name: 'Host',
                        hostToken,
                    }));

                    resolve(id);
                } catch (err) {
                    clearTimeout(failTimer);
                    reject(err);
                }
            };
            ws.onerror = () => {
                clearTimeout(failTimer);
                reject(new Error('Cannot connect to signaling server'));
            };
            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                handleHostMessage(msg);
            };
        });
    }, [resolvedUrl]);

    const handleHostMessage = useCallback((msg) => {
        switch (msg.type) {
            case 'guest-joined': {
                setGuests(prev => [...prev, { id: msg.peerId, name: msg.name, stream: null }]);
                createPeerConnection(msg.peerId, true);
                break;
            }
            case 'guest-left': {
                setGuests(prev => prev.filter(g => g.id !== msg.peerId));
                const pc = peerConnections.current.get(msg.peerId);
                if (pc) {
                    pc.close();
                    peerConnections.current.delete(msg.peerId);
                }
                break;
            }
            case 'answer': {
                const pc = peerConnections.current.get(msg.fromId);
                if (pc) pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
                break;
            }
            case 'ice-candidate': {
                const pc = peerConnections.current.get(msg.fromId);
                if (pc && msg.candidate) {
                    pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
                }
                break;
            }
        }
    }, []);

    const createPeerConnection = useCallback(async (guestId, isInitiator) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnections.current.set(guestId, pc);

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });
        }

        pc.ontrack = (event) => {
            setGuests(prev => prev.map(g =>
                g.id === guestId ? { ...g, stream: event.streams[0] } : g
            ));
        };

        pc.onicecandidate = (event) => {
            if (event.candidate && wsRef.current) {
                wsRef.current.send(JSON.stringify({
                    type: 'ice-candidate',
                    targetId: guestId,
                    candidate: event.candidate,
                }));
            }
        };

        if (isInitiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            wsRef.current.send(JSON.stringify({
                type: 'offer',
                targetId: guestId,
                offer: pc.localDescription,
            }));
        }

        return pc;
    }, []);

    const removeGuest = useCallback((peerId) => {
        if (wsRef.current) {
            wsRef.current.send(JSON.stringify({ type: 'remove-guest', targetId: peerId }));
        }
        setGuests(prev => prev.filter(g => g.id !== peerId));
    }, []);

    useEffect(() => {
        return () => {
            peerConnections.current.forEach(pc => pc.close());
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    return {
        guests,
        roomId,
        isHost,
        connected,
        createRoom,
        removeGuest,
    };
};
