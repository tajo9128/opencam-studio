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
    const { applyZoom, restoreZoom, setZoomLevel, setPanOffset } = useZoom(canvasRef, zoomEnabled);
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

    const selectedClip = timeline.clips.find(c => c.id === timeline.selectedClipId);

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
                // Trim via resizeClip: set start and end from command
                if (clipId && command.end !== undefined) {
                    const clip = timeline.clips.find(c => c.id === clipId);
                    if (clip) {
                        const newDuration = command.end - (command.start ?? clip.startTime);
                        timeline.updateClip(clipId, {
                            startTime: command.start ?? 0,
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
    }, [timeline, annotation, overlays, navigate, setZoomLevel, setPanOffset]);

    // Wire AI sendMessage to execute returned commands
    const handleAISend = useCallback(async (text) => {
        const command = await ai.sendMessage(text);
        if (command) handleAICommand(command);
    }, [ai.sendMessage, handleAICommand]);

    // Keyboard shortcuts
    useKeyboardShortcuts({
        'space': () => timeline.togglePlayback?.() || (timeline.isPlaying ? timeline.pause?.() : timeline.play?.()),
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
        <div className="edit-mode">
            <div className="edit-mode-main">
                <ToolSidebar activeTool={activeTool} onToolChange={handleToolChange} />

                <div className="edit-mode-canvas">
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
                    />
                </div>

                <RightPanel
                    isOpen={rightPanelOpen}
                    onClose={() => { setRightPanelOpen(false); setActiveTool(null); }}
                    activeTool={activeTool}
                    selectedClip={selectedClip}
                    activeFilters={activeFilters}
                    setActiveFilters={setActiveFilters}
                    onRemoveKeyframe={timeline.removeKeyframe}
                />
            </div>

            <div className="edit-mode-timeline">
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
                    onMove={timeline.moveClip}
                    onResize={timeline.resizeClip}
                    onPlay={timeline.play}
                    onPause={timeline.pause}
                    onStop={timeline.stop}
                    onZoomChange={timeline.setZoom}
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
        </div>
    );
};
