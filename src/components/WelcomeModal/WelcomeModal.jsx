import React, { useState } from 'react';
import './WelcomeModal.css';

export const WelcomeModal = ({ isOpen, onFolderSelected, onSkip }) => {
    const [step, setStep] = useState('welcome'); // welcome | selecting

    if (!isOpen) return null;

    const handleSelectFolder = async () => {
        setStep('selecting');
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            onFolderSelected(handle);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Folder selection failed:', err);
            }
            setStep('welcome');
        }
    };

    return (
        <div className="modal-overlay welcome-overlay">
            <div className="welcome-modal">
                <div className="welcome-logo">
                    <div className="welcome-logo-icon">S</div>
                    <h1>BioDockify Studio</h1>
                </div>

                <h2>Welcome to BioDockify Studio</h2>
                <p className="welcome-desc">
                    Free, private screen recorder with webcam overlay, AI editing, and YouTube upload.
                    All recordings save directly to your local PC.
                </p>

                <div className="welcome-folder-section">
                    <h3>Choose where to save recordings</h3>
                    <p className="welcome-hint">
                        Your recordings will be saved to this folder. You can change this later.
                    </p>
                    <button className="btn btn-primary btn-lg" onClick={handleSelectFolder}>
                        {step === 'selecting' ? 'Selecting...' : 'Select Folder'}
                    </button>
                </div>

                <div className="welcome-skip">
                    <button className="btn-link" onClick={onSkip}>
                        Skip — use Downloads folder
                    </button>
                </div>

                <div className="welcome-features">
                    <div className="welcome-feature">
                        <span className="wf-icon">Screen</span>
                        <span>Screen + Webcam recording</span>
                    </div>
                    <div className="welcome-feature">
                        <span className="wf-icon">AI</span>
                        <span>AI-powered editing (Ollama)</span>
                    </div>
                    <div className="welcome-feature">
                        <span className="wf-icon">YT</span>
                        <span>Direct YouTube upload</span>
                    </div>
                    <div className="welcome-feature">
                        <span className="wf-icon">Free</span>
                        <span>100% free, no limits</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
