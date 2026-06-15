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

    const scenes = useScenes();
    const streams = useStreams(screenVideoRef, cameraVideoRef, () => {});
    const audioLevel = useAudioLevel(streams?.audioStream);
    const recording = useRecording({
        screenStream: streams?.screenStream,
        audioStream: streams?.audioStream,
        cameraStream: streams?.cameraStream,
        canvasRef,
        useCanvas: true,
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
    useEffect(() => { scenesRef.current = scenes; streamsRef.current = streams; });

    useEffect(() => {
        let running = true;
        const loop = () => {
            if (!running) return;
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                const s = scenesRef.current;
                s.renderScene(ctx, canvas, s.activeScene, streamsRef.current);

                // Branding overlays
                if (brandLogo) {
                    const img = new Image();
                    img.src = brandLogo;
                    if (img.complete) {
                        ctx.drawImage(img, canvas.width - 220, 20, 200, 60);
                    }
                }
                if (bannerVisible && bannerText) {
                    ctx.save();
                    ctx.fillStyle = `rgba(0,0,0,0.8)`;
                    ctx.fillRect(0, canvas.height - 80, canvas.width, 60);
                    ctx.fillStyle = brandColor;
                    ctx.fillRect(0, canvas.height - 80, 6, 60);
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 28px Outfit, sans-serif';
                    ctx.textBaseline = 'middle';
                    const text = bannerText.slice(0, 80);
                    ctx.fillText(text, 24, canvas.height - 50);
                    ctx.restore();
                }
            }
            requestAnimationFrame(loop);
        };
        loop();
        return () => { running = false; };
    }, [brandLogo, bannerVisible, bannerText, brandColor]);

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

    const fmtTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
    const platform = PLATFORM_INFO[streaming.platform] || PLATFORM_INFO.custom;

    return (
        <div className="stream-mode">
            {/* === MAIN LAYOUT === */}
            <div className="stream-layout">
                {/* === LEFT PANEL === */}
                <aside className="stream-left-panel">
                    <div className="stream-left-tabs">
                        <button className={leftTab === 'scenes' ? 'active' : ''} onClick={() => setLeftTab('scenes')}>Scenes</button>
                        <button className={leftTab === 'branding' ? 'active' : ''} onClick={() => setLeftTab('branding')}>Brand</button>
                        <button className={leftTab === 'banners' ? 'active' : ''} onClick={() => setLeftTab('banners')}>Banners</button>
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
                    <div className="stream-preview-wrapper">
                        <canvas ref={canvasRef} width={1920} height={1080} className="stream-canvas" />

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
                        <div className="stream-section-label">Destination</div>
                        <div className="stream-dest-card">
                            <div className="stream-dest-icon" style={{ background: platform.color }}>{platform.icon}</div>
                            <div className="stream-dest-info">
                                <div className="stream-dest-name">{platform.name}</div>
                                <div className="stream-dest-status">
                                    {streaming.isStreaming ? (
                                        <span className="stream-status-live">Connected</span>
                                    ) : streaming.isConnecting ? (
                                        <span className="stream-status-connecting">Connecting...</span>
                                    ) : streaming.streamKey ? (
                                        <span className="stream-status-ready">Ready</span>
                                    ) : (
                                        <span className="stream-status-offline">Not configured</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button className="stream-dest-config" onClick={() => setShowStreamPanel(true)}>
                            Configure Stream
                        </button>
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
                        <button className="stream-btn-live" onClick={() => setShowStreamPanel(true)}>
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
                platform={streaming.platform}
                selectPlatform={streaming.selectPlatform}
                streamKey={streaming.streamKey}
                setStreamKey={streaming.setStreamKey}
                rtmpUrl={streaming.rtmpUrl}
                setRtmpUrl={streaming.setRtmpUrl}
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
