import React, { useState, useEffect, useRef } from 'react';
import './RenderDialog.css';

const PRESETS = {
    'mp4-1080p': { label: 'MP4 1080p', format: 'mp4', width: 1920, height: 1080, crf: 23, preset: 'medium' },
    'mp4-720p': { label: 'MP4 720p', format: 'mp4', width: 1280, height: 720, crf: 23, preset: 'medium' },
    'mp4-480p': { label: 'MP4 480p', format: 'mp4', width: 854, height: 480, crf: 28, preset: 'fast' },
    'webm-1080p': { label: 'WebM 1080p', format: 'webm', width: 1920, height: 1080, crf: 10, preset: 'medium' },
};

export default function RenderDialog({ projectId, onClose }) {
    const [preset, setPreset] = useState('mp4-1080p');
    const [status, setStatus] = useState('idle');
    const [jobId, setJobId] = useState(null);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const pollRef = useRef(null);

    const startRender = async () => {
        setStatus('queued');
        setProgress(0);
        const p = PRESETS[preset];
        try {
            const res = await fetch(`/api/projects/${projectId}/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p),
            });
            if (!res.ok) { setStatus('error'); setError('Failed to start render'); return; }
            const job = await res.json();
            setJobId(job.id);
            setStatus('queued');
        } catch (e) {
            setStatus('error');
            setError(e.message);
        }
    };

    useEffect(() => {
        if (!jobId) return;
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/jobs/${jobId}`);
                const job = await res.json();
                setStatus(job.status);
                setProgress(job.progress);
                if (job.status === 'done' || job.status === 'error') {
                    clearInterval(pollRef.current);
                    if (job.error) setError(job.error);
                }
            } catch { /* ignore poll errors */ }
        }, 1000);
        return () => clearInterval(pollRef.current);
    }, [jobId]);

    const download = () => {
        window.open(`/api/jobs/${jobId}/output`, '_blank');
    };

    return (
        <div className="rd-overlay" onClick={onClose}>
            <div className="rd-dialog" onClick={e => e.stopPropagation()}>
                <h2>Render Project</h2>

                <div className="rd-presets">
                    {Object.entries(PRESETS).map(([key, val]) => (
                        <label key={key} className={`rd-preset ${preset === key ? 'rd-selected' : ''}`}>
                            <input type="radio" name="preset" value={key}
                                checked={preset === key} onChange={() => setPreset(key)} />
                            <span className="rd-preset-label">{val.label}</span>
                            <span className="rd-preset-desc">{val.width}×{val.height}</span>
                        </label>
                    ))}
                </div>

                <div className="rd-status">
                    {status === 'idle' && (
                        <button className="btn btn-primary" onClick={startRender}>Start Render</button>
                    )}
                    {status === 'queued' && <div className="rd-status-text">Waiting in queue...</div>}
                    {status === 'rendering' && (
                        <div className="rd-progress">
                            <div className="rd-progress-bar">
                                <div className="rd-progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                            <div className="rd-progress-text">{progress}%</div>
                        </div>
                    )}
                    {status === 'done' && (
                        <div className="rd-done">
                            <div className="rd-status-text rd-success">Render complete!</div>
                            <button className="btn btn-primary" onClick={download}>Download</button>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="rd-error">
                            <div className="rd-status-text rd-error-text">Error: {error}</div>
                            <button className="btn btn-primary" onClick={startRender}>Retry</button>
                        </div>
                    )}
                    {status === 'cancelled' && (
                        <div className="rd-status-text">Cancelled</div>
                    )}
                </div>

                <button className="rd-close" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
