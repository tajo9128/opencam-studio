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

const TRACK_HEIGHT = 48;
const TIME_SCALE_BASE = 80;

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
            useTimelineStore.getState().setSelectedClipId(clickedClip.id);
        } else {
            useTimelineStore.getState().setSelectedClipId(null);
            useTimelineStore.getState().setCurrentTime(Math.max(0, time));
        }
    }, [clips, dragging, xToTime]);

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
                    useTimelineStore.getState().moveClip(dragging.clipId, newStart, newTrack);
                }
            } else if (dragging.type === 'resize-left') {
                const newDuration = Math.max(0.1, dragging.origDuration - dt);
                useTimelineStore.getState().resizeClip(dragging.clipId, newDuration, true);
            } else if (dragging.type === 'resize-right') {
                const newDuration = Math.max(0.1, dragging.origDuration + dt);
                useTimelineStore.getState().resizeClip(dragging.clipId, newDuration, false);
            }
        };

        const handleMouseUp = () => setDragging(null);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, timeScale, tracks]);

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
        const isSelected = clip.id === selectedClipId;
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
                        </div>
                    ))}
                    <div className="tl-add-track" onClick={() => useTimelineStore.getState().addTrack()}>
                        <span>+ Track</span>
                    </div>
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
                    </div>

                    {/* Screencast tracks */}
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
                <button className="tl-toolbar-btn" onClick={() => useTimelineStore.getState().splitAtPlayhead()} disabled={!selectedClipId} title="Split at Playhead (S)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="8 6 12 2 16 6"/><polyline points="8 18 12 22 16 18"/></svg>
                    <span>Split</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => {
                    if (!selectedClipId) return;
                    const store = useTimelineStore.getState();
                    const clip = store.clips.find(c => c.id === selectedClipId);
                    if (!clip) return;
                    const playheadTime = store.currentTime;
                    if (playheadTime > clip.startTime && playheadTime < clip.startTime + clip.duration) {
                        store.splitAtPlayhead();
                        const leftClip = store.clips.find(c => c.id === selectedClipId);
                        if (leftClip) store.removeClip(leftClip.id);
                    }
                }} disabled={!selectedClipId} title="Razor Cut (X)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                    <span>Cut</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().removeClip(selectedClipId)} disabled={!selectedClipId} title="Delete Clip (Del)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    <span>Delete</span>
                </button>
                <div className="tl-toolbar-divider" />
                <button className="tl-toolbar-btn" onClick={() => selectedClipId && useTimelineStore.getState().duplicateClip(selectedClipId)} disabled={!selectedClipId} title="Duplicate Clip">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Duplicate</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => {
                    if (!selectedClipId) return;
                    const store = useTimelineStore.getState();
                    const clip = store.clips.find(c => c.id === selectedClipId);
                    if (clip) {
                        const newSpeed = clip.speed === 1 ? 2 : 1;
                        store.updateClip(selectedClipId, { speed: newSpeed });
                    }
                }} disabled={!selectedClipId} title="Toggle Speed (1x/2x)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                    <span>Speed</span>
                </button>
                <div className="tl-toolbar-divider" />
                <button className={`tl-toolbar-btn ${noiseReductionEnabled ? 'tl-toolbar-active' : ''}`} onClick={() => onNoiseReduction?.()} title="Noise Reduction">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                    <span>Denoise</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => {
                    if (!selectedClipId) return;
                    const store = useTimelineStore.getState();
                    const clip = store.clips.find(c => c.id === selectedClipId);
                    if (clip) {
                        store.updateClip(selectedClipId, { filters: [] });
                    }
                }} disabled={!selectedClipId} title="Remove All Filters">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    <span>Clear FX</span>
                </button>
                <div className="tl-toolbar-spacer" />
                <button className="tl-toolbar-btn" onClick={() => useTimelineStore.getState().undo?.()} title="Undo (Ctrl+Z)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                    <span>Undo</span>
                </button>
                <button className="tl-toolbar-btn" onClick={() => useTimelineStore.getState().redo?.()} title="Redo (Ctrl+Y)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
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
