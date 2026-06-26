import { useCallback, useRef, useEffect } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { FILTERS, buildCSSFilter, getDefaultParams } from '../utils/FilterEngine';
import { applyTransition } from '../utils/Transitions';

// Thin wrapper around Zustand store for backwards compatibility
// All new components should migrate to useTimelineStore directly
export const useTimeline = () => {
    const store = useTimelineStore();
    const videoCacheRef = useRef(new Map());

    const getOrCreateVideo = useCallback((clip) => {
        let video = videoCacheRef.current.get(clip.id);
        if (!video) {
            if (videoCacheRef.current.size >= 2) {
                const first = videoCacheRef.current.keys().next().value;
                const old = videoCacheRef.current.get(first);
                if (old) { old.pause(); old.removeAttribute('src'); old.load(); }
                videoCacheRef.current.delete(first);
            }
            video = document.createElement('video');
            video.muted = true; video.playsInline = true; video.preload = 'metadata';
            const url = clip.sourceUrl || (clip._fileRef ? URL.createObjectURL(clip._fileRef) : null);
            if (!url) return null;
            video.src = url;
            videoCacheRef.current.set(clip.id, video);
        }
        return video;
    }, []);

    useEffect(() => {
        const cache = videoCacheRef.current;
        return () => {
            cache.forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
            cache.clear();
        };
    }, []);

    const playRafRef = useRef(null);
    const playStartTimeRef = useRef(0);
    const playStartCurrentRef = useRef(0);

    const play = useCallback(() => {
        if (playRafRef.current) return;
        useTimelineStore.setState({ isPlaying: true });
        playStartTimeRef.current = performance.now();
        playStartCurrentRef.current = useTimelineStore.getState().currentTime;

        const tick = () => {
            const elapsed = (performance.now() - playStartTimeRef.current) / 1000;
            const newTime = playStartCurrentRef.current + elapsed;
            const dur = useTimelineStore.getState().duration;
            if (newTime >= dur) {
                useTimelineStore.setState({ currentTime: dur, isPlaying: false });
                playRafRef.current = null;
                return;
            }
            useTimelineStore.setState({ currentTime: newTime });
            playRafRef.current = requestAnimationFrame(tick);
        };
        playRafRef.current = requestAnimationFrame(tick);
    }, []);

    const pause = useCallback(() => {
        if (playRafRef.current) {
            cancelAnimationFrame(playRafRef.current);
            playRafRef.current = null;
        }
        useTimelineStore.setState({ isPlaying: false });
    }, []);

    const stop = useCallback(() => {
        pause();
        useTimelineStore.setState({ currentTime: 0 });
    }, [pause]);

    const getKeyframedValueLocal = useCallback((clip, paramKey, time) => {
        const kfs = clip.keyframes?.[paramKey];
        if (!kfs || kfs.length === 0) return undefined;
        if (kfs.length === 1) return kfs[0].value;
        const relTime = time - clip.startTime;
        let prev = null, next = null;
        for (const kf of kfs) {
            if (kf.time <= relTime) prev = kf;
            if (kf.time >= relTime && !next) next = kf;
        }
        if (!prev) return next.value;
        if (!next) return prev.value;
        if (prev.time === next.time) return prev.value;
        const t = (relTime - prev.time) / (next.time - prev.time);
        let factor = t;
        if (next.interpolation === 'ease-in') factor = t * t;
        else if (next.interpolation === 'ease-out') factor = 1 - (1 - t) * (1 - t);
        else if (next.interpolation === 'ease-in-out') factor = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        return prev.value + (next.value - prev.value) * factor;
    }, []);

    const renderFrame = useCallback((ctx, canvas, time) => {
        const { clips, tracks } = useTimelineStore.getState();

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
                const transitionDuration = 1.0;
                const endGap = clipEnd - time;

                if (clip.transitions.out && endGap < transitionDuration && ci < trackClips.length - 1) {
                    const nextClip = trackClips[ci + 1];
                    const gap = nextClip.startTime - clipEnd;
                    if (gap <= transitionDuration) {
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
                        continue;
                    }
                }

                const resolvedFilters = (clip.filters || []).map(f => {
                    const merged = { ...f.params };
                    if (clip.keyframes) {
                        for (const [paramKey] of Object.entries(clip.keyframes)) {
                            if (paramKey.startsWith(f.filterId + '.')) {
                                const subKey = paramKey.slice(f.filterId.length + 1);
                                const val = getKeyframedValueLocal(clip, paramKey, time);
                                if (val !== undefined) merged[subKey] = val;
                            }
                        }
                    }
                    return { filterId: f.filterId, params: merged };
                });

                const video = getOrCreateVideo(clip);

                if (video && video.readyState >= 2) {
                    const sourceTime = clip.sourceStart + relTime * clip.speed;
                    ctx.save();

                    resolvedFilters.forEach(f => {
                        if (['mirror', 'flip', 'rotate'].includes(f.filterId)) {
                            const filterObj = FILTERS[f.filterId];
                            if (filterObj && filterObj.apply) {
                                filterObj.apply(ctx, canvas, { ...getDefaultParams(f.filterId), ...f.params });
                            }
                        }
                    });

                    const cropF = resolvedFilters.find(f => f.filterId === 'crop');
                    const cropX = cropF?.params?.x || 0;
                    const cropY = cropF?.params?.y || 0;
                    const cropW = cropF?.params?.w || video.videoWidth;
                    const cropH = cropF?.params?.h || video.videoHeight;

                    if (Math.abs(video.currentTime - sourceTime) > 0.1) {
                        video.currentTime = sourceTime;
                    }

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
    }, [getOrCreateVideo, getKeyframedValueLocal]);

    return {
        clips: store.clips,
        tracks: store.tracks,
        currentTime: store.currentTime,
        duration: store.duration,
        selectedClipId: store.selectedClipId,
        isPlaying: store.isPlaying,
        zoom: store.zoom,
        canUndo: store.canUndo,
        canRedo: store.canRedo,

        setSelectedClipId: store.setSelectedClipId,
        setCurrentTime: store.setCurrentTime,
        setZoom: store.setZoom,
        addClip: store.addClip,
        removeClip: store.removeClip,
        updateClip: store.updateClip,
        moveClip: store.moveClip,
        resizeClip: store.resizeClip,
        splitAtPlayhead: store.splitAtPlayhead,
        duplicateClip: store.duplicateClip,
        setClipSpeed: store.setClipSpeed,
        addTrack: store.addTrack,
        removeTrack: store.removeTrack,
        toggleTrackMute: store.toggleTrackMute,
        toggleTrackLock: store.toggleTrackLock,
        addKeyframe: store.addKeyframe,
        removeKeyframe: store.removeKeyframe,
        undo: store.undo,
        redo: store.redo,

        play, pause, stop,
        seek: store.seek,
        renderFrame,
        getOrCreateVideo,
        videoCacheRef,
        loadProject: store.loadProject,
    };
};
