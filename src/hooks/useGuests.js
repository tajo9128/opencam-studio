import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

export const useGuests = (signalingUrl = 'ws://localhost:8083') => {
    const [guests, setGuests] = useState([]);
    const [roomId, setRoomId] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const peerConnections = useRef(new Map());
    const localStreamRef = useRef(null);

    const createRoom = useCallback(async (localStream) => {
        localStreamRef.current = localStream;
        setIsHost(true);

        const ws = new WebSocket(signalingUrl);
        wsRef.current = ws;

        return new Promise((resolve) => {
            ws.onopen = async () => {
                const res = await fetch('http://localhost:8083/api/room', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hostId: 'host' }),
                });
                const { roomId: id } = await res.json();
                setRoomId(id);
                setConnected(true);

                ws.send(JSON.stringify({
                    type: 'join',
                    roomId: id,
                    peerId: 'host',
                    role: 'host',
                    name: 'Host',
                }));

                resolve(id);
            };

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                handleHostMessage(msg);
            };
        });
    }, [signalingUrl]);

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
