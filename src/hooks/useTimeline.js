import { useState, useCallback, useRef, useEffect } from 'react';
import { FILTERS, buildCSSFilter, getDefaultParams } from '../utils/FilterEngine';
import { applyTransition } from '../utils/Transitions';

let clipIdCounter = 0;

const createClip = (overrides = {}) => ({
    id: `clip_${++clipIdCounter}`,
    trackIndex: 0,
    startTime: 0,
    duration: 10,
    sourceStart: 0,
    sourceEnd: 10,
    sourceUrl: null,
    speed: 1.0,
    filters: [],
    transitions: { in: null, out: null },
    keyframes: {}, // { paramKey: [{ time, value, interpolation }] }
    label: '',
    color: '#8b5cf6',
    type: 'video',
    ...overrides,
});

const MAX_UNDO = 50;

export const useTimeline = () => {
    const [clips, setClips] = useState([]);
    const [tracks, setTracks] = useState([
        { id: 'track_0', name: 'Video 1', type: 'video', muted: false, locked: false, visible: true },
        { id: 'track_1', name: 'Video 2', type: 'video', muted: false, locked: false, visible: true },
        { id: 'track_2', name: 'Screen', type: 'video', muted: false, locked: false, visible: true },
        { id: 'track_3', name: 'Webcam', type: 'video', muted: false, locked: false, visible: true },
        { id: 'track_4', name: 'Audio', type: 'audio', muted: false, locked: false, visible: true },
    ]);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [selectedClipId, setSelectedClipId] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [zoom, setZoom] = useState(1);
    const playIntervalRef = useRef(null);

    // Phase 1.4: Undo/Redo
    const undoStack = useRef([]);
    const redoStack = useRef([]);
    const isUndoRedo = useRef(false);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const updateUndoRedoState = useCallback(() => {
        setCanUndo(undoStack.current.length > 0);
        setCanRedo(redoStack.current.length > 0);
    }, []);

    const pushUndo = useCallback((clipsState, tracksState) => {
        if (isUndoRedo.current) return;
        undoStack.current.push({ clips: JSON.parse(JSON.stringify(clipsState)), tracks: JSON.parse(JSON.stringify(tracksState)) });
        if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
        redoStack.current = [];
        updateUndoRedoState();
    }, [updateUndoRedoState]);

    const undo = useCallback(() => {
        if (undoStack.current.length === 0) return;
        isUndoRedo.current = true;
        const snapshot = undoStack.current.pop();
        redoStack.current.push({ clips: JSON.parse(JSON.stringify(clips)), tracks: JSON.parse(JSON.stringify(tracks)) });
        setClips(snapshot.clips);
        setTracks(snapshot.tracks);
        const maxEnd = Math.max(...snapshot.clips.map(c => c.startTime + c.duration), 0);
        setDuration(maxEnd);
        isUndoRedo.current = false;
        updateUndoRedoState();
    }, [clips, tracks, updateUndoRedoState]);

    const redo = useCallback(() => {
        if (redoStack.current.length === 0) return;
        isUndoRedo.current = true;
        const snapshot = redoStack.current.pop();
        undoStack.current.push({ clips: JSON.parse(JSON.stringify(clips)), tracks: JSON.parse(JSON.stringify(tracks)) });
        setClips(snapshot.clips);
        setTracks(snapshot.tracks);
        const maxEnd = Math.max(...snapshot.clips.map(c => c.startTime + c.duration), 0);
        setDuration(maxEnd);
        isUndoRedo.current = false;
        updateUndoRedoState();
    }, [clips, tracks, updateUndoRedoState]);

    const updateDuration = useCallback((updatedClips) => {
        const maxEnd = Math.max(...updatedClips.map(c => c.startTime + c.duration), 0);
        setDuration(maxEnd);
    }, []);

    // Track management
    const addTrack = useCallback((name = 'New Track', type = 'video') => {
        pushUndo(clips, tracks);
        const id = `track_${Date.now()}`;
        setTracks(prev => [...prev, { id, name, type, muted: false, locked: false, visible: true }]);
    }, [clips, tracks, pushUndo]);

    const removeTrack = useCallback((trackId) => {
        pushUndo(clips, tracks);
        setTracks(prev => prev.filter(t => t.id !== trackId));
        setClips(prev => {
            const trackIndex = tracks.findIndex(t => t.id === trackId);
            const filtered = prev.filter(c => c.trackIndex !== trackIndex);
            const remapped = filtered.map(c => ({
                ...c,
                trackIndex: c.trackIndex > trackIndex ? c.trackIndex - 1 : c.trackIndex
            }));
            updateDuration(remapped);
            return remapped;
        });
    }, [clips, tracks, pushUndo, updateDuration]);

    const toggleTrackMute = useCallback((trackId) => {
        setTracks(prev => prev.map(t => t.id === trackId ? { ...t, muted: !t.muted } : t));
    }, []);

    const toggleTrackLock = useCallback((trackId) => {
        setTracks(prev => prev.map(t => t.id === trackId ? { ...t, locked: !t.locked } : t));
    }, []);

    const addClip = useCallback((trackIndex, clipData) => {
        pushUndo(clips, tracks);
        const clip = createClip({ trackIndex, ...clipData });
        setClips(prev => {
            const updated = [...prev, clip];
            updateDuration(updated);
            return updated;
        });
        return clip;
    }, [clips, tracks, pushUndo, updateDuration]);

    const removeClip = useCallback((id) => {
        pushUndo(clips, tracks);
        const clip = clips.find(c => c.id === id);
        const vid = videoCacheRef.current.get(id);
        if (vid) { vid.pause(); vid.src = ''; videoCacheRef.current.delete(id); }
        if (clip?.sourceUrl) URL.revokeObjectURL(clip.sourceUrl);
        setClips(prev => {
            const updated = prev.filter(c => c.id !== id);
            updateDuration(updated);
            return updated;
        });
        if (selectedClipId === id) setSelectedClipId(null);
    }, [clips, tracks, pushUndo, updateDuration, selectedClipId]);

    const updateClip = useCallback((id, updates) => {
        pushUndo(clips, tracks);
        setClips(prev => {
            const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c);
            updateDuration(updated);
            return updated;
        });
    }, [clips, tracks, pushUndo, updateDuration]);

    const splitAtPlayhead = useCallback(() => {
        if (!selectedClipId) return;
        const clip = clips.find(c => c.id === selectedClipId);
        if (!clip) return;

        const splitTime = currentTime;
        if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) return;

        pushUndo(clips, tracks);

        const leftDuration = splitTime - clip.startTime;
        const rightDuration = clip.duration - leftDuration;
        const rightSourceStart = clip.sourceStart + leftDuration * clip.speed;

        const rightClip = createClip({
            trackIndex: clip.trackIndex,
            startTime: splitTime,
            duration: rightDuration,
            sourceStart: rightSourceStart,
            sourceEnd: clip.sourceEnd,
            sourceUrl: clip.sourceUrl,
            speed: clip.speed,
            filters: [...clip.filters],
            transitions: { ...clip.transitions },
            keyframes: clip.keyframes ? JSON.parse(JSON.stringify(clip.keyframes)) : {},
            label: clip.label,
            color: clip.color,
            type: clip.type,
        });

        setClips(prev => {
            const updated = prev.map(c => c.id === selectedClipId
                ? { ...c, duration: leftDuration, sourceEnd: clip.sourceStart + leftDuration * clip.speed }
                : c
            );
            return [...updated, rightClip];
        });
    }, [selectedClipId, currentTime, clips, tracks, pushUndo]);

    const moveClip = useCallback((id, newStartTime, newTrackIndex) => {
        setClips(prev => prev.map(c => {
            if (c.id !== id) return c;
            return {
                ...c,
                startTime: Math.max(0, newStartTime),
                ...(newTrackIndex !== undefined ? { trackIndex: newTrackIndex } : {})
            };
        }));
    }, []);

    const resizeClip = useCallback((id, newDuration, fromLeft = false) => {
        setClips(prev => prev.map(c => {
            if (c.id !== id) return c;
            const dur = Math.max(0.1, newDuration);
            if (fromLeft) {
                const diff = c.duration - dur;
                return {
                    ...c,
                    startTime: c.startTime + diff,
                    duration: dur,
                    sourceStart: c.sourceStart + diff * (c.speed || 1),
                };
            }
            return { ...c, duration: dur };
        }));
    }, []);

    // Keyframe management
    const addKeyframe = useCallback((clipId, paramKey, time, value, interpolation = 'linear') => {
        pushUndo(clips, tracks);
        setClips(prev => prev.map(c => {
            if (c.id !== clipId) return c;
            const kfs = { ...c.keyframes };
            const arr = [...(kfs[paramKey] || [])];
            // Insert sorted by time
            const idx = arr.findIndex(k => k.time >= time);
            if (idx >= 0 && arr[idx].time === time) {
                arr[idx] = { time, value, interpolation };
            } else {
                arr.splice(idx >= 0 ? idx : arr.length, 0, { time, value, interpolation });
            }
            kfs[paramKey] = arr;
            return { ...c, keyframes: kfs };
        }));
    }, [clips, tracks, pushUndo]);

    const removeKeyframe = useCallback((clipId, paramKey, time) => {
        pushUndo(clips, tracks);
        setClips(prev => prev.map(c => {
            if (c.id !== clipId) return c;
            const kfs = { ...c.keyframes };
            kfs[paramKey] = (kfs[paramKey] || []).filter(k => k.time !== time);
            return { ...c, keyframes: kfs };
        }));
    }, [clips, tracks, pushUndo]);

    const getKeyframedValue = useCallback((clip, paramKey, time) => {
        const kfs = clip.keyframes?.[paramKey];
        if (!kfs || kfs.length === 0) return undefined;
        if (kfs.length === 1) return kfs[0].value;

        const relTime = time - clip.startTime;
        // Find surrounding keyframes
        let prev = null, next = null;
        for (const kf of kfs) {
            if (kf.time <= relTime) prev = kf;
            if (kf.time >= relTime && !next) next = kf;
        }
        if (!prev) return next.value;
        if (!next) return prev.value;
        if (prev.time === next.time) return prev.value;

        const t = (relTime - prev.time) / (next.time - prev.time);
        // Interpolation
        let factor = t;
        if (next.interpolation === 'ease-in') factor = t * t;
        else if (next.interpolation === 'ease-out') factor = 1 - (1 - t) * (1 - t);
        else if (next.interpolation === 'ease-in-out') factor = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        return prev.value + (next.value - prev.value) * factor;
    }, []);

    // Playback
    const play = useCallback(() => {
        if (playIntervalRef.current) return;
        setIsPlaying(true);
        const startTime = Date.now();
        const startCurrent = currentTime;

        playIntervalRef.current = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const newTime = startCurrent + elapsed;
            if (newTime >= duration) {
                setCurrentTime(duration);
                clearInterval(playIntervalRef.current);
                playIntervalRef.current = null;
                setIsPlaying(false);
            } else {
                setCurrentTime(newTime);
            }
        }, 1000 / 30);
    }, [currentTime, duration]);

    const pause = useCallback(() => {
        if (playIntervalRef.current) {
            clearInterval(playIntervalRef.current);
            playIntervalRef.current = null;
        }
        setIsPlaying(false);
    }, []);

    const stop = useCallback(() => {
        pause();
        setCurrentTime(0);
    }, [pause]);

    const seek = useCallback((time) => {
        setCurrentTime(Math.max(0, Math.min(time, duration)));
    }, [duration]);

    // Video element cache for timeline playback
    const videoCacheRef = useRef(new Map()); // clipId -> HTMLVideoElement

    const getOrCreateVideo = useCallback((clip) => {
        const cid = clip.id;
        let video = videoCacheRef.current.get(cid);
        if (!video) {
            // Limit cache to 5 videos max
            if (videoCacheRef.current.size >= 5) {
                const first = videoCacheRef.current.keys().next().value;
                const old = videoCacheRef.current.get(first);
                if (old) { old.pause(); old.src = ''; old.load(); }
                videoCacheRef.current.delete(first);
            }
            video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'metadata';
            // Use existing blob URL or recreate from File ref
            const url = clip.sourceUrl || (clip._fileRef ? URL.createObjectURL(clip._fileRef) : null);
            if (!url) return null;
            video.src = url;
            videoCacheRef.current.set(cid, video);
        }
        return video;
    }, []);

    // Cleanup video cache on unmount
    useEffect(() => {
        const cache = videoCacheRef.current;
        return () => {
            cache.forEach(v => { v.pause(); v.src = ''; });
            cache.clear();
        };
    }, []);

    // Render all timeline clips onto a canvas frame at the given time
    const renderFrame = useCallback((ctx, canvas, time) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';
        ctx.globalAlpha = 1;

        const sortedClips = [...clips].sort((a, b) => a.trackIndex - b.trackIndex || a.startTime - b.startTime);

        for (const track of tracks) {
            if (track.muted || !track.visible) continue;
            const trackIdx = tracks.indexOf(track);
            const trackClips = sortedClips.filter(c => c.trackIndex === trackIdx);

            for (let ci = 0; ci < trackClips.length; ci++) {
                const clip = trackClips[ci];
                const clipEnd = clip.startTime + clip.duration;

                if (time < clip.startTime || time >= clipEnd) continue;

                const relTime = time - clip.startTime;

                // --- Transition detection ---
                const transitionDuration = 1.0;
                const endGap = clipEnd - time;

                // Check out-transition: near end of clip, next clip is adjacent or overlapping
                if (clip.transitions.out && endGap < transitionDuration && ci < trackClips.length - 1) {
                    const nextClip = trackClips[ci + 1];
                    const gap = nextClip.startTime - clipEnd;
                    // Allow transition if clips are adjacent or overlapping (within transition window)
                    if (gap <= transitionDuration) {
                        // Render transition between this and next clip
                        const fromVideo = getOrCreateVideo(clip);
                        const toVideo = getOrCreateVideo(nextClip);
                        if (fromVideo && toVideo && fromVideo.readyState >= 2 && toVideo.readyState >= 2) {
                            const progress = 1 - (endGap / transitionDuration);
                            const fromRel = time - clip.startTime;
                            const toRel = Math.max(0, time - nextClip.startTime);
                            const fromSrc = clip.sourceStart + fromRel * clip.speed;
                            const toSrc = nextClip.sourceStart + toRel * nextClip.speed;
                            if (Math.abs(fromVideo.currentTime - fromSrc) > 0.1) fromVideo.currentTime = fromSrc;
                            if (Math.abs(toVideo.currentTime - toSrc) > 0.1) toVideo.currentTime = toSrc;
                            applyTransition(clip.transitions.out, ctx, canvas, fromVideo, toVideo, progress);
                        }
                        continue; // Skip normal rendering for this clip
                    }
                }

                // --- Build merged filter params with keyframe overrides ---
                const resolvedFilters = (clip.filters || []).map(f => {
                    const merged = { ...f.params };
                    if (clip.keyframes) {
                        for (const [paramKey] of Object.entries(clip.keyframes)) {
                            if (paramKey.startsWith(f.filterId + '.')) {
                                const subKey = paramKey.slice(f.filterId.length + 1);
                                const val = getKeyframedValue(clip, paramKey, time);
                                if (val !== undefined) merged[subKey] = val;
                            }
                        }
                    }
                    return { filterId: f.filterId, params: merged };
                });

                // --- Draw the clip frame ---
                const video = getOrCreateVideo(clip);

                if (video && video.readyState >= 2) {
                    const sourceTime = clip.sourceStart + relTime * clip.speed;

                    ctx.save();

                    // Apply transform filters (mirror, flip, rotate) before drawing
                    resolvedFilters.forEach(f => {
                        if (['mirror', 'flip', 'rotate'].includes(f.filterId)) {
                            const filterObj = FILTERS[f.filterId];
                            if (filterObj && filterObj.apply) {
                                filterObj.apply(ctx, canvas, { ...getDefaultParams(f.filterId), ...f.params });
                            }
                        }
                    });

                    // Handle crop via drawImage source rectangle
                    const cropF = resolvedFilters.find(f => f.filterId === 'crop');
                    const cropX = cropF?.params?.x || 0;
                    const cropY = cropF?.params?.y || 0;
                    const cropW = cropF?.params?.w || video.videoWidth;
                    const cropH = cropF?.params?.h || video.videoHeight;

                    // Seek BEFORE drawing (fixes 1-frame lag)
                    if (Math.abs(video.currentTime - sourceTime) > 0.1) {
                        video.currentTime = sourceTime;
                    }

                    // Set CSS filter string for draw-time filters
                    const cssFilter = buildCSSFilter(resolvedFilters);
                    if (cssFilter && cssFilter !== 'none') {
                        ctx.filter = cssFilter;
                    }

                    if (cropF) {
                        ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
                    } else {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    }
                    ctx.filter = 'none';

                    // Apply image-data filters (canvas-only: opacity, pixelate, sharpen, etc.)
                    resolvedFilters.forEach(f => {
                        if (['opacity', 'pixelate', 'sharpen', 'curves', 'levels',
                             'liftgammagain', 'posterize', 'cartoon', 'glow', 'emboss',
                             'charcoal', 'chromakey', 'white-balance', 'color-grade'].includes(f.filterId)) {
                            const filterObj = FILTERS[f.filterId];
                            if (filterObj && filterObj.apply) {
                                ctx.save();
                                filterObj.apply(ctx, canvas, { ...getDefaultParams(f.filterId), ...f.params });
                                ctx.restore();
                            }
                        }
                    });

                    // Apply post-draw overlay filters
                    resolvedFilters.forEach(f => {
                        if (['vignette', 'border', 'temperature', 'tint', 'noise',
                             'filmgrain', 'oldfilm'].includes(f.filterId)) {
                            const filterObj = FILTERS[f.filterId];
                            if (filterObj && filterObj.apply) {
                                ctx.save();
                                filterObj.apply(ctx, canvas, { ...getDefaultParams(f.filterId), ...f.params });
                                ctx.restore();
                            }
                        }
                    });

                    ctx.restore();
                } else if (video) {
                    ctx.save();
                    ctx.fillStyle = clip.color || '#8b5cf6';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#fff';
                    ctx.font = '16px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('Loading...', canvas.width / 2, canvas.height / 2);
                    ctx.restore();
                } else {
                    ctx.save();
                    ctx.fillStyle = clip.color || '#8b5cf6';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#fff';
                    ctx.font = '16px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(clip.label || 'No source', canvas.width / 2, canvas.height / 2);
                    ctx.restore();
                }
            }
        }
    }, [tracks, clips, getKeyframedValue, getOrCreateVideo]);

    // Duplicate clip
    const duplicateClip = useCallback((id) => {
        const clip = clips.find(c => c.id === id);
        if (!clip) return;
        pushUndo(clips, tracks);
        const { id: _omitId, ...clipWithoutId } = clip;
        const newClip = createClip({
            ...clipWithoutId,
            startTime: clip.startTime + clip.duration,
        });
        setClips(prev => {
            const updated = [...prev, newClip];
            updateDuration(updated);
            return updated;
        });
    }, [clips, tracks, pushUndo, updateDuration]);

    // Clip speed
    const setClipSpeed = useCallback((id, speed) => {
        pushUndo(clips, tracks);
        setClips(prev => prev.map(c => {
            if (c.id !== id) return c;
            const oldSpeed = c.speed || 1;
            const newDuration = c.duration * (oldSpeed / speed);
            return { ...c, speed, duration: newDuration };
        }));
    }, [clips, tracks, pushUndo]);

    return {
        clips, tracks, currentTime, duration, selectedClipId, isPlaying, zoom,
        setSelectedClipId, setCurrentTime, setZoom,
        addClip, removeClip, updateClip, moveClip, resizeClip,
        splitAtPlayhead, duplicateClip, setClipSpeed,
        addTrack, removeTrack, toggleTrackMute, toggleTrackLock,
        addKeyframe, removeKeyframe, getKeyframedValue,
        play, pause, stop, seek,
        renderFrame,
        undo, redo, canUndo, canRedo,
    };
};
