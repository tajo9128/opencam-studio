import React, { useState, useRef, useEffect, useCallback } from 'react';
import './ClipMonitor.css';

export const ClipMonitor = ({ clip, onInsert, onOverwrite, onClose }) => {
    const videoRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [inPoint, setInPoint] = useState(0);
    const [outPoint, setOutPoint] = useState(clip?.duration || 10);
    const [duration, setDuration] = useState(clip?.duration || 10);

    useEffect(() => {
        const vid = videoRef.current;
        if (!vid) return;
        const onMeta = () => { setDuration(vid.duration); setOutPoint(vid.duration); };
        const onTime = () => setCurrentTime(vid.currentTime);
        vid.addEventListener('loadedmetadata', onMeta);
        vid.addEventListener('timeupdate', onTime);
        return () => {
            vid.removeEventListener('loadedmetadata', onMeta);
            vid.removeEventListener('timeupdate', onTime);
        };
    }, []);

    const togglePlay = useCallback(() => {
        const vid = videoRef.current;
        if (!vid) return;
        if (playing) { vid.pause(); } else { vid.play(); }
        setPlaying(!playing);
    }, [playing]);

    const seek = useCallback((time) => {
        const vid = videoRef.current;
        if (vid) vid.currentTime = Math.max(0, Math.min(time, duration));
    }, [duration]);

    const markIn = useCallback(() => setInPoint(currentTime), [currentTime]);
    const markOut = useCallback(() => setOutPoint(currentTime), [currentTime]);

    const handleInsert = () => onInsert({ sourceStart: inPoint, sourceEnd: outPoint, duration: outPoint - inPoint });
    const handleOverwrite = () => onOverwrite({ sourceStart: inPoint, sourceEnd: outPoint, duration: outPoint - inPoint });

    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'i' || e.key === 'I') { e.preventDefault(); setInPoint(currentTime); }
            if (e.key === 'o' || e.key === 'O') { e.preventDefault(); setOutPoint(currentTime); }
            if (e.key === ' ') { e.preventDefault(); togglePlay(); }
            if (e.key === 'Escape') { onClose(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [currentTime, togglePlay, onClose]);

    if (!clip) return null;

    const fmt = (s) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${String(sec).padStart(2, '0')}`;
    };

    return (
        <div className="clip-monitor-overlay" onClick={onClose}>
            <div className="clip-monitor" onClick={e => e.stopPropagation()}>
                <div className="cm-header">
                    <span>{clip.name}</span>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="cm-viewer">
                    <video ref={videoRef} src={clip.url} />
                    <div className="cm-in-marker" style={{ left: `${(inPoint / duration) * 100}%` }} title="In Point" />
                    <div className="cm-out-marker" style={{ left: `${(outPoint / duration) * 100}%` }} title="Out Point" />
                </div>
                <div className="cm-scrub">
                    <input type="range" min={0} max={duration || 10} step={0.1} value={currentTime}
                        onChange={e => seek(parseFloat(e.target.value))} />
                    <div className="cm-range-labels">
                        <span>{fmt(inPoint)}</span>
                        <span>{fmt(outPoint)}</span>
                    </div>
                </div>
                <div className="cm-controls">
                    <button onClick={togglePlay}>{playing ? '⏸' : '▶'}</button>
                    <button onClick={() => seek(0)}>⏮</button>
                    <button onClick={markIn}>Mark In</button>
                    <span className="cm-btn-hint">I</span>
                    <button onClick={markOut}>Mark Out</button>
                    <span className="cm-btn-hint">O</span>
                    <span className="cm-time">{fmt(currentTime)} / {fmt(duration)}</span>
                </div>
                <div className="cm-actions">
                    <button onClick={handleInsert}>Insert to Timeline</button>
                    <button onClick={handleOverwrite}>Overwrite at Playhead</button>
                </div>
            </div>
        </div>
    );
};
