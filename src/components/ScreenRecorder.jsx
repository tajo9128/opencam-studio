import React, { useRef, useState, useEffect, useCallback } from 'react';
import { storageManager } from '../utils/StorageManager';
import { BACKGROUND_PRESETS } from '../constants/backgrounds';
import { useStreams } from '../hooks/useStreams';
import { useFileSystem } from '../hooks/useFileSystem';
import { useRecording } from '../hooks/useRecording';
import { useAudioLevel } from '../hooks/useAudioLevel';
import { useCursorFx } from '../hooks/useCursorFx';
import { useAnnotation } from '../hooks/useAnnotation';
import { useZoom } from '../hooks/useZoom';
import { EXPORT_FORMATS, getDefaultFormat } from '../constants/formats';
import { useAI } from '../hooks/useAI';
import { useYouTube } from '../hooks/useYouTube';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { recordingStore } from '../utils/RecordingStore';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { useSmartZoom } from '../hooks/useSmartZoom';
import { CALLOUTS } from '../utils/Callouts';

// UI Components
import { ControlBar } from './Controls/ControlBar';
import { HistorySidebar } from './Sidebar/HistorySidebar';
import { PreviewStage } from './Preview/PreviewStage';
import { Toast } from './Notifications/Toast';
import { VideoPlayerModal } from './Modals/VideoPlayerModal';
import SaveRecordingModal from './Modals/SaveRecordingModal';
import { AnnotationToolbar } from './Annotation/AnnotationToolbar';
import { ChatPanel } from './Chat/ChatPanel';
import { YouTubeUploadModal } from './Modals/YouTubeUploadModal';
import { FilterPanel } from './Filters/FilterPanel';
import { applyFilters } from '../utils/FilterEngine';
import { Timeline } from './Timeline/Timeline';
import { useTimeline } from '../hooks/useTimeline';
import { useOverlays } from '../hooks/useOverlays';
import { WelcomeModal } from './WelcomeModal/WelcomeModal';

const QUALITY_PRESETS = {
    'native': { width: null, height: null, label: 'Native Source', bitrate: 15000000 },
    '720p': { width: 1280, height: 720, label: '720p (HD)', bitrate: 6000000 },
    '1080p': { width: 1920, height: 1080, label: '1080p (FHD)', bitrate: 12000000 },
    '1440p': { width: 2560, height: 1440, label: '1440p (2K)', bitrate: 20000000 }
};

const ScreenRecorder = () => {
    const canvasRef = useRef(null);
    const screenVideoRef = useRef(null);
    const cameraVideoRef = useRef(null);
    const workerRef = useRef(null);

    const [, setStatus] = useState('idle');
    const {
        screenStream, audioStream, cameraStream, systemAudioStream,
        screenDimensions, cameraDimensions,
        sourceType, setSourceType,
        toggleScreen, toggleSystemAudio, toggleMic, toggleCamera,
        stopAll: stopStreams, changeCamera, changeMic
    } = useStreams(screenVideoRef, cameraVideoRef, setStatus);

    const [webcamShape, setWebcamShape] = useState('circle');
    const [webcamScale, setWebcamScale] = useState(0.40);
    const [activeBg, setActiveBg] = useState('none');
    const [screenScale, setScreenScale] = useState(1.0);
    const [recordingQuality, setRecordingQuality] = useState('1080p');
    const [recordingFormat, setRecordingFormat] = useState(getDefaultFormat());
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [toast, setToast] = useState(null);
    const [highlightedFile, setHighlightedFile] = useState(null);
    const [pendingRecording, setPendingRecording] = useState(null);
    const [countdown, setCountdown] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [cursorFxEnabled, setCursorFxEnabled] = useState(false);
    const [webcamOnly, setWebcamOnly] = useState(false);
    const [annotationEnabled, setAnnotationEnabled] = useState(false);
    const [zoomEnabled, setZoomEnabled] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [ytOpen, setYtOpen] = useState(false);
    const [filterPanelOpen, setFilterPanelOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState([]);
    const [showWelcome, setShowWelcome] = useState(false);

    // Camtasia-inspired recording features
    const [enhancedAudio, setEnhancedAudio] = useState(true);
    const [multiTrack, setMultiTrack] = useState(true);
    const [smartZoomEnabled, setSmartZoomEnabled] = useState(false);
    const [callout, setCallout] = useState({ active: false, type: 'info', text: '' });

    const audioLevel = useAudioLevel(audioStream);
    const { processedStream } = useAudioProcessor(audioStream, enhancedAudio);
    const { zoomLevel: smartZoomLevel, panOffset: smartPan } = useSmartZoom(canvasRef, smartZoomEnabled);
    const smartZoomRef = useRef({ level: 1, pan: { x: 0, y: 0 } });
    useEffect(() => { smartZoomRef.current = { level: smartZoomEnabled ? smartZoomLevel : 1, pan: smartZoomEnabled ? smartPan : { x: 0, y: 0 } }; });
    const { drawCursorFx } = useCursorFx(canvasRef, cursorFxEnabled);
    const annotation = useAnnotation(canvasRef, annotationEnabled);
    const { applyZoom, restoreZoom } = useZoom(canvasRef, zoomEnabled);
    const ai = useAI();
    const youtube = useYouTube();
    const timeline = useTimeline();
    const overlays = useOverlays();
    const [showTimeline, setShowTimeline] = useState(false);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);

    const toastTimerRef = useRef(null);

    const showToast = useCallback((title, message, type = 'info') => {
        setToast({ title, message, type });
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    }, []);

    const {
        directoryHandle, setDirectoryHandle,
        isHandleAuthorized, setIsHandleAuthorized,
        libraryFiles, thumbnailMap,
        editingFileName, setEditingFileName,
        newName, setNewName,
        selectedVideoUrl, setSelectedVideoUrl,
        connectFolder, resumeSync, syncLibrary,
        playVideo, startRename, handleRename, deleteFile,
        generateThumbnail, getThumbnailUrl
    } = useFileSystem(showToast, setHighlightedFile);

    const handleRecordingComplete = useCallback((blob, mimeType, meta = {}) => {
        if (!blob) {
            showToast('Recording Failed', 'No video data was captured.', 'error');
            return;
        }
        recordingStore.set(blob, mimeType);
        // Store cursor data if captured
        if (meta.cursorData?.length > 0) {
            try { localStorage.setItem('last_cursor_data', JSON.stringify(meta.cursorData)); } catch { /* storage full */ }
        }
        // Store separate audio if multi-track
        if (meta.multiTrack && meta.audioBlob) {
            try { localStorage.setItem('last_audio_track', meta.audioBlob.type); } catch { /* storage full */ }
        }

        if (quickRecordRef.current) {
            quickRecordRef.current = false;
            const ext = mimeType?.includes('mp4') ? '.mp4' : '.webm';
            const name = `recording-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}${ext}`;
            const blobUrl = URL.createObjectURL(blob);
            if (directoryHandle) {
                directoryHandle.getFileHandle(name, { create: true }).then(fileHandle =>
                    fileHandle.createWritable().then(writable =>
                        writable.write(blob).then(() => writable.close())
                    )
                ).then(() => {
                    showToast('Saved', `Saved to ${directoryHandle.name}/${name}`, 'success');
                    syncLibrary(directoryHandle);
                }).catch(() => {
                    const a = document.createElement('a');
                    a.href = blobUrl; a.download = name; a.click();
                    showToast('Download Saved', 'Saved via browser download', 'success');
                });
            } else {
                const a = document.createElement('a');
                a.href = blobUrl; a.download = name; a.click();
                showToast('Download Saved', 'Check your downloads folder', 'success');
            }
            return;
        }

        setPendingRecording({ blob, mimeType, audioBlob: meta.audioBlob });
    }, [showToast, directoryHandle, syncLibrary]);

    const {
        isRecording, isPaused, status: recordingStatus, multiTrackMode, startRecording: startMediaRecording, pauseRecording, resumeRecording, stopRecording, resetRecording
    } = useRecording({
        screenStream, audioStream: processedStream || audioStream, cameraStream,
        activeBg, screenScale, canvasRef,
        recordingQuality,
        bitrate: QUALITY_PRESETS[recordingQuality].bitrate,
        mimeType: EXPORT_FORMATS.find(f => f.id === recordingFormat)?.mimeType,
        useCanvas: cameraStream || activeBg !== 'none' || screenScale < 1.0 || webcamOnly || annotationEnabled || zoomEnabled || cursorFxEnabled,
        multiTrack,
        onComplete: handleRecordingComplete
    });

    // Cleanup streams on unmount when not recording
    useEffect(() => {
        return () => { if (!isRecording) stopStreams(); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Keyboard shortcuts
    useKeyboardShortcuts({
        'ctrl+shift+r': () => { if (isRecording) stopRecording(); else startMediaRecording(); },
        'ctrl+shift+p': () => { if (isPaused) resumeRecording(); else if (isRecording) pauseRecording(); },
        'ctrl+shift+c': () => toggleCamera(),
        'ctrl+shift+m': () => toggleMic(),
        'ctrl+shift+a': () => setAnnotationEnabled(prev => !prev),
        'ctrl+shift+x': () => setCursorFxEnabled(prev => !prev),
    });

    // AI command handler
    const handleAICommand = useCallback(async (input) => {
        const command = await ai.sendMessage(input);
        if (!command) return;
        switch (command.action) {
            case 'cursor_fx': setCursorFxEnabled(command.enabled); break;
            case 'set_quality': if (['720p','1080p','1440p'].includes(command.quality)) setRecordingQuality(command.quality); break;
            case 'set_format': { const f = EXPORT_FORMATS.find(fmt => fmt.id.includes(command.format)); if (f) setRecordingFormat(f.id); break; }
            case 'annotate': setAnnotationEnabled(true); break;
            case 'zoom': setZoomEnabled(true); break;
            case 'start_recording': startMediaRecording(); break;
            case 'stop_recording': stopRecording(); break;
            case 'pause_recording': pauseRecording(); break;
            case 'resume_recording': resumeRecording(); break;
        }
    }, [ai, startMediaRecording, stopRecording, pauseRecording, resumeRecording]);

    const handleGenerateAIMetadata = useCallback(async () => {
        setIsGeneratingAI(true);
        try {
            const prompt = `Generate a YouTube title, description, and tags for a screen recording video.

Respond ONLY with valid JSON in this format:
{"title": "...", "description": "...", "tags": ["tag1", "tag2"], "categoryId": "22"}

Rules:
- Title: max 100 chars, catchy, include keywords
- Description: 2-3 sentences, include keywords naturally
- Tags: 5-10 relevant tags
- categoryId: "22" for People & Blogs, "28" for Science & Technology, "27" for Education`;

            const command = await ai.sendMessage(prompt);
            if (command) {
                const content = command.message || '';
                const jsonMatch = content.match(/\{[\s\S]*?\}/);
                if (jsonMatch) {
                    try { return JSON.parse(jsonMatch[0]); } catch { /* parse error */ }
                }
                if (command.title || command.description) {
                    return command;
                }
            }
            return null;
        } catch {
            return null;
        } finally {
            setIsGeneratingAI(false);
        }
    }, [ai]);

    const handleSaveRecording = async (blob, fileName) => {
        const blobUrl = URL.createObjectURL(blob);

        // Add clip to timeline with source URL
        const clipDuration = elapsedTime || 10;
        timeline.addClip(0, {
            sourceUrl: blobUrl,
            duration: clipDuration,
            sourceEnd: clipDuration,
            label: fileName || 'Recording',
            color: '#8b5cf6',
            type: 'video',
        });

        if (directoryHandle) {
            try {
                const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                await syncLibrary(directoryHandle);
                showToast(`Saved to ${directoryHandle.name}`, fileName, 'success');
                setHighlightedFile(fileName);
                generateThumbnail(blob, fileName, directoryHandle).then(() => syncLibrary(directoryHandle));
                setTimeout(() => setHighlightedFile(null), 5000);
            } catch {
                const a = document.createElement('a');
                a.href = blobUrl; a.download = fileName; a.click();
                showToast('Direct save failed', 'Download triggered as fallback', 'error');
            }
        } else {
            const a = document.createElement('a');
            a.href = blobUrl; a.download = fileName; a.click();
            showToast('Recording Saved', 'Check your downloads folder', 'success');
        }
        setPendingRecording(null);
    };

    const webcamPos = useRef({ x: 20, y: 410 });
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const countdownTimerRef = useRef(null);
    const elapsedTimerRef = useRef(null);
    const quickRecordRef = useRef(false);

    const handleRecordScreen = useCallback(async () => {
        // If screen not active, enable it first
        if (!screenStream) {
            await toggleScreen();
        }
        // Start recording immediately without countdown, auto-save on stop
        quickRecordRef.current = true;
        // Short delay to let the canvas render the first frame
        setTimeout(() => startMediaRecording(), 300);
    }, [screenStream, toggleScreen, startMediaRecording]);

    const handleStopAll = useCallback(() => {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setCountdown(null); setElapsedTime(0);
        resetRecording(); stopStreams(); setActiveBg('none'); setScreenScale(1.0);
    }, [resetRecording, stopStreams]);

    useEffect(() => {
        screenVideoRef.current = document.createElement('video');
        screenVideoRef.current.muted = true;
        screenVideoRef.current.autoplay = true;
        screenVideoRef.current.playsInline = true;
        cameraVideoRef.current = document.createElement('video');
        cameraVideoRef.current.muted = true;
        cameraVideoRef.current.autoplay = true;
        cameraVideoRef.current.playsInline = true;
        return () => handleStopAll();
    }, []);

    // Guard against accidental page close during recording
    useEffect(() => {
        if (!isRecording) return;
        const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isRecording]);

    useEffect(() => {
        if (isRecording && !isPaused) {
            elapsedTimerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
        } else {
            if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
        }
        return () => { if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current); };
    }, [isRecording, isPaused]);

    useEffect(() => { if (!isRecording) setElapsedTime(0); }, [isRecording]);

    const formatTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

    const [currentDimensions, setCurrentDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const quality = QUALITY_PRESETS[recordingQuality];
        let tw = quality.width, th = quality.height;
        if (!tw || !th) {
            if (screenStream) { tw = screenDimensions.width; th = screenDimensions.height; }
            else if (cameraStream) { tw = cameraDimensions.width; th = cameraDimensions.height; }
            else { tw = 1920; th = 1080; }
        }
        const isCanvasNeeded = cameraStream || activeBg !== 'none' || screenScale < 1.0 || webcamOnly || annotationEnabled || zoomEnabled || cursorFxEnabled;
        if (!isCanvasNeeded && tw > 1920) { th = 1920 * (th / tw); tw = 1920; }
        if (tw > 0 && th > 0 && (canvas.width !== tw || canvas.height !== th)) {
            canvas.width = tw; canvas.height = th; setCurrentDimensions({ width: tw, height: th });
        }
    }, [screenStream, cameraStream, activeBg, screenScale, recordingQuality, screenDimensions, cameraDimensions, webcamOnly, annotationEnabled, zoomEnabled, cursorFxEnabled]);

    const renderFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        const isCanvasNeeded = cameraStream || activeBg !== 'none' || screenScale < 1.0 || (recordingQuality && recordingQuality !== 'native') || webcamOnly || annotationEnabled || zoomEnabled || cursorFxEnabled;
        if (!isCanvasNeeded) return;

        const bubbleSize = canvas.height * webcamScale;
        const { x, y } = webcamPos.current;

        // Smart zoom transform
        const sz = smartZoomRef.current;
        if (sz.level !== 1) {
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(sz.level, sz.level);
            ctx.translate(-canvas.width / 2 + (sz.pan.x * canvas.width), -canvas.height / 2 + (sz.pan.y * canvas.height));
        }

        applyZoom(ctx, canvas.width, canvas.height);

        const preset = BACKGROUND_PRESETS.find(p => p.id === activeBg);
        if (preset && preset.colors) {
            const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            preset.colors.forEach((c, i) => grad.addColorStop(preset.colors.length === 1 ? 0 : i / (preset.colors.length - 1), c));
            ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        if (webcamOnly && cameraStream && cameraVideoRef.current.readyState >= 2) {
            const v = cameraVideoRef.current;
            const a = v.videoWidth / v.videoHeight, ca = canvas.width / canvas.height;
            let dw, dh;
            if (a > ca) { dh = canvas.height; dw = canvas.height * a; } else { dw = canvas.width; dh = canvas.width / a; }
            ctx.drawImage(v, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
        } else {
            if (screenStream && screenVideoRef.current.readyState >= 2) {
                const v = screenVideoRef.current;
                const a = v.videoWidth / v.videoHeight, ca = canvas.width / canvas.height;
                let dw, dh;
                if (a > ca) { dw = canvas.width; dh = canvas.width / a; } else { dh = canvas.height; dw = canvas.height * a; }
                const sw = dw * screenScale, sh = dh * screenScale;
                const sx = (canvas.width - sw) / 2, sy = (canvas.height - sh) / 2;
                if (screenScale < 1.0) { ctx.save(); ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 16); ctx.clip(); ctx.drawImage(v, sx, sy, sw, sh); ctx.restore(); }
                else ctx.drawImage(v, sx, sy, sw, sh);
            }
            if (cameraStream && cameraVideoRef.current.readyState >= 2) {
                const v = cameraVideoRef.current;
                const a = v.videoWidth / v.videoHeight;
                let dw, dh, dx, dy;
                if (a > 1) { dw = bubbleSize * a; dh = bubbleSize; dx = x - (dw - bubbleSize) / 2; dy = y; }
                else { dw = bubbleSize; dh = bubbleSize / a; dx = x; dy = y - (dh - bubbleSize) / 2; }
                if (webcamShape !== 'square') {
                    ctx.save(); ctx.beginPath();
                    if (webcamShape === 'circle') ctx.arc(x + bubbleSize / 2, y + bubbleSize / 2, bubbleSize / 2, 0, Math.PI * 2);
                    else ctx.roundRect(x, y, bubbleSize, bubbleSize, 32);
                    ctx.clip(); ctx.drawImage(v, dx, dy, dw, dh); ctx.restore();
                } else ctx.drawImage(v, dx, dy, dw, dh);
            }
        }
        restoreZoom(ctx);
        if (sz.level !== 1) ctx.restore();
        drawCursorFx(ctx, canvas.width, canvas.height);
        annotation.drawAnnotations(ctx);
        overlays.drawOverlays(ctx, 0);

        // Callouts
        if (callout.active && callout.text) {
            const c = CALLOUTS[callout.type] || CALLOUTS.info;
            c.render(ctx, canvas.width * 0.05, canvas.height * 0.05, callout.text);
        }

        applyFilters(ctx, canvas, activeFilters);
    }, [cameraStream, screenStream, activeBg, webcamScale, screenScale, webcamShape, recordingQuality, webcamOnly, annotationEnabled, zoomEnabled, cursorFxEnabled, drawCursorFx, annotation, applyZoom, restoreZoom, activeFilters, overlays]);

    const launchLoop = useCallback(() => {
        const isCanvasNeeded = cameraStream || activeBg !== 'none' || screenScale < 1.0 || recordingQuality !== 'native' || webcamOnly || cursorFxEnabled || annotationEnabled || zoomEnabled;
        if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
        if (isCanvasNeeded) {
            workerRef.current = new Worker(new URL('../workers/heartbeat.worker.js', import.meta.url), { type: 'module' });
            workerRef.current.onmessage = (e) => { if (e.data.action === 'tick') renderFrame(); };
            workerRef.current.postMessage({ action: 'setFps', fps: 30 });
            workerRef.current.postMessage({ action: 'start' });
        }
    }, [cameraStream, activeBg, screenScale, recordingQuality, webcamOnly, cursorFxEnabled, annotationEnabled, zoomEnabled, renderFrame]);

    useEffect(() => { launchLoop(); return () => { if (workerRef.current) workerRef.current.terminate(); }; }, [launchLoop]);

    const getCanvasMousePos = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
    }, []);

    const handleMouseDown = useCallback((e) => {
        if (annotationEnabled) { annotation.handleMouseDown(e); return; }
        const pos = getCanvasMousePos(e);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const bubbleSize = canvas.height * webcamScale;
        const { x, y } = webcamPos.current;
        if (pos.x >= x && pos.x <= x + bubbleSize && pos.y >= y && pos.y <= y + bubbleSize) {
            isDragging.current = true; dragOffset.current = { x: pos.x - x, y: pos.y - y };
        }
    }, [getCanvasMousePos, webcamScale, annotationEnabled, annotation]);

    const handleMouseMove = useCallback((e) => {
        if (annotationEnabled) { annotation.handleMouseMove(e); return; }
        if (!isDragging.current) return;
        const pos = getCanvasMousePos(e);
        webcamPos.current = { x: pos.x - dragOffset.current.x, y: pos.y - dragOffset.current.y };
    }, [getCanvasMousePos, annotationEnabled, annotation]);

    const handleMouseUp = useCallback((e) => {
        if (annotationEnabled) { annotation.handleMouseUp(e); return; }
        isDragging.current = false;
    }, [annotationEnabled, annotation]);

    useEffect(() => {
        const loadSavedState = async () => {
            const savedHandle = await storageManager.getSetting('workspace_handle');
            if (savedHandle) {
                setDirectoryHandle(savedHandle);
                const state = await savedHandle.queryPermission({ mode: 'readwrite' });
                setIsHandleAuthorized(state === 'granted');
                if (state !== 'granted') {
                    setShowWelcome(true);
                }
            } else {
                setShowWelcome(true);
            }
        };
        loadSavedState();
    }, [setDirectoryHandle, setIsHandleAuthorized]);

    useEffect(() => { if (isHistoryOpen && directoryHandle) syncLibrary(directoryHandle); }, [isHistoryOpen, directoryHandle, syncLibrary]);

    const startRecording = useCallback(() => {
        if (isRecording || countdown !== null) return;
        setCountdown(3);
        countdownTimerRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
                    startMediaRecording(); return null;
                }
                return prev - 1;
            });
        }, 1000);
    }, [isRecording, countdown, startMediaRecording]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'Space') { e.preventDefault(); if (isRecording) stopRecording(); else if (countdown === null) startRecording(); }
            else if (e.code === 'KeyP' && isRecording) { e.preventDefault(); if (isPaused) resumeRecording(); else pauseRecording(); }
            else if (e.code === 'Escape' && countdown !== null) { e.preventDefault(); if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; } setCountdown(null); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isRecording, isPaused, countdown, startRecording, stopRecording, pauseRecording, resumeRecording]);

    return (
        <div className="recorder-container">
            <header className="header-section" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ visibility: 'hidden' }}>Spacer</div>
                <div style={{ textAlign: 'center' }}>
                    <h1>ScreenStudio</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Record your screen with webcam overlay</p>
                </div>
                <button className="btn btn-outline" onClick={() => setIsHistoryOpen(!isHistoryOpen)}>
                    History {libraryFiles.length > 0 && `(${libraryFiles.length})`}
                </button>
            </header>

            <PreviewStage canvasRef={canvasRef} screenVideoRef={screenVideoRef} cameraVideoRef={cameraVideoRef}
                cameraStream={cameraStream} screenStream={screenStream} activeBg={activeBg} screenScale={screenScale}
                isRecording={isRecording} status={recordingStatus} countdown={countdown} recordingQuality={recordingQuality}
                currentDimensions={currentDimensions} handleMouseDown={handleMouseDown} handleMouseMove={handleMouseMove}
                handleMouseUp={handleMouseUp} elapsedTime={formatTime(elapsedTime)}
                webcamOnly={webcamOnly} annotationEnabled={annotationEnabled} zoomEnabled={zoomEnabled} cursorFxEnabled={cursorFxEnabled}
                onEnableScreen={handleRecordScreen} onEnableCamera={toggleCamera} />

            {/* Recording HUD */}
            {isRecording && (
                <div className="rec-hud">
                    <span className="rec-hud-item rec-hud-rec">
                        <span className="rec-hud-dot" /> REC {formatTime(elapsedTime)}
                    </span>
                    <span className="rec-hud-item">~{Math.round(elapsedTime * QUALITY_PRESETS[recordingQuality].bitrate / 8000000)} MB</span>
                    {multiTrackMode && <span className="rec-hud-badge">MULTI-TRACK</span>}
                    {enhancedAudio && <span className="rec-hud-badge">ENHANCED AUDIO</span>}
                    <span className="rec-hud-audio-bar">
                        <span className="rec-hud-audio-fill" style={{ width: `${Math.min(audioLevel * 100, 100)}%` }} />
                    </span>
                </div>
            )}

            {/* Feature toggles */}
            <div className="rec-features">
                <button className={`rec-feature-btn ${enhancedAudio ? 'active' : ''}`} onClick={() => setEnhancedAudio(!enhancedAudio)} title="AI Noise Removal">
                    {enhancedAudio ? 'ON' : 'OFF'} Noise Removal
                </button>
                <button className={`rec-feature-btn ${multiTrack ? 'active' : ''}`} onClick={() => setMultiTrack(!multiTrack)} title="Separate audio track recording">
                    {multiTrack ? 'ON' : 'OFF'} Multi-Track
                </button>
                <button className={`rec-feature-btn ${smartZoomEnabled ? 'active' : ''}`} onClick={() => setSmartZoomEnabled(!smartZoomEnabled)} title="Auto-zoom to cursor activity">
                    {smartZoomEnabled ? 'ON' : 'OFF'} Smart Zoom
                </button>
                <button className={`rec-feature-btn ${callout.active ? 'active' : ''}`} onClick={() => setCallout(prev => ({ ...prev, active: !prev.active }))} title="Add callout overlay">
                    {callout.active ? 'ON' : 'OFF'} Callout
                </button>
            </div>
            {callout.active && (
                <div className="rec-features" style={{ marginTop: 0 }}>
                    {Object.entries(CALLOUTS).map(([id, c]) => (
                        <button key={id} className={`rec-feature-btn ${callout.type === id ? 'active' : ''}`}
                            onClick={() => setCallout(prev => ({ ...prev, type: id }))} title={c.name}
                            style={callout.type === id ? { borderColor: c.bg } : {}}>
                            {c.icon} {c.name}
                        </button>
                    ))}
                    <input type="text" className="rec-feature-input" value={callout.text}
                        onChange={e => setCallout(prev => ({ ...prev, text: e.target.value }))}
                        placeholder="Callout text..." style={{ flex: 1, minWidth: '120px' }} />
                </div>
            )}

            {annotationEnabled && (
                <AnnotationToolbar tool={annotation.tool} setTool={annotation.setTool} color={annotation.color}
                    setColor={annotation.setColor} strokeWidth={annotation.strokeWidth} setStrokeWidth={annotation.setStrokeWidth}
                    undo={annotation.undo} redo={annotation.redo} clearAnnotations={annotation.clearAnnotations}
                    canUndo={annotation.hasAnnotations} canRedo={annotation.canRedo} />
            )}

            <ControlBar screenStream={screenStream} cameraStream={cameraStream} audioStream={audioStream}
                activeBg={activeBg} setActiveBg={setActiveBg} isRecording={isRecording}
                webcamShape={webcamShape} setWebcamShape={setWebcamShape} webcamScale={webcamScale} setWebcamScale={setWebcamScale}
                screenScale={screenScale} setScreenScale={setScreenScale} toggleScreen={toggleScreen} toggleCamera={toggleCamera}
                toggleMic={toggleMic} recordingQuality={recordingQuality} setRecordingQuality={setRecordingQuality}
                qualityPresets={QUALITY_PRESETS} recordingFormat={recordingFormat} setRecordingFormat={setRecordingFormat}
                startRecording={startRecording} pauseRecording={pauseRecording} resumeRecording={resumeRecording}
                stopRecording={stopRecording} isPaused={isPaused} handleStopAll={handleStopAll}
                changeCamera={changeCamera} changeMic={changeMic} audioLevel={audioLevel}
                cursorFxEnabled={cursorFxEnabled} setCursorFxEnabled={setCursorFxEnabled}
                webcamOnly={webcamOnly} setWebcamOnly={setWebcamOnly}
                annotationEnabled={annotationEnabled} setAnnotationEnabled={setAnnotationEnabled}
                zoomEnabled={zoomEnabled} setZoomEnabled={setZoomEnabled}
                chatOpen={chatOpen} setChatOpen={setChatOpen}
                filterPanelOpen={filterPanelOpen} setFilterPanelOpen={setFilterPanelOpen}
                sourceType={sourceType} setSourceType={setSourceType}
                toggleSystemAudio={toggleSystemAudio} systemAudioStream={systemAudioStream} />

            {/* Timeline toggle */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '1rem 0' }}>
                <button className={`btn-pill ${showTimeline ? 'active' : ''}`}
                    onClick={() => setShowTimeline(!showTimeline)}>
                    Timeline Editor {showTimeline ? '(Hide)' : '(Show)'}
                </button>
            </div>

            {showTimeline && (
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
                    onDelete={(id) => timeline.removeClip(id || timeline.selectedClipId)}
                    onDuplicate={timeline.duplicateClip}
                    onSpeed={timeline.setClipSpeed}
                    onMove={timeline.moveClip}
                    onResize={timeline.resizeClip}
                    onAddTrack={timeline.addTrack}
                    onRemoveTrack={timeline.removeTrack}
                    onToggleMute={timeline.toggleTrackMute}
                    onToggleLock={timeline.toggleTrackLock}
                    onPlay={timeline.play}
                    onPause={timeline.pause}
                    onStop={timeline.stop}
                    onZoomChange={timeline.setZoom}
                />
            )}

            <div className="mode-info">
                <div className="status-dot" style={{ background: cameraStream ? 'var(--primary)' : 'var(--success)' }}></div>
                <span>Current Mode: {cameraStream ? 'Optimized Canvas' : 'Direct Hardware'}</span>
                <span style={{ marginLeft: '1rem', opacity: 0.5, fontSize: '0.7rem' }}>Space: record/stop | P: pause | Esc: cancel</span>
            </div>

            <footer style={{ marginTop: 'auto', paddingTop: '4rem', color: 'var(--text-muted)', fontSize: '0.75rem', width: '100%', maxWidth: '600px', textAlign: 'center', lineHeight: '1.5' }}>
                <p>ScreenStudio &mdash; Free &amp; Open Source</p>
            </footer>

            <HistorySidebar isHistoryOpen={isHistoryOpen} setIsHistoryOpen={setIsHistoryOpen}
                directoryHandle={directoryHandle} isHandleAuthorized={isHandleAuthorized}
                connectFolder={connectFolder} resumeSync={resumeSync} libraryFiles={libraryFiles}
                thumbnailMap={thumbnailMap} getThumbnailUrl={getThumbnailUrl} highlightedFile={highlightedFile}
                playVideo={playVideo} editingFileName={editingFileName} newName={newName} setNewName={setNewName}
                handleRename={handleRename} setEditingFileName={setEditingFileName} startRename={startRename} deleteFile={deleteFile} />

            <VideoPlayerModal url={selectedVideoUrl} onClose={() => setSelectedVideoUrl(null)} />
            <Toast toast={toast} onClose={() => setToast(null)} />

            <SaveRecordingModal blob={pendingRecording?.blob} mimeType={pendingRecording?.mimeType}
                onSave={handleSaveRecording} onDiscard={() => setPendingRecording(null)}
                onYouTube={() => setYtOpen(true)} />

            <YouTubeUploadModal isOpen={ytOpen} onClose={() => setYtOpen(false)}
                onUpload={(metadata) => youtube.uploadVideo(pendingRecording?.blob, metadata)}
                isAuthenticated={youtube.isAuthenticated} channelName={youtube.channelName}
                clientId={youtube.clientId} onSetClientId={youtube.setClientId}
                onAuthenticate={youtube.authenticate} onDisconnect={youtube.disconnect}
                isUploading={youtube.isUploading} uploadProgress={youtube.uploadProgress}
                onGenerateAI={handleGenerateAIMetadata} isGeneratingAI={isGeneratingAI} />

            <FilterPanel isOpen={filterPanelOpen} onClose={() => setFilterPanelOpen(false)}
                activeFilters={activeFilters} setActiveFilters={setActiveFilters} />

            <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)}
                messages={ai.messages} isProcessing={ai.isProcessing} onSend={handleAICommand}
                onClear={ai.clearMessages} apiKey={ai.apiKey} onApiKeyChange={ai.setApiKey}
                ollamaConnected={ai.ollamaConnected} ollamaModel={ai.ollamaModel}
                ollamaModels={ai.ollamaModels} onCheckOllama={ai.checkOllama} />

            <WelcomeModal
                isOpen={showWelcome}
                onFolderSelected={async (handle) => {
                    setDirectoryHandle(handle);
                    const perm = await handle.requestPermission({ mode: 'readwrite' });
                    setIsHandleAuthorized(perm === 'granted');
                    await storageManager.setSetting('workspace_handle', handle);
                    setShowWelcome(false);
                }}
                onSkip={() => setShowWelcome(false)}
            />
        </div>
    );
};

export default ScreenRecorder;
