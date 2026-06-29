import React, { useState, useEffect, useRef } from 'react';
import './GuestPage.css';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

export const GuestPage = () => {
    const [name, setName] = useState('');
    const [joined, setJoined] = useState(false);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const pcRef = useRef(null);
    const wsRef = useRef(null);

    const roomId = window.location.pathname.split('/guest/')[1];

    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                streamRef.current = stream;
                if (videoRef.current) videoRef.current.srcObject = stream;
            })
            .catch(() => {
                navigator.mediaDevices.getUserMedia({ video: true })
                    .then(stream => {
                        streamRef.current = stream;
                        if (videoRef.current) videoRef.current.srcObject = stream;
                    })
                    .catch(err => setError('Camera access required: ' + err.message));
            });
    }, []);

    const handleJoin = async () => {
        if (!name.trim() || !roomId) return;
        setStatus('connecting');

        try {
            const ws = new WebSocket('ws://localhost:8083');
            wsRef.current = ws;

            ws.onopen = () => {
                ws.send(JSON.stringify({
                    type: 'join',
                    roomId,
                    role: 'guest',
                    name: name.trim(),
                }));
            };

            ws.onmessage = async (event) => {
                const msg = JSON.parse(event.data);

                switch (msg.type) {
                    case 'joined':
                        setStatus('connected');
                        setJoined(true);
                        break;

                    case 'offer': {
                        const pc = new RTCPeerConnection(ICE_SERVERS);
                        pcRef.current = pc;

                        if (streamRef.current) {
                            streamRef.current.getTracks().forEach(track => {
                                pc.addTrack(track, streamRef.current);
                            });
                        }

                        pc.onicecandidate = (event) => {
                            if (event.candidate) {
                                ws.send(JSON.stringify({
                                    type: 'ice-candidate',
                                    targetId: msg.fromId,
                                    candidate: event.candidate,
                                }));
                            }
                        };

                        await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);

                        ws.send(JSON.stringify({
                            type: 'answer',
                            targetId: msg.fromId,
                            answer: pc.localDescription,
                        }));
                        break;
                    }

                    case 'ice-candidate': {
                        if (pcRef.current && msg.candidate) {
                            await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
                        }
                        break;
                    }

                    case 'removed':
                        setStatus('removed');
                        if (pcRef.current) pcRef.current.close();
                        break;

                    case 'error':
                        setError(msg.message);
                        break;
                }
            };

            ws.onclose = () => {
                if (status !== 'removed') setStatus('disconnected');
            };
        } catch (err) {
            setError('Connection failed: ' + err.message);
        }
    };

    useEffect(() => {
        return () => {
            if (pcRef.current) pcRef.current.close();
            if (wsRef.current) wsRef.current.close();
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    if (!roomId) {
        return (
            <div className="guest-page">
                <div className="guest-card">
                    <h1>OpenCam Studio</h1>
                    <p className="guest-error">Invalid room link</p>
                </div>
            </div>
        );
    }

    return (
        <div className="guest-page">
            <div className="guest-card">
                <h1>OpenCam Studio</h1>
                <p className="guest-subtitle">Join as a guest</p>

                {!joined ? (
                    <>
                        <div className="guest-preview">
                            <video ref={videoRef} autoPlay muted playsInline className="guest-video" />
                        </div>

                        <input
                            type="text"
                            className="guest-name-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name"
                            maxLength={30}
                        />

                        <button
                            className="guest-join-btn"
                            onClick={handleJoin}
                            disabled={!name.trim() || status === 'connecting'}
                        >
                            {status === 'connecting' ? 'Connecting...' : 'Join Stream'}
                        </button>
                    </>
                ) : (
                    <div className="guest-connected">
                        <div className="guest-preview">
                            <video ref={videoRef} autoPlay muted playsInline className="guest-video" />
                        </div>
                        <p className="guest-status">You're connected!</p>
                        <p className="guest-hint">The host will add you to the stream.</p>
                    </div>
                )}

                {error && <p className="guest-error">{error}</p>}
                {status === 'removed' && <p className="guest-error">You've been removed from the stream.</p>}
            </div>
        </div>
    );
};
