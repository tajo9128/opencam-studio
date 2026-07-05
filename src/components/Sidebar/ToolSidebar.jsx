import React from 'react';
import './ToolSidebar.css';

const TOOLS = [
    { id: 'upload', icon: '+', label: 'Upload' },
    { id: 'select', icon: 'V', label: 'Select' },
    { id: 'razor', icon: 'S', label: 'Split' },
    { id: 'cut', icon: '✂', label: 'Cut' },
    { id: 'text', icon: 'T', label: 'Text' },
    { id: 'draw', icon: 'D', label: 'Draw' },
    { id: 'filter', icon: 'F', label: 'Filters' },
    { id: 'transition', icon: 'X', label: 'Transitions' },
    { id: 'keyframe', icon: 'K', label: 'Keyframes' },
];

export const ToolSidebar = ({ activeTool, onToolChange, onUpload }) => {
    return (
        <aside className="tool-sidebar">
            {TOOLS.map(tool => (
                <button
                    key={tool.id}
                    className={`tool-sidebar-btn ${activeTool === tool.id ? 'active' : ''}`}
                    onClick={() => {
                        if (tool.id === 'upload') onUpload?.();
                        else onToolChange(tool.id === activeTool ? null : tool.id);
                    }}
                    title={tool.label}
                >
                    <span className="tool-sidebar-icon">{tool.icon}</span>
                    <span className="tool-sidebar-label">{tool.label}</span>
                </button>
            ))}
        </aside>
    );
};
