import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import './TopBar.css';

const MODES = [
    { id: 'record', label: 'Record', path: '/recorder', icon: 'REC' },
    { id: 'edit', label: 'Edit', path: '/editor', icon: 'EDIT' },
    { id: 'stream', label: 'Stream', path: '/stream', icon: 'LIVE' },
    { id: 'export', label: 'Export', path: '/export', icon: 'OUT' },
];

export const TopBar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { theme, toggleTheme } = useTheme();

    const currentMode = MODES.find(m => location.pathname.startsWith(m.path))?.id || 'record';

    return (
        <header className="topbar">
            <div className="topbar-left">
                <div className="topbar-logo" onClick={() => navigate('/')}>
                    <div className="topbar-logo-icon">S</div>
                    <span className="topbar-logo-text">OpenCam Studio</span>
                </div>
            </div>

            <nav className="topbar-modes">
                {MODES.map(mode => (
                    <button
                        key={mode.id}
                        className={`topbar-mode-btn ${currentMode === mode.id ? 'active' : ''}`}
                        onClick={() => navigate(mode.path)}
                    >
                        <span className="topbar-mode-icon">{mode.icon}</span>
                        <span className="topbar-mode-label">{mode.label}</span>
                    </button>
                ))}
            </nav>

            <div className="topbar-right">
                <button className="topbar-action-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                    {theme === 'dark' ? '☀' : '🌙'}
                </button>
                <button className="topbar-action-btn" onClick={() => navigate('/settings')} title="Settings">
                    ⚙
                </button>
            </div>
        </header>
    );
};
