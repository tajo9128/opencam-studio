import { useState, useCallback, useRef, useEffect } from 'react';

// Streaming hook — sends canvas + audio to RTMP relay server via WebSocket
// The relay server (server/rtmp-relay.js) forwards to YouTube Live / Twitch RTMP ingest

export const useStreaming = () => {
    const [isStreaming, setIsStreaming] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [streamError, setStreamError] = useState(null);
    const [streamStats, setStreamStats] = useState({ bitrate: 0, fps: 0, droppedFrames: 0, uptime: 0, bytesSent: 0 });
    const [platform, setPlatform] = useState('youtube'); // youtube, twitch, custom
    const [streamKey, setStreamKeyState] = useState(() => localStorage.getItem('stream_key') || '');
    const [rtmpUrl, setRtmpUrlState] = useState(() => localStorage.getItem('stream_rtmp_url') || 'rtmp://a.rtmp.youtube.com/live2');
    const [relayUrl, setRelayUrlState] = useState(() => localStorage.getItem('stream_relay_url') || 'ws://localhost:8080');
    const [resolution, setResolution] = useState('1080p');
    const [bitrate, setBitrate] = useState(6000); // kbps

    const wsRef = useRef(null);
    const recorderRef = useRef(null);
    const startTimeRef = useRef(null);
    const statsIntervalRef = useRef(null);
    const bytesSentRef = useRef(0);

    const setStreamKey = useCallback((key) => {
        setStreamKeyState(key);
        localStorage.setItem('stream_key', key);
    }, []);

    const setRtmpUrl = useCallback((url) => {
        setRtmpUrlState(url);
        localStorage.setItem('stream_rtmp_url', url);
    }, []);

    const setRelayUrl = useCallback((url) => {
        setRelayUrlState(url);
        localStorage.setItem('stream_relay_url', url);
    }, []);

    // Auto-set RTMP URL based on platform
    const selectPlatform = useCallback((p) => {
        setPlatform(p);
        if (p === 'youtube') setRtmpUrl('rtmp://a.rtmp.youtube.com/live2');
        else if (p === 'twitch') setRtmpUrl('rtmp://live.twitch.tv/app');
    }, [setRtmpUrl]);

    const startStream = useCallback(async (canvas, audioStream) => {
        if (isStreaming) return;
        if (!streamKey) {
            setStreamError('Stream key is required. Go to YouTube Studio > Stream to get your key.');
            return;
        }

        setIsConnecting(true);
        setStreamError(null);

        try {
            // Connect to RTMP relay server via WebSocket
            const ws = new WebSocket(relayUrl);
            ws.binaryType = 'arraybuffer';

            ws.onopen = () => {
                // Send config
                ws.send(JSON.stringify({
                    type: 'config',
                    rtmpUrl: `${rtmpUrl}/${streamKey}`,
                    resolution,
                    bitrate: bitrate * 1000,
                    framerate: 30,
                    audioBitrate: 128000,
                }));

                // Start MediaRecorder on canvas
                const canvasStream = canvas.captureStream(30);

                // Add audio tracks if available
                if (audioStream) {
                    audioStream.getAudioTracks().forEach(track => {
                        canvasStream.addTrack(track);
                    });
                }

                const recorder = new MediaRecorder(canvasStream, {
                    mimeType: 'video/webm;codecs=vp8,opus',
                    videoBitsPerSecond: bitrate * 1000,
                    audioBitsPerSecond: 128000,
                });

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                        e.data.arrayBuffer().then(buffer => {
                            ws.send(buffer);
                            bytesSentRef.current += buffer.byteLength;
                        });
                    }
                };

                recorder.onerror = (e) => {
                    setStreamError('Recording error: ' + e.error?.message);
                    stopStream();
                };

                recorder.start(1000); // 1-second chunks
                recorderRef.current = recorder;
                wsRef.current = ws;
                startTimeRef.current = Date.now();
                bytesSentRef.current = 0;
                setIsStreaming(true);
                setIsConnecting(false);

                // Stats update interval
                statsIntervalRef.current = setInterval(() => {
                    const elapsed = (Date.now() - startTimeRef.current) / 1000;
                    setStreamStats({
                        bitrate: Math.round((bytesSentRef.current * 8) / elapsed / 1000),
                        fps: 30,
                        droppedFrames: 0,
                        uptime: elapsed,
                        bytesSent: bytesSentRef.current,
                    });
                }, 2000);
            };

            ws.onerror = () => {
                setStreamError(`Cannot connect to relay server at ${relayUrl}. Make sure rtmp-relay is running.`);
                setIsConnecting(false);
            };

            ws.onclose = () => {
                if (isStreaming) {
                    stopStream();
                }
            };

        } catch (err) {
            setStreamError(err.message);
            setIsConnecting(false);
        }
    }, [isStreaming, streamKey, rtmpUrl, relayUrl, resolution, bitrate]);

    const stopStream = useCallback(() => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
        }
        if (wsRef.current) {
            wsRef.current.send(JSON.stringify({ type: 'stop' }));
            wsRef.current.close();
            wsRef.current = null;
        }
        if (statsIntervalRef.current) {
            clearInterval(statsIntervalRef.current);
            statsIntervalRef.current = null;
        }
        recorderRef.current = null;
        setIsStreaming(false);
        setIsConnecting(false);
        setStreamStats({ bitrate: 0, fps: 0, droppedFrames: 0, uptime: 0, bytesSent: 0 });
    }, []);

    // Check relay server availability
    const checkRelay = useCallback(async () => {
        try {
            // Try HTTP health check on relay
            const httpUrl = relayUrl.replace('ws://', 'http://').replace('wss://', 'https://');
            const res = await fetch(`${httpUrl}/health`, { signal: AbortSignal.timeout(3000) });
            return res.ok;
        } catch {
            return false;
        }
    }, [relayUrl]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
            wsRef.current?.close();
            if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
        };
    }, []);

    return {
        isStreaming, isConnecting, streamError, streamStats,
        platform, selectPlatform,
        streamKey, setStreamKey,
        rtmpUrl, setRtmpUrl,
        relayUrl, setRelayUrl,
        resolution, setResolution,
        bitrate, setBitrate,
        startStream, stopStream, checkRelay,
    };
};
