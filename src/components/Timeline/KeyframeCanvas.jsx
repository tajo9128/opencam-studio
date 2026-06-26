import React, { useRef, useEffect, useCallback } from 'react';
import './KeyframeCanvas.css';

const DIAMOND_SIZE = 8;
const CANVAS_HEIGHT = 24;

export const KeyframeCanvas = ({
    clip,
    zoom,
    onAddKeyframe,
    onRemoveKeyframe,
    onSelectKeyframe,
    selectedParam = null,
}) => {
    const canvasRef = useRef(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const keyframes = clip.keyframes || {};
        const params = selectedParam ? { [selectedParam]: keyframes[selectedParam] || [] } : keyframes;

        for (const [, kfs] of Object.entries(params)) {
            if (!kfs || kfs.length === 0) continue;

            // Draw interpolation lines
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(139, 92, 246, 0.6)';
            ctx.lineWidth = 1.5;

            for (let i = 0; i < kfs.length; i++) {
                const kf = kfs[i];
                const x = (kf.time / clip.duration) * w;
                const y = h / 2;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    const prev = kfs[i - 1];
                    const prevX = (prev.time / clip.duration) * w;
                    const midX = (prevX + x) / 2;
                    ctx.quadraticCurveTo(midX, y - 4, x, y);
                }
            }
            ctx.stroke();

            // Draw diamonds
            for (const kf of kfs) {
                const x = (kf.time / clip.duration) * w;
                const y = h / 2;

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.PI / 4);
                ctx.fillStyle = '#8b5cf6';
                ctx.fillRect(-DIAMOND_SIZE / 2, -DIAMOND_SIZE / 2, DIAMOND_SIZE, DIAMOND_SIZE);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.strokeRect(-DIAMOND_SIZE / 2, -DIAMOND_SIZE / 2, DIAMOND_SIZE, DIAMOND_SIZE);
                ctx.restore();
            }
        }
    }, [clip, zoom, selectedParam]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resizeObserver = new ResizeObserver(() => {
            canvas.width = canvas.parentElement?.offsetWidth || 200;
            canvas.height = CANVAS_HEIGHT;
            draw();
        });
        resizeObserver.observe(canvas.parentElement);
        return () => resizeObserver.disconnect();
    }, [draw]);

    const handleClick = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x / canvas.width) * clip.duration;

        const keyframes = clip.keyframes || {};
        for (const [param, kfs] of Object.entries(keyframes)) {
            for (const kf of kfs) {
                const kfX = (kf.time / clip.duration) * canvas.width;
                if (Math.abs(kfX - x) < DIAMOND_SIZE) {
                    if (e.detail === 2) {
                        onRemoveKeyframe?.(clip.id, selectedParam || param, kf.time);
                    } else {
                        onSelectKeyframe?.(kf);
                    }
                    return;
                }
            }
        }

        if (selectedParam) {
            onAddKeyframe?.(clip.id, selectedParam, time, 1.0, 'linear');
        }
    }, [clip, selectedParam, onAddKeyframe, onRemoveKeyframe, onSelectKeyframe]);

    return (
        <canvas
            ref={canvasRef}
            className="tl-keyframe-canvas"
            onClick={handleClick}
        />
    );
};
