import { useState, useCallback, useRef } from 'react';
import { COMMAND_PATTERNS, SYSTEM_PROMPT, HELP_MESSAGE } from '../constants/aiPrompts';

// Ollama endpoints: Docker proxy first, then direct localhost
const OLLAMA_ENDPOINTS = ['/api/ollama', 'http://localhost:11434'];

export const useAI = () => {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hi! I\'m OpenCam Studio AI. Try: "trim first 5 seconds", "apply sepia filter", "set speed to 2x", or type "help" for all commands.' }
    ]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [apiKey, setApiKeyState] = useState(() => localStorage.getItem('ai_api_key') || '');
    const [apiEndpoint, setApiEndpointState] = useState(() => localStorage.getItem('ai_api_endpoint') || 'https://api.openai.com/v1/chat/completions');
    const [model, setModelState] = useState(() => localStorage.getItem('ai_model') || 'gpt-4o-mini');
    const [ollamaConnected, setOllamaConnected] = useState(false);
    const [ollamaModel, setOllamaModelState] = useState(() => localStorage.getItem('ollama_model') || '');
    const [ollamaModels, setOllamaModels] = useState([]);
    const [ollamaBase, setOllamaBase] = useState('');
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const streamAbortRef = useRef(null);

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
                const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
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

    // Stream from Ollama (real-time token output)
    const streamOllama = useCallback(async (input, recentMessages, onToken) => {
        if (!ollamaConnected || !ollamaBase || !ollamaModel) return null;
        try {
            const ollamaMessages = recentMessages.map(m => ({ role: m.role, content: m.content }));
            ollamaMessages.push({ role: 'user', content: input });
            const res = await fetch(`${ollamaBase}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: ollamaModel,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        ...ollamaMessages.slice(-8)
                    ],
                    stream: true
                })
            });
            if (!res.ok) return null;

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let lineBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                lineBuffer += decoder.decode(value, { stream: true });
                // Ollama streams JSON objects separated by newlines
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.message?.content) {
                            fullContent += data.message.content;
                            onToken?.(data.message.content);
                        }
                    } catch { /* partial JSON, will retry next chunk */ }
                }
            }
            // Process any remaining buffered line
            if (lineBuffer.trim()) {
                try {
                    const data = JSON.parse(lineBuffer);
                    if (data.message?.content) {
                        fullContent += data.message.content;
                        onToken?.(data.message.content);
                    }
                } catch { /* final partial, skip */ }
            }

            // Parse the accumulated content as a command
            if (!fullContent.trim()) return null;
            try { return JSON.parse(fullContent); }
            catch {
                const jsonMatch = fullContent.match(/\{"action"[\s\S]*\}/);
                if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch { /* json parse fallback */ } }
                return { action: 'chat', message: fullContent.trim() };
            }
        } catch { return null; }
    }, [ollamaConnected, ollamaBase, ollamaModel]);

    // Call Ollama for complex commands (non-streaming fallback)
    const callOllama = useCallback(async (input, recentMessages) => {
        if (!ollamaConnected || !ollamaBase || !ollamaModel) return null;
        try {
            const ollamaMessages = recentMessages.map(m => ({ role: m.role, content: m.content }));
            ollamaMessages.push({ role: 'user', content: input });
            const res = await fetch(`${ollamaBase}/api/chat`, {
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
                const jsonMatch = content.match(/\{"action"[\s\S]*\}/);
                if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch { /* json parse fallback */ } }
                return { action: 'chat', message: content };
            }
        } catch { return null; }
    }, [ollamaConnected, ollamaBase, ollamaModel]);

    // Call external LLM API (OpenAI compatible) with streaming
    const streamLLM = useCallback(async (input, recentMessages, onToken) => {
        if (!apiKey) return null;
        try {
            const llmMessages = recentMessages.map(m => ({ role: m.role, content: m.content }));
            llmMessages.push({ role: 'user', content: input });

            const controller = new AbortController();
            streamAbortRef.current = controller;

            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...llmMessages.slice(-8)],
                    temperature: 0.1, max_tokens: 500,
                    stream: true
                }),
                signal: controller.signal
            });
            if (!response.ok) return null;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let lineBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                lineBuffer += decoder.decode(value, { stream: true });
                // OpenAI SSE format: data: {...}\n\n
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ')) continue;
                    const json = trimmed.replace('data: ', '').trim();
                    if (json === '[DONE]') break;
                    try {
                        const data = JSON.parse(json);
                        const token = data.choices?.[0]?.delta?.content;
                        if (token) {
                            fullContent += token;
                            onToken?.(token);
                        }
                    } catch { /* skip */ }
                }
            }

            streamAbortRef.current = null;
            if (!fullContent.trim()) return null;
            try { return JSON.parse(fullContent); }
            catch {
                const jsonMatch = fullContent.match(/\{"action"[\s\S]*\}/);
                if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch { /* json parse fallback */ } }
                return { action: 'chat', message: fullContent.trim() };
            }
        } catch { return null; }
    }, [apiKey, apiEndpoint, model]);

    // Non-streaming LLM fallback
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
                    temperature: 0.1, max_tokens: 500
                })
            });
            if (!response.ok) return null;
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content?.trim();
            if (!content) return null;
            try { return JSON.parse(content); }
            catch {
                const jsonMatch = content.match(/\{"action"[\s\S]*\}/);
                if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch { /* json parse fallback */ } }
                return { action: 'chat', message: content };
            }
        } catch { return null; }
    }, [apiKey, apiEndpoint, model]);

    // Paid API fallback using opencam_studio_api_key / opencam_studio_api_provider
    const callPaidFallback = useCallback(async (input, recentMessages) => {
        const fallbackKey = localStorage.getItem('opencam_studio_api_key');
        const fallbackProvider = localStorage.getItem('opencam_studio_api_provider');
        if (!fallbackKey) return null;

        // Build endpoint from provider name
        const providerEndpoints = {
            openai: 'https://api.openai.com/v1/chat/completions',
            anthropic: 'https://api.anthropic.com/v1/messages',
            groq: 'https://api.groq.com/openai/v1/chat/completions',
            together: 'https://api.together.xyz/v1/chat/completions',
            openrouter: 'https://openrouter.ai/api/v1/chat/completions',
        };
        const provider = fallbackProvider || 'openai';
        const endpoint = providerEndpoints[provider] || providerEndpoints.openai;
        const isOpenAICompat = provider !== 'anthropic';

        try {
            const llmMessages = recentMessages.map(m => ({ role: m.role, content: m.content }));
            llmMessages.push({ role: 'user', content: input });

            const headers = { 'Content-Type': 'application/json' };
            const modelNames = {
                openai: 'gpt-4o-mini',
                anthropic: 'claude-3-5-haiku-20241022',
                groq: 'llama-3.3-70b-versatile',
                together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
                openrouter: 'meta-llama/llama-3.1-8b-instruct',
            };

            let body;
            if (isOpenAICompat) {
                headers['Authorization'] = `Bearer ${fallbackKey}`;
                body = JSON.stringify({
                    model: modelNames[provider] || 'gpt-4o-mini',
                    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...llmMessages.slice(-8)],
                    temperature: 0.1,
                    max_tokens: 500
                });
            } else {
                // Anthropic format
                headers['x-api-key'] = fallbackKey;
                headers['anthropic-version'] = '2023-06-01';
                const systemMsg = SYSTEM_PROMPT;
                const userMsgs = llmMessages.slice(-8);
                body = JSON.stringify({
                    model: modelNames[provider],
                    max_tokens: 500,
                    system: systemMsg,
                    messages: userMsgs
                });
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body
            });
            if (!response.ok) return null;
            const data = await response.json();

            let content;
            if (isOpenAICompat) {
                content = data.choices?.[0]?.message?.content?.trim();
            } else {
                // Anthropic response format
                content = data.content?.[0]?.text?.trim();
            }

            if (!content) return null;
            try { return JSON.parse(content); }
            catch {
                const jsonMatch = content.match(/\{"action"[\s\S]*\}/);
                if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch { /* json parse fallback */ } }
                return { action: 'chat', message: content };
            }
        } catch { return null; }
    }, []);

    const sendMessage = useCallback(async (input) => {
        if (!input.trim()) return null;
        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setIsProcessing(true);
        setIsStreaming(true);

        try {
            const recentMessages = messages.slice(-6);

            // 1. Local pattern matching (instant)
            let command = parseLocal(input);

            // 2. Streaming from Ollama or LLM (real-time tokens)
            if (!command) {
                const streamingMsg = { role: 'assistant', content: '' };
                setMessages(prev => [...prev, streamingMsg]);

                const onToken = (token) => {
                    setMessages(prev => {
                        const updated = [...prev];
                        const last = updated[updated.length - 1];
                        if (last?.role === 'assistant') {
                            updated[updated.length - 1] = { ...last, content: last.content + token };
                        }
                        return updated;
                    });
                };

                // Try streaming from Ollama first
                if (ollamaConnected) {
                    command = await streamOllama(input, recentMessages, onToken);
                }
                // Then try streaming from paid API
                if (!command && apiKey) {
                    command = await streamLLM(input, recentMessages, onToken);
                }
                // Fallback to non-streaming
                if (!command && ollamaConnected) {
                    command = await callOllama(input, recentMessages);
                }
                if (!command && apiKey) {
                    command = await callLLM(input, recentMessages);
                }
                // Last resort: paid API fallback via opencam_studio_api_key
                if (!command) {
                    command = await callPaidFallback(input, recentMessages);
                }

                // Remove the streaming placeholder if we got a structured command
                if (command && command.action !== 'chat') {
                    setMessages(prev => {
                        const last = prev[prev.length - 1];
                        // Only remove if last message is the empty streaming placeholder
                        if (last?.role === 'assistant' && !last.content) {
                            return prev.slice(0, -1);
                        }
                        return prev;
                    });
                }
            }

            // 3. Final fallback
            if (!command) {
                const hint = !ollamaConnected && !apiKey ? ' For complex edits, start Ollama or add an API key in Settings.' : '';
                command = { action: 'chat', message: `I couldn't parse that.${hint} Type "help" for available commands.` };
            }

            if (command.action === 'help') {
                setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: HELP_MESSAGE }]);
                setIsProcessing(false);
                setIsStreaming(false);
                return command;
            }

            if (command.action === 'chat') {
                // The streaming message already has the content
                setIsProcessing(false);
                setIsStreaming(false);
                return command;
            }

            // Non-chat commands get a response summary
            const responseMap = {
                trim: `Trimming from ${command.start}s to ${command.end}s...`,
                trim_end: `Trimming last ${command.seconds} seconds...`,
                split: 'Splitting clip at playhead...',
                set_speed: `Setting speed to ${command.speed}x...`,
                delete_clip: 'Deleting selected clip...',
                duplicate_clip: 'Duplicating clip...',
                zoom: `Adding ${command.level || 3}x zoom at ${command.time}s for ${command.duration}s...`,
                title: `Adding title: "${command.text}" for ${command.duration}s...`,
                add_text: `Adding text: "${command.text}"...`,
                apply_filter: `Applying ${command.filter} filter...`,
                remove_filter: `Removing ${command.filter} filter...`,
                remove_all_filters: 'Removing all filters...',
                set_transition: `Setting transition to ${command.type}...`,
                add_keyframe: `Adding keyframe at ${command.time}s...`,
                remove_keyframe: `Removing keyframe at ${command.time}s...`,
                switch_scene: `Switching to scene: ${command.scene}...`,
                add_scene: `Creating scene: ${command.name}...`,
                add_source: `Adding ${command.type} source: ${command.name}...`,
                export_gif: 'Preparing GIF export...',
                transcribe: 'Starting transcription...',
                add_subtitle: `Adding subtitle: "${command.text}"...`,
                set_quality: `Setting quality to ${command.quality}...`,
                set_format: `Setting format to ${command.format}...`,
                cursor_fx: `Cursor effects ${command.enabled ? 'enabled' : 'disabled'}.`,
                annotate: `Switched to ${command.tool} tool.`,
                set_volume: `Volume set to ${command.volume}%.`,
                mute: 'Audio muted.',
                unmute: 'Audio unmuted.',
                apply_audio_effect: `Applied ${command.effect} audio effect.`,
                remove_audio_effect: `Removed ${command.effect} audio effect.`,
                start_recording: 'Starting recording...',
                stop_recording: 'Stopping recording...',
                pause_recording: 'Pausing recording...',
                resume_recording: 'Resuming recording...',
                description: 'Generating YouTube description...',
                thumbnail: `Extracting thumbnail at ${command.time}s...`,
            };
            const responseText = responseMap[command.action] || command.message || `Command: ${command.action}`;

            // Add assistant response — don't slice user message
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.content) {
                    // Already has streaming content from a chat-like response, keep it
                    return prev;
                }
                return [...prev, { role: 'assistant', content: responseText }];
            });

            return command;
        } finally {
            setIsProcessing(false);
            setIsStreaming(false);
        }
    }, [messages, parseLocal, callOllama, callLLM, callPaidFallback, streamOllama, streamLLM, apiKey, ollamaConnected]);

    // Voice input via Web Speech API
    const startListening = useCallback(() => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Voice input not supported in this browser. Try Chrome or Edge.' }]);
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);

        recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            const transcript = result[0].transcript;
            if (result.isFinal) {
                setIsListening(false);
                sendMessage(transcript);
            }
        };

        recognition.onerror = (event) => {
            setIsListening(false);
            if (event.error !== 'no-speech') {
                setMessages(prev => [...prev, { role: 'assistant', content: `Voice error: ${event.error}` }]);
            }
        };

        recognition.onend = () => setIsListening(false);

        recognition.start();
        recognitionRef.current = recognition;
    }, [sendMessage]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
    }, []);

    // Stop streaming in progress
    const stopStreaming = useCallback(() => {
        if (streamAbortRef.current) {
            streamAbortRef.current.abort();
            streamAbortRef.current = null;
        }
        setIsStreaming(false);
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([{ role: 'assistant', content: 'Chat cleared. How can I help?' }]);
    }, []);

    return {
        messages, isProcessing, isStreaming,
        sendMessage, clearMessages, stopStreaming,
        apiKey, setApiKey, apiEndpoint, setApiEndpoint, model, setModel,
        ollamaConnected, ollamaModel, setOllamaModel, ollamaModels, checkOllama,
        voiceEnabled, setVoiceEnabled, isListening, startListening, stopListening,
    };
};
