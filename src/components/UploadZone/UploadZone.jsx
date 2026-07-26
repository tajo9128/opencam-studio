import React, { useState, useRef, useCallback } from 'react';
import './UploadZone.css';

export default function UploadZone({ onClipUploaded }) {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef(null);

    const uploadFile = useCallback(async (file) => {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            if (res.ok) {
                const result = await res.json();
                onClipUploaded(result);
            } else {
                const err = await res.json().catch(() => ({}));
                console.error('Upload failed:', err.error || res.statusText);
            }
        } catch (e) {
            console.error('Upload failed:', e.message);
        }
        setUploading(false);
    }, [onClipUploaded]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files).filter(f =>
            f.type.startsWith('video/')
        );
        for (const file of files) uploadFile(file);
    }, [uploadFile]);

    return (
        <div
            className={`upload-zone ${dragging ? 'uz-dragging' : ''} ${uploading ? 'uz-uploading' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
        >
            <input
                ref={inputRef}
                type="file"
                accept="video/*"
                multiple
                hidden
                onChange={e => {
                    for (const f of e.target.files) uploadFile(f);
                    e.target.value = '';
                }}
            />
            {uploading ? (
                <div className="uz-progress">
                    <div className="uz-spinner" />
                    <span>Processing video on server...</span>
                </div>
            ) : (
                <div className="uz-prompt">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <p>Drop video files here or click to browse</p>
                    <small>Uploaded to Docker backend — proxy generated automatically</small>
                </div>
            )}
        </div>
    );
}
