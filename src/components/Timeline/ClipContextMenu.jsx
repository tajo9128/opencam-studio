import React, { useState } from 'react';
import { useTimelineStore } from '../../store/timelineStore';
import './ClipContextMenu.css';

export const ClipContextMenu = ({ x, y, clip, onClose, onSplit, onDelete, onDuplicate, onSpeed, onFilters, onKeyframes, mode = 'simple' }) => {
    const [speedMenu, setSpeedMenu] = useState(false);
    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

    return (
        <div className="clip-context-menu" style={{ left: x, top: y }} onClick={e => e.stopPropagation()}>
            <div className="ctx-item" onClick={() => { onSplit(); onClose(); }}>Split at Playhead</div>
            <div className="ctx-item" onClick={() => { onDuplicate(); onClose(); }}>Duplicate</div>
            <div className="ctx-divider" />
            <div className="ctx-item ctx-submenu" onMouseEnter={() => setSpeedMenu(true)} onMouseLeave={() => setSpeedMenu(false)}>
                Speed
                {speedMenu && (
                    <div className="ctx-sub">
                        {speeds.map(s => (
                            <div key={s} className={`ctx-sub-item ${clip.speed === s ? 'active' : ''}`}
                                onClick={() => { onSpeed(s); onClose(); }}>
                                {s}x
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="ctx-item" onClick={() => { onFilters(); onClose(); }}>Filters...</div>
            {mode === 'advanced' && (
                <div className="ctx-item" onClick={() => { onKeyframes(); onClose(); }}>Keyframes...</div>
            )}
            <div className="ctx-divider" />
            <div className="ctx-item ctx-danger" onClick={() => { onDelete(clip.id); onClose(); }}>Delete</div>
            {mode === 'advanced' && (
                <>
                    <div className="ctx-separator" />
                    <button className="ctx-item" onClick={() => {
                        const offset = Math.max(-clip.startTime, -2);
                        useTimelineStore.getState().setAudioOffset(clip.id, offset);
                        onClose();
                    }}>
                        J-Cut (Audio Before Video)
                    </button>
                    <button className="ctx-item" onClick={() => {
                        useTimelineStore.getState().setAudioOffset(clip.id, 0);
                        useTimelineStore.getState().setAudioDuration(clip.id, clip.duration + 2);
                        onClose();
                    }}>
                        L-Cut (Video Ends Before Audio)
                    </button>
                    <button className="ctx-item" onClick={() => {
                        useTimelineStore.getState().setAudioOffset(clip.id, 0);
                        useTimelineStore.getState().setAudioDuration(clip.id, null);
                        onClose();
                    }}>
                        Reset Audio Timing
                    </button>
                </>
            )}
        </div>
    );
};
