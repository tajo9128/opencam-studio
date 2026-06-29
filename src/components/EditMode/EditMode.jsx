import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ToolSidebar } from '../Sidebar/ToolSidebar';
import { RightPanel } from '../RightPanel/RightPanel';
import { Timeline } from '../Timeline/Timeline';
import { AIAssistant } from '../AI/AIAssistant';
import { useTimeline } from '../../hooks/useTimeline';
import { useAnnotation } from '../../hooks/useAnnotation';
import { useZoom } from '../../hooks/useZoom';
import { useAI } from '../../hooks/useAI';
import { useClipBin } from '../../hooks/useClipBin';
import { useOverlays } from '../../hooks/useOverlays';
import { useTimelineKeyboard } from '../../hooks/useTimelineKeyboard';
import { ClipBin } from './ClipBin';
import { ClipMonitor } from './ClipMonitor';
import { Toast } from '../Notifications/Toast';
import UploadZone from '../UploadZone/UploadZone';
import RenderDialog from '../RenderDialog/RenderDialog';
import { TransitionLibrary } from '../Transitions/TransitionLibrary';
import { CursorRenderer } from '../Timeline/CursorRenderer';
import { CursorEffectPanel } from '../Timeline/CursorEffectPanel';
import { recordingStore } from '../../utils/RecordingStore';
import { CursorTelemetry } from '../../utils/CursorTelemetry';
import { useTimelineStore } from '../../store/timelineStore';
import './EditMode.css';

export const EditMode = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { projectId } = useParams();
    const canvasRef = useRef(null);
    const previewVideoRef = useRef(null);

    const [project, setServerProject] = useState(null);
    const [, setServerClips] = useState([]);
    const [projectLoading, setProjectLoading] = useState(!!projectId);
    const [renderOpen, setRenderOpen] = useState(false);

    const timeline = useTimeline();
    const ai = useAI();
    const clipBin = useClipBin();
    const overlays = useOverlays();
    const [zoomEnabled, setZoomEnabled] = useState(false);
    const [, setCursorFxEnabled] = useState(false);
    const { setZoomLevel } = useZoom(canvasRef, zoomEnabled);
    const [activeTool, setActiveTool] = useState(null);
    const [rightPanelOpen, setRightPanelOpen] = useState(false);
    const [videoDimensions, setVideoDimensions] = useState({ width: 1920, height: 1080 });
    const [activeFilters, setActiveFilters] = useState([]);
    const [aiOpen, setAiOpen] = useState(false);
    const [annotationEnabled, setAnnotationEnabled] = useState(false);
    const annotation = useAnnotation(canvasRef, annotationEnabled);
    const setCursorTelemetry = useTimelineStore(s => s.setCursorTelemetry);
    const cursorTelemetry = useTimelineStore(s => s.cursorTelemetry);

    // Stable ref to timeline so mount effects don't capture a stale hook
    const timelineRef = useRef(timeline);
    timelineRef.current = timeline;

    // Auto-import recording from recorder on mount
    useEffect(() => {
        const tl = timelineRef.current;
        if (!tl || projectId) return; // skip if loading a server project
        const serverVideoUrl = location.state?.serverVideoUrl;
        if (serverVideoUrl) {
            tl.addClip(0, {
                sourceUrl: serverVideoUrl,
                duration: 30,
                sourceEnd: 30,
                label: 'Recording',
                type: 'video',
            });
            tl.addClip(4, {
                sourceUrl: serverVideoUrl,
                duration: 30,
                sourceEnd: 30,
                label: 'Recording (audio)',
                type: 'audio',
                color: '#10b981',
            });
        } else {
            const rec = recordingStore.get();
            if (rec?.url && rec.blob) {
                tl.addClip(0, {
                    sourceUrl: rec.url,
                    duration: 10,
                    sourceEnd: 10,
                    label: rec.name || 'Recording',
                    type: 'video',
                });
                tl.addClip(4, {
                    sourceUrl: rec.url,
                    duration: 10,
                    sourceEnd: 10,
                    label: (rec.name || 'Recording') + ' (audio)',
                    type: 'audio',
                    color: '#10b981',
                });
                recordingStore.clear();
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Load project from server if projectId param present
    useEffect(() => {
        if (!projectId) { setProjectLoading(false); return; }
        let cancelled = false;
        fetch(`/api/projects/${projectId}`)
            .then(r => r.json())
            .then(p => {
                if (cancelled || !p || typeof p !== 'object') { setProjectLoading(false); return; }
                setServerProject(p);
                setServerClips(p.clips || []);
                const tl = timelineRef.current;
                if (p.timeline?.tracks?.length > 0 && tl) {
                    const loadedClips = [];
                    for (const track of p.timeline.tracks) {
                        for (const clip of (track.clips || [])) {
                            loadedClips.push({
                                sourceUrl: clip.clipId ? `/api/videos/${clip.clipId}` : null,
                                duration: (clip.sourceEnd || 10) - (clip.sourceStart || 0),
                                sourceStart: clip.sourceStart || 0,
                                sourceEnd: clip.sourceEnd || 10,
                                label: clip.clipId || 'Clip',
                                type: 'video',
                            });
                        }
                    }
                    if (loadedClips.length > 0) {
                        loadedClips.forEach(c => tl.addClip(0, c));
                    }
                }
                if (!cancelled) setProjectLoading(false);
            })
            .catch(() => { if (!cancelled) setProjectLoading(false); });
        return () => { cancelled = true; };
    }, [projectId]);

    // Load cursor telemetry when project has cursorUrl
    useEffect(() => {
        if (project?.cursorUrl) {
            const url = project.cursorUrl.startsWith('http')
                ? project.cursorUrl
                : `http://localhost:8082${project.cursorUrl}`;
            fetch(url)
                .then(r => r.json())
                .then(data => {
                    const telemetry = CursorTelemetry.deserialize(JSON.stringify(data));
                    setCursorTelemetry(telemetry);
                })
                .catch(() => {});
        }
    }, [project, setCursorTelemetry]);

    // Auto-save timeline to server
    const saveTimeoutRef = useRef(null);
    useEffect(() => {
        if (!projectId) return;
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            const tl = timelineRef.current;
            const tracks = tl.tracks.map(t => ({
                id: t.id,
                type: t.type,
                clips: tl.clips.filter(c => c.trackIndex === tl.tracks.indexOf(t)).map(c => ({
                    clipId: c.sourceUrl?.replace('/api/videos/', '') || c.label,
                    sourceStart: c.sourceStart || 0,
                    sourceEnd: c.sourceEnd || c.duration || 10,
                    trackStart: c.startTime || 0,
                    speed: c.speed || 1,
                })),
            }));
            fetch(`/api/projects/${projectId}/timeline`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracks }),
            }).catch(() => {});
        }, 2000);
    }, [timeline.clips, timeline.tracks, projectId]);

    const selectedClip = timeline.clips.find(c => c.id === timeline.selectedClipId);

    // Find the clip at the current playhead position for preview
    const activeClip = timeline.clips.find(c =>
        timeline.currentTime >= c.startTime && timeline.currentTime < c.startTime + c.duration
    ) || timeline.clips[0];

    // Sync activeFilters from selected clip when selection changes
    useEffect(() => {
        setActiveFilters(selectedClip?.filters || []);
        if (selectedClip) setRightPanelOpen(true);
    }, [timeline.selectedClipId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Wrapper that persists filter changes to the clip
    const updateFilters = useCallback((updater) => {
        setActiveFilters(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            if (selectedClip) {
                timeline.updateClip(selectedClip.id, { filters: next });
            }
            return next;
        });
    }, [selectedClip, timeline]);

    // Set transition on selected clip
    const handleSetTransition = useCallback((type) => {
        if (!selectedClip) return;
        timeline.updateClip(selectedClip.id, {
            transitions: { ...selectedClip.transitions, out: type },
        });
    }, [selectedClip, timeline]);

    // Add text overlay
    const handleAddTextOverlay = useCallback((text, x, y, fontSize, duration) => {
        overlays.addTextOverlay(text, x || 50, y || 50, {
            fontSize: fontSize || 24,
            duration: duration || 5,
            startTime: 0,
        });
    }, [overlays]);

    // Import media file into timeline
    const fileInputRef = useRef(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [previewClip, setPreviewClip] = useState(null);
    const [toast, setToast] = useState(null);
    const [uploadQueue, setUploadQueue] = useState([]);

    const showToast = useCallback((title, msg, type) => {
        setToast({ title, message: msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const SERVER_UPLOAD_THRESHOLD = 100 * 1024 * 1024; // 100MB — above this, upload to Docker for proxy generation

    const importFiles = useCallback((files) => {
        Array.from(files).forEach(file => {
            const fileId = `${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
            setUploadQueue(prev => [...prev, { id: fileId, name: file.name, size: file.size, status: 'loading' }]);
            try {
                if (file.size > SERVER_UPLOAD_THRESHOLD) {
                    // Large file — upload to server, edit from 480p proxy (supports 10GB+)
                    const formData = new FormData();
                    formData.append('file', file);
                    fetch('/api/upload', { method: 'POST', body: formData })
                        .then(r => r.json())
                        .then(result => {
                            if (!result.clipId) throw new Error('Upload failed');
                            const proxyUrl = result.proxyUrl || `/api/videos/${result.clipId}`;
                            const baseName = (result.originalName || file.name).replace(/\.[^/.]+$/, '');
                            timeline.addClip(0, {
                                sourceUrl: proxyUrl,
                                duration: result.duration || 10,
                                sourceEnd: result.duration || 10,
                                label: baseName,
                                type: 'video',
                            });
                            timeline.addClip(4, {
                                sourceUrl: proxyUrl,
                                duration: result.duration || 10,
                                sourceEnd: result.duration || 10,
                                label: baseName + ' (audio)',
                                type: 'audio',
                                color: '#10b981',
                            });
                            setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'done' } : f));
                            setTimeout(() => setUploadQueue(prev => prev.filter(f => f.id !== fileId)), 2000);
                        })
                        .catch(() => {
                            setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error', error: 'server upload failed' } : f));
                        });
                    return;
                }
                // Small file — use blob URL (fast, local)
                const url = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.onloadedmetadata = () => {
                    const dur = video.duration || 10;
                    const baseName = file.name.replace(/\.[^/.]+$/, '');
                    const isAudio = file.type?.startsWith('audio');
                    if (isAudio) {
                        // Audio-only → goes on Audio track
                        timeline.addClip(4, {
                            sourceUrl: url, duration: dur, sourceEnd: dur,
                            label: baseName,
                            type: 'audio',
                            color: '#10b981',
                        });
                    } else {
                        // Video → linked video clip on track 0 + audio clip on Audio track
                        timeline.addClip(0, {
                            sourceUrl: url, duration: dur, sourceEnd: dur,
                            label: baseName,
                            type: 'video',
                        });
                        timeline.addClip(4, {
                            sourceUrl: url, duration: dur, sourceEnd: dur,
                            label: baseName + ' (audio)',
                            type: 'audio',
                            color: '#10b981',
                        });
                    }
                    video.removeAttribute('src'); video.load();
                    setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'done' } : f));
                    setTimeout(() => setUploadQueue(prev => prev.filter(f => f.id !== fileId)), 2000);
                };
                video.onerror = () => { URL.revokeObjectURL(url); setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error', error: 'unsupported' } : f)); };
                video.src = url;
            } catch (e) {
                setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error', error: e.message } : f));
            }
        });
    }, [timeline]);

    const handleImportMedia = useCallback((e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        importFiles(files);
        e.target.value = '';
    }, [importFiles]);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (e.dataTransfer.files.length > 0) {
            importFiles(e.dataTransfer.files);
        }
    }, [importFiles]);

    const triggerUpload = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleAddToTimeline = useCallback((clip) => {
        timeline.addClip(0, {
            sourceUrl: clip.url,
            duration: clip.duration || 10,
            sourceEnd: clip.duration || 10,
            label: clip.name.replace(/\.[^/.]+$/, ''),
            type: clip.type.startsWith('audio') ? 'audio' : 'video',
        });
    }, [timeline]);

    const handleBinImport = useCallback((files) => {
        clipBin.importFiles(files);
    }, [clipBin]);

    const handleDropExternal = useCallback((clipId, trackIndex, startTime) => {
        const binClip = clipBin.clips.find(c => c.id === clipId);
        if (!binClip) return;
        timeline.addClip(trackIndex, {
            sourceUrl: binClip.url,
            duration: binClip.duration || 10,
            sourceEnd: binClip.duration || 10,
            startTime,
            label: binClip.name.replace(/\.[^/.]+$/, ''),
            type: binClip.type?.startsWith('audio') ? 'audio' : 'video',
        });
    }, [clipBin.clips, timeline]);

    const handlePreviewClip = useCallback((clip) => {
        setPreviewClip(clip);
    }, []);

    const handleInsertClip = useCallback(({ sourceStart, sourceEnd, duration: dur }) => {
        if (!previewClip) return;
        timeline.addClip(0, {
            sourceUrl: previewClip.url,
            duration: dur,
            sourceStart,
            sourceEnd,
            label: previewClip.name.replace(/\.[^/.]+$/, ''),
            type: 'video',
        });
        setPreviewClip(null);
    }, [previewClip, timeline]);

    const handleOverwriteClip = useCallback(({ sourceStart, sourceEnd, duration: dur }) => {
        if (!previewClip) return;
        timeline.addClip(0, {
            sourceUrl: previewClip.url,
            duration: dur,
            sourceStart,
            sourceEnd,
            startTime: timeline.currentTime,
            label: previewClip.name.replace(/\.[^/.]+$/, ''),
            type: 'video',
        });
        setPreviewClip(null);
    }, [previewClip, timeline]);

    const handleClipUploaded = useCallback((result) => {
        timeline.addClip(0, {
            sourceUrl: `/api/videos/${result.clipId}`,
            duration: result.duration || 10,
            sourceEnd: result.duration || 10,
            label: result.originalName?.replace(/\.[^/.]+$/, '') || 'Upload',
            type: 'video',
        });
        setServerClips(prev => [...prev, result]);
    }, [timeline]);

    const handleToolChange = useCallback((tool) => {
        setActiveTool(tool);
        if (tool && ['filter', 'transition', 'keyframe', 'text'].includes(tool)) {
            setRightPanelOpen(true);
        } else if (!tool) {
            setRightPanelOpen(false);
        }
        // Handle annotation toggle
        if (tool === 'draw') setAnnotationEnabled(true);
        else setAnnotationEnabled(false);
    }, []);

    const handleAICommand = useCallback((command) => {
        if (!command || !command.action) return;

        const clipId = command.clipId || timeline.selectedClipId;

        switch (command.action) {
            // === EDITING ===
            case 'split':
                timeline.splitAtPlayhead();
                break;
            case 'delete_clip':
                if (clipId) timeline.removeClip(clipId);
                break;
            case 'duplicate_clip':
                if (clipId) timeline.duplicateClip(clipId);
                break;
            case 'set_speed': {
                const speed = Math.max(0.25, Math.min(4, command.speed || 1));
                if (clipId) timeline.setClipSpeed(clipId, speed);
                break;
            }
            case 'trim': {
                if (clipId && command.end !== undefined) {
                    const clip = timeline.clips.find(c => c.id === clipId);
                    if (clip) {
                        const startTime = command.start ?? clip.startTime;
                        const newDuration = command.end - startTime;
                        timeline.updateClip(clipId, {
                            startTime,
                            duration: Math.max(0.1, newDuration),
                        });
                    }
                }
                break;
            }
            case 'trim_end': {
                if (clipId && command.seconds) {
                    const clip = timeline.clips.find(c => c.id === clipId);
                    if (clip) {
                        timeline.updateClip(clipId, {
                            duration: Math.max(0.1, clip.duration - command.seconds),
                        });
                    }
                }
                break;
            }

            // === FILTERS ===
            case 'apply_filter': {
                if (clipId) {
                    const clip = timeline.clips.find(c => c.id === clipId);
                    if (clip) {
                        const newFilter = { filterId: command.filter, params: command.params || {} };
                        const existing = clip.filters || [];
                        // Replace if same filter exists, else append
                        const idx = existing.findIndex(f => f.filterId === command.filter);
                        const updated = idx >= 0
                            ? existing.map((f, i) => i === idx ? newFilter : f)
                            : [...existing, newFilter];
                        timeline.updateClip(clipId, { filters: updated });
                        setActiveFilters(updated);
                    }
                }
                break;
            }
            case 'remove_filter': {
                if (clipId && command.filter) {
                    const clip = timeline.clips.find(c => c.id === clipId);
                    if (clip) {
                        const updated = (clip.filters || []).filter(f => f.filterId !== command.filter);
                        timeline.updateClip(clipId, { filters: updated });
                        setActiveFilters(updated);
                    }
                }
                break;
            }
            case 'remove_all_filters': {
                if (clipId) {
                    timeline.updateClip(clipId, { filters: [] });
                    setActiveFilters([]);
                }
                break;
            }

            // === TRANSITIONS ===
            case 'set_transition': {
                if (clipId) {
                    const clip = timeline.clips.find(c => c.id === clipId);
                    if (clip) {
                        timeline.updateClip(clipId, {
                            transitions: { ...clip.transitions, out: command.type },
                        });
                    }
                }
                break;
            }

            // === KEYFRAMES ===
            case 'add_keyframe': {
                if (clipId && command.param && command.time !== undefined && command.value !== undefined) {
                    timeline.addKeyframe(clipId, command.param, command.time, command.value, command.interpolation || 'linear');
                }
                break;
            }
            case 'remove_keyframe': {
                if (clipId && command.param && command.time !== undefined) {
                    timeline.removeKeyframe(clipId, command.param, command.time);
                }
                break;
            }

            // === ZOOM (preview zoom, not timeline zoom) ===
            case 'zoom': {
                setZoomEnabled(true);
                const level = command.level || 3;
                setZoomLevel(level);
                break;
            }

            // === CURSOR FX ===
            case 'cursor_fx':
                setCursorFxEnabled(command.enabled !== false);
                break;

            // === ANNOTATION ===
            case 'annotate':
                setAnnotationEnabled(true);
                setActiveTool('draw');
                if (command.tool) annotation.setTool(command.tool);
                if (command.color) annotation.setColor(command.color);
                break;

            // === TEXT / TITLE OVERLAYS ===
            case 'title':
            case 'add_text':
                overlays.addTextOverlay(
                    command.text || 'Title',
                    command.x || 50,
                    command.y || 50,
                    {
                        fontSize: command.fontSize || (command.action === 'title' ? 36 : 24),
                        duration: command.duration || 5,
                        startTime: command.action === 'title' && command.position === 'end' ? -3 : 0,
                    }
                );
                break;

            // === EXPORT ===
            case 'export_gif':
            case 'thumbnail':
            case 'description':
                navigate('/export');
                break;

            // === SCENES / SOURCES ===
            case 'switch_scene':
            case 'add_scene':
            case 'add_source':
                // Scene management handled by streaming mode; show info
                break;

            // === RECORDING (handled elsewhere in recording mode) ===
            case 'start_recording':
            case 'stop_recording':
            case 'pause_recording':
            case 'resume_recording':
            case 'set_quality':
            case 'set_format':
                // Recording commands are handled in recording mode
                break;

            // === AUDIO ===
            case 'set_volume':
            case 'mute':
            case 'unmute':
            case 'apply_audio_effect':
            case 'remove_audio_effect':
                // Audio commands — volume control would need audio track integration
                break;

            // === SUBTITLES ===
            case 'transcribe':
            case 'add_subtitle':
                // Would need subtitle track integration
                break;

            default:
                // chat, help, unknown — no action needed
                break;
        }
    }, [timeline, annotation, overlays, navigate, setZoomLevel]);

    // Wire AI sendMessage to execute returned commands
    const handleAISend = useCallback(async (text) => {
        const command = await ai.sendMessage(text);
        if (command) handleAICommand(command);
    }, [ai, handleAICommand]);

    // Wire keyboard shortcuts via dedicated hook
    useTimelineKeyboard({
        play: timeline.play,
        pause: timeline.pause,
        isPlaying: timeline.isPlaying,
    });

    // Sync preview video with timeline playback + honor track mute
    const activeTrack = activeClip ? timeline.tracks[activeClip.trackIndex] : null;
    useEffect(() => {
        const vid = previewVideoRef.current;
        if (!vid || timeline.clips.length === 0 || !activeClip) return;
        const sourceTime = (timeline.currentTime - activeClip.startTime) + (activeClip.sourceStart || 0);

        // Track mute → preview muted (audio still in source, just silence)
        vid.muted = activeTrack?.muted ? true : false;

        if (timeline.isPlaying) {
            if (Math.abs(vid.currentTime - sourceTime) > 0.3) {
                vid.currentTime = Math.max(0, sourceTime);
            }
            if (vid.paused) {
                vid.play().then(() => {
                    // Some browsers require muted to unlock autoplay; unmute right after
                    if (vid.muted && !activeTrack?.muted) vid.muted = false;
                }).catch(() => {
                    // Autoplay blocked — try muted autoplay then unmute
                    vid.muted = true;
                    vid.play().catch(() => {});
                });
            }
        } else {
            if (!vid.paused) vid.pause();
            vid.currentTime = Math.max(0, sourceTime);
        }
    }, [timeline.isPlaying, timeline.currentTime, activeClip, activeTrack]);

    return (
        <div className="edit-mode" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {isDragOver && <div className="edit-drop-overlay"><span>Drop files here</span></div>}

            <div className="edit-mode-main">
                <ToolSidebar activeTool={activeTool} onToolChange={handleToolChange} onUpload={triggerUpload} />

                <div className="edit-mode-canvas">
                    {projectLoading ? (
                        <div className="edit-drop-zone"><div className="edit-drop-zone-inner"><h3>Loading project...</h3></div></div>
                    ) : timeline.clips.length === 0 && !projectId ? (
                        <div className="edit-drop-zone" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}>
                            <div className="edit-drop-zone-inner">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                <h3>Drop video files here</h3>
                                <p>or click to browse</p>
                                <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); triggerUpload(); }}>Upload Video</button>
                            </div>
                        </div>
                    ) : timeline.clips.length === 0 && projectId ? (
                        <UploadZone onClipUploaded={handleClipUploaded} />
                    ) : (
                        <>
                        {/* Simple video preview — no canvas for basic edit */}
                        <div className="edit-preview-video" style={{ position: 'relative' }}>
                            {activeClip?.sourceUrl ? (
                                <video
                                    key={activeClip.id}
                                    ref={previewVideoRef}
                                    src={activeClip.sourceUrl}
                                    style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, background: '#000' }}
                                    onLoadedMetadata={(e) => {
                                        setVideoDimensions({ width: e.target.videoWidth, height: e.target.videoHeight });
                                    }}
                                />
                            ) : (
                                <div className="preview-placeholder">No video source available</div>
                            )}
                            {cursorTelemetry && (
                                <CursorRenderer
                                    videoRef={previewVideoRef}
                                    canvasWidth={videoDimensions.width}
                                    canvasHeight={videoDimensions.height}
                                />
                            )}
                        </div>
                        {/* Transport bar below preview */}
                        <div className="edit-transport-bar">
                            <button className="edit-transport-btn" onClick={timeline.stop} title="Stop">⏮</button>
                            <button className="edit-transport-btn edit-transport-play" onClick={timeline.isPlaying ? timeline.pause : timeline.play}>
                                {timeline.isPlaying ? '⏸' : '▶'}
                            </button>
                            <span className="edit-transport-time">
                                {Math.floor(timeline.currentTime / 60)}:{String(Math.floor(timeline.currentTime % 60)).padStart(2, '0')}
                            </span>
                            <span className="edit-transport-sep">/</span>
                            <span className="edit-transport-duration">
                                {Math.floor(timeline.duration / 60)}:{String(Math.floor(timeline.duration % 60)).padStart(2, '0')}
                            </span>
                        </div>
                        </>
                    )}
                </div>

                <TransitionLibrary />
                <RightPanel
                    isOpen={rightPanelOpen}
                    onClose={() => { setRightPanelOpen(false); setActiveTool(null); }}
                    activeTool={activeTool}
                    selectedClip={selectedClip}
                    activeFilters={activeFilters}
                    setActiveFilters={updateFilters}
                    onRemoveKeyframe={timeline.removeKeyframe}
                    onAddKeyframe={timeline.addKeyframe}
                    onSetTransition={handleSetTransition}
                    onAddTextOverlay={handleAddTextOverlay}
                    allClips={timeline.clips}
                />
                {cursorTelemetry && <CursorEffectPanel />}
            </div>

            {uploadQueue.length > 0 && (
                <div style={{
                    background: 'var(--nav-bg)', borderTop: '1px solid var(--glass-border)',
                    borderBottom: '1px solid var(--glass-border)', padding: '0.4rem 0.8rem',
                    display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center',
                    fontSize: '0.7rem', overflow: 'hidden'
                }}>
                    {uploadQueue.map(f => (
                        <div key={f.id} style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.15rem 0.5rem', borderRadius: 6,
                            background: f.status === 'done' ? 'rgba(16,185,129,0.1)' :
                                        f.status === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--glass)',
                            border: `1px solid ${f.status === 'done' ? 'var(--success)' :
                                              f.status === 'error' ? 'var(--danger)' : 'var(--glass-border)'}`,
                        }}>
                            <span>{f.status === 'loading' ? '⏳' : f.status === 'done' ? '✅' : '❌'}</span>
                            <span style={{ color: 'var(--text-main)' }}>{f.name}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{(f.size / 1024 / 1024).toFixed(0)}MB</span>
                            <span style={{ color: f.status === 'done' ? 'var(--success)' : f.status === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
                                {f.status === 'loading' ? 'Importing...' : f.status === 'done' ? 'Done' : f.error || 'Error'}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div className="edit-mode-timeline">
                <input ref={fileInputRef} type="file" accept="video/*,audio/*" multiple style={{ display: 'none' }} onChange={handleImportMedia} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                    <button className="btn btn-primary" onClick={triggerUpload}>+ Import Media</button>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>or drag files anywhere on the page</span>
                </div>
                <div style={{ flex: '0 0 auto', maxHeight: '160px', overflow: 'hidden' }}>
                    <ClipBin
                        clips={clipBin.clips}
                        onImport={handleBinImport}
                        onRemove={clipBin.removeClip}
                        onAddToTimeline={handleAddToTimeline}
                        onPreview={handlePreviewClip}
                    />
                </div>
                <Timeline
                    clips={timeline.clips}
                    tracks={timeline.tracks}
                    currentTime={timeline.currentTime}
                    duration={timeline.duration}
                    selectedClipId={timeline.selectedClipId}
                    zoom={timeline.zoom}
                    onSelectClip={timeline.setSelectedClipId}
                    onSeek={timeline.seek}
                    onSplit={timeline.splitAtPlayhead}
                    onDelete={timeline.removeClip}
                    onDuplicate={timeline.duplicateClip}
                    onSpeed={timeline.setClipSpeed}
                    onMove={timeline.moveClip}
                    onResize={timeline.resizeClip}
                    onPlayPause={() => timeline.isPlaying ? timeline.pause() : timeline.play()}
                    onStop={timeline.stop}
                    onZoomChange={timeline.setZoom}
                    onAddTrack={timeline.addTrack}
                    onRemoveTrack={timeline.removeTrack}
                    onToggleMute={timeline.toggleTrackMute}
                    onToggleLock={timeline.toggleTrackLock}
                    onDropExternal={handleDropExternal}
                />
            </div>

            <AIAssistant
                isOpen={aiOpen}
                onToggle={() => setAiOpen(!aiOpen)}
                messages={ai.messages}
                isProcessing={ai.isProcessing}
                isStreaming={ai.isStreaming}
                onSend={handleAISend}
                onClear={ai.clearMessages}
                ollamaConnected={ai.ollamaConnected}
                ollamaModel={ai.ollamaModel}
                ollamaModels={ai.ollamaModels}
                onSetOllamaModel={ai.setOllamaModel}
                onCheckOllama={ai.checkOllama}
                apiKey={ai.apiKey}
                onApiKeyChange={ai.setApiKey}
                voiceInput={ai.isListening}
                onStartVoice={ai.startListening}
                onStopVoice={ai.stopListening}
            />

            {previewClip && (
                <ClipMonitor
                    clip={previewClip}
                    onInsert={handleInsertClip}
                    onOverwrite={handleOverwriteClip}
                    onClose={() => setPreviewClip(null)}
                />
            )}

            {projectId && (
                <div style={{ position: 'fixed', bottom: '0.5rem', right: '0.5rem', zIndex: 50, display: 'flex', gap: '0.3rem' }}>
                    <button className="btn btn-outline" style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
                        onClick={() => navigate('/projects')}>Back</button>
                    <button className="btn btn-primary" style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
                        onClick={() => setRenderOpen(true)}>Render</button>
                </div>
            )}
            {!projectId && (
                <div style={{ position: 'fixed', bottom: '0.5rem', right: '0.5rem', zIndex: 50, display: 'flex', gap: '0.3rem' }}>
                    <button className="btn btn-outline" style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
                        onClick={() => {
                            const project = { clips: timeline.clips, tracks: timeline.tracks, savedAt: Date.now() };
                            localStorage.setItem('opencam_studio_project', JSON.stringify(project));
                            showToast('Saved', 'Project saved to browser storage', 'success');
                        }}>Save</button>
                    <button className="btn btn-outline" style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
                        onClick={() => {
                            const saved = localStorage.getItem('opencam_studio_project');
                            if (!saved) { showToast('Error', 'No saved project found.', 'error'); return; }
                            const project = JSON.parse(saved);
                            project.clips.forEach(c => timeline.addClip(c.trackIndex, c));
                            showToast('Loaded', 'Project loaded from browser storage', 'success');
                        }}>Load</button>
                </div>
            )}
            {renderOpen && projectId && (
                <RenderDialog projectId={projectId} onClose={() => setRenderOpen(false)} />
            )}
            <Toast toast={toast} onClose={() => setToast(null)} />
        </div>
    );
};