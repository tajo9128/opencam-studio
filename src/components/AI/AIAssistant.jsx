import React, { useState, useRef, useEffect } from 'react';
import './AIAssistant.css';

export const AIAssistant = ({
    isOpen, onToggle,
    messages, isProcessing, isStreaming, onSend, onClear,
    ollamaConnected, ollamaModel, ollamaModels, onCheckOllama, onSetOllamaModel,
    apiKey, onApiKeyChange,
    voiceInput, onStartVoice, onStopVoice,
}) => {
    const [input, setInput] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const [voiceText, setVoiceText] = useState('');

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isOpen) { inputRef.current?.focus(); onCheckOllama?.(); }
    }, [isOpen, onCheckOllama]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const text = input.trim() || voiceText.trim();
        if (!text || isProcessing) return;
        onSend(text);
        setInput('');
        setVoiceText('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleVoice = () => {
        if (voiceInput) {
            onStopVoice?.();
        } else {
            onStartVoice?.((text, isInterim) => {
                if (isInterim) {
                    setVoiceText(text);
                } else {
                    setInput(text);
                    setVoiceText('');
                }
            });
        }
    };

    const displayText = voiceText || input;

    return (
        <>
            {/* Floating button */}
            <button className={`ai-fab ${isOpen ? 'ai-fab-active' : ''}`} onClick={onToggle} title="AI Assistant" aria-label="Toggle AI Assistant" aria-expanded={isOpen}>
                <span className="ai-fab-icon">AI</span>
                {ollamaConnected && <span className="ai-fab-status-dot" />}
            </button>

            {/* Drawer */}
            {isOpen && (
                <div className="ai-drawer" role="dialog" aria-label="AI Assistant">
                    <div className="ai-drawer-header">
                        <div className="ai-drawer-header-left">
                            <span className="ai-drawer-icon">AI</span>
                            <span className="ai-drawer-title">BioDockify Studio AI</span>
                            <span className={`ai-drawer-status ${ollamaConnected ? 'connected' : apiKey ? 'connected' : 'local'}`}>
                                {ollamaConnected ? `Ollama: ${ollamaModel || 'ready'}` : apiKey ? 'API' : 'Local'}
                            </span>
                        </div>
                        <div className="ai-drawer-header-right">
                            <button className="ai-drawer-btn" onClick={() => setShowSettings(!showSettings)} title="Settings">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                                </svg>
                            </button>
                            <button className="ai-drawer-btn" onClick={onClear} title="Clear">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                            <button className="ai-drawer-btn" onClick={onToggle} title="Close">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {showSettings && (
                        <div className="ai-drawer-settings">
                            <div className="ai-setting">
                                <label>Ollama</label>
                                <span className={ollamaConnected ? 'ai-connected' : 'ai-disconnected'}>
                                    {ollamaConnected ? `Connected` : 'Offline'}
                                </span>
                                <button className="ai-drawer-btn-sm" onClick={onCheckOllama}>Refresh</button>
                            </div>
                            {ollamaConnected && ollamaModels?.length > 0 && (
                                <div className="ai-setting">
                                    <label>Model</label>
                                    <select
                                        className="ai-setting-select"
                                        value={ollamaModel || ''}
                                        onChange={e => onSetOllamaModel?.(e.target.value)}
                                    >
                                        {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="ai-setting">
                                <label>API Key</label>
                                <input
                                    type="password"
                                    value={apiKey || ''}
                                    onChange={e => onApiKeyChange?.(e.target.value)}
                                    placeholder="sk-... (OpenAI fallback)"
                                    className="ai-setting-input"
                                />
                            </div>
                        </div>
                    )}

                    <div className="ai-drawer-messages">
                        {messages.length === 0 && (
                            <div className="ai-drawer-empty">
                                <p>Ask me to edit your video</p>
                                <div className="ai-suggestions">
                                    {['Trim first 5 seconds', 'Apply sepia filter', 'Set speed to 2x', 'Add zoom at 0:30 for 3s'].map(s => (
                                        <button key={s} className="ai-suggestion" onClick={() => onSend(s)}>{s}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} className={`ai-msg ai-msg-${msg.role}`}>
                                <div className="ai-msg-content">
                                    {msg.content}
                                    {isStreaming && i === messages.length - 1 && msg.role === 'assistant' && (
                                        <span className="ai-streaming-cursor" />
                                    )}
                                </div>
                            </div>
                        ))}
                        {isProcessing && !isStreaming && (
                            <div className="ai-msg ai-msg-assistant">
                                <div className="ai-msg-content ai-thinking">
                                    <span className="ai-dot" /><span className="ai-dot" /><span className="ai-dot" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form className="ai-drawer-input" onSubmit={handleSubmit}>
                        <button type="button" className={`ai-voice-btn ${voiceInput ? 'active' : ''}`} onClick={handleVoice} title={voiceInput ? 'Stop listening' : 'Voice input'}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                <line x1="12" y1="19" x2="12" y2="23"/>
                                <line x1="8" y1="23" x2="16" y2="23"/>
                            </svg>
                        </button>
                        <input
                            ref={inputRef}
                            value={displayText}
                            onChange={e => { setInput(e.target.value); setVoiceText(''); }}
                            onKeyDown={handleKeyDown}
                            placeholder={voiceInput ? 'Listening...' : 'Try: "trim first 5 seconds" or "help"'}
                            disabled={isProcessing}
                        />
                        <button type="submit" disabled={(!input.trim() && !voiceText.trim()) || isProcessing}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                            </svg>
                        </button>
                    </form>
                </div>
            )}
        </>
    );
};
