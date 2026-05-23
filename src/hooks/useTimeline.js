import { useState, useCallback, useRef } from 'react';

let clipIdCounter = 0;

const createClip = (overrides = {}) => ({
    id: `clip_${++clipIdCounter}`,
    trackIndex: 0,
    startTime: 0,       // Position on timeline (seconds)
    duration: 10,        // Duration on timeline (seconds)
    sourceStart: 0,      // Start offset in source media
    sourceEnd: 10,       // End offset in source media
    speed: 1.0,          // Playback speed
    filters: [],         // Applied filters [{type, params}]
    transitions: { in: null, out: null },
    label: '',
    color: '#8b5cf6',
    type: 'video',       // 'video', 'audio', 'text', 'overlay'
    ...overrides,
});

export const useTimeline = () => {
    const [clips, setClips] = useState([]);
    const [tracks, setTracks] = useState([
        { id: 'track_0', name: 'Screen', type: 'video', muted: false, locked: false, visible: true },
        { id: 'track_1', name: 'Webcam', type: 'video', muted: false, locked: false, visible: true },
        { id: 'track_2', name: 'Audio', type: 'audio', muted: false, locked: false, visible: true },
    ]);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [selectedClipId, setSelectedClipId] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [zoom, setZoom] = useState(1);
    const playIntervalRef = useRef(null);

    // Add a clip to a track
    const addClip = useCallback((trackIndex, clipData) => {
        const clip = createClip({ trackIndex, ...clipData });
        setClips(prev => {
            const updated = [...prev, clip];
            const maxEnd = Math.max(...updated.map(c => c.startTime + c.duration), 0);
            setDuration(maxEnd);
            return updated;
        });
        return clip;
    }, []);

    // Remove a clip
    const removeClip = useCallback((clipId) => {
        setClips(prev => prev.filter(c => c.id !== clipId));
        if (selectedClipId === clipId) setSelectedClipId(null);
    }, [selectedClipId]);

    // Update a clip
    const updateClip = useCallback((clipId, updates) => {
        setClips(prev => prev.map(c => c.id === clipId ? { ...c, ...updates } : c));
    }, []);

    // Split clip at current playhead
    const splitAtPlayhead = useCallback(() => {
        if (!selectedClipId) return;
        const clip = clips.find(c => c.id === selectedClipId);
        if (!clip) return;

        const splitPoint = currentTime;
        if (splitPoint <= clip.startTime || splitPoint >= clip.startTime + clip.duration) return;

        const leftDuration = splitPoint - clip.startTime;
        const rightDuration = clip.duration - leftDuration;
        const sourceSplit = clip.sourceStart + (leftDuration * clip.speed);

        const leftClip = { ...clip, duration: leftDuration, sourceEnd: sourceSplit };
        const rightClip = createClip({
            ...clip,
            id: undefined,
            startTime: splitPoint,
            duration: rightDuration,
            sourceStart: sourceSplit,
            sourceEnd: clip.sourceEnd,
        });

        setClips(prev => {
            const updated = prev.filter(c => c.id !== clipId);
            return [...updated, leftClip, rightClip];
        });
    }, [clips, selectedClipId, currentTime]);

    // Delete selected clip
    const deleteSelected = useCallback(() => {
        if (selectedClipId) removeClip(selectedClipId);
    }, [selectedClipId, removeClip]);

    // Move clip to a different position/track
    const moveClip = useCallback((clipId, newStartTime, newTrackIndex) => {
        setClips(prev => prev.map(c => {
            if (c.id !== clipId) return c;
            return {
                ...c,
                startTime: Math.max(0, newStartTime),
                trackIndex: newTrackIndex !== undefined ? newTrackIndex : c.trackIndex,
            };
        }));
    }, []);

    // Resize clip (change duration by dragging edge)
    const resizeClip = useCallback((clipId, newDuration, anchorEnd = false) => {
        setClips(prev => prev.map(c => {
            if (c.id !== clipId) return c;
            const clampedDuration = Math.max(0.1, newDuration);
            if (anchorEnd) {
                return {
                    ...c,
                    startTime: c.startTime + c.duration - clampedDuration,
                    duration: clampedDuration,
                };
            }
            return { ...c, duration: clampedDuration };
        }));
    }, []);

    // Add filter to a clip
    const addFilterToClip = useCallback((clipId, filterType, params = {}) => {
        setClips(prev => prev.map(c => {
            if (c.id !== clipId) return c;
            return { ...c, filters: [...c.filters, { type: filterType, params }] };
        }));
    }, []);

    // Remove filter from clip
    const removeFilterFromClip = useCallback((clipId, filterIndex) => {
        setClips(prev => prev.map(c => {
            if (c.id !== clipId) return c;
            return { ...c, filters: c.filters.filter((_, i) => i !== filterIndex) };
        }));
    }, []);

    // Update filter params
    const updateFilterParams = useCallback((clipId, filterIndex, params) => {
        setClips(prev => prev.map(c => {
            if (c.id !== clipId) return c;
            const filters = c.filters.map((f, i) =>
                i === filterIndex ? { ...f, params: { ...f.params, ...params } } : f
            );
            return { ...c, filters };
        }));
    }, []);

    // Playback control
    const play = useCallback(() => {
        if (playIntervalRef.current) clearInterval(playIntervalRef.current);
        setIsPlaying(true);
        const startTime = Date.now();
        const startPos = currentTime;
        const totalDuration = Math.max(...clips.map(c => c.startTime + c.duration), 0);

        playIntervalRef.current = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const newPos = startPos + elapsed;
            if (newPos >= totalDuration) {
                setCurrentTime(0);
                setIsPlaying(false);
                clearInterval(playIntervalRef.current);
                playIntervalRef.current = null;
            } else {
                setCurrentTime(newPos);
            }
        }, 1000 / 30);
    }, [currentTime, clips]);

    const pause = useCallback(() => {
        setIsPlaying(false);
        if (playIntervalRef.current) {
            clearInterval(playIntervalRef.current);
            playIntervalRef.current = null;
        }
    }, []);

    const stop = useCallback(() => {
        pause();
        setCurrentTime(0);
    }, [pause]);

    const seek = useCallback((time) => {
        setCurrentTime(Math.max(0, time));
    }, []);

    // Get clips at current time (for rendering)
    const getClipsAtTime = useCallback((time) => {
        return clips.filter(c => time >= c.startTime && time < c.startTime + c.duration);
    }, [clips]);

    // Get selected clip
    const selectedClip = clips.find(c => c.id === selectedClipId) || null;

    return {
        // State
        clips,
        tracks,
        currentTime,
        duration,
        selectedClipId,
        selectedClip,
        isPlaying,
        zoom,

        // Actions
        addClip,
        removeClip,
        updateClip,
        splitAtPlayhead,
        deleteSelected,
        moveClip,
        resizeClip,
        setSelectedClipId,
        setZoom,

        // Filters
        addFilterToClip,
        removeFilterFromClip,
        updateFilterParams,

        // Playback
        play,
        pause,
        stop,
        seek,

        // Queries
        getClipsAtTime,
    };
};
