import { useState, useCallback, useRef } from 'react';

// Google Identity Services + YouTube Data API v3
// Works in any browser — no Electron needed
// User provides their own Google Cloud OAuth Client ID

const YOUTUBE_UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const YOUTUBE_CHANNEL_URL = 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';

const TOKEN_MAX_AGE_MS = 50 * 60 * 1000; // 50 minutes (Google tokens expire ~60 min)
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk

export const useYouTube = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [channelName, setChannelName] = useState('');
    const [clientId, setClientIdState] = useState(() => localStorage.getItem('yt_client_id') || '');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const tokenRef = useRef(null);
    const tokenExpiryRef = useRef(null);
    const tokenClientRef = useRef(null);

    const setClientId = useCallback((id) => {
        setClientIdState(id);
        localStorage.setItem('yt_client_id', id);
    }, []);

    const loadGis = useCallback(() => {
        return new Promise((resolve, reject) => {
            if (window.google?.accounts?.oauth2) { resolve(); return; }
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
            document.head.appendChild(script);
        });
    }, []);

    const authenticate = useCallback(async () => {
        if (!clientId) return false;
        try {
            await loadGis();
        } catch {
            return false;
        }

        return new Promise((resolve) => {
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: SCOPES,
                callback: async (tokenResponse) => {
                    if (tokenResponse.error) {
                        resolve(false);
                        return;
                    }
                    tokenRef.current = tokenResponse.access_token;
                    tokenExpiryRef.current = Date.now();
                    tokenClientRef.current = tokenClient;
                    setIsAuthenticated(true);

                    try {
                        const res = await fetch(YOUTUBE_CHANNEL_URL, {
                            headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                        });
                        const data = await res.json();
                        if (data.items?.[0]?.snippet?.title) {
                            setChannelName(data.items[0].snippet.title);
                        }
                    } catch { /* silent */ }
                    resolve(true);
                },
            });
            tokenClient.requestAccessToken();
        });
    }, [clientId, loadGis]);

    const disconnect = useCallback(() => {
        if (tokenRef.current) {
            try { window.google?.accounts?.oauth2?.revoke(tokenRef.current); } catch { /* silent */ }
        }
        tokenRef.current = null;
        tokenExpiryRef.current = null;
        tokenClientRef.current = null;
        setIsAuthenticated(false);
        setChannelName('');
    }, []);

    const isTokenExpired = useCallback(() => {
        if (!tokenExpiryRef.current) return true;
        return Date.now() - tokenExpiryRef.current > TOKEN_MAX_AGE_MS;
    }, []);

    const refreshToken = useCallback(() => {
        return new Promise((resolve) => {
            if (!window.google?.accounts?.oauth2) {
                resolve(false);
                return;
            }
            const refreshClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: SCOPES,
                callback: (tokenResponse) => {
                    if (tokenResponse.error) {
                        resolve(false);
                        return;
                    }
                    tokenRef.current = tokenResponse.access_token;
                    tokenExpiryRef.current = Date.now();
                    // Update stored client reference for future refreshes
                    tokenClientRef.current = refreshClient;
                    resolve(true);
                },
            });
            // prompt:'' = silent refresh if user already consented
            refreshClient.requestAccessToken({ prompt: '' });
        });
    }, [clientId]);

    const uploadVideo = useCallback(async (blob, metadata) => {
        if (!tokenRef.current || !blob) return null;

        // Refresh token if expired before starting upload
        if (isTokenExpired()) {
            const refreshed = await refreshToken();
            if (!refreshed) {
                return { success: false, error: 'Token expired and refresh failed. Please reconnect.' };
            }
        }

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const videoMetadata = {
                snippet: {
                    title: metadata.title || 'OpenCam Studio Recording',
                    description: metadata.description || 'Recorded with OpenCam Studio',
                    tags: metadata.tags || ['screen recording', 'opencam-studio'],
                    categoryId: metadata.categoryId || '22',
                },
                status: {
                    privacyStatus: metadata.privacy || 'unlisted',
                },
            };

            // Step 1: Initiate resumable upload session
            const initRes = await fetch(YOUTUBE_UPLOAD_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${tokenRef.current}`,
                    'Content-Type': 'application/json',
                    'X-Upload-Content-Type': blob.type || 'video/webm',
                    'X-Upload-Content-Length': String(blob.size),
                },
                body: JSON.stringify(videoMetadata),
            });

            if (!initRes.ok) {
                const errBody = await initRes.text().catch(() => '');
                throw new Error(`Upload init failed: ${initRes.status} ${errBody}`);
            }

            const uploadUrl = initRes.headers.get('Location');
            if (!uploadUrl) throw new Error('No upload URL returned');

            // Step 2: Chunked upload with Content-Range headers
            const totalSize = blob.size;
            let offset = 0;
            let result = null;

            while (offset < totalSize) {
                const chunkEnd = Math.min(offset + CHUNK_SIZE, totalSize);
                const chunk = blob.slice(offset, chunkEnd);

                const headers = {
                    'Content-Type': blob.type || 'video/webm',
                    'Content-Range': `bytes ${offset}-${chunkEnd - 1}/${totalSize}`,
                };

                // Use fetch for chunk upload
                const chunkRes = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers,
                    body: chunk,
                });

                // YouTube returns 308 for incomplete uploads, 200/201 for complete
                if (chunkRes.status === 308) {
                    // Chunk accepted, continue
                    offset = chunkEnd;
                    setUploadProgress(Math.round((offset / totalSize) * 100));
                } else if (chunkRes.status >= 200 && chunkRes.status < 300) {
                    // Upload complete
                    result = await chunkRes.json();
                    setUploadProgress(100);
                    break;
                } else if (chunkRes.status === 401) {
                    // Token expired mid-upload, try refresh
                    const refreshed = await refreshToken();
                    if (!refreshed) {
                        throw new Error('Authentication lost during upload. Please reconnect.');
                    }
                    // Retry this chunk with new token (re-initiate session)
                    throw new Error('Token refreshed but upload session lost. Please retry.');
                } else {
                    const errBody = await chunkRes.text().catch(() => '');
                    throw new Error(`Chunk upload failed: ${chunkRes.status} ${errBody}`);
                }
            }

            if (!result) {
                throw new Error('Upload completed but no response received');
            }

            return { success: true, url: `https://youtube.com/watch?v=${result.id}`, videoId: result.id };
        } catch (err) {
            return { success: false, error: err.message };
        } finally {
            setIsUploading(false);
        }
    }, [isTokenExpired, refreshToken]);

    const generateMetadata = useCallback(async (ollamaChat, transcription) => {
        try {
            const systemPrompt = `You are a YouTube SEO expert. Generate a title, description, and tags for a screen recording video.
Respond ONLY with valid JSON in this format:
{"title": "...", "description": "...", "tags": ["tag1", "tag2"], "categoryId": "22"}

Rules:
- Title: max 100 chars, catchy, include keywords
- Description: 2-3 sentences, include keywords naturally
- Tags: 5-10 relevant tags
- categoryId: "22" for People & Blogs, "28" for Science & Technology, "27" for Education`;

            const userContent = transcription
                ? `This is a transcription of the recording:\n\n${transcription}\n\nGenerate YouTube metadata for this video.`
                : 'Generate YouTube metadata for a screen recording video. The user did not provide a transcription.';

            const response = await ollamaChat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ]);

            if (response?.message?.content) {
                const jsonMatch = response.message.content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            }
            return null;
        } catch {
            return null;
        }
    }, []);

    return {
        isAuthenticated, channelName,
        clientId, setClientId,
        authenticate, disconnect, refreshToken,
        uploadVideo, isUploading, uploadProgress,
        generateMetadata,
    };
};
