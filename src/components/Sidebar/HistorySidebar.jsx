import React, { useEffect } from 'react';

export const HistorySidebar = ({
    isHistoryOpen,
    setIsHistoryOpen,
    directoryHandle,
    isHandleAuthorized,
    connectFolder,
    resumeSync,
    libraryFiles,
    thumbnailMap,
    getThumbnailUrl,
    highlightedFile,
    playVideo,
    editingFileName,
    newName,
    setNewName,
    handleRename,
    setEditingFileName,
    startRename,
    deleteFile
}) => {
    useEffect(() => {
        if (!isHistoryOpen || !directoryHandle) return;
        libraryFiles.forEach(file => {
            if (!thumbnailMap[file.name]) {
                getThumbnailUrl(file.name, file.handle, directoryHandle);
            }
        });
    }, [isHistoryOpen, libraryFiles, thumbnailMap, directoryHandle, getThumbnailUrl]);

    return (
        <div className={`sidebar ${isHistoryOpen ? 'open' : ''}`}>
            {isHistoryOpen && (
                <>
                    <div className="sidebar-header">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Library</h3>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Files synced to disk</span>
                        </div>
                        <button className="btn-icon-bg" onClick={() => setIsHistoryOpen(false)}>x</button>
                    </div>

                    {!directoryHandle ? (
                        <div className="empty-state">
                            <span style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block' }}>&#128193;</span>
                            <p>Connect a folder to track your recordings on this PC.</p>
                            <button className="btn btn-primary" onClick={connectFolder} style={{ marginTop: '1.5rem', width: '100%' }}>
                                Select Workspace Folder
                            </button>
                        </div>
                    ) : !isHandleAuthorized ? (
                        <div className="empty-state">
                            <span style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block' }}>&#128274;</span>
                            <p>Connection lost after refresh.</p>
                            <button className="btn btn-primary" onClick={resumeSync} style={{ marginTop: '1.5rem', width: '100%' }}>
                                Resume Sync with {directoryHandle.name}
                            </button>
                            <button onClick={connectFolder} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', marginTop: '1rem' }}>Pick another folder</button>
                        </div>
                    ) : (
                        <div className="sidebar-content">
                            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Connected to: {directoryHandle.name}</span>
                                <button onClick={connectFolder} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.7rem' }}>Change</button>
                            </div>

                            {libraryFiles.length === 0 ? (
                                <div className="empty-state">No recordings found in this folder.</div>
                            ) : (
                                libraryFiles.map(file => (
                                    <div key={file.name}
                                        className={`video-card ${highlightedFile === file.name ? 'highlight-success' : ''}`}
                                        onClick={() => playVideo(file.handle)}>
                                        <div className="video-thumb" style={{ background: '#000' }}>
                                            {thumbnailMap[file.name] ? (
                                                <img src={thumbnailMap[file.name]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                            ) : (
                                                <span style={{ fontSize: '1.5rem', color: '#fff' }}>&#9654;</span>
                                            )}
                                        </div>
                                        <div className="video-info">
                                            {editingFileName === file.name ? (
                                                <div onClick={e => e.stopPropagation()}>
                                                    <input
                                                        autoFocus
                                                        className="rename-input"
                                                        value={newName}
                                                        onChange={e => setNewName(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && handleRename(e, file.handle)}
                                                    />
                                                    <div className="rename-actions">
                                                        <button className="btn-small active" onClick={e => handleRename(e, file.handle)}>Save</button>
                                                        <button className="btn-small" onClick={() => setEditingFileName(null)}>Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="video-title-row">
                                                        <span className="video-title">{file.name}</span>
                                                        <div className="video-actions">
                                                            <button className="btn-rename" onClick={e => startRename(e, file)} title="Rename">&#9998;</button>
                                                            <button
                                                                className="btn-delete"
                                                                onClick={e => { e.stopPropagation(); deleteFile(file); }}
                                                                title="Delete Recording"
                                                            >&#128465;</button>
                                                        </div>
                                                    </div>
                                                    <span className="video-meta">{file.date} &bull; {file.size}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
