import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ClipContextMenu } from './ClipContextMenu';
import './Timeline.css';

const TRACK_HEIGHT = 48;
const TIME_SCALE_BASE = 80; // pixels per second at zoom=1

export const Timeline = ({
    clips, tracks, currentTime, duration, selectedClipId, isPlaying, zoom,
    onSelectClip, onSeek, onSplit, onDelete, onMove, onResize, onPlay, onPause, onStop, onZoomChange,
    onDuplicate, onSpeed, onAddTrack, onRemoveTrack, onToggleMute, onToggleLock,
    clipThumbnails = {},
}) => {
    const containerRef = useRef(null);
    const scrollRef = useRef(null);
    const [dragging, setDragging] = useState(null);
    const [playheadDragging, setPlayheadDragging] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const [speedSlider, setSpeedSlider] = useState(null); // { clipId, x, y }
    const timeScale = TIME_SCALE_BASE * zoom;
    const totalWidth = Math.max(duration * timeScale + 200, 800);

    const timeToX = useCallback((t) => t * timeScale, [timeScale]);
    const xToTime = useCallback((x) => x / timeScale, [timeScale]);

    // Close context menu on click elsewhere
    useEffect(() => {
        const close = () => { setContextMenu(null); setSpeedSlider(null); };
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    const handleTimelineClick = useCallback((e) => {
        if (playheadDragging || dragging) return;
        if (contextMenu) { setContextMenu(null); return; }
        const rect = scrollRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
        const y = e.clientY - rect.top;
        const trackIndex = Math.floor(y / TRACK_HEIGHT);
        const time = xToTime(x);

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
    }, [clips, dragging, playheadDragging, xToTime, onSelectClip, onSeek, contextMenu]);

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

    const handleClipContextMenu = useCallback((e, clip) => {
        e.preventDefault();
        e.stopPropagation();
        onSelectClip(clip.id);
        setContextMenu({ x: e.clientX, y: e.clientY, clip });
    }, [onSelectClip]);

    useEffect(() => {
        if (!dragging) return;

        const handleMouseMove = (e) => {
            const dx = e.clientX - dragging.startX;
            const dt = dx / timeScale;

            if (dragging.type === 'move') {
                const newStart = Math.max(0, dragging.origStart + dt);
                const container = scrollRef.current;
                if (container) {
                    const rect = container.getBoundingClientRect();
                    const y = e.clientY - rect.top + container.scrollTop;
                    const newTrack = Math.max(0, Math.min(tracks.length - 1, Math.floor(y / TRACK_HEIGHT)));
                    onMove(dragging.clipId, newStart, newTrack);
                }
            } else if (dragging.type === 'resize-left') {
                const newDuration = Math.max(0.1, dragging.origDuration - dt);
                onResize(dragging.clipId, newDuration, true);
            } else if (dragging.type === 'resize-right') {
                const newDuration = Math.max(0.1, dragging.origDuration + dt);
                onResize(dragging.clipId, newDuration, false);
            }
        };

        const handleMouseUp = () => { setDragging(null); };

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
            if (e.code === 'Delete' || e.code === 'Backspace') { if (selectedClipId) { e.preventDefault(); onDelete(selectedClipId); } }
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
                onContextMenu={(e) => handleClipContextMenu(e, clip)}
                onDoubleClick={() => setSpeedSlider({ clipId: clip.id, x: x, y: clip.trackIndex * TRACK_HEIGHT })}
            >
                <div className="tl-clip-handle tl-clip-handle-left"
                    onMouseDown={(e) => handleClipMouseDown(e, clip, 'left')} />
                <div className="tl-clip-content">
                    <span className="tl-clip-label">{clip.label || clip.type}</span>
                    {(clip.speed ?? 1) !== 1 && <span className="tl-clip-speed">{clip.speed}x</span>}
                    <span className="tl-clip-duration">{formatTime(clip.duration)}</span>
                </div>
                {clip.type === 'audio' && (
                    <div className="tl-clip-waveform" style={{ position: 'absolute', left: 8, right: 8, bottom: 6, height: 16, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                        {Array.from({ length: 40 }).map((_, i) => (
                            <div key={i} style={{ flex: 1, height: `${10 + Math.random() * 70}%`, background: '#10b981', borderRadius: '1px', opacity: 0.6 }} />
                        ))}
                    </div>
                )}
                {clipThumbnails[clip.id] && (
                    <div className="tl-clip-thumb" style={{ backgroundImage: `url(${clipThumbnails[clip.id]})` }} />
                )}
                    {(clip.filters?.length > 0) && (
                        <div className="tl-clip-filters">
                            {clip.filters.map((f, i) => (
                                <span key={i} className="tl-filter-dot" title={f.filterId} />
                            ))}
                        </div>
                    )}
                {clip.keyframes && Object.keys(clip.keyframes).length > 0 && (
                    <div className="tl-clip-keyframes">
                        {Object.values(clip.keyframes).flat().map((kf, i) => (
                            <div key={i} className="tl-keyframe-dot" style={{ left: `${((kf.time / clip.duration) * 100)}%` }} />
                        ))}
                    </div>
                )}
                <div className="tl-clip-handle tl-clip-handle-right"
                    onMouseDown={(e) => handleClipMouseDown(e, clip, 'right')} />
            </div>
        );
    };

    return (
        <div className="timeline-container" ref={containerRef} onWheel={handleWheel}>
            <div className="tl-content-row">
            {/* Track headers */}
            <div className="tl-track-headers">
                {tracks.map((track, _i) => (
                    <div key={track.id} className="tl-track-header" style={{ height: TRACK_HEIGHT }}>
                        <span className="tl-track-name">{track.name}</span>
                        <div className="tl-track-controls">
                            <button className={`tl-btn ${track.muted ? 'tl-btn-muted' : ''}`}
                                onClick={() => onToggleMute?.(track.id)} title="Mute"
                                aria-pressed={!!track.muted} aria-label={`Mute track ${track.id}`}>M</button>
                            <button className={`tl-btn ${track.locked ? 'tl-btn-locked' : ''}`}
                                onClick={() => onToggleLock?.(track.id)} title="Lock"
                                aria-pressed={!!track.locked} aria-label={`Lock track ${track.id}`}>L</button>
                            {tracks.length > 1 && (
                                <button className="tl-btn tl-btn-remove" onClick={() => onRemoveTrack?.(track.id)} title="Remove Track">-</button>
                            )}
                        </div>
                    </div>
                ))}
                <div className="tl-add-track" onClick={() => onAddTrack?.()}>
                    <span>+ Track</span>
                </div>
            </div>

            {/* Timeline body */}
            <div className="tl-scroll" ref={scrollRef} onClick={handleTimelineClick}>
                <div className="tl-ruler" style={{ width: totalWidth }}>
                    {renderTimeMarkers()}
                </div>
                <div className="tl-tracks" style={{ width: totalWidth }}>
                    {tracks.map((track, _i) => (
                        <div key={track.id} className="tl-track-lane" style={{ height: TRACK_HEIGHT }} />
                    ))}
                </div>
                <div className="tl-clips" style={{ width: totalWidth }}>
                    {clips.map(renderClip)}
                </div>
                <div className="tl-playhead" style={{ left: timeToX(currentTime) }}
                    onMouseDown={handlePlayheadMouseDown}>
                    <div className="tl-playhead-head" />
                    <div className="tl-playhead-line" />
                </div>
            </div>
            </div>

            {/* Speed slider popup */}
            {speedSlider && (() => {
                const clip = clips.find(c => c.id === speedSlider.clipId);
                if (!clip) return null;
                return (
                    <div className="tl-speed-popup" style={{ left: speedSlider.x, top: speedSlider.y + TRACK_HEIGHT }}
                        onClick={e => e.stopPropagation()}>
                        <label>Speed: {clip.speed}x</label>
                        <input type="range" min={0.25} max={4} step={0.25} value={clip.speed}
                            onChange={e => onSpeed?.(speedSlider.clipId, parseFloat(e.target.value))} />
                        <div className="tl-speed-presets">
                            {[0.5, 1, 1.5, 2].map(s => (
                                <button key={s} className={`tl-btn ${clip.speed === s ? 'active' : ''}`}
                                    onClick={() => onSpeed?.(speedSlider.clipId, s)}>{s}x</button>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* Context menu */}
            {contextMenu && (
                <ClipContextMenu
                    x={contextMenu.x} y={contextMenu.y} clip={contextMenu.clip}
                    onClose={() => setContextMenu(null)}
                    onSplit={onSplit} onDelete={onDelete}
                    onDuplicate={() => onDuplicate?.(contextMenu.clip.id)}
                    onSpeed={(speed) => onSpeed?.(contextMenu.clip.id, speed)}
                    onFilters={() => {}} onKeyframes={() => {}}
                />
            )}

            {/* Transport controls */}
            <div className="tl-transport" role="toolbar" aria-label="Timeline transport controls">
                <button className="tl-transport-btn" onClick={onStop} title="Stop" aria-label="Stop playback">Stop</button>
                <button className="tl-transport-btn tl-transport-play" onClick={isPlaying ? onPause : onPlay} aria-label={isPlaying ? 'Pause playback' : 'Play'}>
                    {isPlaying ? 'Pause' : 'Play'}
                </button>
                <span className="tl-transport-time" aria-label={`Current time: ${formatTime(currentTime)}`}>{formatTime(currentTime)}</span>
                <span className="tl-transport-divider">/</span>
                <span className="tl-transport-time tl-transport-duration" aria-label={`Duration: ${formatTime(duration)}`}>{formatTime(duration)}</span>
                <div className="tl-transport-spacer" />
                <button className="tl-transport-btn" onClick={onSplit} disabled={!selectedClipId} title="Split (S)" aria-label="Split clip at playhead">Split</button>
                <button className="tl-transport-btn" onClick={() => onDelete(selectedClipId)} disabled={!selectedClipId} title="Delete (Del)" aria-label="Delete selected clip">Delete</button>
                <div className="tl-transport-spacer" />
                <button className="tl-transport-btn" onClick={() => onZoomChange(z => Math.max(0.1, z * 0.8))} title="Zoom Out" aria-label="Zoom timeline out">-</button>
                <span className="tl-zoom-label">{Math.round(zoom * 100)}%</span>
                <button className="tl-transport-btn" onClick={() => onZoomChange(z => Math.min(10, z * 1.25))} title="Zoom In" aria-label="Zoom timeline in">+</button>
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
