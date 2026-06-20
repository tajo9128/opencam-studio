import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToolSidebar } from '../Sidebar/ToolSidebar';
import { RightPanel } from '../RightPanel/RightPanel';
import { PreviewStage } from '../Preview/PreviewStage';
import { Timeline } from '../Timeline/Timeline';
import { AIAssistant } from '../AI/AIAssistant';
import { useTimeline } from '../../hooks/useTimeline';
import { useAnnotation } from '../../hooks/useAnnotation';
import { useCursorFx } from '../../hooks/useCursorFx';
import { useZoom } from '../../hooks/useZoom';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useAI } from '../../hooks/useAI';
import { useOverlays } from '../../hooks/useOverlays';
import { useStreams } from '../../hooks/useStreams';
import { useRecording } from '../../hooks/useRecording';
import { useAudioLevel } from '../../hooks/useAudioLevel';
import { BACKGROUND_PRESETS } from '../../constants/backgrounds';
import { useClipBin } from '../../hooks/useClipBin';
import { ClipBin } from './ClipBin';
import { ClipMonitor } from './ClipMonitor';
import { Toast } from '../Notifications/Toast';
import './EditMode.css';

export const EditMode = () => {
    const navigate = useNavigate();
    const canvasRef = useRef(null);
    const screenVideoRef = useRef(null);
    const cameraVideoRef = useRef(null);

    const [activeTool, setActiveTool] = useState(null);
    const [rightPanelOpen, setRightPanelOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState([]);
    const [cursorFxEnabled, setCursorFxEnabled] = useState(false);
    const [annotationEnabled, setAnnotationEnabled] = useState(false);
    const [zoomEnabled, setZoomEnabled] = useState(false);
    const [activeBg, _setActiveBg] = useState('none');
    const [webcamShape, _setWebcamShape] = useState('circle');
    const [webcamScale, _setWebcamScale] = useState(0.25);
    const [screenScale, _setScreenScale] = useState(1.0);
    const [aiOpen, setAiOpen] = useState(false);
    const timeline = useTimeline();
    const annotation = useAnnotation(canvasRef, annotationEnabled);
    const { drawCursorFx } = useCursorFx(canvasRef, cursorFxEnabled);
    const { applyZoom, restoreZoom, setZoomLevel } = useZoom(canvasRef, zoomEnabled);
    const ai = useAI();
    const overlays = useOverlays();
    const streams = useStreams(screenVideoRef, cameraVideoRef, () => {});
    const recording = useRecording({
        screenStream: streams?.screenStream,
        cameraStream: streams?.cameraStream,
        activeBg,
        screenScale,
        canvasRef,
    });
    const _audioLevel = useAudioLevel(streams?.audioStream);
    const clipBin = useClipBin();

    const selectedClip = timeline.clips.find(c => c.id === timeline.selectedClipId);

    // Sync activeFilters from selected clip when selection changes
    useEffect(() => {
        setActiveFilters(selectedClip?.filters || []);
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

    const showToast = useCallback((title, msg, type) => {
        setToast({ title, message: msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const importFiles = useCallback((files) => {
        Array.from(files).forEach(file => {
            try {
                const url = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.onloadedmetadata = () => {
                    timeline.addClip(0, {
                        sourceUrl: url,
                        duration: video.duration || 10,
                        sourceEnd: video.duration || 10,
                        label: file.name.replace(/\.[^/.]+$/, ''),
                        type: file.type?.startsWith('audio') ? 'audio' : 'video',
                    });
                };
                video.onerror = () => showToast('Import Error', `${file.name} could not be loaded`, 'error');
                video.src = url;
            } catch (e) {
                console.error('File import failed:', file.name, e);
            }
        });
    }, [timeline, showToast]);

    const handleImportMedia = useCallback((e) => {
        importFiles(e.target.files);
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

    // Keyboard shortcuts
    useKeyboardShortcuts({
        ' ': () => timeline.isPlaying ? timeline.pause() : timeline.play(),
        's': () => timeline.splitAtPlayhead(),
        'delete': () => { if (timeline.selectedClipId) timeline.removeClip(timeline.selectedClipId); },
        'ctrl+z': () => timeline.undo(),
        'ctrl+shift+z': () => timeline.redo(),
        '=': () => timeline.setZoom?.(Math.min((timeline.zoom || 1) + 0.25, 4)),
        '-': () => timeline.setZoom?.(Math.max((timeline.zoom || 1) - 0.25, 0.25)),
        'arrowleft': () => timeline.setCurrentTime?.(Math.max(0, (timeline.currentTime || 0) - 1)),
        'arrowright': () => timeline.setCurrentTime?.((timeline.currentTime || 0) + 1),
        'ctrl+d': () => { if (timeline.selectedClipId) timeline.duplicateClip(timeline.selectedClipId); },
    });

    // Drive canvas preview during timeline playback
    const previewRafRef = useRef(null);
    const currentTimeRef = useRef(timeline.currentTime);

    // Set canvas drawing buffer size
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || timeline.clips.length === 0) return;
        if (canvas.width !== 1920) canvas.width = 1920;
        if (canvas.height !== 1080) canvas.height = 1080;
    }, [timeline.clips.length]);

    // Keep ref in sync with state so rAF loop reads latest time
    useEffect(() => { currentTimeRef.current = timeline.currentTime; }, [timeline.currentTime]);

    useEffect(() => {
        if (!timeline.isPlaying) {
            if (previewRafRef.current) {
                cancelAnimationFrame(previewRafRef.current);
                previewRafRef.current = null;
            }
            return;
        }

        const renderPreview = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d', { alpha: false });
            timeline.renderFrame(ctx, canvas, currentTimeRef.current);
            previewRafRef.current = requestAnimationFrame(renderPreview);
        };

        previewRafRef.current = requestAnimationFrame(renderPreview);
        return () => {
            if (previewRafRef.current) {
                cancelAnimationFrame(previewRafRef.current);
                previewRafRef.current = null;
            }
        };
    }, [timeline.isPlaying, timeline.renderFrame]);

    // Also render a single frame on seek (even when not playing)
    useEffect(() => {
        if (timeline.isPlaying) return;
        const canvas = canvasRef.current;
        if (!canvas || timeline.clips.length === 0) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        timeline.renderFrame(ctx, canvas, timeline.currentTime);
    }, [timeline.currentTime, timeline.isPlaying, timeline.clips.length, timeline.renderFrame]);

    return (
        <div className="edit-mode" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {isDragOver && <div className="edit-drop-overlay"><span>Drop files here</span></div>}

            <div className="edit-mode-main">
                <ToolSidebar activeTool={activeTool} onToolChange={handleToolChange} onUpload={triggerUpload} />

                <div className="edit-mode-canvas">
                    {timeline.clips.length === 0 ? (
                        <div className="edit-drop-zone" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}>
                            <div className="edit-drop-zone-inner">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                <h3>Drop video files here</h3>
                                <p>or click to browse</p>
                                <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); triggerUpload(); }}>Upload Video</button>
                            </div>
                        </div>
                    ) : (
                        <>
                        <PreviewStage
                            canvasRef={canvasRef}
                            screenVideoRef={screenVideoRef}
                            cameraVideoRef={cameraVideoRef}
                            screenStream={streams.screenStream}
                            cameraStream={streams.cameraStream}
                            activeBg={activeBg}
                            webcamShape={webcamShape}
                            webcamScale={webcamScale}
                            screenScale={screenScale}
                            isRecording={recording.isRecording}
                            isPaused={recording.isPaused}
                            webcamOnly={false}
                            cursorFxEnabled={cursorFxEnabled}
                            drawCursorFx={drawCursorFx}
                            annotationEnabled={annotationEnabled}
                            annotationHandlers={annotationEnabled ? {
                                onMouseDown: annotation.handleMouseDown,
                                onMouseMove: annotation.handleMouseMove,
                                onMouseUp: annotation.handleMouseUp,
                            } : null}
                            zoomEnabled={zoomEnabled}
                            applyZoom={applyZoom}
                            restoreZoom={restoreZoom}
                            editMode={true}
                        />
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
                />
            </div>

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
                    isPlaying={timeline.isPlaying}
                    zoom={timeline.zoom}
                    onSelectClip={timeline.setSelectedClipId}
                    onSeek={timeline.seek}
                    onSplit={timeline.splitAtPlayhead}
                    onDelete={timeline.removeClip}
                    onDuplicate={timeline.duplicateClip}
                    onSpeed={timeline.setClipSpeed}
                    onMove={timeline.moveClip}
                    onResize={timeline.resizeClip}
                    onPlay={timeline.play}
                    onPause={timeline.pause}
                    onStop={timeline.stop}
                    onZoomChange={timeline.setZoom}
                    onAddTrack={timeline.addTrack}
                    onRemoveTrack={timeline.removeTrack}
                    onToggleMute={timeline.toggleTrackMute}
                    onToggleLock={timeline.toggleTrackLock}
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

            <div style={{ position: 'fixed', bottom: '0.5rem', right: '0.5rem', zIndex: 50, display: 'flex', gap: '0.3rem' }}>
                <button className="btn btn-outline" style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
                    onClick={() => {
                        const project = { clips: timeline.clips, tracks: timeline.tracks, savedAt: Date.now() };
                        localStorage.setItem('biodockifystudio_project', JSON.stringify(project));
                        alert('Project saved!');
                    }}>Save</button>
                <button className="btn btn-outline" style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
                    onClick={() => {
                        const saved = localStorage.getItem('biodockifystudio_project');
                        if (!saved) return alert('No saved project found.');
                        const project = JSON.parse(saved);
                        project.clips.forEach(c => timeline.addClip(c.trackIndex, c));
                        alert('Project loaded!');
                    }}>Load</button>
            </div>
            <Toast toast={toast} onClose={() => setToast(null)} />
        </div>
    );
};