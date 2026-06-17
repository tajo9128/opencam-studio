import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useStreams } from '../hooks/useStreams';
import { useRecording } from '../hooks/useRecording';
import { useAudioLevel } from '../hooks/useAudioLevel';
import { recordingStore } from '../utils/RecordingStore';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { Toast } from './Notifications/Toast';
import { BACKGROUND_PRESETS } from '../constants/backgrounds';
import './ScreenRecorder.css';

const QUALITY_PRESETS = {
    'native': { width: null, height: null, bitrate: 15000000 },
    '720p': { width: 1280, height: 720, bitrate: 6000000 },
    '1080p': { width: 1920, height: 1080, bitrate: 12000000 },
    '1440p': { width: 2560, height: 1440, bitrate: 20000000 },
};

const ScreenRecorder = () => {
    const canvasRef = useRef(null);
    const screenVideoRef = useRef(null);
    const cameraVideoRef = useRef(null);

    const [toast, setToast] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [recQuality, setRecQuality] = useState('1080p');
    const [enhancedAudio, setEnhancedAudio] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [micEnabled, setMicEnabled] = useState(false);
    const [activeBg, setActiveBg] = useState('none');
    const [directoryHandle, setDirectoryHandle] = useState(null);
    const [isStarting, setIsStarting] = useState(false);
    const isStartingRef = useRef(false);

    const { screenStream, audioStream, cameraStream, toggleScreen, toggleMic, toggleCamera, stopAll, screenDimensions } = useStreams(screenVideoRef, cameraVideoRef, () => {});
    const audioLevel = useAudioLevel(audioStream);
    const { processedStream } = useAudioProcessor(audioStream, enhancedAudio);

    const handleComplete = useCallback(async (blob, mimeType) => {
        if (!blob) {
            setToast({ title: 'Recording Failed', message: 'No video captured', type: 'error' });
            return;
        }
        recordingStore.set(blob, mimeType);

        const ext = '.webm';
        const name = `recording-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}${ext}`;
        const blobUrl = URL.createObjectURL(blob);

        try {
            // Try saving to folder first
            if (directoryHandle) {
                const fileHandle = await directoryHandle.getFileHandle(name, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                setToast({ title: 'Saved', message: `Saved to ${directoryHandle.name}/${name}`, type: 'success' });
            } else {
                const a = document.createElement('a');
                a.href = blobUrl; a.download = name;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setToast({ title: 'Saved', message: 'Check your downloads folder', type: 'success' });
            }
        } catch {
            const a = document.createElement('a');
            a.href = blobUrl; a.download = name;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setToast({ title: 'Saved', message: 'Download triggered', type: 'success' });
        }
    }, [directoryHandle]);

    const { isRecording, isPaused, status, startRecording, pauseRecording, resumeRecording, stopRecording } = useRecording({
        screenStream, audioStream: processedStream || audioStream, cameraStream,
        activeBg, screenScale: 1.0, canvasRef,
        recordingQuality: recQuality,
        bitrate: QUALITY_PRESETS[recQuality].bitrate,
        useCanvas: true,
        onComplete: handleComplete,
    });

    // Elapsed timer
    useEffect(() => {
        if (!isRecording) { setElapsedTime(0); return; }
        const iv = setInterval(() => setElapsedTime(t => t + 1), 1000);
        return () => clearInterval(iv);
    }, [isRecording]);

    // Cleanup on unmount
    useEffect(() => () => { stopAll(); }, []);

    // Prevent page close during recording
    useEffect(() => {
        if (!isRecording) return;
        const h = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
    }, [isRecording]);

    // Canvas sizing
    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        const q = QUALITY_PRESETS[recQuality];
        let w = q.width || screenDimensions.width || 1920;
        let h = q.height || screenDimensions.height || 1080;
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }, [recQuality, screenDimensions]);

    // Canvas render loop
    useEffect(() => {
        let running = true;
        const loop = () => {
            if (!running) return;
            const c = canvasRef.current;
            if (!c) { requestAnimationFrame(loop); return; }
            const ctx = c.getContext('2d', { alpha: false });
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, c.width, c.height);

            // Draw screen
            if (screenStream && screenVideoRef.current?.readyState >= 2) {
                const v = screenVideoRef.current;
                const a = v.videoWidth / v.videoHeight;
                const ca = c.width / c.height;
                let dw, dh;
                if (a > ca) { dw = c.width; dh = c.width / a; } else { dh = c.height; dw = c.height * a; }
                ctx.drawImage(v, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
            }

            // Draw camera PiP
            if (cameraStream && cameraVideoRef.current?.readyState >= 2) {
                const v = cameraVideoRef.current;
                const a = v.videoWidth / v.videoHeight;
                const bs = c.height * 0.22;
                let dw, dh;
                if (a > 1) { dw = bs * a; dh = bs; } else { dw = bs; dh = bs / a; }
                const px = c.width - dw - 20, py = c.height - dh - 20;
                ctx.save();
                ctx.beginPath();
                ctx.arc(px + bs / 2, py + bs / 2, bs / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(v, px, py, dw, dh);
                ctx.restore();
            }

            requestAnimationFrame(loop);
        };
        loop();
        return () => { running = false; };
    }, [screenStream, cameraStream]);

    // Keyboard
    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'Space') { e.preventDefault(); if (isRecording) stopRecording(); else startFlow(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isRecording]);

    // === CORE FLOW: One click starts everything ===
    const startFlow = useCallback(async () => {
        if (isStartingRef.current || isRecording) return;
        isStartingRef.current = true;
        setIsStarting(true);

        try {
            // If no screen stream, open screen picker
            if (!screenStream) {
                await toggleScreen();
            }
            // If user cancelled screen picker, stop
            if (!screenStream && !cameraStream) {
                setIsStarting(false);
                isStartingRef.current = false;
                return;
            }
            // Auto-enable mic if not active
            if (!audioStream) {
                await toggleMic().catch(() => {});
            }
            // Start recording
            setTimeout(() => {
                startRecording();
                setIsStarting(false);
                isStartingRef.current = false;
            }, 300);
        } catch {
            setIsStarting(false);
            isStartingRef.current = false;
        }
    }, [screenStream, audioStream, cameraStream, isRecording, toggleScreen, toggleMic, startRecording]);

    const fmtTime = (s) => `${Math.floor(s/60).toString().padStart(2, '0')}:${(s%60).toString().padStart(2, '0')}`;

    // Try restore folder
    useEffect(() => {
        import('../utils/StorageManager').then(m => m.storageManager).then(sm => {
            sm.getSetting('workspace_handle').then(h => { if (h) setDirectoryHandle(h); }).catch(() => {});
        }).catch(() => {});
    }, []);

    return (
        <div className="recorder-page">
            {/* Preview */}
            <div className={`recorder-preview ${isRecording ? 'recording' : ''}`}>
                <canvas ref={canvasRef} className="recorder-canvas" />
                {!screenStream && !cameraStream && !isStarting && (
                    <div className="recorder-start-screen">
                        <div className="recorder-start-icon">🎬</div>
                        <h2>Start Recording Your Screen</h2>
                        <p>Record screen, webcam, and audio — auto-saves on stop</p>
                        <button className="recorder-start-btn" onClick={startFlow} disabled={isStarting}>
                            {isStarting ? 'Opening Screen Picker...' : 'Start Recording'}
                        </button>
                        <p className="recorder-hint">or press <kbd>Space</kbd></p>
                    </div>
                )}
            </div>

            {/* Recording bar */}
            {isRecording && (
                <div className="recorder-bar">
                    <div className="recorder-bar-left">
                        <span className="recorder-rec-dot" />
                        <span className="recorder-timer">{fmtTime(elapsedTime)}</span>
                        <span className="recorder-q">· {recQuality} · ~{Math.round(elapsedTime * QUALITY_PRESETS[recQuality].bitrate / 8000000)} MB</span>
                    </div>
                    <div className="recorder-bar-center">
                        {isPaused ? (
                            <button className="recorder-btn-play" onClick={resumeRecording}>Resume</button>
                        ) : (
                            <button className="recorder-btn-pause" onClick={pauseRecording}>Pause</button>
                        )}
                        <button className="recorder-btn-stop" onClick={stopRecording}>Stop Recording</button>
                    </div>
                    <div className="recorder-bar-right">
                        {audioStream && (
                            <div className="recorder-audio-level">
                                <div className="recorder-audio-fill" style={{ width: `${Math.min(audioLevel * 100, 100)}%` }} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Controls */}
            {!isRecording && (
                <div className="recorder-controls">
                    <button className={`recorder-ctrl ${cameraEnabled ? 'active' : ''}`}
                        onClick={async () => { await toggleCamera(); setCameraEnabled(!!cameraStream); }}>
                        📷 {cameraEnabled ? 'Camera On' : 'Camera'}
                    </button>
                    <button className={`recorder-ctrl ${micEnabled ? 'active' : ''}`}
                        onClick={async () => { await toggleMic(); setMicEnabled(!!audioStream); }}>
                        🎤 {micEnabled ? 'Mic On' : 'Mic'}
                    </button>
                    <button className={`recorder-ctrl ${enhancedAudio ? 'active' : ''}`}
                        onClick={() => setEnhancedAudio(!enhancedAudio)}>
                        {enhancedAudio ? 'Audio Enhanced' : 'Raw Audio'}
                    </button>
                    <select className="recorder-ctrl" value={recQuality} onChange={e => setRecQuality(e.target.value)}>
                        <option value="720p">720p HD</option>
                        <option value="1080p">1080p FHD</option>
                        <option value="1440p">1440p 2K</option>
                        <option value="native">Native</option>
                    </select>
                </div>
            )}

            <Toast toast={toast} onClose={() => setToast(null)} />
        </div>
    );
};

export default ScreenRecorder;
