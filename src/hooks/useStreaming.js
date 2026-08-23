import { useState, useCallback, useRef, useEffect } from 'react';

export const useStreaming = () => {
    const [isStreaming, setIsStreaming] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [streamError, setStreamError] = useState(null);
    const [streamStats, setStreamStats] = useState({ bitrate: 0, fps: 0, droppedFrames: 0, uptime: 0, bytesSent: 0 });
    const [destinations, setDestinations] = useState(() => {
        try {
            const saved = localStorage.getItem('stream_destinations');
            return saved ? JSON.parse(saved) : [{ platform: 'youtube', streamKey: '', rtmpUrl: '', label: 'YouTube' }];
        } catch { return [{ platform: 'youtube', streamKey: '', rtmpUrl: '', label: 'YouTube' }]; }
    });
    const [destStatuses, setDestStatuses] = useState({});
    const [relayUrl, setRelayUrlState] = useState(() => {
        const saved = localStorage.getItem('stream_relay_url');
        if (saved && saved !== 'ws://localhost:8080') return saved;
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${window.location.host}/rtmp`;
    });
    const [resolution, setResolution] = useState('1080p');
    const [bitrate, setBitrate] = useState(6000);

    const wsRef = useRef(null);
    const recorderRef = useRef(null);
    const startTimeRef = useRef(null);
    const statsIntervalRef = useRef(null);
    const bytesSentRef = useRef(0);
    const isStreamingRef = useRef(false);

    useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);

    const persistDestinations = useCallback((dests) => {
        localStorage.setItem('stream_destinations', JSON.stringify(dests));
        setDestinations(dests);
    }, []);

    const addDestination = useCallback((platform = 'custom') => {
        const defaults = {
            youtube: { rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2', label: 'YouTube' },
            twitch: { rtmpUrl: 'rtmp://live.twitch.tv/app', label: 'Twitch' },
            custom: { rtmpUrl: '', label: 'Custom RTMP' },
        };
        const d = defaults[platform] || defaults.custom;
        setDestinations(prev => {
            const next = [...prev, { platform, streamKey: '', rtmpUrl: d.rtmpUrl, label: d.label }];
            persistDestinations(next);
            return next;
        });
    }, [persistDestinations]);

    const removeDestination = useCallback((index) => {
        setDestinations(prev => {
            const next = prev.filter((_, i) => i !== index);
            persistDestinations(next);
            return next;
        });
    }, [persistDestinations]);

    const updateDestination = useCallback((index, updates) => {
        setDestinations(prev => {
            const next = prev.map((d, i) => i === index ? { ...d, ...updates } : d);
            persistDestinations(next);
            return next;
        });
    }, [persistDestinations]);

    const setPlatform = useCallback((index, platform) => {
        const defaults = {
            youtube: { rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2', label: 'YouTube' },
            twitch: { rtmpUrl: 'rtmp://live.twitch.tv/app', label: 'Twitch' },
            custom: { rtmpUrl: '', label: 'Custom RTMP' },
        };
        updateDestination(index, { platform, ...defaults[platform] || defaults.custom });
    }, [updateDestination]);

    const setRelayUrl = useCallback((url) => {
        setRelayUrlState(url);
        localStorage.setItem('stream_relay_url', url);
    }, []);

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
        setDestStatuses({});
        setStreamStats({ bitrate: 0, fps: 0, droppedFrames: 0, uptime: 0, bytesSent: 0 });
    }, []);

    const startStream = useCallback(async (canvas, audioStream) => {
        if (isStreaming) return;
        const validDests = destinations.filter(d => d.streamKey && d.rtmpUrl);
        if (validDests.length === 0) {
            setStreamError('At least one destination with a stream key is required.');
            return;
        }

        setIsConnecting(true);
        setStreamError(null);

        try {
            const ws = new WebSocket(relayUrl);
            ws.binaryType = 'arraybuffer';

            ws.onopen = () => {
                // Build destinations for relay
                const relayDests = validDests.map(d => ({
                    platform: d.platform,
                    rtmpUrl: `${d.rtmpUrl.endsWith('/') ? d.rtmpUrl.slice(0, -1) : d.rtmpUrl}/${d.streamKey}`,
                    label: d.label,
                }));

                ws.send(JSON.stringify({
                    type: 'config',
                    destinations: relayDests,
                    resolution,
                    bitrate: bitrate * 1000,
                    framerate: 30,
                    audioBitrate: 128000,
                }));

                const canvasStream = canvas.captureStream(30);

                if (audioStream) {
                    audioStream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
                }

                const mimeTypes = [
                    'video/webm;codecs=vp8,opus',
                    'video/webm;codecs=vp9,opus',
                    'video/webm;codecs=h264,opus',
                    'video/webm',
                ];
                const selectedMimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';

                const recorder = new MediaRecorder(canvasStream, {
                    mimeType: selectedMimeType,
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

                recorder.start(1000);
                recorderRef.current = recorder;
                wsRef.current = ws;
                startTimeRef.current = Date.now();
                bytesSentRef.current = 0;
                setIsStreaming(true);
                setIsConnecting(false);

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

            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === 'dest_status') {
                        setDestStatuses(prev => ({ ...prev, [msg.platform]: msg }));
                    }
                    if (msg.type === 'started') {
                        setDestStatuses({});
                    }
                } catch { /* ignore non-JSON messages */ }
            };

            ws.onerror = () => {
                setStreamError(`Cannot connect to relay server at ${relayUrl}. Make sure rtmp-relay is running.`);
                setIsConnecting(false);
            };

            ws.onclose = () => {
                if (isStreamingRef.current) stopStream();
            };

        } catch (err) {
            setStreamError(err.message);
            setIsConnecting(false);
        }
    }, [isStreaming, destinations, relayUrl, resolution, bitrate, stopStream]);

    const checkRelay = useCallback(async () => {
        try {
            const httpUrl = relayUrl.replace('ws://', 'http://').replace('wss://', 'https://');
            const res = await fetch(`${httpUrl}/health`, { signal: AbortSignal.timeout(3000) });
            return res.ok;
        } catch { return false; }
    }, [relayUrl]);

    useEffect(() => {
        return () => {
            if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
            wsRef.current?.close();
            if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
        };
    }, []);

    return {
        isStreaming, isConnecting, streamError, streamStats,
        destinations, destStatuses,
        addDestination, removeDestination, updateDestination, setPlatform,
        relayUrl, setRelayUrl,
        resolution, setResolution,
        bitrate, setBitrate,
        startStream, stopStream, checkRelay,
    };
};
