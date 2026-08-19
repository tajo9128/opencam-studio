import { useState, useRef, useCallback } from 'react';

const API_BASE = window.location.origin;

export const useServerRecording = () => {
    const [sessionId, setSessionId] = useState(null);
    const [videoUrl, setVideoUrl] = useState(null);
    const [proxyUrl, setProxyUrl] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);
    const wsRef = useRef(null);
    const resolveRef = useRef(null);
    const rejectRef = useRef(null);

    const start = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/record/start`, { method: 'POST' });
            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            const data = await res.json();
            setSessionId(data.sessionId);

            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsPath = data.wsUrl || '/ws/record';
            const baseWsUrl = wsPath.startsWith('ws') ? wsPath : `${wsProtocol}//${window.location.host}${wsPath.split('?')[0]}`;
            const separator = baseWsUrl.includes('?') ? '&' : '?';
            const socket = new WebSocket(`${baseWsUrl}${separator}session=${data.sessionId}`);
            wsRef.current = socket;

            // Set binary type for large chunks
            socket.binaryType = 'arraybuffer';

            return new Promise((resolve, reject) => {
                socket.onopen = () => resolve(data.sessionId);
                socket.onerror = () => reject(new Error('WebSocket connection failed'));
            });
        } catch (err) {
            setError(err.message);
            return null;
        }
    }, []);

    const sendChunk = useCallback((chunk) => {
        try {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(chunk);
            }
        } catch { /* ignore */ }
    }, []);

    const stop = useCallback(() => {
        setIsProcessing(true);
        return new Promise((resolve, reject) => {
            resolveRef.current = resolve;
            rejectRef.current = reject;

            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                setIsProcessing(false);
                reject(new Error('Server not connected'));
                return;
            }

            wsRef.current.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === 'ready') {
                        setVideoUrl(msg.videoUrl);
                        setProxyUrl(msg.proxyUrl);
                        setIsProcessing(false);
                        if (resolveRef.current) {
                            resolveRef.current({ videoUrl: msg.videoUrl, proxyUrl: msg.proxyUrl });
                            resolveRef.current = null;
                        }
                    } else if (msg.type === 'error') {
                        setIsProcessing(false);
                        if (rejectRef.current) {
                            rejectRef.current(new Error(msg.error));
                            rejectRef.current = null;
                        }
                    }
                } catch { /* ignore */ }
            };

            wsRef.current.onclose = () => {
                if (rejectRef.current) {
                    rejectRef.current(new Error('Connection closed'));
                    rejectRef.current = null;
                }
                setIsProcessing(false);
            };

            wsRef.current.send(JSON.stringify({ type: 'stop' }));

            setTimeout(() => {
                if (resolveRef.current) {
                    resolveRef.current(null);
                    resolveRef.current = null;
                }
                setIsProcessing(false);
            }, 600000); // 10 min timeout for large recordings
        });
    }, []);

    const sendJson = useCallback((payload) => {
        try {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify(payload));
            }
        } catch { /* ignore */ }
    }, []);

    const cancel = useCallback(() => {
        if (wsRef.current) {
            try { wsRef.current.close(); } catch { /* ignore */ }
            wsRef.current = null;
        }
        setSessionId(null);
        setVideoUrl(null);
        setProxyUrl(null);
        setIsProcessing(false);
        setError(null);
    }, []);

    const serverUrl = videoUrl ? `${API_BASE}${videoUrl}` : null;
    const serverProxyUrl = proxyUrl ? `${API_BASE}${proxyUrl}` : null;

    return { sessionId, videoUrl: serverUrl, proxyUrl: serverProxyUrl, isProcessing, error, start, sendChunk, sendJson, stop, cancel };
};
