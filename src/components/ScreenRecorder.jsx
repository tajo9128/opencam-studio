import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useStreams } from '../hooks/useStreams';
import { useRecording } from '../hooks/useRecording';
import { useAudioLevel } from '../hooks/useAudioLevel';
import { recordingStore } from '../utils/RecordingStore';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { Toast } from './Notifications/Toast';
import './ScreenRecorder.css';

const QUALITY_PRESETS = {
    'native': { width: null, height: null, bitrate: 15000000 },
    '720p': { width: 1280, height: 720, bitrate: 6000000 },
    '1080p': { width: 1920, height: 1080, bitrate: 12000000 },
    '1440p': { width: 2560, height: 1440, bitrate: 20000000 },
};

const RECORDING_TEMPLATES = [
    { id: 'screen-only', icon: '️', label: 'Screen', desc: 'Screen only' },
    { id: 'camera-only', icon: '📷', label: 'Camera', desc: 'Webcam only' },
    { id: 'pip-circle', icon: '', label: 'PiP Circle', desc: 'Screen + circle cam' },
    { id: 'pip-rect', icon: '📺', label: 'PiP Rect', desc: 'Screen + rect cam' },
    { id: 'side-by-side', icon: '', label: 'Side by Side', desc: 'Screen left, cam right' },
    { id: 'stacked', icon: '', label: 'Stacked', desc: 'Screen top, cam bottom' },
];

const ASPECT_RATIOS = [
    { id: '16:9', label: '16:9', w: 1920, h: 1080 },
    { id: '9:16', label: '9:16', w: 1080, h: 1920 },
    { id: '4:3', label: '4:3', w: 1440, h: 1080 },
    { id: '1:1', label: '1:1', w: 1080, h: 1080 },
];

const BG_PRESETS = [
    { id: 'none', label: 'None', color: '#1a1a1a' },
    { id: 'gradient1', label: 'Purple', color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { id: 'gradient2', label: 'Blue', color: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
    { id: 'gradient3', label: 'Green', color: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
    { id: 'gradient4', label: 'Orange', color: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
    { id: 'gradient5', label: 'Dark', color: 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 100%)' },
];

const drawFit = (ctx, video, x, y, w, h) => {
    const va = video.videoWidth / video.videoHeight;
    const ca = w / h;
    let dw, dh;
    if (va > ca) { dw = w; dh = w / va; } else { dh = h; dw = h * va; }
    ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
};

const getPipPos = (cw, ch, camW, camH, pad, corner) => {
    switch (corner) {
        case 'tl': return { x: pad, y: pad };
        case 'tr': return { x: cw - camW - pad, y: pad };
        case 'bl': return { x: pad, y: ch - camH - pad };
        default:  return { x: cw - camW - pad, y: ch - camH - pad };
    }
};

const ScreenRecorder = () => {
    const canvasRef = useRef(null);
    const screenVideoRef = useRef(null);
    const cameraVideoRef = useRef(null);

    const [toast, setToast] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [recQuality, setRecQuality] = useState('720p');
    const [enhancedAudio, setEnhancedAudio] = useState(true);
    const [activeBg, setActiveBg] = useState('gradient1');
    const [directoryHandle, setDirectoryHandle] = useState(null);
    const [isStarting, setIsStarting] = useState(false);
    const [layoutTemplate, setLayoutTemplate] = useState('pip-circle');
    const [pipCorner, setPipCorner] = useState('br');
    const [aspectRatio, setAspectRatio] = useState('16:9');
    const [openPanel, setOpenPanel] = useState(null);
    const [showTeleprompter, setShowTeleprompter] = useState(false);
    const [prompterText, setPrompterText] = useState('');
    const [prompterSpeed, setPrompterSpeed] = useState(3);
    const [prompterScroll, setPrompterScroll] = useState(0);
    const isStartingRef = useRef(false);
    const pipPosRef = useRef({ corner: 'br', x: 0, y: 0 });

    const { screenStream, audioStream, cameraStream, toggleScreen, toggleMic, toggleCamera, stopAll, screenDimensions } = useStreams(screenVideoRef, cameraVideoRef, () => {});
    const audioLevel = useAudioLevel(audioStream);
    const { processedStream } = useAudioProcessor(audioStream, enhancedAudio);

    const handleComplete = useCallback(async (blob, mimeType) => {
        if (!blob) { setToast({ title: 'Recording Failed', message: 'No video captured', type: 'error' }); return; }
        recordingStore.set(blob, mimeType);
        const ext = '.webm';
        const name = `recording-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}${ext}`;
        const blobUrl = URL.createObjectURL(blob);
        try {
            if (directoryHandle) {
                const fileHandle = await directoryHandle.getFileHandle(name, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob); await writable.close();
                setToast({ title: 'Saved', message: `Saved to ${directoryHandle.name}/${name}`, type: 'success' });
            } else {
                const a = document.createElement('a'); a.href = blobUrl; a.download = name;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setToast({ title: 'Saved', message: 'Check your downloads folder', type: 'success' });
            }
        } catch {
            const a = document.createElement('a'); a.href = blobUrl; a.download = name;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setToast({ title: 'Saved', message: 'Download triggered', type: 'success' });
        }
    }, [directoryHandle]);

    const { isRecording, isPaused, startRecording, pauseRecording, resumeRecording, stopRecording } = useRecording({
        screenStream, audioStream: processedStream || audioStream, cameraStream,
        activeBg, screenScale: 1.0, canvasRef,
        recordingQuality: recQuality,
        bitrate: QUALITY_PRESETS[recQuality].bitrate,
        useCanvas: true,
        onComplete: handleComplete,
    });

    useEffect(() => { if (!isRecording) { setElapsedTime(0); return; } const iv = setInterval(() => setElapsedTime(t => t + 1), 1000); return () => clearInterval(iv); }, [isRecording]);
    useEffect(() => () => { stopAll(); }, []);
    useEffect(() => { if (!isRecording) return; const h = (e) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [isRecording]);

    // Teleprompter auto-scroll
    useEffect(() => {
        if (!showTeleprompter || !isRecording) return;
        const iv = setInterval(() => setPrompterScroll(s => s + prompterSpeed), 50);
        return () => clearInterval(iv);
    }, [showTeleprompter, isRecording, prompterSpeed]);

    // Canvas sizing
    useEffect(() => {
        const c = canvasRef.current; if (!c) return;
        const ratio = ASPECT_RATIOS.find(r => r.id === aspectRatio) || ASPECT_RATIOS[0];
        const q = QUALITY_PRESETS[recQuality];
        let w = q.width || ratio.w; let h = q.height || ratio.h;
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }, [recQuality, screenDimensions, aspectRatio]);

    useEffect(() => { pipPosRef.current.corner = pipCorner; }, [pipCorner]);

    // Canvas render loop
    useEffect(() => {
        let running = true;
        const loop = () => {
            if (!running) return;
            const c = canvasRef.current; if (!c) { requestAnimationFrame(loop); return; }
            const ctx = c.getContext('2d', { alpha: false });
            const tpl = layoutTemplate;

            // Background
            const bg = BG_PRESETS.find(b => b.id === activeBg);
            if (bg && bg.color.startsWith('linear')) {
                const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
                const colors = bg.color.match(/#[a-fA-F0-9]{6}/g) || ['#1a1a1a', '#2a2a2a'];
                grad.addColorStop(0, colors[0]); grad.addColorStop(1, colors[1] || colors[0]);
                ctx.fillStyle = grad;
            } else { ctx.fillStyle = bg?.color || '#1a1a1a'; }
            ctx.fillRect(0, 0, c.width, c.height);

            const hasScreen = screenStream && screenVideoRef.current?.readyState >= 2 && tpl !== 'camera-only';
            const hasCamera = cameraStream && cameraVideoRef.current?.readyState >= 2 && tpl !== 'screen-only';

            if (tpl === 'screen-only' || tpl === 'camera-only') {
                const v = tpl === 'screen-only' ? screenVideoRef.current : cameraVideoRef.current;
                if (v?.readyState >= 2) drawFit(ctx, v, 0, 0, c.width, c.height);
            } else if (tpl === 'side-by-side') {
                const hw = c.width / 2;
                if (hasScreen) drawFit(ctx, screenVideoRef.current, 0, 0, hw, c.height);
                else { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, hw, c.height); }
                if (hasCamera) drawFit(ctx, cameraVideoRef.current, hw, 0, hw, c.height);
                else { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(hw, 0, hw, c.height); }
            } else if (tpl === 'stacked') {
                const hh = c.height / 2;
                if (hasScreen) drawFit(ctx, screenVideoRef.current, 0, 0, c.width, hh);
                else { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, c.width, hh); }
                if (hasCamera) drawFit(ctx, cameraVideoRef.current, 0, hh, c.width, hh);
                else { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, hh, c.width, hh); }
            } else {
                if (hasScreen) drawFit(ctx, screenVideoRef.current, 0, 0, c.width, c.height);
                if (hasCamera) {
                    const v = cameraVideoRef.current;
                    const camW = c.width * 0.22;
                    const camH = camW * (v.videoHeight / v.videoWidth);
                    const pad = 16;
                    const { x: cx, y: cy } = getPipPos(c.width, c.height, camW, camH, pad, pipCorner);
                    pipPosRef.current.x = cx; pipPosRef.current.y = cy;
                    ctx.save();
                    if (tpl === 'pip-circle') {
                        const radius = Math.max(camW, camH) / 2;
                        ctx.beginPath(); ctx.arc(cx + camW / 2, cy + camH / 2, radius, 0, Math.PI * 2); ctx.clip();
                    }
                    drawFit(ctx, v, cx, cy, camW, camH);
                    ctx.restore();
                }
            }
            requestAnimationFrame(loop);
        };
        loop(); return () => { running = false; };
    }, [screenStream, cameraStream, layoutTemplate, pipCorner, activeBg]);

    // Keyboard
    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'Space') { e.preventDefault(); if (isRecording) stopRecording(); else startFlow(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isRecording]);

    const startFlow = useCallback(async () => {
        if (isStartingRef.current || isRecording) return;
        isStartingRef.current = true; setIsStarting(true);
        try {
            const needsCam = ['pip-circle', 'pip-rect', 'side-by-side', 'stacked', 'camera-only'].includes(layoutTemplate);
            const needsScreen = layoutTemplate !== 'camera-only';
            let gotScreen = true, gotCam = true;
            if (needsScreen && !screenStream) gotScreen = !!(await toggleScreen());
            if (needsCam && !cameraStream) { const s = await toggleCamera(); gotCam = !!s; }
            if (!gotScreen && !gotCam) { setIsStarting(false); isStartingRef.current = false; return; }
            if (!audioStream) await toggleMic().catch(() => {});
            setTimeout(() => { startRecording(); setIsStarting(false); isStartingRef.current = false; }, 600);
        } catch { setIsStarting(false); isStartingRef.current = false; }
    }, [layoutTemplate, screenStream, cameraStream, audioStream, isRecording, toggleScreen, toggleCamera, toggleMic, startRecording]);

    const fmtTime = (s) => `${Math.floor(s/60).toString().padStart(2, '0')}:${(s%60).toString().padStart(2, '0')}`;

    const selectFolder = useCallback(async () => {
        try { const handle = await window.showDirectoryPicker(); setDirectoryHandle(handle);
            import('../utils/StorageManager').then(m => m.storageManager).then(sm => sm.setSetting('workspace_handle', handle));
            setToast({ title: 'Folder Selected', message: `Saves to: ${handle.name}`, type: 'success' });
        } catch {}
    }, []);

    useEffect(() => {
        import('../utils/StorageManager').then(m => m.storageManager).then(sm => {
            sm.getSetting('workspace_handle').then(h => { if (h) setDirectoryHandle(h); }).catch(() => {});
        }).catch(() => {});
    }, []);

    const togglePanel = (panel) => setOpenPanel(openPanel === panel ? null : panel);

    return (
        <div className="recorder-page">
            {/* Main preview area */}
            <div className="recorder-main">
                <canvas ref={canvasRef} className="recorder-canvas" />

                {/* Quality badge top-left */}
                <div className="quality-badge">{recQuality}</div>

                {/* Center placeholder when no sources active */}
                {!screenStream && !cameraStream && !isRecording && (
                    <div className="recorder-placeholder">
                        <svg className="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="17" cy="17" r="3"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                        <p className="placeholder-text">To Start Recording, Turn On Your<br/>Camera Or Microphone Or<br/>Share Your Screen From Toolbar</p>
                    </div>
                )}

                {/* Camera preview when camera only */}
                {!screenStream && cameraStream && !isRecording && (
                    <video ref={cameraVideoRef} className="recorder-cam-full" autoPlay muted playsInline />
                )}

                {/* Teleprompter overlay */}
                {showTeleprompter && isRecording && (
                    <div className="teleprompter-overlay" style={{ transform: `translateY(-${prompterScroll}px)` }}>
                        <p>{prompterText || 'Type your script in Settings...'}</p>
                    </div>
                )}

                {/* Recording indicator */}
                {isRecording && (
                    <div className="rec-indicator">
                        <span className="rec-dot" />
                        <span className="rec-timer">{fmtTime(elapsedTime)}</span>
                    </div>
                )}

                {/* Settings panels */}
                {openPanel && (
                    <div className="settings-panel-overlay" onClick={() => setOpenPanel(null)}>
                        <div className="settings-panel" onClick={e => e.stopPropagation()}>
                            <button className="settings-close" onClick={() => setOpenPanel(null)}></button>
                            {openPanel === 'ratio' && (
                                <div className="panel-content">
                                    <h3>Aspect Ratio</h3>
                                    <div className="panel-options">
                                        {ASPECT_RATIOS.map(r => (
                                            <button key={r.id} className={`panel-option ${aspectRatio === r.id ? 'selected' : ''}`}
                                                onClick={() => { setAspectRatio(r.id); setOpenPanel(null); }}>{r.label}</button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {openPanel === 'background' && (
                                <div className="panel-content">
                                    <h3>Background</h3>
                                    <div className="panel-options">
                                        {BG_PRESETS.map(b => (
                                            <button key={b.id} className={`panel-option bg-option ${activeBg === b.id ? 'selected' : ''}`}
                                                onClick={() => { setActiveBg(b.id); setOpenPanel(null); }}
                                                style={{ background: b.color }}>
                                                {b.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {openPanel === 'layout' && (
                                <div className="panel-content">
                                    <h3>Recording Layout</h3>
                                    <div className="panel-options">
                                        {RECORDING_TEMPLATES.map(t => (
                                            <button key={t.id} className={`panel-option ${layoutTemplate === t.id ? 'selected' : ''}`}
                                                onClick={() => setLayoutTemplate(t.id)} title={t.desc}>
                                                <span>{t.icon}</span> {t.label}
                                            </button>
                                        ))}
                                    </div>
                                    {(layoutTemplate === 'pip-circle' || layoutTemplate === 'pip-rect') && (
                                        <div className="corner-section">
                                            <h4>Webcam Position</h4>
                                            <div className="panel-options">
                                                {[{ id: 'tl', label: '↖ Top Left' }, { id: 'tr', label: '↗ Top Right' },
                                                  { id: 'bl', label: '↙ Bot Left' }, { id: 'br', label: '↘ Bot Right' }].map(c => (
                                                    <button key={c.id} className={`panel-option ${pipCorner === c.id ? 'selected' : ''}`}
                                                        onClick={() => setPipCorner(c.id)}>{c.label}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {openPanel === 'prompter' && (
                                <div className="panel-content">
                                    <h3>Teleprompter</h3>
                                    <textarea className="prompter-textarea" value={prompterText}
                                        onChange={e => setPrompterText(e.target.value)}
                                        placeholder="Type your script here..." />
                                    <div className="prompter-controls">
                                        <label>Speed: <input type="range" min="1" max="10" value={prompterSpeed}
                                            onChange={e => setPrompterSpeed(Number(e.target.value))} /></label>
                                        <button className={`panel-option ${showTeleprompter ? 'selected' : ''}`}
                                            onClick={() => setShowTeleprompter(!showTeleprompter)}>
                                            {showTeleprompter ? 'Hide Prompter' : 'Show Prompter'}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {openPanel === 'settings' && (
                                <div className="panel-content">
                                    <h3>Settings</h3>
                                    <div className="settings-list">
                                        <div className="setting-row">
                                            <label>Quality</label>
                                            <select value={recQuality} onChange={e => setRecQuality(e.target.value)}>
                                                <option value="720p">720p HD</option>
                                                <option value="1080p">1080p FHD</option>
                                                <option value="1440p">1440p 2K</option>
                                                <option value="native">Native</option>
                                            </select>
                                        </div>
                                        <div className="setting-row">
                                            <label>Enhanced Audio</label>
                                            <button className={`panel-option ${enhancedAudio ? 'selected' : ''}`}
                                                onClick={() => setEnhancedAudio(!enhancedAudio)}>
                                                {enhancedAudio ? 'ON' : 'OFF'}
                                            </button>
                                        </div>
                                        <div className="setting-row">
                                            <label>Save Folder</label>
                                            <button className="panel-option" onClick={selectFolder}>
                                                 {directoryHandle ? directoryHandle.name : 'Select Folder'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom toolbar — dadan.io style */}
            <div className="recorder-toolbar">
                <div className="toolbar-group toolbar-sources">
                    <button className={`toolbar-btn ${cameraStream ? 'active' : ''}`}
                        onClick={async () => { const s = await toggleCamera(); if (s) {} else {} }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            {cameraStream ? <><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>
                                : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34"/></>}
                        </svg>
                        <span>{cameraStream ? 'Cam On' : 'Show Cam'}</span>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    <button className={`toolbar-btn ${audioStream ? 'active' : ''}`}
                        onClick={async () => { const s = await toggleMic(); if (s) {} else {} }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            {audioStream ? <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                                : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>}
                        </svg>
                        <span>{audioStream ? 'Mic On' : 'Enable Mic'}</span>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    <button className={`toolbar-btn ${screenStream ? 'active' : ''}`}
                        onClick={async () => { await toggleScreen(); }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                        <span>{screenStream ? 'Screen On' : 'Show Screen'}</span>
                    </button>
                </div>

                <div className="toolbar-divider" />

                <div className="toolbar-group toolbar-tools">
                    <button className={`toolbar-btn ${openPanel === 'ratio' ? 'active' : ''}`} onClick={() => togglePanel('ratio')}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
                        <span>Ratio</span>
                    </button>
                    <button className={`toolbar-btn ${openPanel === 'background' ? 'active' : ''}`} onClick={() => togglePanel('background')}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        <span>Background</span>
                    </button>
                    <button className={`toolbar-btn ${openPanel === 'layout' ? 'active' : ''}`} onClick={() => togglePanel('layout')}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        <span>Layout</span>
                    </button>
                    <button className={`toolbar-btn ${openPanel === 'prompter' ? 'active' : ''}`} onClick={() => togglePanel('prompter')}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        <span>Prompter</span>
                    </button>
                </div>

                <div className="toolbar-divider" />

                <div className="toolbar-group toolbar-actions">
                    <button className={`toolbar-btn ${openPanel === 'settings' ? 'active' : ''}`} onClick={() => togglePanel('settings')}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                        <span>Settings</span>
                    </button>
                    <button className={`toolbar-btn toolbar-record-btn ${isRecording ? 'recording' : ''}`}
                        onClick={() => { if (isRecording) stopRecording(); else startFlow(); }}
                        disabled={isStarting}>
                        <span className="record-dot" />
                        <span>{isRecording ? `Stop (${fmtTime(elapsedTime)})` : 'Record'}</span>
                    </button>
                    <button className={`toolbar-btn ${layoutTemplate.startsWith('pip') ? 'active' : ''}`}
                        onClick={() => { setLayoutTemplate(layoutTemplate.startsWith('pip') ? 'screen-only' : 'pip-circle'); }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="12" y="12" width="10" height="10" rx="1"/></svg>
                        <span>PIP</span>
                    </button>
                </div>
            </div>

            <Toast toast={toast} onClose={() => setToast(null)} />
        </div>
    );
};

export default ScreenRecorder;
