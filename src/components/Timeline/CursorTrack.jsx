import React, { useState, useCallback } from 'react';
import { useTimelineStore } from '../../store/timelineStore';
import './CursorTrack.css';

const TIME_SCALE_BASE = 80;
const CURSOR_EFFECTS = ['none', 'highlight', 'magnify', 'smooth'];

export const CursorTrack = ({
    events,
    zoom,
    trackHeight,
    onAddEvent,
    onUpdateEvent,
    onRemoveEvent,
}) => {
    const [selectedEvent, setSelectedEvent] = useState(null);
    const timeScale = TIME_SCALE_BASE * zoom;
    const cursorTelemetry = useTimelineStore(s => s.cursorTelemetry);
    const duration = useTimelineStore(s => s.duration);
    const totalDuration = duration + 10;

    const timeToX = useCallback((t) => t * timeScale, [timeScale]);
    const xToTime = useCallback((x) => x / timeScale, [timeScale]);

    const handleTrackClick = useCallback((e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = Math.max(0, xToTime(x));
        onAddEvent?.({ time, type: 'click', effect: 'none', x: 0.5, y: 0.5 });
    }, [xToTime, onAddEvent]);

    return (
        <div className="tl-cursor-track" style={{ height: trackHeight }} onClick={handleTrackClick}>
            {events.map(event => (
                <div key={event.id}
                    className={`tl-cursor-marker tl-cursor-${event.type} ${event.effect !== 'none' ? 'tl-cursor-effect-' + event.effect : ''}`}
                    style={{ left: timeToX(event.time) }}
                    onClick={(e) => { e.stopPropagation(); setSelectedEvent(selectedEvent === event.id ? null : event.id); }}
                    onDoubleClick={(e) => { e.stopPropagation(); onRemoveEvent?.(event.id); }}
                    title={`${event.type} - ${event.effect}`}>
                    <div className="tl-cursor-dot" />
                    {event.effect !== 'none' && <div className="tl-cursor-effect-badge">{event.effect[0].toUpperCase()}</div>}
                </div>
            ))}
            {selectedEvent && (() => {
                const event = events.find(e => e.id === selectedEvent);
                if (!event) return null;
                return (
                    <div className="tl-cursor-popup" style={{ left: timeToX(event.time) }}>
                        <select value={event.effect} onChange={(e) => { onUpdateEvent?.(event.id, { effect: e.target.value }); setSelectedEvent(null); }}>
                            {CURSOR_EFFECTS.map(fx => <option key={fx} value={fx}>{fx}</option>)}
                        </select>
                    </div>
                );
            })()}
            {cursorTelemetry && cursorTelemetry.eventCount > 0 && (
                <div className="tl-cursor-density">
                    {Array.from({ length: 100 }).map((_, i) => {
                        const timeStart = (i / 100) * totalDuration;
                        const timeEnd = ((i + 1) / 100) * totalDuration;
                        const events = cursorTelemetry.getEventsInRange(timeStart * 1000, timeEnd * 1000);
                        const density = Math.min(events.length / 10, 1);
                        return (
                            <div
                                key={i}
                                className="tl-cursor-density__bar"
                                style={{
                                    height: `${density * 100}%`,
                                    left: `${(i / 100) * 100}%`,
                                }}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};
