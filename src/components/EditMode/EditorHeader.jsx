import React from 'react';
import './EditorHeader.css';

export const EditorHeader = ({ mode, onModeChange, projectName }) => {
    return (
        <header className="editor-header">
            <div className="editor-header-left">
                <span className="editor-header-logo">OpenCam Studio</span>
            </div>
            <div className="editor-header-center">
                <span className="editor-header-project">{projectName || 'Untitled Project'}</span>
            </div>
            <div className="editor-header-right">
                <div className="editor-mode-toggle">
                    <button
                        className={`mode-btn ${mode === 'simple' ? 'active' : ''}`}
                        onClick={() => onModeChange('simple')}
                    >
                        Simple
                    </button>
                    <button
                        className={`mode-btn ${mode === 'advanced' ? 'active' : ''}`}
                        onClick={() => onModeChange('advanced')}
                    >
                        Advanced
                    </button>
                </div>
            </div>
        </header>
    );
};
