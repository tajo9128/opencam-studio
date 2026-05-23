import React, { useState } from 'react';
import './StreamPanel.css';

const PLATFORMS = [
    { id: 'youtube', label: 'YouTube Live', rtmp: 'rtmp://a.rtmp.youtube.com/live2', color: '#ff0000' },
    { id: 'twitch', label: 'Twitch', rtmp: 'rtmp://live.twitch.tv/app', color: '#9146ff' },
    { id: 'custom', label: 'Custom RTMP', rtmp: '', color: '#8b5cf6' },
];

const RESOLUTIONS = [
    { id: '720p', label: '720p', w: 1280, h: 720 },
    { id: '1080p', label: '1080p', w: 1920, h: 1080 },
    { id: '1440p', label: '1440p', w: 2560, h: 1440 },
];

const BITRATES = [
    { value: 2500, label: '2.5 Mbps' },
    { value: 4000, label: '4 Mbps' },
    { value: 6000, label: '6 Mbps' },
    { value: 8000, label: '8 Mbps' },
    { value: 12000, label: '12 Mbps' },
];

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const StreamPanel = ({
    isOpen, onClose,
    isStreaming, isConnecting, streamError, streamStats,
    platform, selectPlatform,
    streamKey, setStreamKey,
    rtmpUrl, setRtmpUrl,
    relayUrl, setRelayUrl,
    resolution, setResolution,
    bitrate, setBitrate,
    onStartStream, onStopStream, onCheckRelay,
    canvasRef, audioStream,
}) => {
    const [relayStatus, setRelayStatus] = useState('unchecked');
    const [showKey, setShowKey] = useState(false);
    const [configuring, setConfiguring] = useState(!streamKey);

    const handleCheckRelay = async () => {
        setRelayStatus('checking');
        const ok = await onCheckRelay();
        setRelayStatus(ok ? 'connected' : 'disconnected');
    };

    const handleGoLive = () => {
        if (!streamKey) {
            setConfiguring(true);
            return;
        }
        onStartStream(canvasRef, audioStream);
    };

    if (!isOpen) return null;

    return (
        <div className="stream-panel-overlay" onClick={onClose}>
            <div className="stream-panel" onClick={e => e.stopPropagation()}>
                <div className="stream-panel-header">
                    <h2>{isStreaming ? 'Live' : 'Go Live'}</h2>
                    <div className="stream-panel-header-right">
                        {isStreaming && (
                            <div className="stream-live-badge">
                                <span className="stream-live-dot" />
                                LIVE
                            </div>
                        )}
                        <button className="btn-icon-bg" onClick={onClose}>x</button>
                    </div>
                </div>

                <div className="stream-panel-body">
                    {/* Stream Stats (when live) */}
                    {isStreaming && (
                        <div className="stream-stats-grid">
                            <div className="stream-stat">
                                <span className="stream-stat-label">Uptime</span>
                                <span className="stream-stat-value">{formatUptime(streamStats.uptime)}</span>
                            </div>
                            <div className="stream-stat">
                                <span className="stream-stat-label">Bitrate</span>
                                <span className="stream-stat-value">{streamStats.bitrate} kbps</span>
                            </div>
                            <div className="stream-stat">
                                <span className="stream-stat-label">FPS</span>
                                <span className="stream-stat-value">{streamStats.fps}</span>
                            </div>
                            <div className="stream-stat">
                                <span className="stream-stat-label">Sent</span>
                                <span className="stream-stat-value">{formatBytes(streamStats.bytesSent)}</span>
                            </div>
                        </div>
                    )}

                    {streamError && (
                        <div className="stream-error">{streamError}</div>
                    )}

                    {/* Platform Selection */}
                    <div className="stream-section">
                        <label className="stream-label">Platform</label>
                        <div className="stream-platform-row">
                            {PLATFORMS.map(p => (
                                <button
                                    key={p.id}
                                    className={`stream-platform-btn ${platform === p.id ? 'active' : ''}`}
                                    onClick={() => selectPlatform(p.id)}
                                    style={platform === p.id ? { borderColor: p.color, background: `${p.color}15` } : {}}
                                >
                                    <span className="stream-platform-dot" style={{ background: p.color }} />
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Stream Key */}
                    <div className="stream-section">
                        <label className="stream-label">Stream Key</label>
                        <div className="stream-key-row">
                            <input
                                className="stream-input"
                                type={showKey ? 'text' : 'password'}
                                value={streamKey}
                                onChange={e => setStreamKey(e.target.value)}
                                placeholder="Your stream key"
                            />
                            <button className="stream-btn-sm" onClick={() => setShowKey(!showKey)}>
                                {showKey ? 'Hide' : 'Show'}
                            </button>
                        </div>
                        <p className="stream-hint">
                            {platform === 'youtube' ? 'Get your key from YouTube Studio > Stream' :
                             platform === 'twitch' ? 'Get your key from Twitch Dashboard > Settings > Stream' :
                             'Enter your RTMP stream key'}
                        </p>
                    </div>

                    {/* RTMP URL (custom) */}
                    {platform === 'custom' && (
                        <div className="stream-section">
                            <label className="stream-label">RTMP URL</label>
                            <input
                                className="stream-input"
                                value={rtmpUrl}
                                onChange={e => setRtmpUrl(e.target.value)}
                                placeholder="rtmp://your-server/live"
                            />
                        </div>
                    )}

                    {/* Relay Server */}
                    <div className="stream-section">
                        <label className="stream-label">Relay Server</label>
                        <div className="stream-key-row">
                            <input
                                className="stream-input"
                                value={relayUrl}
                                onChange={e => setRelayUrl(e.target.value)}
                                placeholder="ws://localhost:8080"
                            />
                            <button className="stream-btn-sm" onClick={handleCheckRelay}>
                                {relayStatus === 'checking' ? '...' : relayStatus === 'connected' ? 'OK' : 'Test'}
                            </button>
                        </div>
                        <p className="stream-hint">
                            WebSocket relay that converts browser MediaRecorder to RTMP.
                            Run: <code>docker-compose up rtmp-relay</code>
                        </p>
                        {relayStatus === 'connected' && <span className="stream-status-ok">Relay connected</span>}
                        {relayStatus === 'disconnected' && <span className="stream-status-err">Relay not reachable</span>}
                    </div>

                    {/* Quality */}
                    <div className="stream-section">
                        <label className="stream-label">Output Quality</label>
                        <div className="stream-quality-row">
                            <div className="stream-field">
                                <span className="stream-field-label">Resolution</span>
                                <select className="stream-select" value={resolution} onChange={e => setResolution(e.target.value)}>
                                    {RESOLUTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                </select>
                            </div>
                            <div className="stream-field">
                                <span className="stream-field-label">Bitrate</span>
                                <select className="stream-select" value={bitrate} onChange={e => setBitrate(parseInt(e.target.value))}>
                                    {BITRATES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="stream-actions">
                        {isStreaming ? (
                            <button className="btn btn-record stream-go-btn" onClick={onStopStream} disabled={isConnecting}>
                                End Stream
                            </button>
                        ) : (
                            <button className="btn btn-primary stream-go-btn" onClick={handleGoLive} disabled={isConnecting || !streamKey}>
                                {isConnecting ? 'Connecting...' : 'Go Live'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
