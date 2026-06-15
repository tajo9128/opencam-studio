import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SceneSwitcher } from '../Scenes/SceneSwitcher';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { StreamPanel } from './StreamPanel';
import { MixerPanel } from '../Audio/MixerPanel';
import { useScenes } from '../../hooks/useScenes';
import { useStreams } from '../../hooks/useStreams';
import { useRecording } from '../../hooks/useRecording';
import { useStreaming } from '../../hooks/useStreaming';
import { useReplayBuffer } from '../../hooks/useReplayBuffer';
import { useAudioLevel } from '../../hooks/useAudioLevel';
import { SourcePanel } from '../Sources/SourcePanel';
import './StreamMode.css';

const LAYOUTS = [
    { id: 'full', name: 'Full Screen', icon: '▣' },
    { id: 'pip', name: 'PiP Camera', icon: '⊟' },
    { id: 'side', name: 'Side by Side', icon: '⬛⬛' },
    { id: 'cam', name: 'Camera Only', icon: '◉' },
];

const PLATFORM_INFO = {
    youtube: { name: 'YouTube', color: '#ff0000', icon: 'YT' },
    twitch: { name: 'Twitch', color: '#9146ff', icon: 'TW' },
    custom: { name: 'Custom RTMP', color: '#6b7280', icon: 'RT' },
};

export const StreamMode = () => {
    const canvasRef = useRef(null);
    const screenVideoRef = useRef(null);
    const cameraVideoRef = useRef(null);
    const [leftTab, setLeftTab] = useState('scenes');
    const [showStreamPanel, setShowStreamPanel] = useState(false);
    const [showMixer, setShowMixer] = useState(false);
    const [recTime, setRecTime] = useState(0);
    const [brandLogo, setBrandLogo] = useState(null);
    const [brandColor, setBrandColor] = useState('#8b5cf6');
    const [bannerText, setBannerText] = useState('');
    const [bannerVisible, setBannerVisible] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const [recQuality, setRecQuality] = useState('1080p');
    const [bgMode, setBgMode] = useState('none');
    const [bgImage, setBgImage] = useState(null);

    // Presenter tools
    const [lowerThirdName, setLowerThirdName] = useState('');
    const [lowerThirdTitle, setLowerThirdTitle] = useState('');
    const [showLowerThird, setShowLowerThird] = useState(false);
    const [speakerNotes, setSpeakerNotes] = useState('');
    const [speakerTimer, setSpeakerTimer] = useState(0);
    const [speakerTimerRunning, setSpeakerTimerRunning] = useState(false);
    const [teleprompterText, setTeleprompterText] = useState('');
    const [teleprompterSpeed, setTeleprompterSpeed] = useState(30);
    const [teleprompterActive, setTeleprompterActive] = useState(false);

    const scenes = useScenes();
    const streams = useStreams(screenVideoRef, cameraVideoRef, () => {});
    const audioLevel = useAudioLevel(streams?.audioStream);
    const recording = useRecording({
        screenStream: streams?.screenStream,
        audioStream: streams?.audioStream,
        cameraStream: streams?.cameraStream,
        canvasRef,
        useCanvas: true,
        recordingQuality: recQuality,
        bitrate: recQuality === '720p' ? 6000000 : recQuality === '1440p' ? 20000000 : 12000000,
    });
    const streaming = useStreaming();
    const replay = useReplayBuffer();

    // Track active state in refs so unmount cleanup reads latest values
    const activeRef = useRef(false);
    useEffect(() => { activeRef.current = recording.isRecording || streaming.isStreaming; });

    // Recording timer
    useEffect(() => {
        if (!recording.isRecording) { setRecTime(0); return; }
        const interval = setInterval(() => setRecTime(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, [recording.isRecording]);

    // Speaker timer
    useEffect(() => {
        if (!speakerTimerRunning) return;
        const interval = setInterval(() => setSpeakerTimer(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, [speakerTimerRunning]);

    // Cleanup streams on unmount
    useEffect(() => {
        return () => { if (!activeRef.current) streams.stopAll?.(); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useKeyboardShortcuts({
        'ctrl+shift+r': () => { if (recording.isRecording) recording.stopRecording(); else recording.startRecording(); },
        'ctrl+shift+l': () => setShowStreamPanel(prev => !prev),
        'ctrl+shift+b': () => { if (replay.isBuffering) replay.saveReplay(); else handleStartReplay(); },
        '1': () => scenes.scenes?.[0] && scenes.setActiveSceneId(scenes.scenes[0].id),
        '2': () => scenes.scenes?.[1] && scenes.setActiveSceneId(scenes.scenes[1].id),
        '3': () => scenes.scenes?.[2] && scenes.setActiveSceneId(scenes.scenes[2].id),
        '4': () => scenes.scenes?.[3] && scenes.setActiveSceneId(scenes.scenes[3].id),
    });

    useEffect(() => {
        const active = recording.isRecording || streaming.isStreaming;
        if (!active) return;
        const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [recording.isRecording, streaming.isStreaming]);

    // Canvas render loop
    const scenesRef = useRef(scenes);
    const streamsRef = useRef(streams);
    const overlayRef = useRef({ brandLogo, bannerVisible, bannerText, brandColor, showLowerThird, lowerThirdName, lowerThirdTitle });
    useEffect(() => { scenesRef.current = scenes; streamsRef.current = streams; overlayRef.current = { brandLogo, bannerVisible, bannerText, brandColor, showLowerThird, lowerThirdName, lowerThirdTitle }; });

    useEffect(() => {
        let running = true;
        const loop = () => {
            if (!running) return;
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                scenesRef.current.renderScene(ctx, canvas, scenesRef.current.activeScene, streamsRef.current);

                const o = overlayRef.current;
                // Logo
                if (o.brandLogo) {
                    const img = new Image();
                    img.src = o.brandLogo;
                    if (img.complete) ctx.drawImage(img, canvas.width - 220, 20, 200, 60);
                }
                // Banner
                if (o.bannerVisible && o.bannerText) {
                    ctx.save();
                    ctx.fillStyle = 'rgba(0,0,0,0.8)';
                    ctx.fillRect(0, canvas.height - 80, canvas.width, 60);
                    ctx.fillStyle = o.brandColor;
                    ctx.fillRect(0, canvas.height - 80, 6, 60);
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 28px Outfit, sans-serif';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(o.bannerText.slice(0, 80), 24, canvas.height - 50);
                    ctx.restore();
                }
                // Lower third
                if (o.showLowerThird && (o.lowerThirdName || o.lowerThirdTitle)) {
                    const barH = 80, barW = 6;
                    ctx.save();
                    ctx.fillStyle = 'rgba(0,0,0,0.8)';
                    ctx.fillRect(0, canvas.height - barH, canvas.width, barH);
                    ctx.fillStyle = o.brandColor;
                    ctx.fillRect(0, canvas.height - barH, barW, barH);
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 32px Outfit, sans-serif';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(o.lowerThirdName || '', barW + 16, canvas.height - barH + 28);
                    if (o.lowerThirdTitle) {
                        ctx.fillStyle = o.brandColor;
                        ctx.font = '18px Outfit, sans-serif';
                        ctx.fillText(o.lowerThirdTitle, barW + 16, canvas.height - barH + 56);
                    }
                    ctx.restore();
                }
            }
            requestAnimationFrame(loop);
        };
        loop();
        return () => { running = false; };
    }, []);

    // Auto-set first scene active
    useEffect(() => {
        if (!scenes.activeSceneId && scenes.scenes.length > 0) {
            scenes.setActiveSceneId(scenes.scenes[0].id);
        }
    }, [scenes.activeSceneId, scenes.scenes]);

    const handleStartReplay = () => {
        if (canvasRef.current) replay.startBuffering(canvasRef.current, streams.audioStream);
    };

    const handleLogoUpload = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setBrandLogo(reader.result);
        reader.readAsDataURL(file);
        e.target.value = '';
    }, []);

    const handleBgUpload = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setBgImage(reader.result);
        reader.readAsDataURL(file);
        e.target.value = '';
    }, []);

    const goLiveWithCountdown = useCallback((seconds = 5) => {
        setCountdown(seconds);
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    streaming.startStream(canvasRef.current, streams.audioStream);
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
    }, [streaming, streams.audioStream]);

    const fmtTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

    // Drag-to-rearrange sources on canvas
    const dragRef = useRef(null);

    const handleCanvasMouseDown = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas || !scenes.activeScene) return;
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;

        // Hit-test: find topmost source under cursor
        const sources = [...scenes.activeScene.sources].reverse();
        for (const src of sources) {
            if (!src.visible || src.locked) continue;
            const t = src.transform;
            if (px >= t.x && px <= t.x + t.width && py >= t.y && py <= t.y + t.height) {
                dragRef.current = { sourceId: src.id, offsetX: px - t.x, offsetY: py - t.y };
                canvas.style.cursor = 'grabbing';
                return;
            }
        }
    }, [scenes.activeScene]);

    const handleCanvasMouseMove = useCallback((e) => {
        if (!dragRef.current || !scenes.activeSceneId) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;

        const newX = Math.max(0, Math.min(1 - 0.05, px - dragRef.current.offsetX));
        const newY = Math.max(0, Math.min(1 - 0.05, py - dragRef.current.offsetY));

        scenes.updateSource(scenes.activeSceneId, dragRef.current.sourceId, {
            transform: { ...(scenes.activeScene?.sources.find(s => s.id === dragRef.current.sourceId)?.transform), x: newX, y: newY },
        });
    }, [scenes]);

    const handleCanvasMouseUp = useCallback(() => {
        dragRef.current = null;
        if (canvasRef.current) canvasRef.current.style.cursor = 'default';
    }, []);

    const currentLayout = scenes.activeScene?.layout || 'custom';

    return (
        <div className="stream-mode">
            {/* Countdown overlay */}
            {countdown !== null && (
                <div className="stream-countdown-overlay">
                    <div className="stream-countdown-number">{countdown}</div>
                    <div className="stream-countdown-label">Going Live...</div>
                </div>
            )}

            {/* === MAIN LAYOUT === */}
            <div className="stream-layout">
                {/* === LEFT PANEL === */}
                <aside className="stream-left-panel">
                    <div className="stream-left-tabs">
                        <button className={leftTab === 'scenes' ? 'active' : ''} onClick={() => setLeftTab('scenes')}>Scenes</button>
                        <button className={leftTab === 'presenter' ? 'active' : ''} onClick={() => setLeftTab('presenter')}>Presenter</button>
                        <button className={leftTab === 'branding' ? 'active' : ''} onClick={() => setLeftTab('branding')}>Brand</button>
                    </div>

                    <div className="stream-left-content">
                        {leftTab === 'scenes' && (
                            <>
                                <div className="stream-section-label">Scenes</div>
                                <SceneSwitcher
                                    scenes={scenes.scenes}
                                    activeSceneId={scenes.activeSceneId}
                                    onSelectScene={scenes.setActiveSceneId}
                                    onAddScene={scenes.addScene}
                                />
                                <div className="stream-section-label" style={{ marginTop: '1rem' }}>Sources</div>
                                <SourcePanel
                                    scene={scenes.activeScene}
                                    onAddSource={(data) => scenes.addSource(scenes.activeSceneId, data)}
                                    onRemoveSource={(id) => scenes.removeSource(scenes.activeSceneId, id)}
                                    onUpdateSource={(id, updates) => scenes.updateSource(scenes.activeSceneId, id, updates)}
                                />
                            </>
                        )}

                        {leftTab === 'branding' && (
                            <div className="stream-brand-panel">
                                <div className="stream-brand-section">
                                    <label className="stream-brand-label">Logo</label>
                                    <div className="stream-logo-upload">
                                        {brandLogo ? (
                                            <div className="stream-logo-preview">
                                                <img src={brandLogo} alt="Logo" />
                                                <button onClick={() => setBrandLogo(null)}>Remove</button>
                                            </div>
                                        ) : (
                                            <>
                                                <input type="file" accept="image/*" id="logo-upload" style={{ display: 'none' }} onChange={handleLogoUpload} />
                                                <label htmlFor="logo-upload" className="stream-logo-drop">+ Upload Logo</label>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="stream-brand-section">
                                    <label className="stream-brand-label">Brand Color</label>
                                    <div className="stream-color-row">
                                        <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} className="stream-color-input" />
                                        <span className="stream-color-hex">{brandColor}</span>
                                    </div>
                                    <div className="stream-color-presets">
                                        {['#8b5cf6', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'].map(c => (
                                            <button key={c} className="stream-color-swatch" style={{ background: c }} onClick={() => setBrandColor(c)} />
                                        ))}
                                    </div>
                                </div>
                                <div className="stream-brand-section">
                                    <label className="stream-brand-label">Banner Ticker</label>
                                    <input type="text" className="stream-banner-input" value={bannerText}
                                        onChange={e => setBannerText(e.target.value)} placeholder="Enter banner text..." maxLength={80} />
                                    <button className={`stream-banner-toggle ${bannerVisible ? 'active' : ''}`}
                                        onClick={() => setBannerVisible(!bannerVisible)} disabled={!bannerText}
                                        style={{ marginTop: '0.3rem' }}>
                                        {bannerVisible ? 'Hide Banner' : 'Show Banner'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {leftTab === 'presenter' && (
                            <div className="stream-presenter-panel">
                                <div className="stream-section-label">Lower Third</div>
                                <div className="stream-ppt-field">
                                    <label>
                                        <input type="checkbox" checked={showLowerThird} onChange={e => setShowLowerThird(e.target.checked)}
                                            style={{ width: 'auto', marginRight: '0.4rem' }} />
                                        Show overlay
                                    </label>
                                </div>
                                <input type="text" className="stream-banner-input" value={lowerThirdName}
                                    onChange={e => setLowerThirdName(e.target.value)} placeholder="Speaker Name" style={{ marginBottom: '0.3rem' }} />
                                <input type="text" className="stream-banner-input" value={lowerThirdTitle}
                                    onChange={e => setLowerThirdTitle(e.target.value)} placeholder="Title / Role" />

                                <div className="stream-section-label" style={{ marginTop: '0.75rem' }}>Teleprompter</div>
                                <textarea className="stream-textarea" value={teleprompterText}
                                    onChange={e => setTeleprompterText(e.target.value)}
                                    placeholder="Paste your script here..." rows={4} />
                                <div className="stream-ppt-row">
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Speed</span>
                                    <input type="range" min={10} max={60} value={teleprompterSpeed}
                                        onChange={e => setTeleprompterSpeed(Number(e.target.value))} style={{ flex: 1 }} />
                                </div>
                                <button className={`stream-banner-toggle ${teleprompterActive ? 'active' : ''}`}
                                    onClick={() => setTeleprompterActive(!teleprompterActive)} disabled={!teleprompterText}>
                                    {teleprompterActive ? 'Stop Prompter' : 'Start Prompter'}
                                </button>

                                <div className="stream-section-label" style={{ marginTop: '0.75rem' }}>Speaker Notes</div>
                                <textarea className="stream-textarea" value={speakerNotes}
                                    onChange={e => setSpeakerNotes(e.target.value)}
                                    placeholder="Private notes for the speaker..." rows={3} />

                                <div className="stream-section-label" style={{ marginTop: '0.75rem' }}>Speaker Timer</div>
                                <div className="stream-timer-display">{fmtTime(speakerTimer)}</div>
                                <div className="stream-ppt-row">
                                    <button className="stream-banner-toggle" onClick={() => setSpeakerTimerRunning(!speakerTimerRunning)}>
                                        {speakerTimerRunning ? 'Pause' : 'Start'}
                                    </button>
                                    <button className="stream-banner-toggle" onClick={() => { setSpeakerTimer(0); setSpeakerTimerRunning(false); }}>
                                        Reset
                                    </button>
                                </div>
                            </div>
                        )}

                        {leftTab === 'banners' && (
                            <div className="stream-banner-panel">
                                <div className="stream-brand-section">
                                    <label className="stream-brand-label">Banner Text</label>
                                    <input
                                        type="text"
                                        className="stream-banner-input"
                                        value={bannerText}
                                        onChange={e => setBannerText(e.target.value)}
                                        placeholder="Enter banner text..."
                                        maxLength={80}
                                    />
                                </div>
                                <button
                                    className={`stream-banner-toggle ${bannerVisible ? 'active' : ''}`}
                                    onClick={() => setBannerVisible(!bannerVisible)}
                                    disabled={!bannerText}
                                >
                                    {bannerVisible ? 'Hide Banner' : 'Show Banner'}
                                </button>
                                <p className="stream-banner-hint">Banner appears as a lower ticker on your stream.</p>
                            </div>
                        )}
                    </div>
                </aside>

                {/* === CENTER PREVIEW === */}
                <div className="stream-center">
                    {/* Layout selector bar */}
                    <div className="stream-layout-bar">
                        {scenes.LAYOUTS?.map(layout => {
                            const sourceCount = scenes.activeScene?.sources?.filter(s => s.visible).length || 0;
                            const disabled = sourceCount < layout.minSources;
                            return (
                                <button
                                    key={layout.id}
                                    className={`stream-layout-btn ${currentLayout === layout.id ? 'active' : ''}`}
                                    onClick={() => scenes.applyLayout?.(scenes.activeSceneId, layout.id)}
                                    disabled={disabled}
                                    title={disabled ? `Needs ${layout.minSources} sources` : layout.name}
                                >
                                    <span className="stream-layout-icon">{layout.icon}</span>
                                    <span className="stream-layout-name">{layout.name}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="stream-preview-wrapper">
                        <canvas ref={canvasRef} width={1920} height={1080} className="stream-canvas"
                            onMouseDown={handleCanvasMouseDown}
                            onMouseMove={handleCanvasMouseMove}
                            onMouseUp={handleCanvasMouseUp}
                            onMouseLeave={handleCanvasMouseUp}
                            style={{ cursor: 'default' }}
                        />

                        {/* Recording badge */}
                        {recording.isRecording && (
                            <div className="stream-rec-badge">
                                <span className="stream-rec-dot" />
                                REC {fmtTime(recTime)}
                            </div>
                        )}

                        {/* Live badge */}
                        {streaming.isStreaming && (
                            <div className="stream-live-badge">
                                <span className="stream-live-dot" />
                                LIVE {fmtTime(streaming.streamStats?.uptime || 0)}
                            </div>
                        )}

                        {/* Scene name badge */}
                        {scenes.activeScene && (
                            <div className="stream-scene-badge">{scenes.activeScene.name}</div>
                        )}

                        {/* Teleprompter overlay */}
                        {teleprompterActive && teleprompterText && (
                            <div className="stream-teleprompter" style={{ '--tele-speed': `${teleprompterSpeed}s` }}>
                                <div className="stream-teleprompter-text">{teleprompterText}</div>
                            </div>
                        )}

                        {/* Empty state */}
                        {!streams?.screenStream && !streams?.cameraStream && (
                            <div className="stream-preview-empty">
                                <p>Enable your camera or screen to start</p>
                            </div>
                        )}
                    </div>

                    {/* Stream stats bar */}
                    {streaming.isStreaming && (
                        <div className="stream-stats-bar">
                            <span className="stream-stat">Bitrate: {streaming.streamStats?.bitrate || 0} kbps</span>
                            <span className="stream-stat-sep">|</span>
                            <span className="stream-stat">Resolution: {streaming.resolution}</span>
                            <span className="stream-stat-sep">|</span>
                            <span className="stream-stat">Sent: {((streaming.streamStats?.bytesSent || 0) / 1024 / 1024).toFixed(1)} MB</span>
                        </div>
                    )}
                </div>

                {/* === RIGHT PANEL === */}
                <aside className="stream-right-panel">
                    <div className="stream-right-section">
                        <div className="stream-section-label">Destinations ({streaming.destinations?.length || 0})</div>
                        <div className="stream-dest-list">
                            {streaming.destinations?.map((dest, i) => {
                                const pInfo = PLATFORM_INFO[dest.platform] || PLATFORM_INFO.custom;
                                const status = streaming.destStatuses?.[dest.platform];
                                const dotClass = streaming.isStreaming
                                    ? (status?.status === 'connected' ? 'connected' : status?.status === 'reconnecting' ? 'connecting' : 'failed')
                                    : (dest.streamKey ? 'pending' : 'failed');
                                return (
                                    <div key={i} className="stream-dest-item" title={dest.label}>
                                        <div className="stream-dest-item-icon" style={{ background: pInfo.color }}>{pInfo.icon}</div>
                                        <span className="stream-dest-item-name">{dest.label || pInfo.name}</span>
                                        <span className={`stream-dest-item-dot ${dotClass}`} />
                                    </div>
                                );
                            })}
                        </div>
                        <button className="stream-dest-config" onClick={() => setShowStreamPanel(true)}>
                            Configure
                        </button>
                    </div>

                    <div className="stream-right-section">
                        <div className="stream-section-label">Recording</div>
                        <div className="stream-rec-preset">
                            <select value={recQuality} onChange={e => setRecQuality(e.target.value)}>
                                <option value="720p">720p (HD)</option>
                                <option value="1080p">1080p (FHD)</option>
                                <option value="1440p">1440p (2K)</option>
                                <option value="native">Native</option>
                            </select>
                        </div>
                    </div>

                    <div className="stream-right-section">
                        <div className="stream-section-label">Virtual BG</div>
                        <div className="stream-virtbg-section">
                            <select className="stream-virtbg-mode" value={bgMode} onChange={e => setBgMode(e.target.value)}>
                                <option value="none">None</option>
                                <option value="blur">Blur</option>
                                <option value="image">Image</option>
                                <option value="green">Green Screen</option>
                            </select>
                            {bgMode === 'image' && (
                                <>
                                    <input type="file" accept="image/*" id="bg-upload" style={{ display: 'none' }} onChange={handleBgUpload} />
                                    <label htmlFor="bg-upload" className="stream-logo-drop" style={{ height: '40px', fontSize: '0.7rem', margin: 0 }}>+ Background Image</label>
                                    {bgImage && <button className="stream-dest-remove" style={{ alignSelf: 'center' }} onClick={() => setBgImage(null)}>Remove BG</button>}
                                </>
                            )}
                            <p className="stream-virtbg-info">{bgMode === 'blur' ? 'Blurs camera background' : bgMode === 'green' ? 'Replaces green screen' : bgMode === 'image' ? 'Replaces background with image' : 'No background effect'}</p>
                        </div>
                    </div>

                    <div className="stream-right-section">
                        <div className="stream-section-label">Audio</div>
                        <div className="stream-audio-meter">
                            <div className="stream-audio-bar">
                                <div className="stream-audio-fill" style={{ width: `${audioLevel * 100}%` }} />
                            </div>
                            <button className={`stream-mic-toggle ${streams?.audioStream ? 'active' : ''}`} onClick={streams?.toggleMic}>
                                {streams?.audioStream ? 'Mute' : 'Unmute'}
                            </button>
                        </div>
                        <button className="stream-mixer-open" onClick={() => setShowMixer(true)}>Audio Mixer</button>
                    </div>

                    <div className="stream-right-section">
                        <div className="stream-section-label">Replay Buffer</div>
                        {!replay.isBuffering ? (
                            <button className="stream-replay-btn" onClick={handleStartReplay}>Start Buffer</button>
                        ) : (
                            <button className="stream-replay-btn active" onClick={replay.saveReplay}>Save Replay</button>
                        )}
                    </div>

                    {streaming.isStreaming && (
                        <div className="stream-right-section">
                            <div className="stream-section-label">Stream Health</div>
                            <div className="stream-health-bar">
                                <div className="stream-health-item">
                                    <span className="stream-health-value">{streaming.streamStats?.bitrate || 0}</span>
                                    <span className="stream-health-label">kbps</span>
                                </div>
                                <div className="stream-health-item">
                                    <span className="stream-health-value">{streaming.resolution}</span>
                                    <span className="stream-health-label">Res</span>
                                </div>
                                <div className="stream-health-item">
                                    <span className="stream-health-value">30</span>
                                    <span className="stream-health-label">FPS</span>
                                </div>
                            </div>
                        </div>
                    )}
                </aside>
            </div>

            {/* === BOTTOM CONTROL BAR === */}
            <div className="stream-bottom-bar">
                <div className="stream-bottom-left">
                    <button className={`stream-toggle-btn ${streams?.cameraStream ? 'active' : ''}`} onClick={streams?.toggleCamera} title="Camera">
                        <span className="stream-toggle-icon">Cam</span>
                    </button>
                    <button className={`stream-toggle-btn ${streams?.audioStream ? 'active' : ''}`} onClick={streams?.toggleMic} title="Microphone">
                        <span className="stream-toggle-icon">Mic</span>
                    </button>
                    <button className={`stream-toggle-btn ${streams?.screenStream ? 'active' : ''}`} onClick={streams?.toggleScreen} title="Screen Share">
                        <span className="stream-toggle-icon">Screen</span>
                    </button>
                </div>

                <div className="stream-bottom-center">
                    {!recording.isRecording ? (
                        <button className="stream-btn-record" onClick={() => recording.startRecording()}>
                            Record
                        </button>
                    ) : (
                        <button className="stream-btn-record recording" onClick={() => recording.stopRecording()}>
                            Stop ({fmtTime(recTime)})
                        </button>
                    )}

                    {!streaming.isStreaming ? (
                        <button className="stream-btn-live" onClick={() => goLiveWithCountdown(3)}>
                            Go Live
                        </button>
                    ) : (
                        <button className="stream-btn-live streaming" onClick={() => streaming.stopStream()}>
                            End Stream
                        </button>
                    )}
                </div>

                <div className="stream-bottom-right">
                    {streaming.isStreaming && (
                        <div className="stream-indicator live"><span className="stream-ind-dot" /> LIVE</div>
                    )}
                    {recording.isRecording && (
                        <div className="stream-indicator rec"><span className="stream-ind-dot red" /> REC</div>
                    )}
                </div>
            </div>

            {/* === MODALS === */}
            <StreamPanel
                isOpen={showStreamPanel}
                onClose={() => setShowStreamPanel(false)}
                isStreaming={streaming.isStreaming}
                isConnecting={streaming.isConnecting}
                streamError={streaming.streamError}
                streamStats={streaming.streamStats}
                destinations={streaming.destinations}
                destStatuses={streaming.destStatuses}
                addDestination={streaming.addDestination}
                removeDestination={streaming.removeDestination}
                updateDestination={streaming.updateDestination}
                setPlatform={streaming.setPlatform}
                relayUrl={streaming.relayUrl}
                setRelayUrl={streaming.setRelayUrl}
                resolution={streaming.resolution}
                setResolution={streaming.setResolution}
                bitrate={streaming.bitrate}
                setBitrate={streaming.setBitrate}
                onStartStream={streaming.startStream}
                onStopStream={streaming.stopStream}
                onCheckRelay={streaming.checkRelay}
                canvasRef={canvasRef}
                audioStream={streams.audioStream}
            />

            <MixerPanel
                isOpen={showMixer}
                onClose={() => setShowMixer(false)}
                scenes={scenes.scenes}
                activeSceneId={scenes.activeSceneId}
                onUpdateSource={scenes.updateSource}
            />
        </div>
    );
};
