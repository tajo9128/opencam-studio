import React, { useState, useCallback, useEffect } from 'react';
import { YouTubeUploadModal } from '../Modals/YouTubeUploadModal';
import { useYouTube } from '../../hooks/useYouTube';
import { useAI } from '../../hooks/useAI';
import { recordingStore } from '../../utils/RecordingStore';
import './ExportMode.css';

const FORMATS = [
    { id: 'webm', label: 'WebM', desc: 'VP9 codec, best compression' },
    { id: 'mp4', label: 'MP4', desc: 'H.264, universal compatibility' },
    { id: 'mkv', label: 'MKV', desc: 'Matroska container' },
];

const QUALITIES = [
    { id: '720p', label: '720p', desc: 'HD — 1280x720' },
    { id: '1080p', label: '1080p', desc: 'Full HD — 1920x1080' },
    { id: '2K', label: '2K', desc: 'QHD — 2560x1440' },
];

const PRESETS = [
    { id: 'youtube', label: 'YouTube', format: 'webm', quality: '1080p', res: '1920x1080' },
    { id: 'instagram', label: 'Instagram', format: 'mp4', quality: '720p', res: '1080x1080' },
    { id: 'tiktok', label: 'TikTok', format: 'mp4', quality: '720p', res: '1080x1920' },
    { id: 'twitter', label: 'Twitter', format: 'mp4', quality: '720p', res: '1280x720' },
    { id: 'linkedin', label: 'LinkedIn', format: 'mp4', quality: '720p', res: '1920x1080' },
    { id: 'default', label: 'Custom', format: 'webm', quality: '1080p', res: '—' },
];

export const ExportMode = () => {
    const [format, setFormat] = useState('webm');
    const [quality, setQuality] = useState('1080p');
    const [showYouTube, setShowYouTube] = useState(false);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [recording, setRecording] = useState(recordingStore.get());
    const youtube = useYouTube();
    const ai = useAI();

    useEffect(() => {
        return recordingStore.subscribe(setRecording);
    }, []);

    const handleDownload = useCallback(() => {
        if (!recording?.blob) return;
        const ext = format === 'mp4' ? '.mp4' : format === 'mkv' ? '.mkv' : '.webm';
        const name = recording.name + ext;
        const a = document.createElement('a');
        a.href = recording.url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }, [recording, format]);

    const handleGenerateAIMetadata = useCallback(async () => {
        setIsGeneratingAI(true);
        try {
            const prompt = `Generate a YouTube title, description, and tags for a screen recording video.

Respond ONLY with valid JSON in this format:
{"title": "...", "description": "...", "tags": ["tag1", "tag2"], "categoryId": "22"}

Rules:
- Title: max 100 chars, catchy, include keywords
- Description: 2-3 sentences, include keywords naturally
- Tags: 5-10 relevant tags
- categoryId: "22" for People & Blogs, "28" for Science & Technology, "27" for Education`;

            const command = await ai.sendMessage(prompt);
            if (command) {
                // sendMessage returns { action: 'chat', message: fullContent } for chat responses
                const content = command.message || '';
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        return JSON.parse(jsonMatch[0]);
                    } catch { /* parse error */ }
                }
                // If command itself has the fields
                if (command.title || command.description) {
                    return command;
                }
            }
            return null;
        } catch {
            return null;
        } finally {
            setIsGeneratingAI(false);
        }
    }, [ai]);

    return (
        <div className="export-mode">
            <div className="export-mode-content">
                <div className="export-preview-section">
                    {recording?.url ? (
                        <video src={recording.url} controls className="export-preview-video" style={{ maxWidth: '100%', borderRadius: '12px' }} />
                    ) : (
                        <div className="export-preview-placeholder">
                            <div className="export-preview-icon">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3"/>
                                </svg>
                            </div>
                            <p>Record a video first, then come back here to export</p>
                        </div>
                    )}
                </div>

                <div className="export-settings-section">
                    <div className="export-settings-card glass-card">
                        <h3 className="export-card-title">Platform Preset</h3>
                        <div className="export-option-grid">
                            {PRESETS.map(p => (
                                <button key={p.id} className={`export-option-btn ${format === p.format && quality === p.quality ? 'active' : ''}`}
                                    onClick={() => { setFormat(p.format); setQuality(p.quality); }}>
                                    <span className="export-option-label">{p.label}</span>
                                    <span className="export-option-desc">{p.res} · {p.quality}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="export-settings-card glass-card">
                        <h3 className="export-card-title">Export Settings</h3>

                        <div className="export-field">
                            <label className="export-label">Format</label>
                            <div className="export-option-grid">
                                {FORMATS.map(f => (
                                    <button
                                        key={f.id}
                                        className={`export-option-btn ${format === f.id ? 'active' : ''}`}
                                        onClick={() => setFormat(f.id)}
                                    >
                                        <span className="export-option-label">{f.label}</span>
                                        <span className="export-option-desc">{f.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="export-field">
                            <label className="export-label">Quality</label>
                            <div className="export-option-grid">
                                {QUALITIES.map(q => (
                                    <button
                                        key={q.id}
                                        className={`export-option-btn ${quality === q.id ? 'active' : ''}`}
                                        onClick={() => setQuality(q.id)}
                                    >
                                        <span className="export-option-label">{q.label}</span>
                                        <span className="export-option-desc">{q.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="export-actions">
                            <button className="btn btn-primary export-btn" onClick={handleDownload} disabled={!recording?.blob}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                                Download
                            </button>
                            <button className="btn btn-outline export-btn" onClick={() => setShowYouTube(true)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/>
                                    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>
                                </svg>
                                Upload to YouTube
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <YouTubeUploadModal
                isOpen={showYouTube}
                onClose={() => setShowYouTube(false)}
                onUpload={(metadata) => youtube.uploadVideo(recording?.blob, metadata)}
                isAuthenticated={youtube.isAuthenticated}
                channelName={youtube.channelName}
                clientId={youtube.clientId}
                onSetClientId={youtube.setClientId}
                onAuthenticate={youtube.authenticate}
                onDisconnect={youtube.disconnect}
                isUploading={youtube.isUploading}
                uploadProgress={youtube.uploadProgress}
                onGenerateAI={handleGenerateAIMetadata}
                isGeneratingAI={isGeneratingAI}
            />
        </div>
    );
};
