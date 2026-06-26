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
        { id: 'track_0', name: 'Video 1', type: 'video', muted: false, locked: false, visible: true },
        { id: 'track_1', name: 'Video 2', type: 'video', muted: false, locked: false, visible: true },
        { id: 'track_2', name: 'Screen', type: 'video', muted: false, locked: false, visible: true },
        { id: 'track_3', name: 'Webcam', type: 'video', muted: false, locked: false, visible: true },
        { id: 'track_4', name: 'Audio', type: 'audio', muted: false, locked: false, visible: true },
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

    undo: () => {
        const state = get();
        if (state.undoStack.length === 0 || state._isUndoRedo) return;
        const snapshot = state.undoStack[state.undoStack.length - 1];
        const newUndo = state.undoStack.slice(0, -1);
        set({
            _isUndoRedo: true,
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
        set({
            _isUndoRedo: true,
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
        });
    },
}));
