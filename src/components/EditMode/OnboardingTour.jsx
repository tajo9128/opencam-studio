import React, { useState, useEffect } from 'react';
import './OnboardingTour.css';

const STEPS = [
    {
        title: 'Import your video',
        text: 'Click here or drag a video file anywhere on the page.',
        target: '.tool-sidebar-btn:first-child',
    },
    {
        title: 'Move the playhead',
        text: 'Click on the timeline to set where you want to edit.',
        target: '.tl-playhead',
    },
    {
        title: 'Split or cut',
        text: 'Split divides a clip into two. Cut removes the part before the playhead.',
        target: '.tl-transport',
    },
    {
        title: 'Add effects',
        text: 'Add text, filters, and transitions to polish your video.',
        target: '.tool-sidebar',
    },
];

export const OnboardingTour = ({ onComplete }) => {
    const [step, setStep] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const [targetRect, setTargetRect] = useState(null);

    useEffect(() => {
        if (dismissed) return;
        const selector = STEPS[step]?.target;
        const el = selector ? document.querySelector(selector) : null;
        if (el) {
            el.classList.add('onboarding-target-active');
            setTargetRect(el.getBoundingClientRect());
        } else {
            setTargetRect(null);
        }
        return () => {
            if (el) el.classList.remove('onboarding-target-active');
        };
    }, [step, dismissed]);

    if (dismissed) return null;

    const currentStep = STEPS[step];
    const isLast = step === STEPS.length - 1;

    const handleNext = () => {
        if (isLast) {
            localStorage.setItem('opencam_editor_tour_dismissed', 'true');
            setDismissed(true);
            onComplete?.();
        } else {
            setStep(s => s + 1);
        }
    };

    const handleSkip = () => {
        localStorage.setItem('opencam_editor_tour_dismissed', 'true');
        setDismissed(true);
        onComplete?.();
    };

    const cardStyle = targetRect
        ? {
              position: 'fixed',
              top: Math.min(targetRect.bottom + 12, window.innerHeight - 220),
              left: Math.max(12, Math.min(
                  targetRect.left + targetRect.width / 2 - 200,
                  window.innerWidth - 412
              )),
          }
        : undefined;

    return (
        <div className="onboarding-overlay">
            <div className="onboarding-card" style={cardStyle}>
                <div className="onboarding-step">{step + 1} / {STEPS.length}</div>
                <h3 className="onboarding-title">{currentStep.title}</h3>
                <p className="onboarding-text">{currentStep.text}</p>
                <div className="onboarding-actions">
                    <button className="onboarding-skip" onClick={handleSkip}>Skip Tour</button>
                    <button className="onboarding-next" onClick={handleNext}>
                        {isLast ? 'Get Started' : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    );
};
