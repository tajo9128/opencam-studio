import React, { useState, useEffect, useCallback } from 'react';
import { useAI } from '../../hooks/useAI';
import './SettingsPage.css';

export const SettingsPage = () => {
    const { embeddedAvailable, embeddedModel, checkEmbedded } = useAI();
    // AI — Ollama
    const [ollamaStatus, setOllamaStatus] = useState('checking');
    const [ollamaModels, setOllamaModels] = useState([]);
    const [ollamaModel, setOllamaModelState] = useState(() => localStorage.getItem('ollama_model') || '');
    const [ollamaEndpoint, setOllamaEndpoint] = useState(() => localStorage.getItem('ollama_endpoint') || '');

    // AI — Paid API
    const [apiProvider, setApiProvider] = useState(() => localStorage.getItem('ai_provider') || 'openai');
    const [apiKey, setApiKeyState] = useState(() => localStorage.getItem('ai_api_key') || '');
        const [apiModel, setApiModelState] = useState(() => localStorage.getItem('ai_model') || 'gpt-4o-mini');

    // Recording
    const [recQuality, setRecQuality] = useState(() => localStorage.getItem('rec_quality') || '1080p');
    const [recFormat, setRecFormat] = useState(() => localStorage.getItem('rec_format') || 'webm');

    // YouTube
    const [ytClientId, setYtClientId] = useState(() => localStorage.getItem('yt_client_id') || '');

    // Editor
    const [defaultTransition, setDefaultTransition] = useState(() => localStorage.getItem('default_transition') || 'crossfade');
    const [timelineSnap, setTimelineSnap] = useState(() => localStorage.getItem('timeline_snap') !== 'false');
    const [autoSave, setAutoSave] = useState(() => localStorage.getItem('auto_save') !== 'false');

    const save = useCallback((key, val) => localStorage.setItem(key, String(val)), []);

    const checkOllama = useCallback(async () => {
        setOllamaStatus('checking');
        const bases = ['/api/ollama', 'http://localhost:11434'];
        for (const base of bases) {
            try {
                const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
                if (res.ok) {
                    const data = await res.json();
                    setOllamaModels(data.models?.map(m => m.name) || []);
                    setOllamaStatus('connected');
                    return;
                }
            } catch { /* Ollama not available */ }
        }
        setOllamaStatus('disconnected');
        setOllamaModels([]);
    }, []);

    useEffect(() => { checkOllama(); }, [checkOllama]);

    return (
        <div className="settings-page">
            <div className="settings-page-inner">
                <div className="settings-header">
                    <h1>Settings</h1>
                    <p>Configure your recording, editing, and AI workflow</p>
                </div>

                {/* ====== RECORDING (Loom-like) ====== */}
                <section className="settings-section">
                    <div className="settings-section-header"><h2>Recording</h2></div>
                    <div className="settings-card">
                        <h3>Screen Recording Defaults</h3>
                        <div className="settings-field">
                            <label>Default Quality</label>
                            <div className="settings-option-row">
                                {['720p', '1080p', '1440p'].map(q => (
                                    <button key={q} className={`settings-option-btn ${recQuality === q ? 'active' : ''}`}
                                        onClick={() => { setRecQuality(q); save('rec_quality', q); }}>{q}</button>
                                ))}
                            </div>
                        </div>
                        <div className="settings-field">
                            <label>Default Format</label>
                            <div className="settings-option-row">
                                {['webm', 'mp4-h264', 'mkv'].map(f => (
                                    <button key={f} className={`settings-option-btn ${recFormat === f ? 'active' : ''}`}
                                        onClick={() => { setRecFormat(f); save('rec_format', f); }}>{f.toUpperCase()}</button>
                                ))}
                            </div>
                        </div>
                        <p className="settings-hint">These defaults apply when you open the app. You can change per-recording in the control bar.</p>
                    </div>
                </section>

                {/* ====== EDITING (Kdenlive-like) ====== */}
                <section className="settings-section">
                    <div className="settings-section-header"><h2>Editing</h2></div>
                    <div className="settings-card">
                        <h3>Timeline Preferences</h3>
                        <div className="settings-field">
                            <label>Default Transition</label>
                            <div className="settings-option-row">
                                {['crossfade', 'fadeBlack', 'wipeLeft', 'dissolve'].map(t => (
                                    <button key={t} className={`settings-option-btn ${defaultTransition === t ? 'active' : ''}`}
                                        onClick={() => { setDefaultTransition(t); save('default_transition', t); }}>
                                        {t.replace(/([A-Z])/g, ' $1').trim()}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="settings-field">
                            <label>Timeline Snap</label>
                            <div className="settings-toggle-row">
                                <button className={`settings-toggle-btn ${timelineSnap ? 'active' : ''}`}
                                    onClick={() => { setTimelineSnap(!timelineSnap); save('timeline_snap', !timelineSnap); }}>
                                    {timelineSnap ? 'On' : 'Off'}
                                </button>
                                <span className="settings-hint">Snap clips to playhead and other clips when dragging</span>
                            </div>
                        </div>
                        <div className="settings-field">
                            <label>Auto-save Projects</label>
                            <div className="settings-toggle-row">
                                <button className={`settings-toggle-btn ${autoSave ? 'active' : ''}`}
                                    onClick={() => { setAutoSave(!autoSave); save('auto_save', !autoSave); }}>
                                    {autoSave ? 'On' : 'Off'}
                                </button>
                                <span className="settings-hint">Automatically save timeline state</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ====== AI PROVIDER ====== */}
                <section className="settings-section">
                    <div className="settings-section-header"><h2>AI Provider</h2></div>

                    {/* Embedded AI */}
                    <div className="settings-card" style={{ borderLeft: embeddedAvailable ? '4px solid #10b981' : '4px solid #64748b' }}>
                        <h3>Built-in AI</h3>
                        <p className="settings-desc">The completely offline, private AI bundled into OpenCam Studio Docker container.</p>
                        <div className="settings-field">
                            <label>Status</label>
                            <div className="settings-row">
                                <span className="settings-status" style={{ color: embeddedAvailable ? '#10b981' : '#64748b', fontWeight: 'bold' }}>
                                    {embeddedAvailable ? `✅ Ready (${embeddedModel || 'Llama-3.2'})` : '⏳ Loading or unavailable...'}
                                </span>
                                <button className="btn btn-outline btn-sm" onClick={checkEmbedded}>Refresh</button>
                            </div>
                        </div>
                    </div>

                    {/* Ollama */}
                    <div className="settings-card">
                        <h3>Ollama (Free, Local)</h3>
                        <p className="settings-desc">Run AI commands locally with Ollama. Used as a fallback if the Built-in AI is unavailable or disabled.</p>
                        <div className="settings-field">
                            <label>Status</label>
                            <div className="settings-row">
                                <span className={`settings-status ${ollamaStatus}`}>
                                    {ollamaStatus === 'connected' ? `Connected (${ollamaModels.length} models)` :
                                     ollamaStatus === 'checking' ? 'Checking...' : 'Not connected'}
                                </span>
                                <button className="btn btn-outline btn-sm" onClick={checkOllama}>Refresh</button>
                            </div>
                        </div>
                        <div className="settings-field">
                            <label>Ollama Endpoint</label>
                            <input className="settings-input" value={ollamaEndpoint}
                                onChange={e => { setOllamaEndpoint(e.target.value); save('ollama_endpoint', e.target.value); }}
                                placeholder="http://localhost:11434 (auto-detected)" />
                        </div>
                        {ollamaModels.length > 0 && (
                            <div className="settings-field">
                                <label>Default Model</label>
                                <select className="settings-select" value={ollamaModel}
                                    onChange={e => { setOllamaModelState(e.target.value); save('ollama_model', e.target.value); }}>
                                    <option value="">Auto (first available)</option>
                                    {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Paid API */}
                    <div className="settings-card">
                        <h3>Cloud AI Provider</h3>
                        <p className="settings-desc">
                            Fallback when Built-in AI and Ollama are offline. Requests go through the server's AI proxy —
                            endpoints are pinned per provider, and a server-side key (env var) takes priority.
                        </p>
                        <div className="settings-field">
                            <label>Provider</label>
                            <select className="settings-select" value={apiProvider}
                                onChange={e => { setApiProvider(e.target.value); save('ai_provider', e.target.value); }}>
                                {[
                                    { id: 'openai', label: 'OpenAI' },
                                    { id: 'anthropic', label: 'Anthropic' },
                                    { id: 'groq', label: 'Groq' },
                                    { id: 'together', label: 'Together AI' },
                                    { id: 'openrouter', label: 'OpenRouter' },
                                ].map(p => (
                                    <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="settings-field">
                            <label>API Key</label>
                            <input className="settings-input" type="password" value={apiKey}
                                onChange={e => { setApiKeyState(e.target.value); save('ai_api_key', e.target.value); }}
                                placeholder="Leave empty if the server has a key configured" />
                        </div>
                        <div className="settings-field">
                            <label>Model</label>
                            <input className="settings-input" value={apiModel}
                                onChange={e => { setApiModelState(e.target.value); save('ai_model', e.target.value); }}
                                placeholder="gpt-4o-mini" />
                        </div>
                    </div>
                </section>

                {/* ====== YOUTUBE UPLOAD ====== */}
                <section className="settings-section">
                    <div className="settings-section-header"><h2>YouTube Upload</h2></div>
                    <div className="settings-card">
                        <h3>Google OAuth Setup</h3>
                        <p className="settings-desc">Enter your Google Cloud OAuth 2.0 Client ID to enable direct YouTube upload from the browser.</p>
                        <div className="settings-field">
                            <label>Client ID</label>
                            <input className="settings-input" value={ytClientId}
                                onChange={e => { setYtClientId(e.target.value); save('yt_client_id', e.target.value); }}
                                placeholder="xxxxx.apps.googleusercontent.com" />
                        </div>
                        <a className="settings-link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">
                            Create credentials at Google Cloud Console
                        </a>
                    </div>
                </section>

                {/* ====== ABOUT ====== */}
                <section className="settings-section">
                    <div className="settings-section-header"><h2>About</h2></div>
                    <div className="settings-card">
                        <div className="settings-about">
                            <div className="settings-about-logo">S</div>
                            <div>
                                <h3>OpenCam Studio</h3>
                                <p>Developed by team of BioDockify</p>
                                <p>Free & Open Source Screen Recorder + Video Editor</p>
                                <p className="settings-about-ver">v1.0.0 &mdash; Recording + Editing + AI + YouTube</p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

