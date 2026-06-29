import { useState, useRef, useCallback, useEffect } from 'react';

export const useLiveChat = () => {
    const [messages, setMessages] = useState([]);
    const [connected, setConnected] = useState(false);
    const [platform, setPlatform] = useState(null);
    const intervalRef = useRef(null);
    const channelIdRef = useRef(null);

    const pollYouTubeChat = useCallback(async (channelId) => {
        try {
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet&liveChatId=${channelId}&key=YOUR_API_KEY`
            );
            if (!response.ok) return;
            const data = await response.json();
            if (data.items) {
                const newMessages = data.items.map(item => ({
                    id: item.id,
                    author: item.snippet.authorChannelId?.value || 'Unknown',
                    authorName: item.snippet.displayName || 'Viewer',
                    text: item.snippet.textMessageDetails?.messageText || '',
                    timestamp: new Date(item.snippet.publishedAt),
                    platform: 'youtube',
                    color: item.snippet.authorChannelId?.value ? '#ff0000' : '#94a3b8',
                }));
                setMessages(prev => {
                    const existing = new Set(prev.map(m => m.id));
                    return [...prev, ...newMessages.filter(m => !existing.has(m.id))].slice(-100);
                });
            }
        } catch {
            // Silently fail
        }
    }, []);

    const connectTwitch = useCallback((channelName, oauthToken) => {
        const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

        ws.onopen = () => {
            ws.send(`PASS oauth:${oauthToken || 'oauth:anonymous'}`);
                ws.send(`NICK opencamstudio`);
            ws.send(`JOIN #${channelName.toLowerCase()}`);
            setConnected(true);
            setPlatform('twitch');
        };

        ws.onmessage = (event) => {
            const lines = event.data.split('\r\n');
            for (const line of lines) {
                if (line.startsWith(':')) {
                    const match = line.match(/^:(\w+)!.*PRIVMSG #\w+ :(.+)$/);
                    if (match) {
                        setMessages(prev => [...prev, {
                            id: `${Date.now()}_${Math.random()}`,
                            author: match[1],
                            text: match[2],
                            timestamp: new Date(),
                            platform: 'twitch',
                            color: '#9146ff',
                        }].slice(-100));
                    }
                }
            }
        };

        ws.onerror = () => setConnected(false);
        ws.onclose = () => setConnected(false);

        return ws;
    }, []);

    const connect = useCallback((plat, channelId) => {
        disconnect();
        channelIdRef.current = channelId;

        if (plat === 'youtube') {
            setPlatform('youtube');
            setConnected(true);
            intervalRef.current = setInterval(() => {
                if (channelIdRef.current) pollYouTubeChat(channelIdRef.current);
            }, 3000);
        } else if (plat === 'twitch') {
            return connectTwitch(channelId);
        }
    }, [pollYouTubeChat, connectTwitch]);

    const disconnect = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setConnected(false);
        setPlatform(null);
        channelIdRef.current = null;
    }, []);

    const addManualMessage = useCallback((text, author = 'Host') => {
        setMessages(prev => [...prev, {
            id: `manual_${Date.now()}`,
            author,
            text,
            timestamp: new Date(),
            platform: 'manual',
            color: '#8b5cf6',
            isManual: true,
        }].slice(-100));
    }, []);

    const clearMessages = useCallback(() => setMessages([]), []);

    useEffect(() => () => disconnect(), [disconnect]);

    return {
        messages,
        connected,
        platform,
        connect,
        disconnect,
        addManualMessage,
        clearMessages,
    };
};
