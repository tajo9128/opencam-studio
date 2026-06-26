import React, { useState, useCallback, useEffect } from 'react';
import { MarkerPopup } from './MarkerPopup';
import './MarkerLayer.css';

const TIME_SCALE_BASE = 80;

const MARKER_COLORS = [
    '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
];

export const MarkerLayer = ({
    markers,
    zoom,
    currentTime: _currentTime,
    onAddMarker: _onAddMarker,
    onRemoveMarker,
    onUpdateMarker,
    onMoveMarker,
    onSeek: _onSeek,
}) => {
    const [editingMarker, setEditingMarker] = useState(null);
    const [draggingMarker, setDraggingMarker] = useState(null);
    const timeScale = TIME_SCALE_BASE * zoom;

    const timeToX = useCallback((t) => t * timeScale, [timeScale]);
    const xToTime = useCallback((x) => x / timeScale, [timeScale]);

    const handleMarkerMouseDown = useCallback((e, marker) => {
        e.stopPropagation();
        setDraggingMarker({ id: marker.id, startX: e.clientX, origTime: marker.time });
    }, []);

    const handleMarkerDoubleClick = useCallback((e, marker) => {
        e.stopPropagation();
        setEditingMarker(marker);
    }, []);

    useEffect(() => {
        if (!draggingMarker) return;
        const handleMouseMove = (e) => {
            const scrollEl = document.querySelector('.tl-scroll');
            if (!scrollEl) return;
            const rect = scrollEl.getBoundingClientRect();
            const x = e.clientX - rect.left + scrollEl.scrollLeft;
            const newTime = Math.max(0, xToTime(x));
            onMoveMarker(draggingMarker.id, newTime);
        };
        const handleMouseUp = () => setDraggingMarker(null);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingMarker, xToTime, onMoveMarker]);

    return (
        <div className="tl-marker-layer">
            {markers.map(marker => (
                <div
                    key={marker.id}
                    className="tl-marker-flag"
                    style={{
                        left: timeToX(marker.time),
                        '--marker-color': marker.color,
                    }}
                    onMouseDown={(e) => handleMarkerMouseDown(e, marker)}
                    onDoubleClick={(e) => handleMarkerDoubleClick(e, marker)}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        onRemoveMarker(marker.id);
                    }}
                >
                    <div className="tl-marker-flag-pole" />
                    <div className="tl-marker-flag-label">
                        {marker.label || ''}
                    </div>
                </div>
            ))}

            {editingMarker && (
                <MarkerPopup
                    marker={editingMarker}
                    onClose={() => setEditingMarker(null)}
                    onUpdate={(updates) => {
                        onUpdateMarker(editingMarker.id, updates);
                        setEditingMarker(null);
                    }}
                    colors={MARKER_COLORS}
                />
            )}
        </div>
    );
};
