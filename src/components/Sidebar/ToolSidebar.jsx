import React from 'react';
import { Tooltip } from '../Common/Tooltip';
import './ToolSidebar.css';

const SIMPLE_TOOLS = [
    { id: 'upload', icon: '+', label: 'Upload', tooltip: 'Add video or audio files' },
    { id: 'select', icon: 'V', label: 'Select', tooltip: 'Select and move clips' },
    { id: 'razor', icon: 'S', label: 'Split', tooltip: 'Cut clip into two pieces at the playhead' },
    { id: 'cut', icon: '✂', label: 'Cut', tooltip: 'Split and remove the part before playhead' },
    { id: 'text', icon: 'T', label: 'Text', tooltip: 'Add titles and captions' },
    { id: 'filter', icon: 'F', label: 'Filters', tooltip: 'Adjust colors, add effects' },
    { id: 'transition', icon: 'X', label: 'Transitions', tooltip: 'Add smooth transitions between clips' },
];

const ADVANCED_TOOLS = [
    { id: 'upload', icon: '+', label: 'Upload', tooltip: 'Add video or audio files' },
    { id: 'select', icon: 'V', label: 'Select', tooltip: 'Select and move clips' },
    { id: 'razor', icon: 'S', label: 'Split', tooltip: 'Split clip at playhead' },
    { id: 'cut', icon: '✂', label: 'Cut', tooltip: 'Split and remove left part' },
    { id: 'text', icon: 'T', label: 'Text', tooltip: 'Add text overlays' },
    { id: 'draw', icon: 'D', label: 'Draw', tooltip: 'Annotate on video' },
    { id: 'filter', icon: 'F', label: 'Filters', tooltip: 'Apply video filters' },
    { id: 'transition', icon: 'X', label: 'Transitions', tooltip: 'Add transitions' },
    { id: 'keyframe', icon: 'K', label: 'Keyframes', tooltip: 'Animate properties over time' },
];

export const ToolSidebar = ({ activeTool, onToolChange, onUpload, mode = 'simple' }) => {
    const tools = mode === 'simple' ? SIMPLE_TOOLS : ADVANCED_TOOLS;

    return (
        <aside className="tool-sidebar">
            {tools.map(tool => (
                <Tooltip key={tool.id} text={tool.tooltip} position="right">
                    <button
                        className={`tool-sidebar-btn ${activeTool === tool.id ? 'active' : ''}`}
                        onClick={() => {
                            if (tool.id === 'upload') onUpload?.();
                            else onToolChange(tool.id === activeTool ? null : tool.id);
                        }}
                    >
                        <span className="tool-sidebar-icon">{tool.icon}</span>
                        <span className="tool-sidebar-label">{tool.label}</span>
                    </button>
                </Tooltip>
            ))}
        </aside>
    );
};
