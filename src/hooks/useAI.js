import { useState, useCallback } from 'react';
import { COMMAND_PATTERNS, SYSTEM_PROMPT, HELP_MESSAGE } from '../constants/aiPrompts';

// Ollama endpoints: Docker proxy first, then direct localhost
const OLLAMA_ENDPOINTS = ['/api/ollama', 'http://localhost:11434'];

export const useAI = () => {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hi! I\'m ScreenStudio AI. Try: "trim first 5 seconds" or type "help" for all commands.' }
    ]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [apiKey, setApiKeyState] = useState(() => localStorage.getItem('ai_api_key') || '');
    const [apiEndpoint, setApiEndpointState] = useState(() => localStorage.getItem('ai_api_endpoint') || 'https://api.openai.com/v1/chat/completions');
    const [model, setModelState] = useState(() => localStorage.getItem('ai_model') || 'gpt-4o-mini');
    const [ollamaConnected, setOllamaConnected] = useState(false);
    const [ollamaModel, setOllamaModelState] = useState(() => localStorage.getItem('ollama_model') || '');
    const [ollamaModels, setOllamaModels] = useState([]);
    const [ollamaBase, setOllamaBase] = useState('');

    const setApiKey = useCallback((key) => { setApiKeyState(key); localStorage.setItem('ai_api_key', key); }, []);
    const setApiEndpoint = useCallback((url) => { setApiEndpointState(url); localStorage.setItem('ai_api_endpoint', url); }, []);
    const setModel = useCallback((m) => { setModelState(m); localStorage.setItem('ai_model', m); }, []);
    const setOllamaModel = useCallback((m) => { setOllamaModelState(m); localStorage.setItem('ollama_model', m); }, []);

    // Parse command locally (instant, no LLM needed)
    const parseLocal = useCallback((input) => {
        const text = input.trim();
        for (const { patterns, handler } of COMMAND_PATTERNS) {
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) return handler(match);
            }
        }
        return null;
    }, []);

    // Check Ollama connection (try proxy first, then direct)
    const checkOllama = useCallback(async () => {
        for (const base of OLLAMA_ENDPOINTS) {
            try {
                const res = await fetch(`${base}/tags`, { signal: AbortSignal.timeout(3000) });
                if (res.ok) {
                    const data = await res.json();
                    const models = data.models?.map(m => m.name) || [];
                    setOllamaModels(models);
                    setOllamaConnected(true);
                    setOllamaBase(base);
                    if (models.length > 0 && !ollamaModel) {
                        setOllamaModel(models[0]);
                    }
                    return true;
                }
            } catch {
                // Try next endpoint
            }
        }
        setOllamaConnected(false);
        return false;
    }, [ollamaModel, setOllamaModel]);

    // Call Ollama for complex commands
    const callOllama = useCallback(async (input, recentMessages) => {
        if (!ollamaConnected || !ollamaBase || !ollamaModel) return null;
        try {
            const ollamaMessages = recentMessages.map(m => ({ role: m.role, content: m.content }));
            ollamaMessages.push({ role: 'user', content: input });
            const res = await fetch(`${ollamaBase}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: ollamaModel,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        ...ollamaMessages.slice(-8)
                    ],
                    stream: false
                })
            });
            if (!res.ok) return null;
            const data = await res.json();
            const content = data.message?.content?.trim();
            if (!content) return null;
            try { return JSON.parse(content); }
            catch {
                const jsonMatch = content.match(/\{[^{}]*"action"[^{}]*\}/);
                if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch {} }
                return { action: 'chat', message: content };
            }
        } catch { return null; }
    }, [ollamaConnected, ollamaBase, ollamaModel]);

    // Call external LLM API (OpenAI compatible)
    const callLLM = useCallback(async (input, recentMessages) => {
        if (!apiKey) return null;
        try {
            const llmMessages = recentMessages.map(m => ({ role: m.role, content: m.content }));
            llmMessages.push({ role: 'user', content: input });
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...llmMessages.slice(-8)],
                    temperature: 0.1, max_tokens: 300
                })
            });
            if (!response.ok) return null;
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content?.trim();
            if (!content) return null;
            try { return JSON.parse(content); }
            catch {
                const jsonMatch = content.match(/\{[^{}]*"action"[^{}]*\}/);
                if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch {} }
                return { action: 'chat', message: content };
            }
        } catch { return null; }
    }, [apiKey, apiEndpoint, model]);

    const sendMessage = useCallback(async (input) => {
        if (!input.trim()) return null;
        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setIsProcessing(true);
        try {
            const recentMessages = messages.slice(-6);
            // 1. Local pattern matching (instant)
            let command = parseLocal(input);
            // 2. Ollama (local, free)
            if (!command) command = await callOllama(input, recentMessages);
            // 3. External API (requires key)
            if (!command && apiKey) command = await callLLM(input, recentMessages);
            // 4. Fallback
            if (!command) {
                const hint = !ollamaConnected && !apiKey ? ' For complex edits, start Ollama or add an API key in settings.' : '';
                command = { action: 'chat', message: `I couldn't parse that.${hint} Type "help" for available commands.` };
            }
            if (command.action === 'help') {
                setMessages(prev => [...prev, { role: 'assistant', content: HELP_MESSAGE }]);
                setIsProcessing(false);
                return command;
            }
            const responseMap = {
                trim: `Trimming from ${command.start}s to ${command.end}s...`,
                trim_end: `Trimming last ${command.seconds} seconds...`,
                zoom: `Adding ${command.level}x zoom at ${command.time}s for ${command.duration}s...`,
                title: `Adding title: "${command.text}" for ${command.duration}s...`,
                export_gif: 'Preparing GIF export...', transcribe: 'Starting transcription...',
                set_quality: `Setting quality to ${command.quality}...`,
                set_format: `Setting format to ${command.format}...`,
                cursor_fx: `Cursor effects ${command.enabled ? 'enabled' : 'disabled'}.`,
                annotate: `Switched to ${command.tool} tool.`,
                start_recording: 'Starting recording...', stop_recording: 'Stopping recording...',
                pause_recording: 'Pausing recording...', resume_recording: 'Resuming recording...',
                description: 'Generating YouTube description...', thumbnail: `Extracting thumbnail at ${command.time}s...`,
            };
            const responseText = responseMap[command.action] || command.message || `Command: ${command.action}`;
            setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
            return command;
        } finally { setIsProcessing(false); }
    }, [messages, parseLocal, callOllama, callLLM, apiKey, ollamaConnected]);

    const clearMessages = useCallback(() => {
        setMessages([{ role: 'assistant', content: 'Chat cleared. How can I help?' }]);
    }, []);

    return {
        messages, isProcessing, sendMessage, clearMessages,
        apiKey, setApiKey, apiEndpoint, setApiEndpoint, model, setModel,
        ollamaConnected, ollamaModel, setOllamaModel, ollamaModels, checkOllama,
    };
};
