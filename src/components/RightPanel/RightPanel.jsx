import React, { useState } from 'react';
import { FilterPanel } from '../Filters/FilterPanel';
import { KeyframeEditor } from '../Timeline/KeyframeEditor';
import { getTransitionList } from '../../utils/Transitions';
import { useTimelineStore } from '../../store/timelineStore';
import './RightPanel.css';

export const RightPanel = ({
    isOpen, onClose,
    activeTool,
    selectedClip,
    activeFilters, setActiveFilters,
    onRemoveKeyframe,
    onAddKeyframe,
    onSetTransition,
    onAddTextOverlay,
    allClips = [],
    mode = 'simple',
}) => {
    const markers = useTimelineStore(s => s.markers);
    const magneticMode = useTimelineStore(s => s.magneticMode);
    const toggleMagneticMode = useTimelineStore(s => s.toggleMagneticMode);
    const removeMarker = useTimelineStore(s => s.removeMarker);

    const formatTime = (seconds) => {
        if (!seconds || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const [textValue, setTextValue] = useState('');
    const [textX, setTextX] = useState(50);
    const [textY, setTextY] = useState(50);
    const [textSize, setTextSize] = useState(24);

    if (!isOpen) return null;

    const transitions = getTransitionList();
    const activeTransition = selectedClip?.transitions?.out;

    return (
        <aside className="right-panel">
            <div className="right-panel-header">
                <h3 className="right-panel-title">
                    {activeTool === 'filter' ? 'Filters' :
                     activeTool === 'transition' ? 'Transitions' :
                     activeTool === 'keyframe' ? 'Keyframes' :
                     activeTool === 'text' ? 'Text Overlay' :
                     'Properties'}
                </h3>
                <button className="right-panel-close" onClick={onClose}>x</button>
            </div>

            <div className="right-panel-body">
                {activeTool === 'filter' && (
                    <FilterPanel
                        isOpen={true}
                        onClose={onClose}
                        activeFilters={activeFilters || []}
                        setActiveFilters={setActiveFilters}
                        embedded={true}
                    />
                )}

                {activeTool === 'transition' && (
                    <div className="rp-section">
                        {selectedClip ? (
                            <>
                                <div className="rp-label">Transition Type (applies to clip end)</div>
                                <div className="rp-transition-grid">
                                    {transitions.map(t => (
                                        <button
                                            key={t.id}
                                            className={`rp-transition-btn ${activeTransition === t.id ? 'active' : ''}`}
                                            title={t.name}
                                            onClick={() => onSetTransition?.(t.id)}
                                        >
                                            {t.name}
                                        </button>
                                    ))}
                                </div>
                                {activeTransition && (
                                    <button
                                        className="btn btn-outline"
                                        style={{ marginTop: '0.5rem', width: '100%' }}
                                        onClick={() => onSetTransition?.(null)}
                                    >
                                        Remove Transition
                                    </button>
                                )}
                            </>
                        ) : (
                            <p className="rp-empty">Select a clip first to apply transitions.</p>
                        )}
                    </div>
                )}

                {/* Default Properties panel — easy access to transitions + next clip detection */}
                {selectedClip && !activeTool && (
                    <div className="rp-section">
                        <div className="rp-label">Clip Properties</div>
                        <div className="rp-prop-row">
                            <span>Duration</span>
                            <span>{selectedClip.duration?.toFixed(2)}s</span>
                        </div>
                        <div className="rp-prop-row">
                            <span>Speed</span>
                            <span>{selectedClip.speed || 1}x</span>
                        </div>
                        <div className="rp-prop-row">
                            <span>Type</span>
                            <span>{selectedClip.type || 'video'}</span>
                        </div>
                        <div className="rp-prop-row">
                            <span>Track</span>
                            <span>{selectedClip.trackIndex}</span>
                        </div>
                        {(selectedClip.filters?.length > 0) && (
                            <div className="rp-prop-row">
                                <span>Filters</span>
                                <span>{selectedClip.filters.length}</span>
                            </div>
                        )}
                        {(() => {
                            const nextClip = allClips
                                .filter(c => c.trackIndex === selectedClip.trackIndex && c.startTime > selectedClip.startTime)
                                .sort((a, b) => a.startTime - b.startTime)[0];
                            return nextClip ? (
                                <>
                                    <div className="rp-divider" />
                                    <div className="rp-label">Quick Transition → {nextClip.label}</div>
                                    <div className="rp-transition-grid">
                                        {transitions.slice(0, 6).map(t => (
                                            <button
                                                key={t.id}
                                                className={`rp-transition-btn ${activeTransition === t.id ? 'active' : ''}`}
                                                onClick={() => onSetTransition?.(t.id)}
                                                title={t.name}
                                            >
                                                {t.name}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="rp-empty-hint">No adjacent clip to transition into.</div>
                            );
                        })()}
                    </div>
                )}

                {mode === 'advanced' && activeTool === 'keyframe' && selectedClip && (
                    <KeyframeEditor
                        clip={selectedClip}
                        onAddKeyframe={onAddKeyframe}
                        onRemoveKeyframe={onRemoveKeyframe}
                        onClose={onClose}
                    />
                )}

                {mode === 'advanced' && activeTool === 'keyframe' && !selectedClip && (
                    <div className="rp-section">
                        <p className="rp-empty">Select a clip first to manage keyframes.</p>
                    </div>
                )}

                {activeTool === 'text' && (
                    <div className="rp-section">
                        <div className="rp-label">Add Text Overlay</div>
                        <div className="rp-field">
                            <label>Text</label>
                            <input
                                type="text"
                                className="rp-input"
                                value={textValue}
                                onChange={e => setTextValue(e.target.value)}
                                placeholder="Enter text..."
                            />
                        </div>
                        <div className="rp-field-row">
                            <div className="rp-field">
                                <label>X (%)</label>
                                <input
                                    type="number"
                                    className="rp-input"
                                    value={textX}
                                    onChange={e => setTextX(parseFloat(e.target.value) || 0)}
                                    min={0} max={100}
                                />
                            </div>
                            <div className="rp-field">
                                <label>Y (%)</label>
                                <input
                                    type="number"
                                    className="rp-input"
                                    value={textY}
                                    onChange={e => setTextY(parseFloat(e.target.value) || 0)}
                                    min={0} max={100}
                                />
                            </div>
                        </div>
                        <div className="rp-field">
                            <label>Font Size</label>
                            <input
                                type="number"
                                className="rp-input"
                                value={textSize}
                                onChange={e => setTextSize(parseFloat(e.target.value) || 24)}
                                min={8} max={120}
                            />
                        </div>
                        <button
                            className="btn btn-primary"
                            style={{ marginTop: '0.5rem', width: '100%' }}
                            disabled={!textValue.trim()}
                            onClick={() => {
                                onAddTextOverlay?.(textValue, textX, textY, textSize);
                                setTextValue('');
                            }}
                        >
                            Add Text Overlay
                        </button>
                    </div>
                )}

                {!selectedClip && !activeTool && (
                    <div className="rp-empty-state">
                        <p>Select a clip to view properties</p>
                        <p className="rp-empty-hint">Use tools from the sidebar to edit</p>
                    </div>
                )}

                {/* Noise Reduction */}
                {selectedClip && (
                    <div className="rp-section">
                        <h3>Noise Reduction</h3>
                        <div className="rp-field">
                            <label>
                                Strength: {Math.round((selectedClip.noiseReduction?.strength || 0) * 100)}%
                            </label>
                            <input
                                type="range"
                                className="rp-slider"
                                min={0}
                                max={1}
                                step={0.05}
                                value={selectedClip.noiseReduction?.strength || 0}
                                onChange={(e) => {
                                    const strength = parseFloat(e.target.value);
                                    const nr = strength > 0 ? { strength, enabled: true } : null;
                                    useTimelineStore.getState().updateClip(selectedClip.id, { noiseReduction: nr });
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                            {selectedClip.noiseReduction?.enabled ? (
                                <button
                                    className="btn btn-outline"
                                    style={{ flex: 1, fontSize: '0.7rem' }}
                                    onClick={() => useTimelineStore.getState().updateClip(selectedClip.id, { noiseReduction: null })}
                                >
                                    Remove
                                </button>
                            ) : (
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1, fontSize: '0.7rem' }}
                                    onClick={() => useTimelineStore.getState().updateClip(selectedClip.id, { noiseReduction: { strength: 0.7, enabled: true } })}
                                >
                                    Apply
                                </button>
                            )}
                        </div>
                        <p className="rp-empty-hint" style={{ marginTop: '0.5rem' }}>
                            Reduces background noise using FFT spectral subtraction. Adjust strength to balance noise removal vs. audio quality.
                        </p>
                    </div>
                )}

                {/* Markers */}
                {mode === 'advanced' && (
                <div className="rp-section">
                    <h3>Markers</h3>
                    <div className="rp-markers-list">
                        {markers.length === 0 ? (
                            <div className="rp-empty">No markers. Press M on timeline to add.</div>
                        ) : (
                            markers.sort((a, b) => a.time - b.time).map(m => (
                                <div key={m.id} className="rp-marker-item">
                                    <div className="rp-marker-color" style={{ background: m.color }} />
                                    <span className="rp-marker-time">{formatTime(m.time)}</span>
                                    <span className="rp-marker-label">{m.label || 'Untitled'}</span>
                                    <button className="rp-marker-remove" onClick={() => removeMarker(m.id)}>x</button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                )}

                {/* Timeline Settings */}
                {mode === 'advanced' && (
                <div className="rp-section">
                    <h3>Timeline Settings</h3>
                    <label className="rp-toggle">
                        <input type="checkbox" checked={magneticMode} onChange={toggleMagneticMode} />
                        <span>Magnetic Timeline (Auto-Ripple)</span>
                    </label>
                </div>
                )}
            </div>
        </aside>
    );
};
