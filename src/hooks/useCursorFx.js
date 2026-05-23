import { useState, useEffect, useCallback, useRef } from 'react';

export const useCursorFx = (canvasRef, enabled) => {
    const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
    const [clicks, setClicks] = useState([]);
    const clickIdRef = useRef(0);

    useEffect(() => {
        if (!enabled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (canvas.width / rect.width),
                y: (e.clientY - rect.top) * (canvas.height / rect.height)
            };
        };

        const onMove = (e) => setCursorPos(getPos(e));
        const onClick = (e) => {
            const pos = getPos(e);
            const id = clickIdRef.current++;
            setClicks(prev => [...prev, { id, x: pos.x, y: pos.y, time: Date.now() }]);
        };

        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('click', onClick);
        return () => {
            canvas.removeEventListener('mousemove', onMove);
            canvas.removeEventListener('click', onClick);
        };
    }, [canvasRef, enabled]);

    useEffect(() => {
        if (clicks.length === 0) return;
        const timer = setInterval(() => {
            setClicks(prev => prev.filter(c => Date.now() - c.time < 600));
        }, 200);
        return () => clearInterval(timer);
    }, [clicks.length]);

    const drawCursorFx = useCallback((ctx, canvasWidth, canvasHeight) => {
        if (!enabled) return;

        // Cursor highlight circle
        if (cursorPos.x >= 0 && cursorPos.y >= 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cursorPos.x, cursorPos.y, 24, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(139, 92, 246, 0.7)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }

        // Click ripples
        clicks.forEach(click => {
            const age = (Date.now() - click.time) / 600;
            const radius = 10 + age * 40;
            const opacity = 1 - age;
            ctx.save();
            ctx.beginPath();
            ctx.arc(click.x, click.y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(139, 92, 246, ${opacity * 0.8})`;
            ctx.lineWidth = Math.max(0.5, 2.5 - age * 2);
            ctx.stroke();
            ctx.restore();
        });
    }, [enabled, cursorPos, clicks]);

    return { drawCursorFx };
};
