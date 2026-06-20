import { useEffect, useCallback } from 'react';

// Keyboard shortcuts handler for BioDockify Studio
// scope: 'recording' | 'editing' | 'global'
export const useKeyboardShortcuts = (shortcuts = {}, _scope = 'global') => {
    const handleKeyDown = useCallback((e) => {
        // Skip if user is typing in an input/textarea
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        if (e.target.isContentEditable) return;

        const key = [];
        if (e.ctrlKey || e.metaKey) key.push('ctrl');
        if (e.shiftKey) key.push('shift');
        if (e.altKey) key.push('alt');
        key.push(e.key.toLowerCase());
        const combo = key.join('+');

        const handler = shortcuts[combo];
        if (handler) {
            e.preventDefault();
            handler(e);
        }
    }, [shortcuts]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
};

// Predefined shortcut maps
export const RECORDING_SHORTCUTS = {
    onStartRecording: { key: 'ctrl+shift+r', label: 'Start/Stop Recording' },
    onPauseRecording: { key: 'ctrl+shift+p', label: 'Pause/Resume Recording' },
    onToggleCamera: { key: 'ctrl+shift+c', label: 'Toggle Camera' },
    onToggleMic: { key: 'ctrl+shift+m', label: 'Toggle Microphone' },
    onToggleAnnotation: { key: 'ctrl+shift+a', label: 'Toggle Annotations' },
    onToggleCursor: { key: 'ctrl+shift+x', label: 'Toggle Cursor Effects' },
};

export const EDITING_SHORTCUTS = {
    onPlayPause: { key: 'space', label: 'Play / Pause' },
    onSplit: { key: 's', label: 'Split Clip at Playhead' },
    onDelete: { key: 'delete', label: 'Delete Selected Clip' },
    onUndo: { key: 'ctrl+z', label: 'Undo' },
    onRedo: { key: 'ctrl+shift+z', label: 'Redo' },
    onZoomIn: { key: '=', label: 'Zoom Timeline In' },
    onZoomOut: { key: '-', label: 'Zoom Timeline Out' },
    onNudgeLeft: { key: 'arrowleft', label: 'Nudge Playhead Left' },
    onNudgeRight: { key: 'arrowright', label: 'Nudge Playhead Right' },
    onSelectAll: { key: 'ctrl+a', label: 'Select All Clips' },
    onDuplicate: { key: 'ctrl+d', label: 'Duplicate Selected Clip' },
};

export const STREAMING_SHORTCUTS = {
    onGoLive: { key: 'ctrl+shift+l', label: 'Start/Stop Stream' },
    onToggleRecord: { key: 'ctrl+shift+r', label: 'Start/Stop Recording' },
    onToggleReplay: { key: 'ctrl+shift+b', label: 'Toggle Replay Buffer' },
    onScene1: { key: '1', label: 'Switch to Scene 1' },
    onScene2: { key: '2', label: 'Switch to Scene 2' },
    onScene3: { key: '3', label: 'Switch to Scene 3' },
    onScene4: { key: '4', label: 'Switch to Scene 4' },
};
