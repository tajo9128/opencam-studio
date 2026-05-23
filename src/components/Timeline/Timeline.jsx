import React, { useRef, useEffect, useCallback, useState } from 'react';
import './Timeline.css';

const TRACK_HEIGHT = 56;
const TIME_SCALE_BASE = 80; // pixels per second at zoom=1

export const Timeline = ({
    clips, tracks, currentTime, duration, selectedClipId, isPlaying, zoom,
    onSelectClip, onSeek, onSplit, onDelete, onMove, onResize, onPlay, onPause, onStop, onZoomChange,
    clipThumbnails = {},
}) => {
    const containerRef = useRef(null);
    const scrollRef = useRef(null);
    const [dragging, setDragging] = useState(null); // { type: 'move'|'resize-left'|'resize-right', clipId, startX, origStart, origDuration }
    const [playheadDragging, setPlayheadDragging] = useState(false);
    const timeScale = TIME_SCALE_BASE * zoom;
    const totalWidth = Math.max(duration * timeScale + 200, 800);

    const timeToX = useCallback((t) => t * timeScale, [timeScale]);
    const xToTime = useCallback((x) => x / timeScale, [timeScale]);

    const handleTimelineClick = useCallback((e) => {
        if (playheadDragging || dragging) return;
        const rect = scrollRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
        const y = e.clientY - rect.top;
        const trackIndex = Math.floor(y / TRACK_HEIGHT);
        const time = xToTime(x);

        // Check if clicking a clip
        const clickedClip = clips.find(c => {
            if (c.trackIndex !== trackIndex) return false;
            return time >= c.startTime && time < c.startTime + c.duration;
        });

        if (clickedClip) {
            onSelectClip(clickedClip.id);
        } else {
            onSelectClip(null);
            onSeek(Math.max(0, time));
        }
    }, [clips, dragging, playheadDragging, xToTime, onSelectClip, onSeek]);

    const handleClipMouseDown = useCallback((e, clip, resizeSide) => {
        e.stopPropagation();
        onSelectClip(clip.id);

        if (resizeSide) {
            setDragging({
                type: resizeSide === 'left' ? 'resize-left' : 'resize-right',
                clipId: clip.id,
                startX: e.clientX,
                origStart: clip.startTime,
                origDuration: clip.duration,
            });
        } else {
            setDragging({
                type: 'move',
                clipId: clip.id,
                startX: e.clientX,
                origStart: clip.startTime,
                origTrackIndex: clip.trackIndex,
                origDuration: clip.duration,
            });
        }
    }, [onSelectClip]);

    useEffect(() => {
        if (!dragging) return;

        const handleMouseMove = (e) => {
            const dx = e.clientX - dragging.startX;
            const dt = dx / timeScale;

            if (dragging.type === 'move') {
                const newStart = Math.max(0, dragging.origStart + dt);
                // Calculate new track from Y position
                const container = scrollRef.current;
                if (container) {
                    const rect = container.getBoundingClientRect();
                    const y = e.clientY - rect.top + container.scrollTop;
                    const newTrack = Math.max(0, Math.min(tracks.length - 1, Math.floor(y / TRACK_HEIGHT)));
                    onMove(dragging.clipId, newStart, newTrack);
                }
            } else if (dragging.type === 'resize-left') {
                const newStart = Math.max(0, dragging.origStart + dt);
                const newDuration = Math.max(0.1, dragging.origDuration - dt);
                onMove(dragging.clipId, newStart);
                onResize(dragging.clipId, newDuration, false);
            } else if (dragging.type === 'resize-right') {
                const newDuration = Math.max(0.1, dragging.origDuration + dt);
                onResize(dragging.clipId, newDuration, false);
            }
        };

        const handleMouseUp = () => {
            setDragging(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, timeScale, tracks, onMove, onResize]);

    // Playhead drag
    const handlePlayheadMouseDown = useCallback((e) => {
        e.stopPropagation();
        setPlayheadDragging(true);
    }, []);

    useEffect(() => {
        if (!playheadDragging) return;
        const handleMouseMove = (e) => {
            const rect = scrollRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
            onSeek(Math.max(0, xToTime(x)));
        };
        const handleMouseUp = () => setPlayheadDragging(false);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [playheadDragging, xToTime, onSeek]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'KeyS' && selectedClipId) { e.preventDefault(); onSplit(); }
            if (e.code === 'Delete' || e.code === 'Backspace') { if (selectedClipId) { e.preventDefault(); onDelete(); } }
            if (e.code === 'Space') { e.preventDefault(); isPlaying ? onPause() : onPlay(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedClipId, isPlaying, onSplit, onDelete, onPlay, onPause]);

    // Scroll zoom
    const handleWheel = useCallback((e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            onZoomChange(z => Math.max(0.1, Math.min(10, z * delta)));
        }
    }, [onZoomChange]);

    // Render time markers
    const renderTimeMarkers = () => {
        const markers = [];
        const interval = zoom > 2 ? 1 : zoom > 0.5 ? 5 : 10;
        const subInterval = interval / (zoom > 2 ? 5 : zoom > 1 ? 2 : 1);
        const totalDuration = duration + 10;

        for (let t = 0; t < totalDuration; t += subInterval) {
            const x = timeToX(t);
            const isMajor = Math.abs(t % interval) < 0.001;
            markers.push(
                <div key={t} className={`tl-marker ${isMajor ? 'tl-marker-major' : 'tl-marker-minor'}`}
                    style={{ left: x }}>
                    {isMajor && <span className="tl-marker-label">{formatTime(t)}</span>}
                </div>
            );
        }
        return markers;
    };

    // Render a single clip
    const renderClip = (clip) => {
        const x = timeToX(clip.startTime);
        const w = timeToX(clip.duration);
        const isSelected = clip.id === selectedClipId;
        const track = tracks[clip.trackIndex];

        return (
            <div
                key={clip.id}
                className={`tl-clip ${isSelected ? 'tl-clip-selected' : ''} tl-clip-${clip.type}`}
                style={{
                    left: x,
                    width: Math.max(w, 8),
                    top: clip.trackIndex * TRACK_HEIGHT + 2,
                    height: TRACK_HEIGHT - 4,
                    backgroundColor: clip.color || 'var(--primary)',
                    opacity: track?.muted ? 0.4 : 1,
                }}
                onMouseDown={(e) => handleClipMouseDown(e, clip, null)}
            >
                {/* Left resize handle */}
                <div className="tl-clip-handle tl-clip-handle-left"
                    onMouseDown={(e) => handleClipMouseDown(e, clip, 'left')} />

                {/* Clip content */}
                <div className="tl-clip-content">
                    <span className="tl-clip-label">{clip.label || clip.type}</span>
                    <span className="tl-clip-duration">{formatTime(clip.duration)}</span>
                </div>

                {/* Thumbnail */}
                {clipThumbnails[clip.id] && (
                    <div className="tl-clip-thumb" style={{ backgroundImage: `url(${clipThumbnails[clip.id]})` }} />
                )}

                {/* Filter indicators */}
                {clip.filters.length > 0 && (
                    <div className="tl-clip-filters">
                        {clip.filters.map((f, i) => (
                            <span key={i} className="tl-filter-dot" title={f.type} />
                        ))}
                    </div>
                )}

                {/* Right resize handle */}
                <div className="tl-clip-handle tl-clip-handle-right"
                    onMouseDown={(e) => handleClipMouseDown(e, clip, 'right')} />
            </div>
        );
    };

    return (
        <div className="timeline-container" ref={containerRef} onWheel={handleWheel}>
            {/* Track headers */}
            <div className="tl-track-headers">
                {tracks.map((track, i) => (
                    <div key={track.id} className="tl-track-header" style={{ height: TRACK_HEIGHT }}>
                        <span className="tl-track-name">{track.name}</span>
                        <div className="tl-track-controls">
                            <button className={`tl-btn ${track.muted ? 'tl-btn-muted' : ''}`}
                                onClick={() => {}} title="Mute">M</button>
                            <button className={`tl-btn ${track.locked ? 'tl-btn-locked' : ''}`}
                                onClick={() => {}} title="Lock">L</button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Timeline body */}
            <div className="tl-scroll" ref={scrollRef} onClick={handleTimelineClick}>
                {/* Time ruler */}
                <div className="tl-ruler" style={{ width: totalWidth }}>
                    {renderTimeMarkers()}
                </div>

                {/* Track lanes */}
                <div className="tl-tracks" style={{ width: totalWidth }}>
                    {tracks.map((track, i) => (
                        <div key={track.id} className="tl-track-lane" style={{ height: TRACK_HEIGHT }} />
                    ))}
                </div>

                {/* Clips */}
                <div className="tl-clips" style={{ width: totalWidth }}>
                    {clips.map(renderClip)}
                </div>

                {/* Playhead */}
                <div className="tl-playhead" style={{ left: timeToX(currentTime) }}
                    onMouseDown={handlePlayheadMouseDown}>
                    <div className="tl-playhead-head" />
                    <div className="tl-playhead-line" />
                </div>
            </div>

            {/* Transport controls */}
            <div className="tl-transport">
                <button className="tl-transport-btn" onClick={onStop} title="Stop">Stop</button>
                <button className="tl-transport-btn tl-transport-play" onClick={isPlaying ? onPause : onPlay}>
                    {isPlaying ? 'Pause' : 'Play'}
                </button>
                <span className="tl-transport-time">{formatTime(currentTime)}</span>
                <span className="tl-transport-divider">/</span>
                <span className="tl-transport-time tl-transport-duration">{formatTime(duration)}</span>
                <div className="tl-transport-spacer" />
                <button className="tl-transport-btn" onClick={onSplit} disabled={!selectedClipId} title="Split (S)">Split</button>
                <button className="tl-transport-btn" onClick={onDelete} disabled={!selectedClipId} title="Delete (Del)">Delete</button>
                <div className="tl-transport-spacer" />
                <button className="tl-transport-btn" onClick={() => onZoomChange(z => Math.max(0.1, z * 0.8))} title="Zoom Out">-</button>
                <span className="tl-zoom-label">{Math.round(zoom * 100)}%</span>
                <button className="tl-transport-btn" onClick={() => onZoomChange(z => Math.min(10, z * 1.25))} title="Zoom In">+</button>
            </div>
        </div>
    );
};

function formatTime(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
