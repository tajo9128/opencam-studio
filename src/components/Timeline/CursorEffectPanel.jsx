import React from 'react';
import { useTimelineStore } from '../../store/timelineStore';
import './CursorEffectPanel.css';

export const CursorEffectPanel = () => {
    const cursorSettings = useTimelineStore(s => s.cursorSettings);
    const setCursorSettings = useTimelineStore(s => s.setCursorSettings);

    return (
        <div className="cursor-effect-panel">
            <h3 className="cursor-effect-panel__title">Cursor Effects</h3>

            <label className="cursor-effect-panel__option">
                <input
                    type="checkbox"
                    checked={cursorSettings.highlight}
                    onChange={(e) => setCursorSettings({ highlight: e.target.checked })}
                />
                <span>Highlight Cursor</span>
            </label>

            <label className="cursor-effect-panel__option">
                <input
                    type="checkbox"
                    checked={cursorSettings.magnify}
                    onChange={(e) => setCursorSettings({ magnify: e.target.checked })}
                />
                <span>Magnify Under Cursor</span>
            </label>

            {cursorSettings.magnify && (
                <div className="cursor-effect-panel__slider">
                    <label>Zoom: {cursorSettings.magnifyZoom.toFixed(1)}x</label>
                    <input
                        type="range"
                        min="1.5"
                        max="4"
                        step="0.1"
                        value={cursorSettings.magnifyZoom}
                        onChange={(e) => setCursorSettings({ magnifyZoom: parseFloat(e.target.value) })}
                    />
                </div>
            )}

            <label className="cursor-effect-panel__option">
                <input
                    type="checkbox"
                    checked={cursorSettings.spotlight}
                    onChange={(e) => setCursorSettings({ spotlight: e.target.checked })}
                />
                <span>Spotlight (Dim Background)</span>
            </label>

            <label className="cursor-effect-panel__option">
                <input
                    type="checkbox"
                    checked={cursorSettings.clickRipples}
                    onChange={(e) => setCursorSettings({ clickRipples: e.target.checked })}
                />
                <span>Click Ripples</span>
            </label>

            {cursorSettings.clickRipples && (
                <div className="cursor-effect-panel__color">
                    <label>Ripple Color:</label>
                    <input
                        type="color"
                        value={cursorSettings.clickColor}
                        onChange={(e) => setCursorSettings({ clickColor: e.target.value })}
                    />
                </div>
            )}

            <div className="cursor-effect-panel__slider">
                <label>Smoothing: {(cursorSettings.smoothing * 100).toFixed(0)}%</label>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={cursorSettings.smoothing}
                    onChange={(e) => setCursorSettings({ smoothing: parseFloat(e.target.value) })}
                />
            </div>
        </div>
    );
};
