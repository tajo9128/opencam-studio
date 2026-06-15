import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useScenes } from '../../hooks/useScenes';
import { useStreams } from '../../hooks/useStreams';
import { useRecording } from '../../hooks/useRecording';
import { useStreaming } from '../../hooks/useStreaming';
import { useReplayBuffer } from '../../hooks/useReplayBuffer';
import { useAudioLevel } from '../../hooks/useAudioLevel';
import { SceneSwitcher } from '../Scenes/SceneSwitcher';
import { SourcePanel } from '../Sources/SourcePanel';
import { StreamPanel } from '../Streaming/StreamPanel';
import { MixerPanel } from '../Audio/MixerPanel';
import { renderTitleTemplate } from '../../utils/TitleTemplates';
import './WebinarMode.css';

const PLATFORM_INFO = {
    youtube: { name: 'YouTube', color: '#ff0000', icon: 'YT' },
    twitch: { name: 'Twitch', color: '#9146ff', icon: 'TW' },
    custom: { name: 'Custom RTMP', color: '#6b7280', icon: 'RT' },
};

export const WebinarMode = () => {
    const canvasRef = useRef(null);
    const screenVideoRef = useRef(null);
    const cameraVideoRef = useRef(null);
    const [leftTab, setLeftTab] = useState('scenes');
    const [showStreamPanel, setShowStreamPanel] = useState(false);
    const [showMixer, setShowMixer] = useState(false);

    // Presenter tools
    const [lowerThirdName, setLowerThirdName] = useState('Speaker Name');
    const [lowerThirdTitle, setLowerThirdTitle] = useState('Title / Role');
    const [showLowerThird, setShowLowerThird] = useState(false);
    const [teleprompterText, setTeleprompterText] = useState('');
    const [teleprompterSpeed, setTeleprompterSpeed] = useState(30);
    const [teleprompterActive, setTeleprompterActive] = useState(false);
    const [speakerNotes, setSpeakerNotes] = useState('');
    const [speakerTimer, setSpeakerTimer] = useState(0);
    const [speakerTimerRunning, setSpeakerTimerRunning] = useState(false);

    // Q&A audience
    const [qaItems, setQaItems] = useState([]);
    const [newQuestion, setNewQuestion] = useState('');

    // Branding
    const [brandLogo, setBrandLogo] = useState(null);
    const [brandColor, setBrandColor] = useState('#8b5cf6');
    const [bannerText, setBannerText] = useState('');
    const [bannerVisible, setBannerVisible] = useState(false);

    // Countdown + recording
    const [countdown, setCountdown] = useState(null);
    const [recTime, setRecTime] = useState(0);
    const [recQuality, setRecQuality] = useState('1080p');

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

    // Auto-set first scene active
    useEffect(() => {
        if (!scenes.activeSceneId && scenes.scenes.length > 0) {
            scenes.setActiveSceneId(scenes.scenes[0].id);
        }
    }, [scenes.activeSceneId, scenes.scenes]);

    // Guard against accidental close
    useEffect(() => {
        const active = recording.isRecording || streaming.isStreaming;
        if (!active) return;
        const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [recording.isRecording, streaming.isStreaming]);

    // Render loop
    const scenesRef = useRef(scenes);
    const streamsRef = useRef(streams);
    const propsRef = useRef({});
    useEffect(() => {
        scenesRef.current = scenes;
        streamsRef.current = streams;
        propsRef.current = { showLowerThird, name: lowerThirdName, title: lowerThirdTitle, bannerVisible, bannerText, brandColor, brandLogo };
    });

    useEffect(() => {
        let running = true;
        const loop = () => {
            if (!running) return;
            const canvas = canvasRef.current;
            if (!canvas) { requestAnimationFrame(loop); return; }
            const ctx = canvas.getContext('2d');
            scenesRef.current.renderScene(ctx, canvas, scenesRef.current.activeScene, streamsRef.current);

            const p = propsRef.current;
            // Lower third
            if (p.showLowerThird && (p.name || p.title)) {
                renderTitleTemplate('lowerThird', ctx, canvas, { name: p.name, title: p.title });
            }
            // Banner
            if (p.bannerVisible && p.bannerText) {
                ctx.save();
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillRect(0, canvas.height - 80, canvas.width, 60);
                ctx.fillStyle = p.brandColor;
                ctx.fillRect(0, canvas.height - 80, 6, 60);
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 28px Outfit, sans-serif';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.bannerText.slice(0, 80), 24, canvas.height - 50);
                ctx.restore();
            }
            // Logo
            if (p.brandLogo) {
                const img = new Image();
                img.src = p.brandLogo;
                if (img.complete) ctx.drawImage(img, canvas.width - 220, 20, 200, 60);
            }
            requestAnimationFrame(loop);
        };
        loop();
        return () => { running = false; };
    }, []);

    const handleStartReplay = () => {
        if (canvasRef.current) replay.startBuffering(canvasRef.current, streams.audioStream);
    };

    const goLiveWithCountdown = useCallback((seconds = 3) => {
        setCountdown(seconds);
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) { clearInterval(timer); streaming.startStream(canvasRef.current, streams.audioStream); return null; }
                return prev - 1;
            });
        }, 1000);
    }, [streaming, streams.audioStream]);

    const handleLogoUpload = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setBrandLogo(reader.result);
        reader.readAsDataURL(file);
        e.target.value = '';
    }, []);

    const addQaItem = useCallback(() => {
        if (!newQuestion.trim()) return;
        setQaItems(prev => [...prev, { id: Date.now(), question: newQuestion.trim(), answer: '', answered: false }]);
        setNewQuestion('');
    }, [newQuestion]);

    const answerQaItem = useCallback((id, answer) => {
        setQaItems(prev => prev.map(q => q.id === id ? { ...q, answer, answered: true } : q));
    }, []);

    const removeQaItem = useCallback((id) => {
        setQaItems(prev => prev.filter(q => q.id !== id));
    }, []);

    const fmtTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

    return (
        <div className="webinar-mode">
            {/* Countdown overlay */}
            {countdown !== null && (
                <div className="webinar-countdown-overlay">
                    <div className="webinar-countdown-number">{countdown}</div>
                    <div className="webinar-countdown-label">Webinar starting...</div>
                </div>
            )}

            <div className="webinar-layout">
                {/* === LEFT PANEL === */}
                <aside className="webinar-left-panel">
                    <div className="webinar-left-tabs">
                        <button className={leftTab === 'scenes' ? 'active' : ''} onClick={() => setLeftTab('scenes')}>Scenes</button>
                        <button className={leftTab === 'presenter' ? 'active' : ''} onClick={() => setLeftTab('presenter')}>Presenter</button>
                        <button className={leftTab === 'branding' ? 'active' : ''} onClick={() => setLeftTab('branding')}>Brand</button>
                    </div>
                    <div className="webinar-left-content">
                        {leftTab === 'scenes' && (
                            <>
                                <div className="webinar-section-label">Scenes</div>
                                <SceneSwitcher scenes={scenes.scenes} activeSceneId={scenes.activeSceneId} onSelectScene={scenes.setActiveSceneId} onAddScene={scenes.addScene} />

                                <div className="webinar-section-label" style={{ marginTop: '0.75rem' }}>Layout</div>
                                <div className="webinar-layout-bar">
                                    {scenes.LAYOUTS?.map(layout => {
                                        const count = scenes.activeScene?.sources?.filter(s => s.visible).length || 0;
                                        return (
                                            <button key={layout.id} className={`webinar-layout-btn ${scenes.activeScene?.layout === layout.id ? 'active' : ''}`}
                                                onClick={() => scenes.applyLayout?.(scenes.activeSceneId, layout.id)}
                                                disabled={count < layout.minSources}
                                                title={layout.name}>
                                                {layout.icon}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="webinar-section-label" style={{ marginTop: '0.75rem' }}>Sources</div>
                                <SourcePanel scene={scenes.activeScene}
                                    onAddSource={(data) => scenes.addSource(scenes.activeSceneId, data)}
                                    onRemoveSource={(id) => scenes.removeSource(scenes.activeSceneId, id)}
                                    onUpdateSource={(id, updates) => scenes.updateSource(scenes.activeSceneId, id, updates)} />
                            </>
                        )}

                        {leftTab === 'presenter' && (
                            <div className="webinar-presenter-panel">
                                <div className="webinar-section-label">Lower Third</div>
                                <div className="webinar-ppt-field">
                                    <label>
                                        <input type="checkbox" checked={showLowerThird} onChange={e => setShowLowerThird(e.target.checked)}
                                            style={{ width: 'auto', marginRight: '0.4rem' }} />
                                        Show overlay
                                    </label>
                                </div>
                                <input className="webinar-input" value={lowerThirdName} onChange={e => setLowerThirdName(e.target.value)} placeholder="Speaker Name" />
                                <input className="webinar-input" value={lowerThirdTitle} onChange={e => setLowerThirdTitle(e.target.value)} placeholder="Title / Role" />

                                <div className="webinar-section-label" style={{ marginTop: '0.75rem' }}>Teleprompter</div>
                                <textarea className="webinar-textarea" value={teleprompterText}
                                    onChange={e => setTeleprompterText(e.target.value)}
                                    placeholder="Paste your script here..." rows={5} />
                                <div className="webinar-ppt-row">
                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Speed</label>
                                    <input type="range" min={10} max={60} value={teleprompterSpeed}
                                        onChange={e => setTeleprompterSpeed(Number(e.target.value))} style={{ flex: 1 }} />
                                </div>
                                <button className={`webinar-ppt-btn ${teleprompterActive ? 'active' : ''}`}
                                    onClick={() => setTeleprompterActive(!teleprompterActive)} disabled={!teleprompterText}>
                                    {teleprompterActive ? 'Stop' : 'Start'} Teleprompter
                                </button>

                                <div className="webinar-section-label" style={{ marginTop: '0.75rem' }}>Speaker Notes</div>
                                <textarea className="webinar-textarea" value={speakerNotes}
                                    onChange={e => setSpeakerNotes(e.target.value)}
                                    placeholder="Private notes for the speaker..." rows={3} />

                                <div className="webinar-section-label" style={{ marginTop: '0.75rem' }}>Speaker Timer</div>
                                <div className="webinar-timer-display">{fmtTime(speakerTimer)}</div>
                                <div className="webinar-ppt-row">
                                    <button className="webinar-ppt-btn" onClick={() => setSpeakerTimerRunning(!speakerTimerRunning)}>
                                        {speakerTimerRunning ? 'Pause' : 'Start'}
                                    </button>
                                    <button className="webinar-ppt-btn" onClick={() => { setSpeakerTimer(0); setSpeakerTimerRunning(false); }}>
                                        Reset
                                    </button>
                                </div>
                            </div>
                        )}

                        {leftTab === 'branding' && (
                            <div className="webinar-brand-panel">
                                <div className="webinar-section-label">Logo</div>
                                <div className="webinar-brand-upload">
                                    {brandLogo ? (
                                        <div className="webinar-logo-preview">
                                            <img src={brandLogo} alt="Logo" />
                                            <button onClick={() => setBrandLogo(null)}>Remove</button>
                                        </div>
                                    ) : (
                                        <>
                                            <input type="file" accept="image/*" id="web-logo-upload" style={{ display: 'none' }} onChange={handleLogoUpload} />
                                            <label htmlFor="web-logo-upload" className="webinar-logo-drop">+ Upload Logo</label>
                                        </>
                                    )}
                                </div>

                                <div className="webinar-section-label" style={{ marginTop: '0.75rem' }}>Brand Color</div>
                                <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} className="webinar-color-input" />
                                <div className="webinar-color-presets">
                                    {['#8b5cf6', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'].map(c => (
                                        <button key={c} className="webinar-color-swatch" style={{ background: c }} onClick={() => setBrandColor(c)} />
                                    ))}
                                </div>

                                <div className="webinar-section-label" style={{ marginTop: '0.75rem' }}>Banner</div>
                                <input className="webinar-input" value={bannerText} onChange={e => setBannerText(e.target.value)}
                                    placeholder="Banner ticker text..." maxLength={80} />
                                <button className={`webinar-ppt-btn ${bannerVisible ? 'active' : ''}`}
                                    onClick={() => setBannerVisible(!bannerVisible)} disabled={!bannerText}>
                                    {bannerVisible ? 'Hide Banner' : 'Show Banner'}
                                </button>
                            </div>
                        )}
                    </div>
                </aside>

                {/* === CENTER PREVIEW === */}
                <div className="webinar-center">
                    <div className="webinar-preview-wrapper">
                        <canvas ref={canvasRef} width={1920} height={1080} className="webinar-canvas" />

                        {recording.isRecording && (
                            <div className="webinar-rec-badge"><span className="webinar-rec-dot" />REC {fmtTime(recTime)}</div>
                        )}
                        {streaming.isStreaming && (
                            <div className="webinar-live-badge"><span className="webinar-live-dot" />LIVE {fmtTime(streaming.streamStats?.uptime || 0)}</div>
                        )}
                        {!streams?.screenStream && !streams?.cameraStream && (
                            <div className="webinar-preview-empty">Enable camera or screen to start</div>
                        )}

                        {/* Teleprompter overlay */}
                        {teleprompterActive && teleprompterText && (
                            <div className="webinar-teleprompter" style={{ '--teleprompter-speed': `${teleprompterSpeed}s` }}>
                                <div className="webinar-teleprompter-text">{teleprompterText}</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* === RIGHT PANEL === */}
                <aside className="webinar-right-panel">
                    {/* Audience Q&A */}
                    <div className="webinar-right-section">
                        <div className="webinar-section-label">Audience Q&A</div>
                        <div className="webinar-qa-input">
                            <input className="webinar-input" value={newQuestion}
                                onChange={e => setNewQuestion(e.target.value)} placeholder="Add question..."
                                onKeyDown={e => e.key === 'Enter' && addQaItem()} />
                            <button className="webinar-qa-add" onClick={addQaItem} disabled={!newQuestion.trim()}>+</button>
                        </div>
                        <div className="webinar-qa-list">
                            {qaItems.length === 0 && <p className="webinar-qa-empty">No questions yet. Add audience questions or use as speaking points.</p>}
                            {qaItems.map(q => (
                                <div key={q.id} className={`webinar-qa-item ${q.answered ? 'answered' : ''}`}>
                                    <div className="webinar-qa-question">
                                        <span className="webinar-qa-q">Q: {q.question}</span>
                                        <button className="webinar-qa-del" onClick={() => removeQaItem(q.id)}>x</button>
                                    </div>
                                    {q.answered ? (
                                        <div className="webinar-qa-answer">A: {q.answer}</div>
                                    ) : (
                                        <input className="webinar-input" style={{ marginTop: '0.25rem', fontSize: '0.7rem' }}
                                            placeholder="Type answer..." onKeyDown={e => {
                                                if (e.key === 'Enter' && e.target.value.trim()) {
                                                    answerQaItem(q.id, e.target.value.trim());
                                                    e.target.value = '';
                                                }
                                            }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Destinations */}
                    <div className="webinar-right-section">
                        <div className="webinar-section-label">Destinations</div>
                        <div className="webinar-dest-list">
                            {streaming.destinations?.map((dest, i) => {
                                const pInfo = PLATFORM_INFO[dest.platform] || PLATFORM_INFO.custom;
                                const status = streaming.destStatuses?.[dest.platform];
                                const dotClass = streaming.isStreaming ? (status?.status === 'connected' ? 'connected' : status?.status === 'reconnecting' ? 'connecting' : 'failed') : (dest.streamKey ? 'pending' : 'failed');
                                return (
                                    <div key={i} className="webinar-dest-item" title={dest.label}>
                                        <div className="webinar-dest-icon" style={{ background: pInfo.color }}>{pInfo.icon}</div>
                                        <span className="webinar-dest-name">{dest.label}</span>
                                        <span className={`webinar-dest-dot ${dotClass}`} />
                                    </div>
                                );
                            })}
                        </div>
                        <button className="webinar-dest-config" onClick={() => setShowStreamPanel(true)}>Configure</button>
                    </div>

                    {/* Recording */}
                    <div className="webinar-right-section">
                        <div className="webinar-section-label">Recording</div>
                        <select className="webinar-select" value={recQuality} onChange={e => setRecQuality(e.target.value)}>
                            <option value="720p">720p (HD)</option>
                            <option value="1080p">1080p (FHD)</option>
                            <option value="1440p">1440p (2K)</option>
                            <option value="native">Native</option>
                        </select>
                    </div>

                    {/* Audio */}
                    <div className="webinar-right-section">
                        <div className="webinar-section-label">Audio</div>
                        <div className="webinar-audio-bar"><div className="webinar-audio-fill" style={{ width: `${audioLevel * 100}%` }} /></div>
                        <button className={`webinar-toggle-btn ${streams?.audioStream ? 'active' : ''}`} onClick={streams?.toggleMic} style={{ marginTop: '0.3rem' }}>
                            {streams?.audioStream ? 'Mute Mic' : 'Unmute Mic'}
                        </button>
                        <button className="webinar-mixer-open" onClick={() => setShowMixer(true)}>Audio Mixer</button>
                    </div>

                    {/* Replay + Health */}
                    <div className="webinar-right-section">
                        <div className="webinar-section-label">Replay</div>
                        {!replay.isBuffering ? (
                            <button className="webinar-ppt-btn" onClick={handleStartReplay}>Start Buffer</button>
                        ) : (
                            <button className="webinar-ppt-btn active" onClick={replay.saveReplay}>Save Replay</button>
                        )}
                    </div>

                    {streaming.isStreaming && (
                        <div className="webinar-right-section">
                            <div className="webinar-section-label">Stream Health</div>
                            <div className="webinar-health-bar">
                                <div className="webinar-health-item"><span className="webinar-health-val">{streaming.streamStats?.bitrate || 0}</span><span className="webinar-health-lbl">kbps</span></div>
                                <div className="webinar-health-item"><span className="webinar-health-val">{streaming.resolution}</span><span className="webinar-health-lbl">Res</span></div>
                                <div className="webinar-health-item"><span className="webinar-health-val">30</span><span className="webinar-health-lbl">FPS</span></div>
                            </div>
                        </div>
                    )}
                </aside>
            </div>

            {/* === BOTTOM BAR === */}
            <div className="webinar-bottom-bar">
                <div className="webinar-bottom-left">
                    <button className={`webinar-toggle-btn ${streams?.cameraStream ? 'active' : ''}`} onClick={streams?.toggleCamera}>Cam</button>
                    <button className={`webinar-toggle-btn ${streams?.audioStream ? 'active' : ''}`} onClick={streams?.toggleMic}>Mic</button>
                    <button className={`webinar-toggle-btn ${streams?.screenStream ? 'active' : ''}`} onClick={streams?.toggleScreen}>Screen</button>
                </div>
                <div className="webinar-bottom-center">
                    {!recording.isRecording ? (
                        <button className="webinar-btn-record" onClick={() => recording.startRecording()}>Record</button>
                    ) : (
                        <button className="webinar-btn-record recording" onClick={() => recording.stopRecording()}>Stop ({fmtTime(recTime)})</button>
                    )}
                    {!streaming.isStreaming ? (
                        <button className="webinar-btn-live" onClick={() => goLiveWithCountdown(3)}>Go Live</button>
                    ) : (
                        <button className="webinar-btn-live streaming" onClick={() => streaming.stopStream()}>End Webinar</button>
                    )}
                </div>
                <div className="webinar-bottom-right">
                    {streaming.isStreaming && <div className="webinar-ind live"><span className="webinar-ind-dot" />LIVE</div>}
                    {recording.isRecording && <div className="webinar-ind rec"><span className="webinar-ind-dot red" />REC</div>}
                </div>
            </div>

            {/* Modals */}
            <StreamPanel
                isOpen={showStreamPanel} onClose={() => setShowStreamPanel(false)}
                isStreaming={streaming.isStreaming} isConnecting={streaming.isConnecting}
                streamError={streaming.streamError} streamStats={streaming.streamStats}
                destinations={streaming.destinations} destStatuses={streaming.destStatuses}
                addDestination={streaming.addDestination} removeDestination={streaming.removeDestination}
                updateDestination={streaming.updateDestination} setPlatform={streaming.setPlatform}
                relayUrl={streaming.relayUrl} setRelayUrl={streaming.setRelayUrl}
                resolution={streaming.resolution} setResolution={streaming.setResolution}
                bitrate={streaming.bitrate} setBitrate={streaming.setBitrate}
                onStartStream={streaming.startStream} onStopStream={streaming.stopStream}
                onCheckRelay={streaming.checkRelay}
                canvasRef={canvasRef} audioStream={streams.audioStream} />

            <MixerPanel isOpen={showMixer} onClose={() => setShowMixer(false)}
                scenes={scenes.scenes} activeSceneId={scenes.activeSceneId}
                onUpdateSource={scenes.updateSource} />
        </div>
    );
};
