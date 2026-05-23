import { useState, useCallback, useRef } from 'react';
import { applyFilters } from '../utils/FilterEngine';

let sceneIdCounter = 0;
let sourceIdCounter = 0;

const createSource = (overrides = {}) => ({
    id: `src_${++sourceIdCounter}`,
    type: 'screen', // screen, camera, image, text, color
    name: 'Source',
    config: {},
    transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, crop: { top: 0, right: 0, bottom: 0, left: 0 } },
    visible: true,
    locked: false,
    filters: [],
    audio: { enabled: true, volume: 100, muted: false },
    ...overrides,
});

const DEFAULT_SCENES = [
    {
        name: 'Screen Only',
        color: '#8b5cf6',
        sources: [
            { type: 'screen', name: 'Screen', config: { displaySurface: 'monitor' }, transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, crop: { top: 0, right: 0, bottom: 0, left: 0 } } },
        ],
    },
    {
        name: 'Camera + Screen PiP',
        color: '#10b981',
        sources: [
            { type: 'screen', name: 'Screen', config: { displaySurface: 'monitor' }, transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, crop: { top: 0, right: 0, bottom: 0, left: 0 } } },
            { type: 'camera', name: 'Camera', config: {}, transform: { x: 0.72, y: 0.65, width: 0.25, height: 0.3, rotation: 0, opacity: 1, crop: { top: 0, right: 0, bottom: 0, left: 0 } } },
        ],
    },
    {
        name: 'Full Camera',
        color: '#ef4444',
        sources: [
            { type: 'camera', name: 'Camera', config: {}, transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, crop: { top: 0, right: 0, bottom: 0, left: 0 } } },
        ],
    },
    {
        name: 'Screen + Webcam Side',
        color: '#f59e0b',
        sources: [
            { type: 'screen', name: 'Screen', config: { displaySurface: 'monitor' }, transform: { x: 0, y: 0, width: 0.66, height: 1, rotation: 0, opacity: 1, crop: { top: 0, right: 0, bottom: 0, left: 0 } } },
            { type: 'camera', name: 'Camera', config: {}, transform: { x: 0.67, y: 0, width: 0.33, height: 0.5, rotation: 0, opacity: 1, crop: { top: 0, right: 0, bottom: 0, left: 0 } } },
        ],
    },
];

export const useScenes = () => {
    const [scenes, setScenes] = useState(() => {
        // Load from localStorage or use defaults
        try {
            const saved = localStorage.getItem('screenstudio_scenes');
            if (saved) return JSON.parse(saved);
        } catch {}
        return DEFAULT_SCENES.map(s => ({
            id: `scene_${++sceneIdCounter}`,
            ...s,
            sources: s.sources.map(src => createSource(src)),
        }));
    });
    const [activeSceneId, setActiveSceneId] = useState(null);
    const hotkeyMap = useRef({}); // key → sceneId

    const activeScene = scenes.find(s => s.id === activeSceneId) || scenes[0];

    const persist = useCallback((updated) => {
        try { localStorage.setItem('screenstudio_scenes', JSON.stringify(updated)); } catch {}
    }, []);

    const addScene = useCallback((name = 'New Scene', color = '#8b5cf6') => {
        const scene = {
            id: `scene_${++sceneIdCounter}`,
            name,
            color,
            sources: [],
        };
        setScenes(prev => {
            const updated = [...prev, scene];
            persist(updated);
            return updated;
        });
        return scene;
    }, [persist]);

    const removeScene = useCallback((sceneId) => {
        setScenes(prev => {
            const updated = prev.filter(s => s.id !== sceneId);
            persist(updated);
            return updated;
        });
        if (activeSceneId === sceneId) setActiveSceneId(scenes[0]?.id || null);
    }, [activeSceneId, scenes, persist]);

    const duplicateScene = useCallback((sceneId) => {
        const source = scenes.find(s => s.id === sceneId);
        if (!source) return;
        const dup = {
            ...JSON.parse(JSON.stringify(source)),
            id: `scene_${++sceneIdCounter}`,
            name: `${source.name} Copy`,
            sources: source.sources.map(s => ({ ...s, id: `src_${++sourceIdCounter}` })),
        };
        setScenes(prev => {
            const updated = [...prev, dup];
            persist(updated);
            return updated;
        });
    }, [scenes, persist]);

    const updateScene = useCallback((sceneId, updates) => {
        setScenes(prev => {
            const updated = prev.map(s => s.id === sceneId ? { ...s, ...updates } : s);
            persist(updated);
            return updated;
        });
    }, [persist]);

    // Source management
    const addSource = useCallback((sceneId, sourceData) => {
        const source = createSource(sourceData);
        setScenes(prev => {
            const updated = prev.map(s => {
                if (s.id !== sceneId) return s;
                return { ...s, sources: [...s.sources, source] };
            });
            persist(updated);
            return updated;
        });
        return source;
    }, [persist]);

    const removeSource = useCallback((sceneId, sourceId) => {
        setScenes(prev => {
            const updated = prev.map(s => {
                if (s.id !== sceneId) return s;
                return { ...s, sources: s.sources.filter(src => src.id !== sourceId) };
            });
            persist(updated);
            return updated;
        });
    }, [persist]);

    const updateSource = useCallback((sceneId, sourceId, updates) => {
        setScenes(prev => {
            const updated = prev.map(s => {
                if (s.id !== sceneId) return s;
                return {
                    ...s,
                    sources: s.sources.map(src => src.id === sourceId ? { ...src, ...updates } : src),
                };
            });
            persist(updated);
            return updated;
        });
    }, [persist]);

    const moveSource = useCallback((sceneId, sourceId, newIndex) => {
        setScenes(prev => {
            const updated = prev.map(s => {
                if (s.id !== sceneId) return s;
                const sources = [...s.sources];
                const idx = sources.findIndex(src => src.id === sourceId);
                if (idx < 0) return s;
                const [moved] = sources.splice(idx, 1);
                sources.splice(newIndex, 0, moved);
                return { ...s, sources };
            });
            persist(updated);
            return updated;
        });
    }, [persist]);

    const reorderSources = useCallback((sceneId, fromIndex, toIndex) => {
        setScenes(prev => {
            const updated = prev.map(s => {
                if (s.id !== sceneId) return s;
                const sources = [...s.sources];
                const [moved] = sources.splice(fromIndex, 1);
                sources.splice(toIndex, 0, moved);
                return { ...s, sources };
            });
            persist(updated);
            return updated;
        });
    }, [persist]);

    // Hotkey assignment
    const setHotkey = useCallback((key, sceneId) => {
        hotkeyMap.current[key] = sceneId;
    }, []);

    // Render scene onto canvas
    const renderScene = useCallback((ctx, canvas, scene, streams) => {
        if (!scene || !ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (const source of scene.sources) {
            if (!source.visible) continue;
            const { x, y, width: sw, height: sh, rotation, opacity, crop } = source.transform;

            const sx = x * canvas.width;
            const sy = y * canvas.height;
            const sWidth = sw * canvas.width;
            const sHeight = sh * canvas.height;

            ctx.save();
            ctx.globalAlpha = opacity;

            if (rotation !== 0) {
                ctx.translate(sx + sWidth / 2, sy + sHeight / 2);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.translate(-(sx + sWidth / 2), -(sy + sHeight / 2));
            }

            // Get video element for this source
            let videoEl = null;
            if (source.type === 'screen' && streams?.screenStream) {
                if (!streams._screenVideo) {
                    streams._screenVideo = document.createElement('video');
                    streams._screenVideo.srcObject = streams.screenStream;
                    streams._screenVideo.play().catch(() => {});
                }
                videoEl = streams._screenVideo;
            } else if (source.type === 'camera' && streams?.cameraStream) {
                if (!streams._cameraVideo) {
                    streams._cameraVideo = document.createElement('video');
                    streams._cameraVideo.srcObject = streams.cameraStream;
                    streams._cameraVideo.play().catch(() => {});
                }
                videoEl = streams._cameraVideo;
            }

            if (videoEl && videoEl.readyState >= 2) {
                // Apply crop
                const cropX = (crop?.left || 0) * videoEl.videoWidth;
                const cropY = (crop?.top || 0) * videoEl.videoHeight;
                const cropW = videoEl.videoWidth - cropX - (crop?.right || 0) * videoEl.videoWidth;
                const cropH = videoEl.videoHeight - cropY - (crop?.bottom || 0) * videoEl.videoHeight;

                ctx.drawImage(videoEl, cropX, cropY, cropW, cropH, sx, sy, sWidth, sHeight);
            } else if (source.type === 'text') {
                const cfg = source.config || {};
                ctx.fillStyle = cfg.color || '#ffffff';
                ctx.font = `${cfg.fontWeight || 'bold'} ${cfg.fontSize || 24}px ${cfg.fontFamily || 'Outfit, sans-serif'}`;
                ctx.textAlign = cfg.align || 'left';
                ctx.fillText(cfg.text || '', sx, sy + (cfg.fontSize || 24));
                ctx.textAlign = 'start';
            } else if (source.type === 'color') {
                ctx.fillStyle = source.config?.color || '#000000';
                ctx.fillRect(sx, sy, sWidth, sHeight);
            } else if (source.type === 'image' && source.config?.img) {
                ctx.drawImage(source.config.img, sx, sy, sWidth, sHeight);
            }

            // Apply source filters
            if (source.filters?.length > 0) {
                applyFilters(ctx, canvas, source.filters);
            }

            ctx.restore();
        }
    }, []);

    return {
        scenes, activeScene, activeSceneId,
        setActiveSceneId, addScene, removeScene, duplicateScene, updateScene,
        addSource, removeSource, updateSource, moveSource, reorderSources,
        setHotkey, renderScene,
    };
};
