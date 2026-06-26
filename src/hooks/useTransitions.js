import { useState, useRef, useCallback } from 'react';

export const TRANSITION_TYPES = [
    { id: 'cut', name: 'Cut', duration: 0 },
    { id: 'fade', name: 'Fade', duration: 500 },
    { id: 'dissolve', name: 'Dissolve', duration: 800 },
    { id: 'wipe-left', name: 'Wipe Left', duration: 600 },
    { id: 'wipe-right', name: 'Wipe Right', duration: 600 },
    { id: 'zoom', name: 'Zoom', duration: 500 },
];

export const useTransitions = (canvasRef, renderScene) => {
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [transitionType, setTransitionType] = useState('fade');
    const animRef = useRef(null);

    const transitionTo = useCallback((fromScene, toScene, streams, type = transitionType) => {
        const transition = TRANSITION_TYPES.find(t => t.id === type) || TRANSITION_TYPES[0];
        if (transition.duration === 0 || !canvasRef.current) {
            renderScene(canvasRef.current.getContext('2d'), canvasRef.current, toScene, streams);
            return;
        }

        setIsTransitioning(true);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const startTime = performance.now();
        const duration = transition.duration;

        const fromCanvas = document.createElement('canvas');
        fromCanvas.width = canvas.width;
        fromCanvas.height = canvas.height;
        const fromCtx = fromCanvas.getContext('2d');

        const toCanvas = document.createElement('canvas');
        toCanvas.width = canvas.width;
        toCanvas.height = canvas.height;
        const toCtx = toCanvas.getContext('2d');

        renderScene(fromCtx, fromCanvas, fromScene, streams);
        renderScene(toCtx, toCanvas, toScene, streams);

        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            switch (type) {
                case 'fade':
                case 'dissolve':
                    ctx.globalAlpha = 1 - eased;
                    ctx.drawImage(fromCanvas, 0, 0);
                    ctx.globalAlpha = eased;
                    ctx.drawImage(toCanvas, 0, 0);
                    ctx.globalAlpha = 1;
                    break;

                case 'wipe-left':
                    ctx.drawImage(fromCanvas, 0, 0);
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, canvas.width * eased, canvas.height);
                    ctx.clip();
                    ctx.drawImage(toCanvas, 0, 0);
                    ctx.restore();
                    break;

                case 'wipe-right':
                    ctx.drawImage(fromCanvas, 0, 0);
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(canvas.width * (1 - eased), 0, canvas.width * eased, canvas.height);
                    ctx.clip();
                    ctx.drawImage(toCanvas, 0, 0);
                    ctx.restore();
                    break;

                case 'zoom':
                    ctx.globalAlpha = 1 - eased;
                    ctx.drawImage(fromCanvas, 0, 0);
                    ctx.globalAlpha = 1;
                    const scale = 0.8 + eased * 0.2;
                    const cx = canvas.width / 2;
                    const cy = canvas.height / 2;
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.scale(scale, scale);
                    ctx.translate(-cx, -cy);
                    ctx.globalAlpha = eased;
                    ctx.drawImage(toCanvas, 0, 0);
                    ctx.restore();
                    ctx.globalAlpha = 1;
                    break;
            }

            if (progress < 1) {
                animRef.current = requestAnimationFrame(animate);
            } else {
                setIsTransitioning(false);
            }
        };

        if (animRef.current) cancelAnimationFrame(animRef.current);
        animRef.current = requestAnimationFrame(animate);
    }, [canvasRef, renderScene, transitionType]);

    return {
        isTransitioning,
        transitionType,
        setTransitionType,
        transitionTo,
        TRANSITION_TYPES,
    };
};
