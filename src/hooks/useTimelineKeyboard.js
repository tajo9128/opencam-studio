import { useEffect, useCallback, useRef } from 'react';
import { useTimelineStore } from '../store/timelineStore';

export const useTimelineKeyboard = ({
    play,
    pause,
    isPlaying,
}) => {
    const shuttleRef = useRef(null);
    const lastShuttleKey = useRef(null);
    const lastShuttleTime = useRef(0);

    const handleKeyDown = useCallback((e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        if (e.target.isContentEditable) return;

        const store = useTimelineStore.getState();
        const { selectedClipId, splitAtPlayhead, removeClip, trimStartToPlayhead,
                trimEndToPlayhead, addMarker, undo, redo, setCurrentTime,
                currentTime, duration, setZoom,
                sliceAtPlayhead, copyClip, pasteClip, cutClip, rippleDelete,
                sliceAllAtPlayhead, nudgeClip, fadeInOut, removeFade } = store;

        // Space: play/pause
        if (e.code === 'Space') {
            e.preventDefault();
            isPlaying ? pause() : play();
            return;
        }

        // S: split at playhead (keep both sides)
        if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
            if (selectedClipId) {
                e.preventDefault();
                splitAtPlayhead();
            }
            return;
        }

        // Ctrl+C: copy clip
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
            if (selectedClipId) {
                e.preventDefault();
                copyClip();
            }
            return;
        }

        // Ctrl+V: paste clip
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
            e.preventDefault();
            pasteClip();
            return;
        }

        // Ctrl+X: cut clip
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyX') {
            if (selectedClipId) {
                e.preventDefault();
                cutClip();
            }
            return;
        }

        // Delete / Backspace: ripple delete selected clip
        if (e.code === 'Delete' || e.code === 'Backspace') {
            if (selectedClipId) {
                e.preventDefault();
                if (e.shiftKey) {
                    rippleDelete(); // Shift+Delete = ripple delete
                } else {
                    removeClip(selectedClipId); // Regular delete
                }
            }
            return;
        }

        // Q: trim start to playhead
        if (e.code === 'KeyQ') {
            if (selectedClipId) {
                e.preventDefault();
                trimStartToPlayhead();
            }
            return;
        }

        // W: trim end to playhead
        if (e.code === 'KeyW') {
            if (selectedClipId) {
                e.preventDefault();
                trimEndToPlayhead();
            }
            return;
        }

        // X: slice and keep left
        if (e.code === 'KeyX' && !e.ctrlKey && !e.metaKey) {
            if (selectedClipId) {
                e.preventDefault();
                sliceAtPlayhead('keepLeft');
            }
            return;
        }

        // Z: slice and keep right
        if (e.code === 'KeyZ' && !e.ctrlKey && !e.metaKey) {
            if (selectedClipId) {
                e.preventDefault();
                sliceAtPlayhead('keepRight');
            }
            return;
        }

        // M: drop marker
        if (e.code === 'KeyM') {
            e.preventDefault();
            addMarker(currentTime);
            return;
        }

        // J: shuttle backward
        if (e.code === 'KeyJ') {
            e.preventDefault();
            const now = Date.now();
            if (lastShuttleKey.current === 'J' && now - lastShuttleTime.current < 500) {
                shuttleRef.current = Math.min((shuttleRef.current || 1) * 2, 16);
            } else {
                shuttleRef.current = 1;
            }
            lastShuttleKey.current = 'J';
            lastShuttleTime.current = now;
            if (isPlaying) pause();
            setCurrentTime(Math.max(0, currentTime - shuttleRef.current));
            return;
        }

        // K: pause (stop shuttle)
        if (e.code === 'KeyK') {
            e.preventDefault();
            shuttleRef.current = null;
            lastShuttleKey.current = null;
            if (isPlaying) pause();
            return;
        }

        // L: shuttle forward
        if (e.code === 'KeyL') {
            e.preventDefault();
            const now = Date.now();
            if (lastShuttleKey.current === 'L' && now - lastShuttleTime.current < 500) {
                shuttleRef.current = Math.min((shuttleRef.current || 1) * 2, 16);
            } else {
                shuttleRef.current = 1;
            }
            lastShuttleKey.current = 'L';
            lastShuttleTime.current = now;
            if (isPlaying) pause();
            setCurrentTime(Math.min(duration, currentTime + shuttleRef.current));
            return;
        }

        // Ctrl+Z: undo
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
            e.preventDefault();
            undo();
            return;
        }

        // Ctrl+Shift+Z: redo
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && e.shiftKey) {
            e.preventDefault();
            redo();
            return;
        }

        // = / +: zoom in
        if (e.code === 'Equal' || e.code === 'NumpadAdd') {
            e.preventDefault();
            setZoom(z => Math.min(10, z * 1.25));
            return;
        }

        // -: zoom out
        if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
            e.preventDefault();
            setZoom(z => Math.max(0.1, z * 0.8));
            return;
        }

        // ArrowLeft: nudge playhead left
        if (e.code === 'ArrowLeft') {
            e.preventDefault();
            if (selectedClipId && e.ctrlKey) {
                // Ctrl+Arrow = nudge clip left 1 frame
                nudgeClip(selectedClipId, -1);
            } else {
                setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 1 : 0.1)));
            }
            return;
        }

        // ArrowRight: nudge playhead right
        if (e.code === 'ArrowRight') {
            e.preventDefault();
            if (selectedClipId && e.ctrlKey) {
                // Ctrl+Arrow = nudge clip right 1 frame
                nudgeClip(selectedClipId, 1);
            } else {
                setCurrentTime(Math.min(duration, currentTime + (e.shiftKey ? 1 : 0.1)));
            }
            return;
        }

        // Shift+ArrowLeft: nudge clip left 5 frames
        if (e.code === 'ArrowLeft' && e.shiftKey && selectedClipId) {
            e.preventDefault();
            nudgeClip(selectedClipId, -5);
            return;
        }

        // Shift+ArrowRight: nudge clip right 5 frames
        if (e.code === 'ArrowRight' && e.shiftKey && selectedClipId) {
            e.preventDefault();
            nudgeClip(selectedClipId, 5);
            return;
        }

        // A: slice all at playhead (keep both)
        if (e.code === 'KeyA' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            sliceAllAtPlayhead('keepBoth');
            return;
        }

        // F: fade in/out toggle
        if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) {
            if (selectedClipId) {
                e.preventDefault();
                const clip = store.clips.find(c => c.id === selectedClipId);
                if (clip) {
                    const hasFade = clip.filters?.some(f => f.filterId === 'fadeIn' || f.filterId === 'fadeOut');
                    if (hasFade) {
                        removeFade(selectedClipId);
                    } else {
                        fadeInOut(selectedClipId, 1);
                    }
                }
            }
            return;
        }
    }, [isPlaying, play, pause]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
};