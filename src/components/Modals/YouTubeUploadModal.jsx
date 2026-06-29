import React, { useState, useCallback } from 'react';
import { LoadingSpinner } from '../LoadingSpinner';
import './YouTubeUploadModal.css';

const CATEGORIES = [
    { id: '22', name: 'People & Blogs' },
    { id: '28', name: 'Science & Technology' },
    { id: '27', name: 'Education' },
    { id: '24', name: 'Entertainment' },
    { id: '20', name: 'Gaming' },
    { id: '10', name: 'Music' },
    { id: '26', name: 'Howto & Style' },
];

const PRIVACY_OPTIONS = [
    { value: 'public', label: 'Public' },
    { value: 'unlisted', label: 'Unlisted' },
    { value: 'private', label: 'Private' },
];

export const YouTubeUploadModal = ({
    isOpen, onClose,
    onUpload,
    isAuthenticated, channelName,
    clientId, onSetClientId,
    onAuthenticate, onDisconnect,
    isUploading, uploadProgress,
    onGenerateAI, isGeneratingAI,
}) => {
    const [title, setTitle] = useState('OpenCam Studio Recording');
    const [description, setDescription] = useState('Recorded with OpenCam Studio - Free Screen Recorder');
    const [tags, setTags] = useState('screen recording, opencam-studio, tutorial');
    const [privacy, setPrivacy] = useState('unlisted');
    const [categoryId, setCategoryId] = useState('22');
    const [result, setResult] = useState(null);
    const [editClientId, setEditClientId] = useState('');

    const handleUpload = useCallback(async () => {
        const metadata = {
            title,
            description,
            tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            privacy,
            categoryId,
        };
        const res = await onUpload(metadata);
        if (res?.success) {
            setResult(res);
        }
    }, [title, description, tags, privacy, categoryId, onUpload]);

    const handleSaveClientId = useCallback(() => {
        if (editClientId.trim()) {
            onSetClientId(editClientId.trim());
            setEditClientId('');
        }
    }, [editClientId, onSetClientId]);

    const handleGenerateAI = useCallback(async () => {
        if (!onGenerateAI) return;
        const result = await onGenerateAI();
        if (result) {
            if (result.title) setTitle(result.title.slice(0, 100));
            if (result.description) setDescription(result.description);
            if (result.tags) setTags(Array.isArray(result.tags) ? result.tags.join(', ') : result.tags);
            if (result.categoryId) setCategoryId(result.categoryId);
        }
    }, [onGenerateAI]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Upload to YouTube">
            <div className="modal-content yt-modal" onClick={e => e.stopPropagation()}>
                <div className="yt-modal-header">
                    <h2>Upload to YouTube</h2>
                    <button className="btn-icon-bg" onClick={onClose}>x</button>
                </div>

                <div className="yt-modal-body">
                    {!clientId ? (
                        <div className="yt-auth-section">
                            <p>Enter your Google Cloud OAuth Client ID to enable YouTube upload.</p>
                            <p className="yt-auth-note">
                                Create one at console.cloud.google.com &gt; APIs &gt; Credentials &gt; OAuth 2.0 Client ID.
                                Add your app URL as an authorized JavaScript origin.
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
                                <input
                                    className="yt-input"
                                    placeholder="Client ID (xxx.apps.googleusercontent.com)"
                                    value={editClientId}
                                    onChange={e => setEditClientId(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSaveClientId()}
                                />
                                <button className="btn btn-primary" onClick={handleSaveClientId}>
                                    Save
                                </button>
                            </div>
                        </div>
                    ) : !isAuthenticated ? (
                        <div className="yt-auth-section">
                                <p>Connect your YouTube account to upload recordings directly from OpenCam Studio.</p>
                            <p className="yt-auth-note">
                                A popup will open for you to sign in to Google and authorize YouTube access.
                            </p>
                            <button className="btn btn-primary" onClick={onAuthenticate}>
                                Connect YouTube Account
                            </button>
                            <p className="yt-auth-note" style={{ marginTop: '0.75rem' }}>
                                Client ID: {clientId.slice(0, 20)}...
                                <button className="btn-link" onClick={() => onSetClientId('')}
                                    style={{ marginLeft: '0.5rem' }}>
                                    Change
                                </button>
                            </p>
                        </div>
                    ) : result ? (
                        <div className="yt-success-section">
                            <div className="yt-success-icon">Video uploaded successfully</div>
                            <a href={result.url} target="_blank" rel="noopener" className="yt-link">
                                {result.url}
                            </a>
                            <button className="btn btn-primary" onClick={() => { setResult(null); onClose(); }}>
                                Done
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="yt-channel-bar">
                                <span>Connected as <b>{channelName}</b></span>
                                <button className="btn-link" onClick={onDisconnect}>Disconnect</button>
                            </div>

                            <div className="yt-field">
                                <div className="yt-field-header">
                                    <label>Title</label>
                                    {onGenerateAI && (
                                        <button
                                            className="btn btn-outline yt-ai-btn"
                                            onClick={handleGenerateAI}
                                            disabled={isGeneratingAI}
                                        >
                                            {isGeneratingAI ? <LoadingSpinner text="Generating..." size="sm" /> : 'Generate with AI'}
                                        </button>
                                    )}
                                </div>
                                <input
                                    className="yt-input"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    maxLength={100}
                                />
                                <span className="yt-char-count">{title.length}/100</span>
                            </div>

                            <div className="yt-field">
                                <label>Description</label>
                                <textarea
                                    className="yt-textarea"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={4}
                                />
                            </div>

                            <div className="yt-field">
                                <label>Tags (comma separated)</label>
                                <input
                                    className="yt-input"
                                    value={tags}
                                    onChange={e => setTags(e.target.value)}
                                />
                            </div>

                            <div className="yt-row">
                                <div className="yt-field yt-field-half">
                                    <label>Privacy</label>
                                    <select
                                        className="yt-select"
                                        value={privacy}
                                        onChange={e => setPrivacy(e.target.value)}
                                    >
                                        {PRIVACY_OPTIONS.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="yt-field yt-field-half">
                                    <label>Category</label>
                                    <select
                                        className="yt-select"
                                        value={categoryId}
                                        onChange={e => setCategoryId(e.target.value)}
                                    >
                                        {CATEGORIES.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {isUploading && (
                                <div className="yt-progress">
                                    <div className="yt-progress-bar">
                                        <div className="yt-progress-fill" style={{ width: `${uploadProgress}%` }} />
                                    </div>
                                    <span>{uploadProgress}%</span>
                                </div>
                            )}

                            <div className="yt-actions">
                                <button className="btn btn-outline" onClick={onClose}>Cancel</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleUpload}
                                    disabled={isUploading || !title.trim()}
                                >
                                    {isUploading ? <LoadingSpinner text="Uploading..." size="sm" /> : 'Upload'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
