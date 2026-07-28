import { create } from 'zustand';

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
    keyframes: {},
    label: '',
    color: '#8b5cf6',
    type: 'video',
    audioOffset: 0,
    audioDuration: null,
    ...overrides,
});

const MAX_UNDO = 50;

const computeDuration = (clips) => {
    if (clips.length === 0) return 0;
    return Math.max(...clips.map(c => c.startTime + c.duration));
};

export const useTimelineStore = create((set, get) => ({
    clips: [],
    tracks: [
        { id: 'track_0', name: 'Timeline', type: 'video', muted: false, locked: false, visible: true },
    ],
    currentTime: 0,
    duration: 0,
    selectedClipId: null,
    isPlaying: false,
    zoom: 1,
    magneticMode: true,
    markers: [],
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
    _isUndoRedo: false,
    zoomPanRegions: [],
    cursorEvents: [],
    cursorTelemetry: null,
    cursorSettings: {
        smoothing: 0.5,
        magnify: false,
        magnifyRadius: 80,
        magnifyZoom: 2.0,
        spotlight: false,
        spotlightRadius: 120,
        clickRipples: true,
        clickColor: '#fbbf24',
        highlight: true,
        highlightRadius: 24,
    },
    annotations: [],
    animations: [],
    clipboard: null, // For copy/paste

    // === SLICE OPERATIONS (from OpenShot) ===
    sliceAtPlayhead: (mode = 'keepBoth') => {
        const state = get();
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (!clip) return;
        const t = state.currentTime;
        if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;

        const splitPoint = t - clip.startTime;
        const leftDuration = splitPoint;
        const rightDuration = clip.duration - splitPoint;

        if (mode === 'keepLeft') {
            // Keep only left part
            const newClips = state.clips.map(c => {
                if (c.id !== state.selectedClipId) return c;
                return { ...c, duration: leftDuration, sourceEnd: c.sourceStart + leftDuration * (c.speed || 1) };
            });
            set({ clips: newClips, duration: computeDuration(newClips) });
        } else if (mode === 'keepRight') {
            // Keep only right part
            const newClips = state.clips.map(c => {
                if (c.id !== state.selectedClipId) return c;
                return {
                    ...c,
                    startTime: t,
                    duration: rightDuration,
                    sourceStart: c.sourceStart + leftDuration * (c.speed || 1),
                };
            });
            set({ clips: newClips, duration: computeDuration(newClips) });
        } else {
            // Keep both (split into two clips)
            const leftClip = { ...clip, duration: leftDuration, sourceEnd: clip.sourceStart + leftDuration * (clip.speed || 1) };
            const rightClip = createClip({
                ...clip,
                id: undefined,
                startTime: t,
                duration: rightDuration,
                sourceStart: clip.sourceStart + leftDuration * (clip.speed || 1),
                sourceEnd: clip.sourceEnd,
            });
            const newClips = state.clips.flatMap(c => {
                if (c.id !== state.selectedClipId) return [c];
                return [leftClip, rightClip];
            });
            set({ clips: newClips, duration: computeDuration(newClips) });
        }
        // Save undo
        set({
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    // === COPY/PASTE (from OpenShot) ===
    copyClip: () => {
        const state = get();
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (clip) {
            set({ clipboard: JSON.parse(JSON.stringify(clip)) });
        }
    },

    pasteClip: () => {
        const state = get();
        if (!state.clipboard) return;
        const pastedClip = createClip({
            ...state.clipboard,
            id: undefined,
            startTime: state.currentTime,
        });
        const newClips = [...state.clips, pastedClip];
        set({
            clips: newClips,
            duration: computeDuration(newClips),
            selectedClipId: pastedClip.id,
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    cutClip: () => {
        const state = get();
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (clip) {
            set({ clipboard: JSON.parse(JSON.stringify(clip)) });
            // Remove the clip
            const newClips = state.clips.filter(c => c.id !== state.selectedClipId);
            set({
                clips: newClips,
                duration: computeDuration(newClips),
                selectedClipId: null,
                clipboard: get().clipboard,
                undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
                redoStack: [],
                canUndo: true,
                canRedo: false,
            });
        }
    },

    // === RIPPLE DELETE (from OpenShot) ===
    rippleDelete: () => {
        const state = get();
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (!clip) return;

        const clipEnd = clip.startTime + clip.duration;
        const newClips = state.clips
            .filter(c => c.id !== state.selectedClipId)
            .map(c => {
                // Shift clips that are after the deleted clip on the same track
                if (c.trackIndex === clip.trackIndex && c.startTime >= clipEnd) {
                    return { ...c, startTime: c.startTime - clip.duration };
                }
                return c;
            });

        set({
            clips: newClips,
            duration: computeDuration(newClips),
            selectedClipId: null,
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    // === UNDO/REDO ===
    undo: () => {
        const state = get();
        if (state.undoStack.length === 0) return;
        const prev = state.undoStack[state.undoStack.length - 1];
        set({
            clips: prev.clips,
            tracks: prev.tracks,
            duration: computeDuration(prev.clips),
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [...state.redoStack, { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            canUndo: state.undoStack.length > 1,
            canRedo: true,
        });
    },

    redo: () => {
        const state = get();
        if (state.redoStack.length === 0) return;
        const next = state.redoStack[state.redoStack.length - 1];
        set({
            clips: next.clips,
            tracks: next.tracks,
            duration: computeDuration(next.clips),
            redoStack: state.redoStack.slice(0, -1),
            undoStack: [...state.undoStack, { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            canUndo: true,
            canRedo: state.redoStack.length > 1,
        });
    },

    // === FADE IN/OUT (from OpenShot) ===
    fadeIn: (clipId, duration = 1) => {
        const state = get();
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;
        const filters = [...(clip.filters || [])];
        const existingIdx = filters.findIndex(f => f.filterId === 'fadeIn');
        const fadeFilter = { filterId: 'fadeIn', params: { duration } };
        if (existingIdx >= 0) {
            filters[existingIdx] = fadeFilter;
        } else {
            filters.push(fadeFilter);
        }
        set({
            clips: state.clips.map(c => c.id === clipId ? { ...c, filters } : c),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    fadeOut: (clipId, duration = 1) => {
        const state = get();
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;
        const filters = [...(clip.filters || [])];
        const existingIdx = filters.findIndex(f => f.filterId === 'fadeOut');
        const fadeFilter = { filterId: 'fadeOut', params: { duration } };
        if (existingIdx >= 0) {
            filters[existingIdx] = fadeFilter;
        } else {
            filters.push(fadeFilter);
        }
        set({
            clips: state.clips.map(c => c.id === clipId ? { ...c, filters } : c),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    fadeInOut: (clipId, duration = 1) => {
        const state = get();
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;
        const filters = [...(clip.filters || [])];
        const fadeIdx = filters.findIndex(f => f.filterId === 'fadeIn');
        const fadeOutIdx = filters.findIndex(f => f.filterId === 'fadeOut');
        const fadeInFilter = { filterId: 'fadeIn', params: { duration } };
        const fadeOutFilter = { filterId: 'fadeOut', params: { duration } };
        if (fadeIdx >= 0) filters[fadeIdx] = fadeInFilter;
        else filters.push(fadeInFilter);
        if (fadeOutIdx >= 0) filters[fadeOutIdx] = fadeOutFilter;
        else filters.push(fadeOutFilter);
        set({
            clips: state.clips.map(c => c.id === clipId ? { ...c, filters } : c),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    removeFade: (clipId) => {
        const state = get();
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;
        const filters = (clip.filters || []).filter(f => f.filterId !== 'fadeIn' && f.filterId !== 'fadeOut');
        set({
            clips: state.clips.map(c => c.id === clipId ? { ...c, filters } : c),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    // === ROTATION PRESETS (from OpenShot) ===
    rotateClip: (clipId, degrees) => {
        const state = get();
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;
        const filters = [...(clip.filters || [])];
        const existingIdx = filters.findIndex(f => f.filterId === 'rotate');
        const rotateFilter = { filterId: 'rotate', params: { degrees } };
        if (existingIdx >= 0) {
            filters[existingIdx] = rotateFilter;
        } else {
            filters.push(rotateFilter);
        }
        set({
            clips: state.clips.map(c => c.id === clipId ? { ...c, filters } : c),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    // === SLICE ALL (from OpenShot) ===
    sliceAllAtPlayhead: (mode = 'keepBoth') => {
        const state = get();
        const t = state.currentTime;
        const newClips = [];

        state.clips.forEach(clip => {
            if (t <= clip.startTime || t >= clip.startTime + clip.duration) {
                newClips.push(clip);
                return;
            }

            const leftDuration = t - clip.startTime;
            const rightDuration = clip.duration - leftDuration;
            const speed = clip.speed || 1;

            if (mode === 'keepLeft') {
                newClips.push({ ...clip, duration: leftDuration, sourceEnd: clip.sourceStart + leftDuration * speed });
            } else if (mode === 'keepRight') {
                newClips.push({ ...clip, startTime: t, duration: rightDuration, sourceStart: clip.sourceStart + leftDuration * speed });
            } else {
                // Keep both
                newClips.push({ ...clip, duration: leftDuration, sourceEnd: clip.sourceStart + leftDuration * speed });
                newClips.push(createClip({
                    ...clip,
                    id: undefined,
                    startTime: t,
                    duration: rightDuration,
                    sourceStart: clip.sourceStart + leftDuration * speed,
                    sourceEnd: clip.sourceEnd,
                }));
            }
        });

        set({
            clips: newClips,
            duration: computeDuration(newClips),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    // === REMOVE GAP (from OpenShot) ===
    removeGap: (trackIndex) => {
        const state = get();
        const t = state.currentTime;
        const trackClips = state.clips
            .filter(c => c.trackIndex === trackIndex)
            .sort((a, b) => a.startTime - b.startTime);

        // Find gap at playhead
        for (let i = 0; i < trackClips.length - 1; i++) {
            const currentEnd = trackClips[i].startTime + trackClips[i].duration;
            const nextStart = trackClips[i + 1].startTime;
            if (nextStart > currentEnd && t >= currentEnd && t <= nextStart) {
                const gapDuration = nextStart - currentEnd;
                const newClips = state.clips.map(c => {
                    if (c.trackIndex === trackIndex && c.startTime >= nextStart) {
                        return { ...c, startTime: c.startTime - gapDuration };
                    }
                    return c;
                });
                set({
                    clips: newClips,
                    duration: computeDuration(newClips),
                    undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
                    redoStack: [],
                    canUndo: true,
                    canRedo: false,
                });
                return;
            }
        }
    },

    removeAllGaps: (trackIndex) => {
        const state = get();
        const trackClips = state.clips
            .filter(c => c.trackIndex === trackIndex)
            .sort((a, b) => a.startTime - b.startTime);

        let offset = 0;
        const newClips = state.clips.map(c => {
            if (c.trackIndex !== trackIndex) return c;
            const newStart = offset;
            offset += c.duration;
            return { ...c, startTime: newStart };
        });

        set({
            clips: newClips,
            duration: computeDuration(newClips),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    // === NUDGE (from OpenShot) ===
    nudgeClip: (clipId, deltaFrames, fps = 30) => {
        const state = get();
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;
        const deltaTime = deltaFrames / fps;
        const newStart = Math.max(0, clip.startTime + deltaTime);
        set({
            clips: state.clips.map(c => c.id === clipId ? { ...c, startTime: newStart } : c),
            duration: computeDuration(state.clips.map(c => c.id === clipId ? { ...c, startTime: newStart } : c)),
        });
    },

    // === SAVE UNDO SNAPSHOT ===
    saveUndo: () => {
        const state = get();
        set({
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    addClip: (trackIndex, clipData) => {
        const state = get();
        const clip = createClip({ trackIndex, ...clipData });
        const newClips = [...state.clips, clip];
        set({
            clips: newClips,
            duration: computeDuration(newClips),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
        return clip;
    },

    removeClip: (id) => {
        const state = get();
        const clip = state.clips.find(c => c.id === id);
        if (!clip) return;
        const newClips = state.clips.filter(c => c.id !== id);
        if (state.magneticMode && clip) {
            const gap = clip.duration;
            const removedEnd = clip.startTime + clip.duration;
            newClips.forEach(c => {
                if (c.trackIndex === clip.trackIndex && c.startTime >= removedEnd) {
                    c.startTime -= gap;
                }
            });
        }
        set({
            clips: newClips,
            duration: computeDuration(newClips),
            selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    updateClip: (id, updates) => {
        const state = get();
        const newClips = state.clips.map(c => c.id === id ? { ...c, ...updates } : c);
        set({
            clips: newClips,
            duration: computeDuration(newClips),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    moveClip: (id, newStartTime, newTrackIndex) => {
        set(state => ({
            clips: state.clips.map(c => {
                if (c.id !== id) return c;
                return {
                    ...c,
                    startTime: Math.max(0, newStartTime),
                    ...(newTrackIndex !== undefined ? { trackIndex: newTrackIndex } : {}),
                };
            }),
        }));
    },

    resizeClip: (id, newDuration, fromLeft = false) => {
        set(state => ({
            clips: state.clips.map(c => {
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
            }),
        }));
    },

    splitAtPlayhead: () => {
        const state = get();
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (!clip) return;
        const splitTime = state.currentTime;
        if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) return;
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
            audioOffset: clip.audioOffset,
            audioDuration: clip.audioDuration ? clip.audioDuration - leftDuration : null,
        });
        const newClips = state.clips.map(c => c.id === state.selectedClipId
            ? { ...c, duration: leftDuration, sourceEnd: clip.sourceStart + leftDuration * clip.speed, audioDuration: leftDuration }
            : c
        );
        set({
            clips: [...newClips, rightClip],
            duration: computeDuration([...newClips, rightClip]),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    duplicateClip: (id) => {
        const state = get();
        const clip = state.clips.find(c => c.id === id);
        if (!clip) return;
        const { id: _omitId, ...clipWithoutId } = clip;
        const newClip = createClip({
            ...clipWithoutId,
            startTime: clip.startTime + clip.duration,
        });
        const newClips = [...state.clips, newClip];
        set({
            clips: newClips,
            duration: computeDuration(newClips),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    setClipSpeed: (id, speed) => {
        const state = get();
        const newClips = state.clips.map(c => {
            if (c.id !== id) return c;
            const oldSpeed = c.speed || 1;
            const newDuration = c.duration * (oldSpeed / speed);
            return { ...c, speed, duration: newDuration };
        });
        set({
            clips: newClips,
            duration: computeDuration(newClips),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    setAudioOffset: (clipId, offset) => {
        set(state => ({
            clips: state.clips.map(c => c.id === clipId ? { ...c, audioOffset: offset } : c),
        }));
    },

    setAudioDuration: (clipId, dur) => {
        set(state => ({
            clips: state.clips.map(c => c.id === clipId ? { ...c, audioDuration: dur } : c),
        }));
    },

    trimStartToPlayhead: () => {
        const state = get();
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (!clip) return;
        if (state.currentTime <= clip.startTime || state.currentTime >= clip.startTime + clip.duration) return;
        const trimAmount = state.currentTime - clip.startTime;
        const newClips = state.clips.map(c => {
            if (c.id !== state.selectedClipId) return c;
            return {
                ...c,
                startTime: state.currentTime,
                duration: c.duration - trimAmount,
                sourceStart: c.sourceStart + trimAmount * c.speed,
            };
        });
        if (state.magneticMode) {
            newClips.forEach(c => {
                if (c.trackIndex === clip.trackIndex && c.id !== state.selectedClipId && c.startTime > clip.startTime) {
                    c.startTime -= trimAmount;
                }
            });
        }
        set({
            clips: newClips,
            duration: computeDuration(newClips),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    trimEndToPlayhead: () => {
        const state = get();
        if (!state.selectedClipId) return;
        const clip = state.clips.find(c => c.id === state.selectedClipId);
        if (!clip) return;
        if (state.currentTime <= clip.startTime || state.currentTime >= clip.startTime + clip.duration) return;
        const clipEnd = clip.startTime + clip.duration;
        const trimAmount = clipEnd - state.currentTime;
        const newClips = state.clips.map(c => {
            if (c.id !== state.selectedClipId) return c;
            return { ...c, duration: c.duration - trimAmount };
        });
        if (state.magneticMode) {
            newClips.forEach(c => {
                if (c.trackIndex === clip.trackIndex && c.id !== state.selectedClipId && c.startTime > clipEnd) {
                    c.startTime -= trimAmount;
                }
            });
        }
        set({
            clips: newClips,
            duration: computeDuration(newClips),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    rollTrim: (clipId, deltaTime) => {
        const state = get();
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;
        const adjacent = state.clips.find(c =>
            c.trackIndex === clip.trackIndex &&
            c.id !== clipId &&
            Math.abs(c.startTime - (clip.startTime + clip.duration)) < 0.01
        );
        if (!adjacent) return;
        const newDuration = Math.max(0.1, clip.duration + deltaTime);
        const adjDuration = Math.max(0.1, adjacent.duration - deltaTime);
        set({
            clips: state.clips.map(c => {
                if (c.id === clipId) return { ...c, duration: newDuration };
                if (c.id === adjacent.id) return { ...c, startTime: clip.startTime + newDuration, duration: adjDuration };
                return c;
            }),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    addTrack: (name = 'New Track', type = 'video') => {
        const state = get();
        const id = `track_${Date.now()}`;
        set({
            tracks: [...state.tracks, { id, name, type, muted: false, locked: false, visible: true }],
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    removeTrack: (trackId) => {
        const state = get();
        const trackIndex = state.tracks.findIndex(t => t.id === trackId);
        if (trackIndex < 0) return;
        const newTracks = state.tracks.filter(t => t.id !== trackId);
        const newClips = state.clips
            .filter(c => c.trackIndex !== trackIndex)
            .map(c => ({
                ...c,
                trackIndex: c.trackIndex > trackIndex ? c.trackIndex - 1 : c.trackIndex,
            }));
        set({
            tracks: newTracks,
            clips: newClips,
            duration: computeDuration(newClips),
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    toggleTrackMute: (trackId) => {
        set(state => ({
            tracks: state.tracks.map(t => t.id === trackId ? { ...t, muted: !t.muted } : t),
        }));
    },

    toggleTrackLock: (trackId) => {
        set(state => ({
            tracks: state.tracks.map(t => t.id === trackId ? { ...t, locked: !t.locked } : t),
        }));
    },

    setCurrentTime: (time) => set({ currentTime: Math.max(0, time) }),
    seek: (time) => {
        const dur = get().duration;
        set({ currentTime: Math.max(0, Math.min(time, dur)) });
    },
    setDuration: (d) => set({ duration: d }),
    setSelectedClipId: (id) => set({ selectedClipId: id }),
    setZoom: (z) => set({ zoom: typeof z === 'function' ? z(get().zoom) : z }),
    toggleMagneticMode: () => set(state => ({ magneticMode: !state.magneticMode })),

    addMarker: (time, color = '#f59e0b', label = '') => {
        const marker = { id: `marker_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, time, color, label };
        set(state => ({ markers: [...state.markers, marker] }));
        return marker;
    },

    removeMarker: (id) => {
        set(state => ({ markers: state.markers.filter(m => m.id !== id) }));
    },

    updateMarker: (id, updates) => {
        set(state => ({
            markers: state.markers.map(m => m.id === id ? { ...m, ...updates } : m),
        }));
    },

    moveMarker: (id, newTime) => {
        set(state => ({
            markers: state.markers.map(m => m.id === id ? { ...m, time: Math.max(0, newTime) } : m),
        }));
    },

    // Zoom-pan regions
    addZoomPanRegion: (region) => {
        const id = `zp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        set(state => ({
            zoomPanRegions: [...state.zoomPanRegions, { id, ...region }],
        }));
        return id;
    },

    updateZoomPanRegion: (id, updates) => {
        set(state => ({
            zoomPanRegions: state.zoomPanRegions.map(r => r.id === id ? { ...r, ...updates } : r),
        }));
    },

    removeZoomPanRegion: (id) => {
        set(state => ({
            zoomPanRegions: state.zoomPanRegions.filter(r => r.id !== id),
        }));
    },

    // Cursor events
    addCursorEvent: (event) => {
        const id = `cursor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        set(state => ({
            cursorEvents: [...state.cursorEvents, { id, ...event }],
        }));
        return id;
    },

    updateCursorEvent: (id, updates) => {
        set(state => ({
            cursorEvents: state.cursorEvents.map(e => e.id === id ? { ...e, ...updates } : e),
        }));
    },

    removeCursorEvent: (id) => {
        set(state => ({
            cursorEvents: state.cursorEvents.filter(e => e.id !== id),
        }));
    },

    setCursorTelemetry: (telemetry) => set({ cursorTelemetry: telemetry }),
    setCursorSettings: (settings) => set((state) => ({
        cursorSettings: { ...state.cursorSettings, ...settings },
    })),

    // Annotations/callouts
    addAnnotation: (annotation) => {
        const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        set(state => ({
            annotations: [...state.annotations, { id, ...annotation }],
        }));
        return id;
    },

    updateAnnotation: (id, updates) => {
        set(state => ({
            annotations: state.annotations.map(a => a.id === id ? { ...a, ...updates } : a),
        }));
    },

    removeAnnotation: (id) => {
        set(state => ({
            annotations: state.annotations.filter(a => a.id !== id),
        }));
    },

    // Animations
    addAnimation: (animation) => {
        const id = `anim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        set(state => ({
            animations: [...state.animations, { id, ...animation }],
        }));
        return id;
    },

    updateAnimation: (id, updates) => {
        set(state => ({
            animations: state.animations.map(a => a.id === id ? { ...a, ...updates } : a),
        }));
    },

    removeAnimation: (id) => {
        set(state => ({
            animations: state.animations.filter(a => a.id !== id),
        }));
    },

    undo: () => {
        const state = get();
        if (state.undoStack.length === 0 || state._isUndoRedo) return;
        const snapshot = state.undoStack[state.undoStack.length - 1];
        const newUndo = state.undoStack.slice(0, -1);
        set({ _isUndoRedo: true });
        set({
            clips: snapshot.clips,
            tracks: snapshot.tracks,
            duration: computeDuration(snapshot.clips),
            undoStack: newUndo,
            redoStack: [...state.redoStack, { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            canUndo: newUndo.length > 0,
            canRedo: true,
            _isUndoRedo: false,
        });
    },

    redo: () => {
        const state = get();
        if (state.redoStack.length === 0 || state._isUndoRedo) return;
        const snapshot = state.redoStack[state.redoStack.length - 1];
        const newRedo = state.redoStack.slice(0, -1);
        set({ _isUndoRedo: true });
        set({
            clips: snapshot.clips,
            tracks: snapshot.tracks,
            duration: computeDuration(snapshot.clips),
            redoStack: newRedo,
            undoStack: [...state.undoStack, { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            canUndo: true,
            canRedo: newRedo.length > 0,
            _isUndoRedo: false,
        });
    },

    addKeyframe: (clipId, paramKey, time, value, interpolation = 'linear') => {
        const state = get();
        const newClips = state.clips.map(c => {
            if (c.id !== clipId) return c;
            const kfs = { ...c.keyframes };
            const arr = [...(kfs[paramKey] || [])];
            const idx = arr.findIndex(k => k.time >= time);
            if (idx >= 0 && arr[idx].time === time) {
                arr[idx] = { time, value, interpolation };
            } else {
                arr.splice(idx >= 0 ? idx : arr.length, 0, { time, value, interpolation });
            }
            kfs[paramKey] = arr;
            return { ...c, keyframes: kfs };
        });
        set({
            clips: newClips,
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    removeKeyframe: (clipId, paramKey, time) => {
        const state = get();
        const newClips = state.clips.map(c => {
            if (c.id !== clipId) return c;
            const kfs = { ...c.keyframes };
            kfs[paramKey] = (kfs[paramKey] || []).filter(k => k.time !== time);
            return { ...c, keyframes: kfs };
        });
        set({
            clips: newClips,
            undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), { clips: JSON.parse(JSON.stringify(state.clips)), tracks: JSON.parse(JSON.stringify(state.tracks)) }],
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    getKeyframedValue: (clip, paramKey, time) => {
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
    },

    loadProject: (projectClips, projectTracks) => {
        set({
            clips: projectClips || [],
            tracks: projectTracks || get().tracks,
            duration: computeDuration(projectClips || []),
            undoStack: [],
            redoStack: [],
            canUndo: false,
            canRedo: false,
        });
    },

    reset: () => {
        clipIdCounter = 0;
        set({
            clips: [],
            currentTime: 0,
            duration: 0,
            selectedClipId: null,
            isPlaying: false,
            zoom: 1,
            magneticMode: true,
            markers: [],
            undoStack: [],
            redoStack: [],
            canUndo: false,
            canRedo: false,
            zoomPanRegions: [],
            cursorEvents: [],
            annotations: [],
            animations: [],
        });
    },
}));
