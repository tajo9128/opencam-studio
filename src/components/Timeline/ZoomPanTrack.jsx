import React, { useState, useCallback, useEffect } from 'react';
import './ZoomPanTrack.css';

const TIME_SCALE_BASE = 80;
const ZOOM_REGION_COLORS = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6'];

export const ZoomPanTrack = ({
    regions,
    zoom,
    trackHeight,
    onAddRegion,
    onUpdateRegion,
    onRemoveRegion,
}) => {
    const [dragging, setDragging] = useState(null);
    const [creating, setCreating] = useState(null);
    const timeScale = TIME_SCALE_BASE * zoom;

    const timeToX = useCallback((t) => t * timeScale, [timeScale]);
    const xToTime = useCallback((x) => x / timeScale, [timeScale]);

    const handleMouseDown = useCallback((e, region, side) => {
        e.stopPropagation();
        if (side === 'left') {
            setDragging({ id: region.id, side: 'left', startX: e.clientX, origStart: region.startTime, origDuration: region.duration });
        } else if (side === 'right') {
            setDragging({ id: region.id, side: 'right', startX: e.clientX, origStart: region.startTime, origDuration: region.duration });
        } else {
            setDragging({ id: region.id, side: 'move', startX: e.clientX, origStart: region.startTime });
        }
    }, []);

    const handleDoubleClick = useCallback((e, region) => {
        e.stopPropagation();
        onRemoveRegion?.(region.id);
    }, [onRemoveRegion]);

    const handleTrackMouseDown = useCallback((e) => {
        if (dragging) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = Math.max(0, xToTime(x));
        setCreating({ startX: e.clientX, startTime: time, duration: 0 });
    }, [dragging, xToTime]);

    useEffect(() => {
        if (!creating) return;
        const handleMouseMove = (e) => {
            const dx = e.clientX - creating.startX;
            const dt = dx / timeScale;
            const duration = Math.max(0.5, Math.abs(dt));
            const startTime = dt >= 0 ? creating.startTime : creating.startTime + dt;
            setCreating(prev => ({ ...prev, duration, startTime }));
        };
        const handleMouseUp = () => {
            if (creating && creating.duration > 0.5) {
                const color = ZOOM_REGION_COLORS[Math.floor(Math.random() * ZOOM_REGION_COLORS.length)];
                onAddRegion?.({
                    startTime: creating.startTime,
                    duration: creating.duration,
                    startRect: { x: 0, y: 0, width: 100, height: 100 },
                    endRect: { x: 25, y: 25, width: 50, height: 50 },
                    color,
                });
            }
            setCreating(null);
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [creating, timeScale, onAddRegion]);

    useEffect(() => {
        if (!dragging) return;
        const handleMouseMove = (e) => {
            const dx = e.clientX - dragging.startX;
            const dt = dx / timeScale;
            if (dragging.side === 'move') {
                onUpdateRegion?.(dragging.id, { startTime: Math.max(0, dragging.origStart + dt) });
            } else if (dragging.side === 'left') {
                onUpdateRegion?.(dragging.id, { startTime: Math.max(0, dragging.origStart + dt), duration: Math.max(0.5, dragging.origDuration - dt) });
            } else if (dragging.side === 'right') {
                onUpdateRegion?.(dragging.id, { duration: Math.max(0.5, dragging.origDuration + dt) });
            }
        };
        const handleMouseUp = () => setDragging(null);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, timeScale, onUpdateRegion]);

    return (
        <div className="tl-zoompan-track" style={{ height: trackHeight }} onMouseDown={handleTrackMouseDown}>
            {regions.map(region => (
                <div key={region.id} className="tl-zoompan-region"
                    style={{ left: timeToX(region.startTime), width: Math.max(timeToX(region.duration), 12), backgroundColor: region.color || '#f59e0b' }}
                    onMouseDown={(e) => handleMouseDown(e, region, null)}
                    onDoubleClick={(e) => handleDoubleClick(e, region)}>
                    <div className="tl-zoompan-handle tl-zoompan-handle-left" onMouseDown={(e) => handleMouseDown(e, region, 'left')} />
                    <div className="tl-zoompan-label">Zoom</div>
                    <div className="tl-zoompan-handle tl-zoompan-handle-right" onMouseDown={(e) => handleMouseDown(e, region, 'right')} />
                </div>
            ))}
            {creating && creating.duration > 0 && (
                <div className="tl-zoompan-region tl-zoompan-creating"
                    style={{ left: timeToX(creating.startTime), width: Math.max(timeToX(creating.duration), 12) }} />
            )}
        </div>
    );
};
