import React, { useState, useRef, useEffect } from 'react';
import './ChatPanel.css';

export const ChatPanel = ({
    isOpen, onClose, messages, isProcessing, onSend, onClear,
    apiKey, onApiKeyChange,
    ollamaConnected, ollamaModel, ollamaModels, onCheckOllama,
}) => {
    const [input, setInput] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    useEffect(() => { if (isOpen) { inputRef.current?.focus(); onCheckOllama?.(); } }, [isOpen, onCheckOllama]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!input.trim() || isProcessing) return;
        onSend(input);
        setInput('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
    };

    if (!isOpen) return null;

    return (
        <div className="chat-panel">
            <div className="chat-header">
                <div className="chat-header-left">
                    <span className="chat-icon">AI</span>
                    <span className="chat-title">BioDockify Studio AI</span>
                    <span className={`chat-status ${ollamaConnected ? 'connected' : apiKey ? 'connected' : 'local'}`}>
                        {ollamaConnected ? `Ollama: ${ollamaModel || 'ready'}` : apiKey ? 'API' : 'Local'}
                    </span>
                </div>
                <div className="chat-header-right">
                    <button className="btn-icon-sm" onClick={() => setShowSettings(!showSettings)} title="Settings">S</button>
                    <button className="btn-icon-sm" onClick={onClear} title="Clear chat">C</button>
                    <button className="btn-icon-sm" onClick={onClose} title="Close">x</button>
                </div>
            </div>

            {showSettings && (
                <div className="chat-settings">
                    <label>
                        <span>Ollama Status</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: ollamaConnected ? '#22c55e' : '#ef4444' }}>
                                {ollamaConnected ? `Connected (${ollamaModels?.length || 0} models)` : 'Not connected'}
                            </span>
                            <button className="btn-icon-sm" onClick={onCheckOllama} title="Refresh">R</button>
                        </div>
                    </label>
                    {ollamaConnected && ollamaModels?.length > 0 && (
                        <label>
                            <span>Model</span>
                            <select className="chat-input-sm" value={ollamaModel || ''} onChange={() => {}}>
                                {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </label>
                    )}
                    <label>
                        <span>API Key (optional, for non-Ollama)</span>
                        <input type="password" value={apiKey} onChange={(e) => onApiKeyChange(e.target.value)}
                            placeholder="sk-... (OpenAI compatible)" className="chat-input-sm" />
                    </label>
                    <p className="chat-settings-hint">
                        Ollama (free, local) handles complex commands. Without it, basic commands still work instantly via local pattern matching.
                    </p>
                </div>
            )}

            <div className="chat-messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-msg ${msg.role}`}>
                        <div className="chat-msg-content">
                            {msg.content.split('\n').map((line, j) => <p key={j}>{line}</p>)}
                        </div>
                    </div>
                ))}
                {isProcessing && (
                    <div className="chat-msg assistant">
                        <div className="chat-msg-content"><span className="typing-indicator">Thinking...</span></div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-area" onSubmit={handleSubmit}>
                <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown} placeholder='Try "trim first 5 seconds" or "help"'
                    disabled={isProcessing} className="chat-input" />
                <button type="submit" disabled={!input.trim() || isProcessing} className="chat-send-btn">Send</button>
            </form>
        </div>
    );
};
