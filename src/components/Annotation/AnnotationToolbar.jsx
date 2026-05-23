import React from 'react';
import './AnnotationToolbar.css';

const TOOLS = [
    { id: 'pen', icon: '✏️', label: 'Pen' },
    { id: 'line', icon: '📏', label: 'Line' },
    { id: 'rect', icon: '⬜', label: 'Rectangle' },
    { id: 'arrow', icon: '➡️', label: 'Arrow' },
    { id: 'text', icon: '🔤', label: 'Text' },
    { id: 'eraser', icon: '🧹', label: 'Eraser' },
];

const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000'];

const WIDTHS = [2, 4, 6, 10, 16];

export const AnnotationToolbar = ({ tool, setTool, color, setColor, strokeWidth, setStrokeWidth, undo, redo, clearAnnotations, canUndo, canRedo }) => {
    return (
        <div className="annotation-toolbar">
            <div className="annotation-tools">
                {TOOLS.map(t => (
                    <button
                        key={t.id}
                        className={`btn-icon-bg ${tool === t.id ? 'active' : ''}`}
                        onClick={() => setTool(t.id)}
                        title={t.label}
                    >
                        {t.icon}
                    </button>
                ))}
            </div>
            <div className="annotation-divider"></div>
            <div className="annotation-colors">
                {COLORS.map(c => (
                    <div
                        key={c}
                        className={`color-swatch ${color === c ? 'active' : ''}`}
                        style={{ background: c }}
                        onClick={() => setColor(c)}
                    />
                ))}
            </div>
            <div className="annotation-divider"></div>
            <div className="annotation-widths">
                {WIDTHS.map(w => (
                    <button
                        key={w}
                        className={`btn-icon-bg ${strokeWidth === w ? 'active' : ''}`}
                        onClick={() => setStrokeWidth(w)}
                        title={`${w}px`}
                    >
                        <span style={{ fontSize: `${8 + w}px`, lineHeight: 1 }}>.</span>
                    </button>
                ))}
            </div>
            <div className="annotation-divider"></div>
            <div className="annotation-actions">
                <button className="btn-icon-bg" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩️</button>
                <button className="btn-icon-bg" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪️</button>
                <button className="btn-icon-bg" onClick={clearAnnotations} title="Clear All">🗑️</button>
            </div>
        </div>
    );
};
