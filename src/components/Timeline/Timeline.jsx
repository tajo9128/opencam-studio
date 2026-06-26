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
import './Timeline.css';

const TRACK_HEIGHT = 48;
const TIME_SCALE_BASE = 80;

export const Timeline = ({
    onDropExternal,
    clipThumbnails = {},
    onPlayPause,
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
                        <div className="tl-clip-waveform" style={{ position: 'absolute', left: 8, right: 8, bottom: 6, height: 16, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                            {Array.from({ length: 40 }).map((_, i) => {
                                const h = 15 + Math.sin(i * 0.5) * 30 + Math.sin(i * 1.7) * 20;
                                return <div key={i} style={{ flex: 1, height: `${Math.abs(h)}%`, background: '#10b981', borderRadius: '1px', opacity: 0.7 }} />;
                            })}
                        </div>
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
                        if (!clipId || !onDropExternal) return;
                        const rect = scrollRef.current.getBoundingClientRect();
                        const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
                        const y = e.clientY - rect.top;
                        const trackIndex = Math.max(0, Math.min(tracks.length - 1, Math.floor(y / TRACK_HEIGHT)));
                        const time = Math.max(0, xToTime(x));
                        onDropExternal(clipId, trackIndex, time);
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
                />
            )}

            <div className="tl-transport" role="toolbar" aria-label="Timeline transport controls">
                <button className="tl-transport-btn" onClick={() => useTimelineStore.getState().setCurrentTime(0)} title="Stop" aria-label="Stop playback">Stop</button>
                <button className="tl-transport-btn tl-transport-play"
                    onClick={() => onPlayPause?.()}
                    aria-label={isPlaying ? 'Pause playback' : 'Play'}>
                    {isPlaying ? 'Pause' : 'Play'}
                </button>
                <span className="tl-transport-time" aria-label={`Current time: ${formatTime(currentTime)}`}>{formatTime(currentTime)}</span>
                <span className="tl-transport-divider">/</span>
                <span className="tl-transport-time tl-transport-duration" aria-label={`Duration: ${formatTime(duration)}`}>{formatTime(duration)}</span>
                <div className="tl-transport-spacer" />
                <button className="tl-transport-btn" onClick={() => useTimelineStore.getState().splitAtPlayhead()} disabled={!selectedClipId} title="Split (S)" aria-label="Split clip at playhead">Split</button>
                <button className="tl-transport-btn" onClick={() => selectedClipId && useTimelineStore.getState().removeClip(selectedClipId)} disabled={!selectedClipId} title="Delete (Del)" aria-label="Delete selected clip">Delete</button>
                <div className="tl-transport-spacer" />
                <button className="tl-transport-btn" onClick={() => useTimelineStore.getState().setZoom(z => Math.max(0.1, z * 0.8))} title="Zoom Out" aria-label="Zoom timeline out">-</button>
                <span className="tl-zoom-label">{Math.round(zoom * 100)}%</span>
                <button className="tl-transport-btn" onClick={() => useTimelineStore.getState().setZoom(z => Math.min(10, z * 1.25))} title="Zoom In" aria-label="Zoom timeline in">+</button>
                <div className="tl-transport-spacer" />
                <button className={`tl-transport-btn ${magneticMode ? 'tl-transport-active' : ''}`}
                    onClick={() => useTimelineStore.getState().toggleMagneticMode()}
                    title={`Magnetic: ${magneticMode ? 'ON' : 'OFF'}`}
                    aria-label={`Toggle magnetic timeline, currently ${magneticMode ? 'on' : 'off'}`}>
                    {magneticMode ? 'M On' : 'M Off'}
                </button>
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
