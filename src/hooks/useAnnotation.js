import { useRef, useState, useCallback, useEffect } from 'react';

export const useAnnotation = (canvasRef, enabled) => {
    const [tool, setTool] = useState('pen'); // pen, line, rect, arrow, text
    const [color, setColor] = useState('#ef4444');
    const [strokeWidth, setStrokeWidth] = useState(3);
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const currentPath = useRef([]);
    const isDrawing = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const overlayCanvasRef = useRef(null);

    // Create overlay canvas
    useEffect(() => {
        if (!enabled || !canvasRef.current) return;
        const mainCanvas = canvasRef.current;
        const overlay = document.createElement('canvas');
        overlay.width = mainCanvas.width;
        overlay.height = mainCanvas.height;
        overlayCanvasRef.current = overlay;
    }, [enabled, canvasRef.current?.width, canvasRef.current?.height]);

    const getPos = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
    }, [canvasRef]);

    const handleMouseDown = useCallback((e) => {
        if (!enabled) return;
        isDrawing.current = true;
        const pos = getPos(e);
        startPos.current = pos;

        if (tool === 'pen') {
            currentPath.current = [pos];
        } else if (tool === 'text') {
            isDrawing.current = false;
            const text = prompt('Enter text:');
            if (text) {
                setHistory(prev => [...prev, { type: 'text', x: pos.x, y: pos.y, text, color, strokeWidth }]);
                setRedoStack([]);
            }
        }
    }, [enabled, tool, color, strokeWidth, getPos]);

    const handleMouseMove = useCallback((e) => {
        if (!enabled || !isDrawing.current) return;
        if (tool === 'pen') {
            const pos = getPos(e);
            currentPath.current.push(pos);
        }
    }, [enabled, tool, getPos]);

    const handleMouseUp = useCallback((e) => {
        if (!enabled || !isDrawing.current) return;
        isDrawing.current = false;
        const pos = getPos(e);

        if (tool === 'pen' && currentPath.current.length > 1) {
            setHistory(prev => [...prev, { type: 'pen', points: [...currentPath.current], color, strokeWidth }]);
        } else if (tool === 'line') {
            setHistory(prev => [...prev, { type: 'line', x1: startPos.current.x, y1: startPos.current.y, x2: pos.x, y2: pos.y, color, strokeWidth }]);
        } else if (tool === 'rect') {
            setHistory(prev => [...prev, { type: 'rect', x: startPos.current.x, y: startPos.current.y, w: pos.x - startPos.current.x, h: pos.y - startPos.current.y, color, strokeWidth }]);
        } else if (tool === 'arrow') {
            setHistory(prev => [...prev, { type: 'arrow', x1: startPos.current.x, y1: startPos.current.y, x2: pos.x, y2: pos.y, color, strokeWidth }]);
        }
        setRedoStack([]);
        currentPath.current = [];
    }, [enabled, tool, color, strokeWidth, getPos]);

    const undo = useCallback(() => {
        setHistory(prev => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            setRedoStack(r => [...r, last]);
            return prev.slice(0, -1);
        });
    }, []);

    const redo = useCallback(() => {
        setRedoStack(prev => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            setHistory(h => [...h, last]);
            return prev.slice(0, -1);
        });
    }, []);

    const clearAnnotations = useCallback(() => {
        setRedoStack(prev => [...prev, ...history]);
        setHistory([]);
    }, [history]);

    const drawAnnotations = useCallback((ctx) => {
        if (!enabled && history.length === 0) return;

        history.forEach(item => {
            ctx.save();
            ctx.strokeStyle = item.color;
            ctx.fillStyle = item.color;
            ctx.lineWidth = item.strokeWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            switch (item.type) {
                case 'pen':
                    ctx.beginPath();
                    item.points.forEach((p, i) => {
                        if (i === 0) ctx.moveTo(p.x, p.y);
                        else ctx.lineTo(p.x, p.y);
                    });
                    ctx.stroke();
                    break;
                case 'line':
                    ctx.beginPath();
                    ctx.moveTo(item.x1, item.y1);
                    ctx.lineTo(item.x2, item.y2);
                    ctx.stroke();
                    break;
                case 'rect':
                    ctx.beginPath();
                    ctx.rect(item.x, item.y, item.w, item.h);
                    ctx.stroke();
                    break;
                case 'arrow':
                    const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
                    const headLen = 15;
                    ctx.beginPath();
                    ctx.moveTo(item.x1, item.y1);
                    ctx.lineTo(item.x2, item.y2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(item.x2, item.y2);
                    ctx.lineTo(item.x2 - headLen * Math.cos(angle - Math.PI / 6), item.y2 - headLen * Math.sin(angle - Math.PI / 6));
                    ctx.moveTo(item.x2, item.y2);
                    ctx.lineTo(item.x2 - headLen * Math.cos(angle + Math.PI / 6), item.y2 - headLen * Math.sin(angle + Math.PI / 6));
                    ctx.stroke();
                    break;
                case 'text':
                    ctx.font = `${item.strokeWidth * 6}px sans-serif`;
                    ctx.fillText(item.text, item.x, item.y);
                    break;
            }
            ctx.restore();
        });

        // Draw current pen stroke in progress
        if (isDrawing.current && tool === 'pen' && currentPath.current.length > 1) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = strokeWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            currentPath.current.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.stroke();
            ctx.restore();
        }
    }, [enabled, history, tool, color, strokeWidth]);

    return {
        tool, setTool,
        color, setColor,
        strokeWidth, setStrokeWidth,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        drawAnnotations,
        undo, redo, clearAnnotations,
        hasAnnotations: history.length > 0
    };
};
