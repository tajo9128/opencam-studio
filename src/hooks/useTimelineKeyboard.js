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
                currentTime, duration, setZoom } = store;

        // Space: play/pause
        if (e.code === 'Space') {
            e.preventDefault();
            isPlaying ? pause() : play();
            return;
        }

        // S or C: split at playhead
        if (e.code === 'KeyS' || e.code === 'KeyC') {
            if (selectedClipId) {
                e.preventDefault();
                splitAtPlayhead();
            }
            return;
        }

        // Delete / Backspace: ripple delete selected clip
        if (e.code === 'Delete' || e.code === 'Backspace') {
            if (selectedClipId) {
                e.preventDefault();
                removeClip(selectedClipId);
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
            setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 1 : 0.1)));
            return;
        }

        // ArrowRight: nudge playhead right
        if (e.code === 'ArrowRight') {
            e.preventDefault();
            setCurrentTime(Math.min(duration, currentTime + (e.shiftKey ? 1 : 0.1)));
            return;
        }
    }, [isPlaying, play, pause]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
};