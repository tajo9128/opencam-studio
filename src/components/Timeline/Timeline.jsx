import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ClipContextMenu } from './ClipContextMenu';
import { Playhead } from './Playhead';
import { MarkerLayer } from './MarkerLayer';
import { KeyframeCanvas } from './KeyframeCanvas';
import { AudioEnvelope } from './AudioEnvelope';
import { ZoomPanTrack } from './ZoomPanTrack';
import { CursorTrack } from './CursorTrack';
import { AnnotationsTrack } from './AnnotationsTrack';
import { AnimationsTrack } from './AnimationsTrack';
import { useTimelineStore } from '../../store/timelineStore';
import { TransitionHandles } from './TransitionHandles';
import { EffectBadge } from './EffectBadge';
import { WaveformCanvas } from './WaveformCanvas';
import './Timeline.css';

const TRACK_HEIGHT = 80;
const TIME_SCALE_BASE = 80;
const SNAP_THRESHOLD_PX = 7;

export const Timeline = ({
    onDropExternal,
    clipThumbnails = {},
    onPlayPause,
    mode = 'simple',
    onNoiseReduction,
    noiseReductionEnabled,
}) => {
    const containerRef = useRef(null);
    const scrollRef = useRef(null);
    const [dragging, setDragging] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [speedSlider, setSpeedSlider] = useState(null);
    const [selectedKeyframeParam] = useState(null);
    const [snapGuide, setSnapGuide] = useState(null);
    const [marquee, setMarquee] = useState(null);
    const [selectedClipIds, setSelectedClipIds] = useState([]);

    const clips = useTimelineStore(s => s.clips);
    const tracks = useTimelineStore(s => s.tracks);
    const currentTime = useTimelineStore(s => s.currentTime);
    const duration = useTimelineStore(s => s.duration);
    const selectedClipId = useTimelineStore(s => s.selectedClipId);
    const isPlaying = useTimelineStore(s => s.isPlaying);
    const zoom = useTimelineStore(s => s.zoom);
    const markers = useTimelineStore(s => s.markers);
    const magneticMode = useTimelineStore(s => s.magneticMode);
    const zoomPanRegions = useTimelineStore(s => s.zoomPanRegions);
    const cursorEvents = useTimelineStore(s => s.cursorEvents);
    const annotations = useTimelineStore(s => s.annotations);
    const animations = useTimelineStore(s => s.animations);

    const timeScale = TIME_SCALE_BASE * zoom;
    const totalWidth = Math.max(duration * timeScale + 200, 800);

    // Snap system: collect snap points from other clips
    const getSnapPoints = useCallback((excludeClipId) => {
        const points = [0]; // Always snap to start
        clips.forEach(c => {
            if (c.id !== excludeClipId) {
                points.push(c.startTime);
                points.push(c.startTime + c.duration);
            }
        });
        markers.forEach(m => points.push(m.time));
        points.push(duration);
        return points.sort((a, b) => a - b);
    }, [clips, markers, duration]);

    // Snap resolution: find nearest snap point within threshold
    const resolveSnap = useCallback((time, snapPoints) => {
        const thresholdTime = SNAP_THRESHOLD_PX / timeScale;
        let best = null;
        let bestDist = Infinity;
        for (const sp of snapPoints) {
            const dist = Math.abs(time - sp);
            if (dist < thresholdTime && dist < bestDist) {
                best = sp;
                bestDist = dist;
            }
        }
        return best;
    }, [timeScale]);

    const timeToX = useCallback((t) => t * timeScale, [timeScale]);
    const xToTime = useCallback((x) => x / timeScale, [timeScale]);

    useEffect(() => {
        const close = () => { setContextMenu(null); setSpeedSlider(null); };
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    const handleTimelineClick = useCallback((e) => {
        if (dragging) return;
        if (contextMenu) { setContextMenu(null); return; }
        if (marquee) return; // Don't process click during marquee
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
            // Shift+click or Ctrl+click for multi-select
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                setSelectedClipIds(prev => {
                    if (prev.includes(clickedClip.id)) {
                        return prev.filter(id => id !== clickedClip.id);
                    }
                    return [...prev, clickedClip.id];
                });
            } else {
                setSelectedClipIds([clickedClip.id]);
            }
            useTimelineStore.getState().setSelectedClipId(clickedClip.id);
        } else {
            // Start marquee selection on empty space
            setSelectedClipIds([]);
            useTimelineStore.getState().setSelectedClipId(null);
            useTimelineStore.getState().setCurrentTime(Math.max(0, time));
            setMarquee({ startX: x, startY: y, endX: x, endY: y });
        }
    }, [clips, dragging, xToTime, marquee]);

    const handleClipMouseDown = useCallback((e, clip, resizeSide) => {
        e.stopPropagation();
        useTimelineStore.getState().setSelectedClipId(clip.id);

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
    }, []);

    const handleClipContextMenu = useCallback((e, clip) => {
        e.preventDefault();
        e.stopPropagation();
        useTimelineStore.getState().setSelectedClipId(clip.id);
        setContextMenu({ x: e.clientX, y: e.clientY, clip });
    }, []);

    // Marquee selection drag handler
    useEffect(() => {
        if (!marquee) return;

        const handleMouseMove = (e) => {
            const rect = scrollRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
            const y = e.clientY - rect.top;
            setMarquee(prev => prev ? { ...prev, endX: x, endY: y } : null);
        };

        const handleMouseUp = () => {
            // Find clips intersecting the marquee rectangle
            if (marquee) {
                const x1 = Math.min(marquee.startX, marquee.endX);
                const x2 = Math.max(marquee.startX, marquee.endX);
                const y1 = Math.min(marquee.startY, marquee.endY);
                const y2 = Math.max(marquee.startY, marquee.endY);

                const t1 = xToTime(x1);
                const t2 = xToTime(x2);
                const track1 = Math.floor(y1 / TRACK_HEIGHT);
                const track2 = Math.floor(y2 / TRACK_HEIGHT);

                const intersecting = clips.filter(c => {
                    if (c.trackIndex < track1 || c.trackIndex > track2) return false;
                    const clipEnd = c.startTime + c.duration;
                    return clipEnd > t1 && c.startTime < t2;
                });

                if (intersecting.length > 0) {
                    setSelectedClipIds(intersecting.map(c => c.id));
                    useTimelineStore.getState().setSelectedClipId(intersecting[0].id);
                }
            }
            setMarquee(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [marquee, clips, xToTime]);

    useEffect(() => {
        if (!dragging) return;

        const handleMouseMove = (e) => {
            const dx = e.clientX - dragging.startX;
            const dt = dx / timeScale;

            if (dragging.type === 'move') {
                let newStart = Math.max(0, dragging.origStart + dt);
                // Snap system
                const snapPoints = getSnapPoints(dragging.clipId);
                const snapped = resolveSnap(newStart, snapPoints);
                if (snapped !== null) {
                    newStart = snapped;
                    setSnapGuide(snapped);
                } else {
                    setSnapGuide(null);
                }
                const container = scrollRef.current;
                if (container) {
                    const rect = container.getBoundingClientRect();
                    const y = e.clientY - rect.top + container.scrollTop;
                    const newTrack = Math.max(0, Math.min(tracks.length - 1, Math.floor(y / TRACK_HEIGHT)));
                    useTimelineStore.getState().moveClip(dragging.clipId, newStart, newTrack);
                }
            } else if (dragging.type === 'resize-left') {
                let newDuration = Math.max(0.1, dragging.origDuration - dt);
                const clip = clips.find(c => c.id === dragging.clipId);
                if (clip) {
                    const newStart = clip.startTime + (dragging.origDuration - newDuration);
                    const snapPoints = getSnapPoints(dragging.clipId);
                    const snapped = resolveSnap(newStart, snapPoints);
                    if (snapped !== null) {
                        newDuration = Math.max(0.1, clip.startTime + clip.duration - snapped);
                        setSnapGuide(snapped);
                    } else {
                        setSnapGuide(null);
                    }
                }
                useTimelineStore.getState().resizeClip(dragging.clipId, newDuration, true);
            } else if (dragging.type === 'resize-right') {
                let newDuration = Math.max(0.1, dragging.origDuration + dt);
                const clip = clips.find(c => c.id === dragging.clipId);
                if (clip) {
                    const endTime = clip.startTime + newDuration;
                    const snapPoints = getSnapPoints(dragging.clipId);
                    const snapped = resolveSnap(endTime, snapPoints);
                    if (snapped !== null) {
                        newDuration = Math.max(0.1, snapped - clip.startTime);
                        setSnapGuide(snapped);
                    } else {
                        setSnapGuide(null);
                    }
                }
                useTimelineStore.getState().resizeClip(dragging.clipId, newDuration, false);
            }
        };

        const handleMouseUp = () => {
            setDragging(null);
            setSnapGuide(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, timeScale, tracks, clips, getSnapPoints, resolveSnap]);

    const handleWheel = useCallback((e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            useTimelineStore.getState().setZoom(z => Math.max(0.1, Math.min(10, z * delta)));
        }
    }, []);

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

    const renderClip = (clip) => {
        const x = timeToX(clip.startTime);
        const w = timeToX(clip.duration);
        const isSelected = clip.id === selectedClipId || selectedClipIds.includes(clip.id);
        const track = tracks[clip.trackIndex];

        const hasJLCut = clip.audioOffset !== 0 || (clip.audioDuration !== null && clip.audioDuration !== clip.duration);
        const audioStartTime = clip.startTime + (clip.audioOffset || 0);
        const audioDur = clip.audioDuration || clip.duration;

        return (
            <div key={clip.id} className="tl-clip-group">
                <div
                    className={`tl-clip ${isSelected ? 'tl-clip-selected' : ''} tl-clip-${clip.type}`}
                    style={{
                        left: x,
                        width: Math.max(w, 8),
                        top: clip.trackIndex * TRACK_HEIGHT + 2,
                        height: TRACK_HEIGHT - 4,
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
                        <WaveformCanvas
                            clip={clip}
                            zoom={zoom}
                            height={TRACK_HEIGHT - 8}
                            color="#10b981"
                            backgroundColor="rgba(16, 185, 129, 0.1)"
                        />
                    )}
                    {clip.type === 'audio' && (
                        <AudioEnvelope
                            clip={clip}
                            zoom={zoom}
                            onAddVolumeKeyframe={(clipId, time, value) => {
                                useTimelineStore.getState().addKeyframe(clipId, 'volume', time, value, 'linear');
                            }}
                            onRemoveVolumeKeyframe={(clipId, param, time) => {
                                useTimelineStore.getState().removeKeyframe(clipId, param, time);
                            }}
                            onMoveVolumeKeyframe={(clipId, time, value) => {
                                const store = useTimelineStore.getState();
                                store.removeKeyframe(clipId, 'volume', time);
                                store.addKeyframe(clipId, 'volume', time, value, 'linear');
                            }}
                        />
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
                    <EffectBadge effects={clip.filters} />
                    {clip.keyframes && Object.keys(clip.keyframes).length > 0 && (
                        <div className="tl-clip-keyframes">
                            {Object.values(clip.keyframes).flat().map((kf, i) => (
                                <div key={i} className="tl-keyframe-dot" style={{ left: `${((kf.time / clip.duration) * 100)}%` }} />
                            ))}
                        </div>
                    )}
                    {clip.type !== 'audio' && clip.keyframes && Object.keys(clip.keyframes).length > 0 && (
                        <KeyframeCanvas
                            clip={clip}
                            zoom={zoom}
                            selectedParam={selectedKeyframeParam}
                            onAddKeyframe={(clipId, param, time, value, interp) => {
                                useTimelineStore.getState().addKeyframe(clipId, param, time, value, interp);
                            }}
                            onRemoveKeyframe={(clipId, param, time) => {
                                useTimelineStore.getState().removeKeyframe(clipId, param, time);
                            }}
                        />
                    )}
                    <div className="tl-clip-handle tl-clip-handle-right"
                        onMouseDown={(e) => handleClipMouseDown(e, clip, 'right')} />
                </div>

                {hasJLCut && (
                    <div
                        className="tl-clip-audio-bar"
                        style={{
                            left: timeToX(audioStartTime),
                            width: Math.max(timeToX(audioDur), 8),
                            top: clip.trackIndex * TRACK_HEIGHT + TRACK_HEIGHT - 10,
                            height: 8,
                        }}
                    >
                        <div className="tl-clip-audio-bar-inner" />
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="timeline-container" ref={containerRef} onWheel={handleWheel}>
            <div className="tl-content-row">
                <div className="tl-track-headers">
                    {tracks.map((track, _i) => (
                        <div key={track.id} className="tl-track-header" style={{ height: TRACK_HEIGHT }}>
                            <span className="tl-track-name">{track.name}</span>
                            {mode === 'advanced' && (
                                <div className="tl-track-controls">
                                    <button className={`tl-btn ${track.muted ? 'tl-btn-muted' : ''}`}
                                        onClick={() => useTimelineStore.getState().toggleTrackMute(track.id)} title="Mute"
                                        aria-pressed={!!track.muted} aria-label={`Mute track ${track.id}`}>M</button>
                                    <button className={`tl-btn ${track.locked ? 'tl-btn-locked' : ''}`}
                                        onClick={() => useTimelineStore.getState().toggleTrackLock(track.id)} title="Lock"
                                        aria-pressed={!!track.locked} aria-label={`Lock track ${track.id}`}>L</button>
                                    {tracks.length > 1 && (
                                        <button className="tl-btn tl-btn-remove"
                                            onClick={() => useTimelineStore.getState().removeTrack(track.id)}
                                            title="Remove Track">-</button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {mode === 'advanced' && (
                        <div className="tl-add-track" onClick={() => useTimelineStore.getState().addTrack()}>
                            <span>+ Track</span>
                        </div>
                    )}
                </div>

                <div className="tl-scroll" ref={scrollRef} onClick={handleTimelineClick}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                    onDrop={(e) => {
                        e.preventDefault();
                        const clipId = e.dataTransfer.getData('clipId');
                        if (clipId && onDropExternal) {
                            const rect = scrollRef.current.getBoundingClientRect();
                            const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
                            const y = e.clientY - rect.top;
                            const trackIndex = Math.max(0, Math.min(tracks.length - 1, Math.floor(y / TRACK_HEIGHT)));
                            const time = Math.max(0, xToTime(x));
                            onDropExternal(clipId, trackIndex, time);
                        }
                        try {
                            const data = JSON.parse(e.dataTransfer.getData('application/json'));
                            if (data.type === 'effect') {
                                const rect = scrollRef.current.getBoundingClientRect();
                                const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
                                const y = e.clientY - rect.top;
                                const trackIndex = Math.floor(y / TRACK_HEIGHT);
                                const time = xToTime(x);
                                const targetClip = clips.find(c => c.trackIndex === trackIndex && time >= c.startTime && time < c.startTime + c.duration);
                                if (targetClip) {
                                    useTimelineStore.getState().updateClip(targetClip.id, {
                                        filters: [...(targetClip.filters || []), { filterId: data.id, params: {} }]
                                    });
                                }
                            }
                        } catch {}
                    }}>
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
                        {/* Snap guide line */}
                        {snapGuide !== null && (
                            <div className="tl-snap-guide" style={{ left: timeToX(snapGuide) }} />
                        )}
                        {/* Marquee selection rectangle */}
                        {marquee && (
                            <div className="tl-marquee" style={{
                                left: Math.min(marquee.startX, marquee.endX),
                                top: Math.min(marquee.startY, marquee.endY),
                                width: Math.abs(marquee.endX - marquee.startX),
                                height: Math.abs(marquee.endY - marquee.startY),
                            }} />
                        )}
                        {/* Floating action bar for selected clip */}
                        {selectedClipId && (() => {
                            const selectedClip = clips.find(c => c.id === selectedClipId);
                            if (!selectedClip) return null;
                            const cx = timeToX(selectedClip.startTime);
                            const cw = timeToX(selectedClip.duration);
                            const barX = Math.max(0, cx + cw / 2 - 100);
                            const barY = selectedClip.trackIndex * TRACK_HEIGHT - 36;
                            return (
                                <div className="tl-clip-actions" style={{ left: barX, top: barY }}>
                                    <button className="tl-clip-action-btn" title="Split at Playhead"
                                        onClick={() => useTimelineStore.getState().splitAtPlayhead()}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="8 6 12 2 16 6"/><polyline points="8 18 12 22 16 18"/></svg>
                                    </button>
                                    <button className="tl-clip-action-btn" title="Delete"
                                        onClick={() => useTimelineStore.getState().removeClip(selectedClipId)}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    </button>
                                    <button className="tl-clip-action-btn" title="Duplicate"
                                        onClick={() => {
                                            const { id: _omit, ...rest } = selectedClip;
                                            useTimelineStore.getState().addClip(selectedClip.trackIndex, {
                                                ...rest,
                                                startTime: selectedClip.startTime + selectedClip.duration,
                                            });
                                        }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    </button>
                                    <div className="tl-clip-action-divider" />
                                    <button className="tl-clip-action-btn" title="Speed"
                                        onClick={() => setSpeedSlider({ clipId: selectedClipId, x: cx, y: selectedClip.trackIndex * TRACK_HEIGHT })}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                                    </button>
                                    <button className="tl-clip-action-btn" title="More (Right-click)"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleClipContextMenu(e, selectedClip);
                                        }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                                    </button>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Screencast tracks - Advanced mode only */}
                    {mode === 'advanced' && (
                    <div className="tl-screencast-tracks" style={{ width: totalWidth }}>
                        {tracks.filter(t => t.type === 'zoom-pan').map(track => (
                            <ZoomPanTrack
                                key={track.id}
                                regions={zoomPanRegions}
                                zoom={zoom}
                                trackHeight={TRACK_HEIGHT}
                                onAddRegion={(region) => useTimelineStore.getState().addZoomPanRegion(region)}
                                onUpdateRegion={(id, updates) => useTimelineStore.getState().updateZoomPanRegion(id, updates)}
                                onRemoveRegion={(id) => useTimelineStore.getState().removeZoomPanRegion(id)}
                            />
                        ))}
                        {tracks.filter(t => t.type === 'cursor').map(track => (
                            <CursorTrack
                                key={track.id}
                                events={cursorEvents}
                                zoom={zoom}
                                trackHeight={TRACK_HEIGHT}
                                onAddEvent={(event) => useTimelineStore.getState().addCursorEvent(event)}
                                onUpdateEvent={(id, updates) => useTimelineStore.getState().updateCursorEvent(id, updates)}
                                onRemoveEvent={(id) => useTimelineStore.getState().removeCursorEvent(id)}
                            />
                        ))}
                        {tracks.filter(t => t.type === 'annotations').map(track => (
                            <AnnotationsTrack
                                key={track.id}
                                annotations={annotations}
                                zoom={zoom}
                                trackHeight={TRACK_HEIGHT}
                                onAddAnnotation={(ann) => useTimelineStore.getState().addAnnotation(ann)}
                                onUpdateAnnotation={(id, updates) => useTimelineStore.getState().updateAnnotation(id, updates)}
                                onRemoveAnnotation={(id) => useTimelineStore.getState().removeAnnotation(id)}
                            />
                        ))}
                        {tracks.filter(t => t.type === 'animations').map(track => (
                            <AnimationsTrack
                                key={track.id}
                                animations={animations}
                                zoom={zoom}
                                trackHeight={TRACK_HEIGHT}
                                onAddAnimation={(anim) => useTimelineStore.getState().addAnimation(anim)}
                                onUpdateAnimation={(id, updates) => useTimelineStore.getState().updateAnimation(id, updates)}
                                onRemoveAnimation={(id) => useTimelineStore.getState().removeAnimation(id)}
                            />
                        ))}
                    </div>
                    )}

                    <TransitionHandles
                        clips={clips}
                        tracks={tracks}
                        zoom={zoom}
                        trackHeight={TRACK_HEIGHT}
                        onApplyTransition={(clipAId, clipBId, transitionId) => {
                            const store = useTimelineStore.getState();
                            const clipA = store.clips.find(c => c.id === clipAId);
                            const clipB = store.clips.find(c => c.id === clipBId);
                            store.updateClip(clipAId, { transitions: { ...clipA?.transitions, out: transitionId } });
                            store.updateClip(clipBId, { transitions: { ...clipB?.transitions, in: transitionId } });
                        }}
                        onRemoveTransition={(clipAId) => {
                            const store = useTimelineStore.getState();
                            const clipA = store.clips.find(c => c.id === clipAId);
                            store.updateClip(clipAId, { transitions: { ...clipA?.transitions, out: null } });
                        }}
                    />
                    <MarkerLayer
                        markers={markers}
                        zoom={zoom}
                        currentTime={currentTime}
                        onAddMarker={useTimelineStore.getState().addMarker}
                        onRemoveMarker={useTimelineStore.getState().removeMarker}
                        onUpdateMarker={useTimelineStore.getState().updateMarker}
                        onMoveMarker={useTimelineStore.getState().moveMarker}
                        onSeek={useTimelineStore.getState().setCurrentTime}
                    />

                    <Playhead
                        currentTime={currentTime}
                        zoom={zoom}
                        clips={clips}
                        markers={markers}
                        duration={duration}
                        onSeek={useTimelineStore.getState().setCurrentTime}
                    />
                </div>
            </div>

            {speedSlider && (() => {
                const clip = clips.find(c => c.id === speedSlider.clipId);
                if (!clip) return null;
                return (
                    <div className="tl-speed-popup" style={{ left: speedSlider.x, top: speedSlider.y + TRACK_HEIGHT }}
                        onClick={e => e.stopPropagation()}>
                        <label>Speed: {clip.speed}x</label>
                        <input type="range" min={0.25} max={4} step={0.25} value={clip.speed}
                            onChange={e => useTimelineStore.getState().updateClip(speedSlider.clipId, { speed: parseFloat(e.target.value) })} />
                        <div className="tl-speed-presets">
                            {[0.5, 1, 1.5, 2].map(s => (
                                <button key={s} className={`tl-btn ${clip.speed === s ? 'active' : ''}`}
                                    onClick={() => useTimelineStore.getState().updateClip(speedSlider.clipId, { speed: s })}>{s}x</button>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {contextMenu && (
                <ClipContextMenu
                    x={contextMenu.x} y={contextMenu.y} clip={contextMenu.clip}
                    onClose={() => setContextMenu(null)}
                    onSplit={() => useTimelineStore.getState().splitAtPlayhead()}
                    onDelete={(id) => useTimelineStore.getState().removeClip(id)}
                    onDuplicate={() => {
                        const clip = contextMenu.clip;
                        const { id: _omit, ...rest } = clip;
                        useTimelineStore.getState().addClip(clip.trackIndex, {
                            ...rest,
                            startTime: clip.startTime + clip.duration,
                        });
                    }}
                    onSpeed={(speed) => useTimelineStore.getState().updateClip(contextMenu.clip.id, { speed })}
                    onFilters={() => {}}
                    onKeyframes={() => {}}
                    mode={mode}
                />
            )}

            {/* Edit Toolbar with Icons */}
            <div className="tl-edit-toolbar" role="toolbar" aria-label="Edit tools">
                <button className="tl-toolbar-btn" onClick={() => useTimelineStore.getState().splitAtPlayhead()} disabled={!selectedClipId} title="Split (Keep Both) - S">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="8 6 12 2 16 6"/><polyline points="8 18 12 22 16 18"/></svg>
                    <span>Split</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().sliceAtPlayhead('keepLeft')} disabled={!selectedClipId} title="Slice - Keep Left - X">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="8 6 12 2 16 6"/></svg>
                    <span>Left</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().sliceAtPlayhead('keepRight')} disabled={!selectedClipId} title="Slice - Keep Right - Z">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="8 18 12 22 16 18"/></svg>
                    <span>Right</span>
                </button>
                <div className="tl-toolbar-divider" />
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().removeClip(selectedClipId)} disabled={!selectedClipId} title="Delete - Del">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    <span>Delete</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().rippleDelete()} disabled={!selectedClipId} title="Ripple Delete - Shift+Del">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    <span>Ripple</span>
                </button>
                <div className="tl-toolbar-divider" />
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().copyClip()} disabled={!selectedClipId} title="Copy - Ctrl+C">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Copy</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => useTimelineStore.getState().pasteClip()} title="Paste - Ctrl+V">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
                    <span>Paste</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().cutClip()} disabled={!selectedClipId} title="Cut - Ctrl+X">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                    <span>Cut</span>
                </button>
                <div className="tl-toolbar-divider" />
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().duplicateClip(selectedClipId)} disabled={!selectedClipId} title="Duplicate">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Dup</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => {
                    if (!selectedClipId) return;
                    const store = useTimelineStore.getState();
                    const clip = store.clips.find(c => c.id === selectedClipId);
                    if (clip) store.updateClip(selectedClipId, { speed: clip.speed === 1 ? 2 : 1 });
                }} disabled={!selectedClipId} title="Toggle Speed (1x/2x)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                    <span>Speed</span>
                </button>
                <div className="tl-toolbar-divider" />
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().fadeIn(selectedClipId, 1)} disabled={!selectedClipId} title="Fade In (1s)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="2 12 8 6 14 18 20 12"/></svg>
                    <span>Fade In</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().fadeOut(selectedClipId, 1)} disabled={!selectedClipId} title="Fade Out (1s)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="2 12 8 18 14 6 20 12"/></svg>
                    <span>Fade Out</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().rotateClip(selectedClipId, 90)} disabled={!selectedClipId} title="Rotate 90°">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                    <span>Rotate</span>
                </button>
                <div className="tl-toolbar-divider" />
                <button className="tl-toolbar-btn" onClick={() => useTimelineStore.getState().sliceAllAtPlayhead('keepBoth')} title="Slice All at Playhead (A)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
                    <span>Slice All</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => {
                    const store = useTimelineStore.getState();
                    if (selectedClipId) {
                        const clip = store.clips.find(c => c.id === selectedClipId);
                        if (clip) store.removeAllGaps(clip.trackIndex);
                    }
                }} disabled={!selectedClipId} title="Remove All Gaps">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                    <span>Remove Gap</span>
                </button>
                <div className="tl-toolbar-spacer" />
                <button className="tl-toolbar-btn" onClick={() => useTimelineStore.getState().undo()} title="Undo - Ctrl+Z">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                    <span>Undo</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => useTimelineStore.getState().redo()} title="Redo - Ctrl+Shift+Z">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    <span>Redo</span>
                </button>
            </div>

            <div className="tl-transport" role="toolbar" aria-label="Timeline transport controls">
                <button className="tl-transport-btn" onClick={() => useTimelineStore.getState().setCurrentTime(0)} title="Stop" aria-label="Stop playback">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                </button>
                <button className="tl-transport-btn tl-transport-play"
                    onClick={() => onPlayPause?.()}
                    aria-label={isPlaying ? 'Pause playback' : 'Play'}>
                    {isPlaying ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    )}
                </button>
                <span className="tl-transport-time" aria-label={`Current time: ${formatTime(currentTime)}`}>{formatTime(currentTime)}</span>
                <span className="tl-transport-divider">/</span>
                <span className="tl-transport-time tl-transport-duration" aria-label={`Duration: ${formatTime(duration)}`}>{formatTime(duration)}</span>
                <div className="tl-transport-spacer" />
                <button className="tl-transport-btn" onClick={() => useTimelineStore.getState().setZoom(z => Math.max(0.1, z * 0.8))} title="Zoom Out" aria-label="Zoom timeline out">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <input
                    type="range"
                    className="tl-zoom-slider"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={zoom}
                    onChange={e => useTimelineStore.getState().setZoom(parseFloat(e.target.value))}
                    title={`Zoom: ${Math.round(zoom * 100)}%`}
                />
                <span className="tl-zoom-label">{Math.round(zoom * 100)}%</span>
                <button className="tl-transport-btn" onClick={() => useTimelineStore.getState().setZoom(z => Math.min(10, z * 1.25))} title="Zoom In" aria-label="Zoom timeline in">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                {mode === 'advanced' && (
                    <>
                        <div className="tl-toolbar-divider" />
                        <button className={`tl-transport-btn ${magneticMode ? 'tl-transport-active' : ''}`}
                            onClick={() => useTimelineStore.getState().toggleMagneticMode()}
                            title={`Magnetic: ${magneticMode ? 'ON' : 'OFF'}`}
                            aria-label={`Toggle magnetic timeline, currently ${magneticMode ? 'on' : 'off'}`}>
                            {magneticMode ? 'M On' : 'M Off'}
                        </button>
                    </>
                )}
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
