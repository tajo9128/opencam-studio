import { useEffect, useState, useCallback } from 'react';
import { CursorTelemetry } from '../utils/CursorTelemetry';

export const useCursorFx = (canvasRef, enabled = false) => {
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
    const [clicks, setClicks] = useState([]);
    const [telemetry] = useState(() => new CursorTelemetry());

    const getPos = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0.5, y: 0.5 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
        };
    }, [canvasRef]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !enabled) return;

        const onMove = (e) => {
            const pos = getPos(e);
            setCursorPos(pos);
            telemetry.onMouseMove(pos.x, pos.y);
        };

        const onClick = (e) => {
            const pos = getPos(e);
            setClicks(prev => [...prev, {
                id: Date.now(),
                x: pos.x,
                y: pos.y,
                time: Date.now(),
            }]);
            telemetry.onClick(pos.x, pos.y);
        };

        const onKeyDown = (e) => {
            telemetry.onKey(e.key);
        };

        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('click', onClick);
        window.addEventListener('keydown', onKeyDown);

        return () => {
            canvas.removeEventListener('mousemove', onMove);
            canvas.removeEventListener('click', onClick);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [canvasRef, enabled, getPos, telemetry]);

    useEffect(() => {
        const interval = setInterval(() => {
            setClicks(prev => prev.filter(c => Date.now() - c.time < 600));
        }, 200);
        return () => clearInterval(interval);
    }, []);

    const drawCursorFx = useCallback((ctx, canvasWidth, canvasHeight) => {
        if (!enabled) return;

        const cx = cursorPos.x * canvasWidth;
        const cy = cursorPos.y * canvasHeight;

        ctx.beginPath();
        ctx.arc(cx, cy, 24, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.7)';
        ctx.lineWidth = 3;
        ctx.stroke();

        for (const click of clicks) {
            const age = (Date.now() - click.time) / 600;
            if (age > 1) continue;

            const rippleX = click.x * canvasWidth;
            const rippleY = click.y * canvasHeight;
            const radius = 10 + age * 40;
            const opacity = 1 - age;

            ctx.beginPath();
            ctx.arc(rippleX, rippleY, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(139, 92, 246, ${opacity * 0.8})`;
            ctx.lineWidth = 2.5 - age * 2;
            ctx.stroke();
        }
    }, [enabled, cursorPos, clicks]);

    const startTelemetry = useCallback(() => {
        telemetry.start();
    }, [telemetry]);

    const stopTelemetry = useCallback(() => {
        telemetry.stop();
        return telemetry;
    }, [telemetry]);

    return {
        drawCursorFx,
        telemetry,
        startTelemetry,
        stopTelemetry,
    };
};
