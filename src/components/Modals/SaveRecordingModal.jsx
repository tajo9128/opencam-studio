import React, { useState, useEffect } from 'react';

const SaveRecordingModal = ({ blob, mimeType, serverVideoUrl, serverProxyUrl, serverProcessing, onSave, onDiscard, onYouTube, onEditNow }) => {
    const getExtension = (mt) => {
        if (!mt) return '.webm';
        if (mt.includes('mp4')) return '.mp4';
        if (mt.includes('matroska') || mt.includes('mkv')) return '.mkv';
        return '.webm';
    };
    const extension = getExtension(mimeType);
    const getDefaultName = () => `recording-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}`;
    const [fileName, setFileName] = useState(getDefaultName);
    const hasServerUrl = !!serverVideoUrl;

    useEffect(() => {
        if (blob) setFileName(getDefaultName());
    }, [blob]);

    if (!blob && !serverProcessing) return null;

    const handleConfirm = () => {
        if (!fileName.trim()) return;
        const finalName = fileName.endsWith(extension) ? fileName : fileName + extension;
        if (hasServerUrl && onSave) {
            onSave(blob, finalName);
        } else if (onSave) {
            onSave(blob, finalName);
        }
    };

    const handleEditClick = () => {
        handleConfirm();
        if (hasServerUrl && onEditNow) {
            onEditNow(blob, mimeType, { videoUrl: serverVideoUrl, proxyUrl: serverProxyUrl });
        } else if (onEditNow) {
            onEditNow(blob, mimeType);
        }
    };

    const handleSaveAndEdit = async () => {
        if (!fileName.trim()) return;
        const finalName = fileName.endsWith(extension) ? fileName : fileName + extension;
        
        // Save to PC first
        try {
            if (blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = finalName;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Save failed:', err);
        }
        
        // Then go to editor
        if (hasServerUrl && onEditNow) {
            onEditNow(blob, mimeType, { videoUrl: serverVideoUrl, proxyUrl: serverProxyUrl });
        } else if (onEditNow) {
            onEditNow(blob, mimeType);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '450px', padding: '2.5rem' }}>
                {serverProcessing && !hasServerUrl ? (
                    <>
                        <h2 style={{ marginBottom: '1rem', fontSize: '1.75rem', fontWeight: 800 }}>Processing... 🔄</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.5' }}>
                            Server is converting your recording to MP4 and generating a proxy for editing.
                            This may take a few moments for large files.
                        </p>
                        <div className="processing-indicator" style={{
                            width: '100%', height: '8px', background: 'var(--glass)',
                            borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem'
                        }}>
                            <div style={{
                                width: '40%', height: '100%',
                                background: 'var(--primary)',
                                borderRadius: '4px',
                                animation: 'shimmer 1.5s ease-in-out infinite',
                            }} />
                        </div>
                    </>
                ) : (
                    <>
                        <h2 style={{ marginBottom: '1rem', fontSize: '1.75rem', fontWeight: 800 }}>Save Recording? 🎥</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.5' }}>
                            {hasServerUrl
                                ? 'Recording saved to server. Ready to edit or download.'
                                : 'Give it a name before we save it to your workspace.'}
                        </p>

                        <div className="input-group" style={{ marginBottom: '2.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                File Name
                            </label>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={fileName}
                                    onChange={(e) => setFileName(e.target.value)}
                                    placeholder="my-awesome-video"
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        padding: '1rem 1.25rem',
                                        background: 'var(--glass)',
                                        border: '1px solid var(--glass-border)',
                                        borderRadius: '14px',
                                        color: 'var(--text-main)',
                                        fontSize: '1rem',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                                />
                                <span style={{
                                    position: 'absolute',
                                    right: '1.25rem',
                                    color: 'var(--primary)',
                                    fontWeight: 700,
                                    pointerEvents: 'none',
                                    opacity: 0.8
                                }}>
                                    {extension}
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
                            {onEditNow && (
                                <button className="btn btn-primary"
                                    onClick={handleEditClick}
                                    style={{ width: '100%', padding: '1rem', justifyContent: 'center', background: 'var(--primary)', borderColor: 'var(--primary)' }}>
                                    ✂️ Edit Now
                                </button>
                            )}
                            {onEditNow && (
                                <button className="btn btn-primary"
                                    onClick={handleSaveAndEdit}
                                    disabled={!fileName.trim()}
                                    style={{ width: '100%', padding: '1rem', justifyContent: 'center', background: '#10b981', borderColor: '#10b981' }}>
                                    💾 Save & Edit
                                </button>
                            )}
                            <button className="btn btn-outline"
                                onClick={handleConfirm}
                                disabled={!fileName.trim()}
                                style={{ width: '100%', padding: '1rem', justifyContent: 'center' }}>
                                💾 Save Only
                            </button>
                        </div>
                    </>
                )}
                <div style={{ display: 'flex', gap: '1rem', width: '100%', marginTop: '0.75rem' }}>
                    <button className="btn btn-outline" onClick={onDiscard}
                        style={{ flex: 1, padding: '0.75rem', justifyContent: 'center' }}>
                        {serverProcessing && !hasServerUrl ? 'Cancel' : 'Discard'}
                    </button>
                    {!serverProcessing && onYouTube && (
                        <button className="btn btn-outline"
                            onClick={() => { handleConfirm(); onYouTube(); }}
                            style={{ flex: 1, padding: '0.75rem', justifyContent: 'center' }}>
                            📺 YouTube
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SaveRecordingModal;
