import React, { useState, useCallback, useEffect } from 'react';
import './AnimationsTrack.css';

const TIME_SCALE_BASE = 80;
const ANIMATION_TYPES = [
    { id: 'fade-in', label: 'Fade In', color: '#10b981' },
    { id: 'fade-out', label: 'Fade Out', color: '#ef4444' },
    { id: 'slide-in-left', label: 'Slide In', color: '#3b82f6' },
    { id: 'slide-out-right', label: 'Slide Out', color: '#f59e0b' },
    { id: 'scale-in', label: 'Scale In', color: '#8b5cf6' },
    { id: 'scale-out', label: 'Scale Out', color: '#ec4899' },
    { id: 'emphasis', label: 'Emphasis', color: '#f59e0b' },
];

export const AnimationsTrack = ({
    animations,
    zoom,
    trackHeight,
    onAddAnimation,
    onUpdateAnimation,
    onRemoveAnimation,
}) => {
    const [dragging, setDragging] = useState(null);
    const timeScale = TIME_SCALE_BASE * zoom;

    const timeToX = useCallback((t) => t * timeScale, [timeScale]);
    const xToTime = useCallback((x) => x / timeScale, [timeScale]);

    const handleTrackClick = useCallback((e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = Math.max(0, xToTime(x));
        onAddAnimation?.({ startTime: time, duration: 1.0, type: 'fade-in', targetClipId: null });
    }, [xToTime, onAddAnimation]);

    const handleMouseDown = useCallback((e, anim, side) => {
        e.stopPropagation();
        if (side === 'left') {
            setDragging({ id: anim.id, side: 'left', startX: e.clientX, origStart: anim.startTime, origDuration: anim.duration });
        } else if (side === 'right') {
            setDragging({ id: anim.id, side: 'right', startX: e.clientX, origStart: anim.startTime, origDuration: anim.duration });
        } else {
            setDragging({ id: anim.id, side: 'move', startX: e.clientX, origStart: anim.startTime });
        }
    }, []);

    useEffect(() => {
        if (!dragging) return;
        const handleMouseMove = (e) => {
            const dx = e.clientX - dragging.startX;
            const dt = dx / timeScale;
            if (dragging.side === 'move') {
                onUpdateAnimation?.(dragging.id, { startTime: Math.max(0, dragging.origStart + dt) });
            } else if (dragging.side === 'left') {
                onUpdateAnimation?.(dragging.id, { startTime: Math.max(0, dragging.origStart + dt), duration: Math.max(0.2, dragging.origDuration - dt) });
            } else if (dragging.side === 'right') {
                onUpdateAnimation?.(dragging.id, { duration: Math.max(0.2, dragging.origDuration + dt) });
            }
        };
        const handleMouseUp = () => setDragging(null);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, timeScale, onUpdateAnimation]);

    return (
        <div className="tl-animations-track" style={{ height: trackHeight }} onClick={handleTrackClick}>
            {animations.map(anim => {
                const animDef = ANIMATION_TYPES.find(a => a.id === anim.type) || ANIMATION_TYPES[0];
                return (
                    <div key={anim.id} className="tl-animation-block"
                        style={{ left: timeToX(anim.startTime), width: Math.max(timeToX(anim.duration), 16), backgroundColor: animDef.color }}
                        onMouseDown={(e) => handleMouseDown(e, anim, null)}
                        onDoubleClick={(e) => { e.stopPropagation(); onRemoveAnimation?.(anim.id); }}>
                        <div className="tl-animation-handle tl-animation-handle-left" onMouseDown={(e) => handleMouseDown(e, anim, 'left')} />
                        <div className="tl-animation-content">
                            <span className="tl-animation-label">{animDef.label}</span>
                        </div>
                        <div className="tl-animation-handle tl-animation-handle-right" onMouseDown={(e) => handleMouseDown(e, anim, 'right')} />
                    </div>
                );
            })}
        </div>
    );
};
