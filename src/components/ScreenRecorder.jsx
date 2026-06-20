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
    const [activeBg, setActiveBg] = useState('none');
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

    const { screenStream, audioStream, cameraStream, systemAudioStream, toggleScreen, toggleMic, toggleCamera, toggleSystemAudio, stopAll, screenDimensions } = useStreams(screenVideoRef, cameraVideoRef, () => {});
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
                        <div className="recorder-sources">
                            <button className={`recorder-source-card ${screenStream ? 'active' : ''}`}
                                onClick={async () => {
                                    const stream = await toggleScreen();
                                    if (stream) { setToast({ title: 'Screen Active', message: 'Screen sharing enabled', type: 'success' }); }
                                }}>
                                <span className="source-icon">️</span>
                                <span className="source-label">Screen</span>
                                <span className={`source-status ${screenStream ? 'on' : 'off'}`}>
                                    {screenStream ? ' Active' : '🔒 Click to enable'}
                                </span>
                            </button>
                            <button className={`recorder-source-card ${cameraStream ? 'active' : ''}`}
                                onClick={async () => {
                                    const stream = await toggleCamera();
                                    if (stream) { setToast({ title: 'Camera Active', message: 'Camera enabled', type: 'success' }); }
                                }}>
                                <span className="source-icon">📷</span>
                                <span className="source-label">Camera</span>
                                <span className={`source-status ${cameraStream ? 'on' : 'off'}`}>
                                    {cameraStream ? '🔓 Active' : ' Click to enable'}
                                </span>
                            </button>
                            <button className={`recorder-source-card ${audioStream ? 'active' : ''}`}
                                onClick={async () => {
                                    const stream = await toggleMic();
                                    if (stream) { setToast({ title: 'Mic Active', message: 'Microphone enabled', type: 'success' }); }
                                }}>
                                <span className="source-icon"></span>
                                <span className="source-label">Microphone</span>
                                <span className={`source-status ${audioStream ? 'on' : 'off'}`}>
                                    {audioStream ? (
                                        <span className="mic-test-bar">
                                            <span className="mic-test-fill" style={{ width: `${Math.min(audioLevel * 100, 100)}%` }} />
                                        </span>
                                    ) : '🔒 Click to enable'}
                                </span>
                            </button>
                        </div>
                        {/* Template selector */}
                        <div className="recorder-templates">
                            <span className="template-label">Recording Layout</span>
                            <div className="template-options">
                                {RECORDING_TEMPLATES.map(t => (
                                    <button key={t.id}
                                        className={`template-btn ${layoutTemplate === t.id ? 'selected' : ''}`}
                                        onClick={() => setLayoutTemplate(t.id)}
                                        title={t.desc}>
                                        <span className="template-icon">{t.icon}</span>
                                        <span className="template-name">{t.label}</span>
                                    </button>
                                ))}
                            </div>
                            {(layoutTemplate === 'pip-circle' || layoutTemplate === 'pip-rect') && (
                                <div className="pip-corners">
                                    <span className="template-label">Webcam Position</span>
                                    <div className="corner-options">
                                        {[
                                            { id: 'tl', label: '↖ Top Left' },
                                            { id: 'tr', label: '↗ Top Right' },
                                            { id: 'bl', label: '↙ Bot Left' },
                                            { id: 'br', label: '↘ Bot Right' },
                                        ].map(c => (
                                            <button key={c.id}
                                                className={`corner-btn ${pipCorner === c.id ? 'selected' : ''}`}
                                                onClick={() => setPipCorner(c.id)}>
                                                {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <button className="recorder-start-btn" onClick={startFlow} disabled={isStarting || (!screenStream && !cameraStream)}>
                            {isStarting ? 'Opening Screen Picker...' : (screenStream || cameraStream) ? 'Start Recording' : 'Enable Screen or Camera to start'}
                        </button>
                        <p className="recorder-hint">or press <kbd>Space</kbd></p>
                        {directoryHandle && (
                            <p className="recorder-folder-info">
                                📁 Saves to: {directoryHandle.name}
                            </p>
                        )}
                        <button className="recorder-folder-btn" onClick={selectFolder}>
                            📁 {directoryHandle ? `Change Folder (${directoryHandle.name})` : 'Select Save Folder'}
                        </button>
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
            </div>
            {/* recorder-main closes ^ */}

            {/* Settings panel - bottom drawer style */}
            {openPanel && (
                <div className="settings-panel-overlay" onClick={() => setOpenPanel(null)}>
                    <div className="settings-drawer" onClick={e => e.stopPropagation()}>
                        <div className="drawer-handle" />
                        <div className="drawer-header">
                            <h3>{openPanel === 'ratio' ? 'Aspect Ratio' : openPanel === 'background' ? 'Background' : openPanel === 'layout' ? 'Layout' : openPanel === 'prompter' ? 'Teleprompter' : 'Settings'}</h3>
                            <button className="drawer-close" onClick={() => setOpenPanel(null)}>×</button>
                        </div>
                        {openPanel === 'ratio' && (
                            <div className="drawer-options">
                                {ASPECT_RATIOS.map(r => (
                                    <button key={r.id} className={`panel-option ${aspectRatio === r.id ? 'selected' : ''}`}
                                        onClick={() => { setAspectRatio(r.id); setOpenPanel(null); }}>{r.label}</button>
                                ))}
                            </div>
                        )}
                        {openPanel === 'background' && (
                            <div className="drawer-options">
                                {BG_PRESETS.map(b => (
                                    <button key={b.id} className={`panel-option bg-option ${activeBg === b.id ? 'selected' : ''}`}
                                        onClick={() => { setActiveBg(b.id); setOpenPanel(null); }}
                                        style={{ background: b.color }}>{b.label}</button>
                                ))}
                            </div>
                        )}
                        {openPanel === 'layout' && (
                            <div className="drawer-options">
                                {RECORDING_TEMPLATES.map(t => (
                                    <button key={t.id} className={`panel-option ${layoutTemplate === t.id ? 'selected' : ''}`}
                                        onClick={() => setLayoutTemplate(t.id)} title={t.desc}>
                                        <span>{t.icon}</span> {t.label}
                                    </button>
                                ))}
                                {(layoutTemplate === 'pip-circle' || layoutTemplate === 'pip-rect') && (
                                    <div className="drawer-options" style={{ width: '100%', marginTop: '0.5rem' }}>
                                        {[{ id: 'tl', label: '↖ Top Left' }, { id: 'tr', label: '↗ Top Right' },
                                          { id: 'bl', label: '↙ Bot Left' }, { id: 'br', label: '↘ Bot Right' }].map(c => (
                                            <button key={c.id} className={`panel-option ${pipCorner === c.id ? 'selected' : ''}`}
                                                onClick={() => setPipCorner(c.id)}>{c.label}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {openPanel === 'prompter' && (
                            <div className="drawer-options" style={{ flexDirection: 'column' }}>
                                <textarea className="prompter-textarea" value={prompterText}
                                    onChange={e => setPrompterText(e.target.value)}
                                    placeholder="Type your script here..." />
                                <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                    <label style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Speed: <input type="range" min="1" max="10" value={prompterSpeed}
                                            onChange={e => setPrompterSpeed(Number(e.target.value))}
                                            style={{ width: '100%', accentColor: 'var(--primary)' }} />
                                    </label>
                                    <button className={`panel-option ${showTeleprompter ? 'selected' : ''}`}
                                        onClick={() => setShowTeleprompter(!showTeleprompter)}>
                                        {showTeleprompter ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </div>
                        )}
                        {openPanel === 'settings' && (
                            <div className="drawer-options" style={{ flexDirection: 'column', gap: '0.8rem' }}>
                                <div className="setting-row">
                                    <label>Quality</label>
                                    <select value={recQuality} onChange={e => setRecQuality(e.target.value)}>
                                        <option value="720p">720p</option><option value="1080p">1080p</option>
                                        <option value="1440p">1440p</option><option value="native">Native</option>
                                    </select>
                                </div>
                                <div className="setting-row">
                                    <label>Enhanced Audio</label>
                                    <button className={`panel-option ${enhancedAudio ? 'selected' : ''}`}
                                        onClick={() => setEnhancedAudio(!enhancedAudio)}>{enhancedAudio ? 'ON' : 'OFF'}</button>
                                </div>
                                <div className="setting-row">
                                    <label>Save Folder</label>
                                    <button className="panel-option" onClick={selectFolder}>
                                        {directoryHandle ? directoryHandle.name : 'Select'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Toolbar - compact glass panel like editor transport */}
            {!isRecording && (
            <div className="recorder-toolbar">
                <div className="toolbar-row">
                    <div className="toolbar-group">
                        <button className={`toolbar-btn ${cameraStream ? 'active' : ''}`} onClick={async () => { await toggleCamera(); }}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                            <span>{cameraStream ? 'Cam On' : 'Cam'}</span>
                        </button>
                        <button className={`toolbar-btn ${audioStream ? 'active' : ''}`} onClick={async () => { await toggleMic(); }}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                            <span>{audioStream ? 'Mic On' : 'Mic'}</span>
                        </button>
                        <button className={`toolbar-btn ${screenStream ? 'active' : ''}`} onClick={async () => { await toggleScreen(); }}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>
                            <span>{screenStream ? 'Screen' : 'Screen'}</span>
                        </button>
                        <button className={`toolbar-btn ${systemAudioStream ? 'active' : ''}`} onClick={toggleSystemAudio}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                            <span>Sys Audio</span>
                        </button>
                    </div>
                    <div className="toolbar-divider" />
                    <div className="toolbar-group">
                        <button className={`toolbar-btn ${openPanel === 'ratio' ? 'active' : ''}`} onClick={() => togglePanel('ratio')}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
                            <span>Ratio</span>
                        </button>
                        <button className={`toolbar-btn ${openPanel === 'background' ? 'active' : ''}`} onClick={() => togglePanel('background')}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                            <span>BG</span>
                        </button>
                        <button className={`toolbar-btn ${openPanel === 'layout' ? 'active' : ''}`} onClick={() => togglePanel('layout')}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                            <span>Layout</span>
                        </button>
                        <button className={`toolbar-btn ${openPanel === 'prompter' ? 'active' : ''}`} onClick={() => togglePanel('prompter')}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="8" y1="2" x2="8" y2="22"/><line x1="16" y1="2" x2="16" y2="22"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="2" y1="16" x2="22" y2="16"/></svg>
                            <span>Prompter</span>
                        </button>
                        <button className={`toolbar-btn ${openPanel === 'settings' ? 'active' : ''}`} onClick={() => togglePanel('settings')}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4"/></svg>
                            <span>Settings</span>
                        </button>
                        <button className="toolbar-btn" onClick={selectFolder}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                            <span>{directoryHandle ? directoryHandle.name : 'Folder'}</span>
                        </button>
                    </div>
                    <div className="toolbar-divider" />
                    <div className="toolbar-group">
                        <button className="toolbar-btn toolbar-record-btn" onClick={startFlow} disabled={isStarting}>
                            <span className="record-dot" />
                            <span>Record</span>
                        </button>
                        <button className={`toolbar-btn ${layoutTemplate.startsWith('pip') ? 'active' : ''}`}
                            onClick={() => { setLayoutTemplate(layoutTemplate.startsWith('pip') ? 'screen-only' : 'pip-circle'); }}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="13" y="13" width="9" height="9" rx="1"/></svg>
                            <span>PIP</span>
                        </button>
                    </div>
                </div>
            </div>
            )}

            {/* Recording bar */}
            {isRecording && (
                <div className="recorder-toolbar" style={{ gap: '0.75rem' }}>
                    <span className="rec-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'rec-pulse 1.5s infinite' }} />
                    <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: 'var(--danger)' }}>{fmtTime(elapsedTime)}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>· {recQuality} · ~{Math.round(elapsedTime * QUALITY_PRESETS[recQuality].bitrate / 8000000)} MB</span>
                    <div className="toolbar-divider" />
                    {isPaused ? (
                        <button className="toolbar-btn" onClick={resumeRecording} style={{ color: 'var(--success)', borderColor: 'var(--success)' }}>Resume</button>
                    ) : (
                        <button className="toolbar-btn" onClick={pauseRecording}>Pause</button>
                    )}
                    <button className="toolbar-btn" onClick={stopRecording} style={{ color: 'var(--danger)', fontWeight: 700 }}>Stop</button>
                    <div className="toolbar-divider" />
                    <button className={`toolbar-btn ${cameraStream ? 'active' : ''}`} onClick={async () => { await toggleCamera(); }}>
                        {cameraStream ? 'Cam ON' : 'Cam OFF'}
                    </button>
                    <button className={`toolbar-btn ${audioStream ? 'active' : ''}`} onClick={async () => { await toggleMic(); }}>
                        {audioStream ? 'Mic ON' : 'Mic OFF'}
                    </button>
                </div>
            )}

            <Toast toast={toast} onClose={() => setToast(null)} />
        </div>
    );
};

export default ScreenRecorder;
