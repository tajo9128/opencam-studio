import React, { useState, useRef } from 'react';
import './SourcePanel.css';

const SOURCE_TYPES = [
    { type: 'screen', label: 'Screen', icon: '🖥' },
    { type: 'camera', label: 'Camera', icon: '📷' },
    { type: 'video', label: 'Video File', icon: '🎬' },
    { type: 'text', label: 'Text', icon: 'T' },
    { type: 'color', label: 'Color', icon: '■' },
    { type: 'image', label: 'Image', icon: '🖼' },
];

export const SourcePanel = ({ scene, onAddSource, onRemoveSource, onUpdateSource, onClose }) => {
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const videoInputRef = useRef(null);
    const imageInputRef = useRef(null);

    if (!scene) return null;

    const handleAdd = (type) => {
        if (type === 'video') {
            videoInputRef.current?.click();
            return;
        }
        if (type === 'image') {
            imageInputRef.current?.click();
            return;
        }
        const defaults = {
            screen: { name: 'Screen', config: { displaySurface: 'monitor' } },
            camera: { name: 'Camera', config: {} },
            text: { name: 'Text', config: { text: 'Hello World', fontSize: 32, color: '#ffffff', fontFamily: 'Outfit, sans-serif', fontWeight: 'bold' } },
            color: { name: 'Color', config: { color: '#1e1e2e' } },
        };
        onAddSource({ type, ...defaults[type] });
        setAddMenuOpen(false);
    };

    const handleVideoFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        onAddSource({
            type: 'video',
            name: file.name.replace(/\.[^/.]+$/, '').slice(0, 20),
            config: { src: url, loop: true },
            transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, crop: { top: 0, right: 0, bottom: 0, left: 0 } },
        });
        setAddMenuOpen(false);
        e.target.value = '';
    };

    const handleImageFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;
        onAddSource({
            type: 'image',
            name: file.name.replace(/\.[^/.]+$/, '').slice(0, 20),
            config: { src: url, img },
            transform: { x: 0.05, y: 0.05, width: 0.3, height: 0.3, rotation: 0, opacity: 1, crop: { top: 0, right: 0, bottom: 0, left: 0 } },
        });
        setAddMenuOpen(false);
        e.target.value = '';
    };

    return (
        <div className="source-panel">
            <input ref={videoInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideoFile} />
            <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageFile} />

            <div className="source-panel-header">
                <h3>Sources</h3>
                {onClose && <button className="btn-icon-bg" onClick={onClose}>x</button>}
            </div>
            <div className="source-panel-body">
                {scene.sources?.map((source) => (
                    <div key={source.id} className={`source-item ${editingId === source.id ? 'editing' : ''}`}>
                        <div className="source-item-row">
                            <span className="source-item-icon">
                                {SOURCE_TYPES.find(t => t.type === source.type)?.icon || '?'}
                            </span>
                            <span className="source-item-name">{source.name}</span>
                            <div className="source-item-actions">
                                <button
                                    className="source-item-btn"
                                    onClick={() => onUpdateSource(source.id, { visible: !source.visible })}
                                    title={source.visible ? 'Hide' : 'Show'}
                                >
                                    {source.visible ? 'V' : '-'}
                                </button>
                                <button
                                    className="source-item-btn"
                                    onClick={() => setEditingId(editingId === source.id ? null : source.id)}
                                    title="Edit"
                                >
                                    E
                                </button>
                                <button
                                    className="source-item-btn danger"
                                    onClick={() => onRemoveSource(source.id)}
                                    title="Remove"
                                >
                                    X
                                </button>
                            </div>
                        </div>
                        {editingId === source.id && (
                            <div className="source-item-edit">
                                <div className="source-edit-field">
                                    <label>Name</label>
                                    <input
                                        value={source.name}
                                        onChange={e => onUpdateSource(source.id, { name: e.target.value })}
                                    />
                                </div>
                                {source.type === 'text' && (
                                    <>
                                        <div className="source-edit-field">
                                            <label>Text</label>
                                            <input
                                                value={source.config?.text || ''}
                                                onChange={e => onUpdateSource(source.id, { config: { ...source.config, text: e.target.value } })}
                                            />
                                        </div>
                                        <div className="source-edit-field">
                                            <label>Font Size</label>
                                            <input
                                                type="number"
                                                value={source.config?.fontSize || 32}
                                                onChange={e => onUpdateSource(source.id, { config: { ...source.config, fontSize: parseInt(e.target.value) } })}
                                            />
                                        </div>
                                        <div className="source-edit-field">
                                            <label>Color</label>
                                            <input
                                                type="color"
                                                value={source.config?.color || '#ffffff'}
                                                onChange={e => onUpdateSource(source.id, { config: { ...source.config, color: e.target.value } })}
                                            />
                                        </div>
                                    </>
                                )}
                                {source.type === 'color' && (
                                    <div className="source-edit-field">
                                        <label>Color</label>
                                        <input
                                            type="color"
                                            value={source.config?.color || '#1e1e2e'}
                                            onChange={e => onUpdateSource(source.id, { config: { ...source.config, color: e.target.value } })}
                                        />
                                    </div>
                                )}
                                {source.type === 'video' && (
                                    <div className="source-edit-field">
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={source.config?.loop !== false}
                                                onChange={e => onUpdateSource(source.id, { config: { ...source.config, loop: e.target.checked } })}
                                                style={{ width: 'auto', marginRight: '0.5rem' }}
                                            />
                                            Loop Video
                                        </label>
                                    </div>
                                )}

                                {/* Lower Third */}
                                <div className="source-edit-section">
                                    <label className="source-edit-section-title">Lower Third</label>
                                    <div className="source-edit-field">
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={source.lowerThird?.enabled || false}
                                                onChange={e => onUpdateSource(source.id, { lowerThird: { ...source.lowerThird, enabled: e.target.checked } })}
                                                style={{ width: 'auto', marginRight: '0.5rem' }}
                                            />
                                            Show Name Tag
                                        </label>
                                    </div>
                                    {source.lowerThird?.enabled && (
                                        <>
                                            <div className="source-edit-field">
                                                <label>Name</label>
                                                <input
                                                    value={source.lowerThird?.name || source.name || ''}
                                                    onChange={e => onUpdateSource(source.id, { lowerThird: { ...source.lowerThird, name: e.target.value } })}
                                                    placeholder="Speaker Name"
                                                />
                                            </div>
                                            <div className="source-edit-field">
                                                <label>Title</label>
                                                <input
                                                    value={source.lowerThird?.title || ''}
                                                    onChange={e => onUpdateSource(source.id, { lowerThird: { ...source.lowerThird, title: e.target.value } })}
                                                    placeholder="Title / Role"
                                                />
                                            </div>
                                            <div className="source-edit-field">
                                                <label>Accent Color</label>
                                                <input
                                                    type="color"
                                                    value={source.lowerThird?.color || '#8b5cf6'}
                                                    onChange={e => onUpdateSource(source.id, { lowerThird: { ...source.lowerThird, color: e.target.value } })}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="source-edit-section">
                                    <label className="source-edit-section-title">Transform</label>
                                    <div className="source-edit-row">
                                        <div className="source-edit-field">
                                            <label>X</label>
                                            <input type="number" step="0.01" min="0" max="1"
                                                value={source.transform?.x || 0}
                                                onChange={e => onUpdateSource(source.id, { transform: { ...source.transform, x: parseFloat(e.target.value) } })}
                                            />
                                        </div>
                                        <div className="source-edit-field">
                                            <label>Y</label>
                                            <input type="number" step="0.01" min="0" max="1"
                                                value={source.transform?.y || 0}
                                                onChange={e => onUpdateSource(source.id, { transform: { ...source.transform, y: parseFloat(e.target.value) } })}
                                            />
                                        </div>
                                    </div>
                                    <div className="source-edit-row">
                                        <div className="source-edit-field">
                                            <label>W</label>
                                            <input type="number" step="0.01" min="0.01" max="1"
                                                value={source.transform?.width || 1}
                                                onChange={e => onUpdateSource(source.id, { transform: { ...source.transform, width: parseFloat(e.target.value) } })}
                                            />
                                        </div>
                                        <div className="source-edit-field">
                                            <label>H</label>
                                            <input type="number" step="0.01" min="0.01" max="1"
                                                value={source.transform?.height || 1}
                                                onChange={e => onUpdateSource(source.id, { transform: { ...source.transform, height: parseFloat(e.target.value) } })}
                                            />
                                        </div>
                                    </div>
                                    <div className="source-edit-field">
                                        <label>Opacity</label>
                                        <input type="range" step="0.01" min="0" max="1"
                                            value={source.transform?.opacity ?? 1}
                                            onChange={e => onUpdateSource(source.id, { transform: { ...source.transform, opacity: parseFloat(e.target.value) } })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {scene.sources?.length === 0 && (
                    <div className="source-empty">No sources. Click + to add one.</div>
                )}
            </div>
            <div className="source-panel-footer">
                <button className="source-add-btn" onClick={() => setAddMenuOpen(!addMenuOpen)}>+ Add Source</button>
                {addMenuOpen && (
                    <div className="source-add-menu">
                        {SOURCE_TYPES.map(t => (
                            <button key={t.type} className="source-add-item" onClick={() => handleAdd(t.type)}>
                                <span>{t.icon}</span>
                                <span>{t.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
