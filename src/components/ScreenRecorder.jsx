import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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

// UI Components
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
import { useServerRecording } from '../hooks/useServerRecording';
import { recordingStore } from '../utils/RecordingStore';
import { WelcomeModal } from './WelcomeModal/WelcomeModal';

const QUALITY_PRESETS = {
    'native': { width: null, height: null, label: 'Native Source', bitrate: 15000000 },
    '720p': { width: 1280, height: 720, label: '720p (HD)', bitrate: 6000000 },
    '1080p': { width: 1920, height: 1080, label: '1080p (FHD)', bitrate: 12000000 },
    '1440p': { width: 2560, height: 1440, label: '1440p (2K)', bitrate: 20000000 }
};

const RECORDING_TEMPLATES = [
    { id: 'screen-only', icon: '🖥️', label: 'Screen' },
    { id: 'camera-only', icon: '📷', label: 'Camera' },
    { id: 'pip-circle', icon: '⭕', label: 'PiP Circle' },
    { id: 'pip-rect', icon: '📺', label: 'PiP Rect' },
    { id: 'side-by-side', icon: '⬛📷', label: 'Side' },
    { id: 'stacked', icon: '📺📷', label: 'Stacked' },
];

const ScreenRecorder = () => {
    const navigate = useNavigate();
    const canvasRef = useRef(null);
    const screenVideoRef = useRef(null);
    const cameraVideoRef = useRef(null);
    const workerRef = useRef(null);

    const [status, setStatus] = useState('idle');
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
    const [layoutTemplate, setLayoutTemplate] = useState('pip-circle');
    const [pipCorner, setPipCorner] = useState('br');
    const [drawer, setDrawer] = useState(null);
    const [isStarting, setIsStarting] = useState(false);
    const isStartingRef = useRef(false);

    const audioLevel = useAudioLevel(audioStream);
    const { drawCursorFx, startTelemetry, stopTelemetry } = useCursorFx(canvasRef, cursorFxEnabled);
    const annotation = useAnnotation(canvasRef, annotationEnabled);
    const { applyZoom, restoreZoom } = useZoom(canvasRef, zoomEnabled);
    const ai = useAI();
    const youtube = useYouTube();
    const timeline = useTimeline();
    const overlays = useOverlays();
    const serverRec = useServerRecording();
    const [showTimeline, setShowTimeline] = useState(false);

    const showToast = useCallback((title, message, type = 'info') => {
        setToast({ title, message, type });
        setTimeout(() => setToast(null), 4000);
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

    const selectFolder = useCallback(async () => {
        try {
            const handle = await window.showDirectoryPicker();
            setDirectoryHandle(handle);
            await storageManager.setSetting('workspace_handle', handle);
            showToast('Folder Selected', `Saves to: ${handle.name}`, 'success');
        } catch { }
    }, [showToast]);

    const handleRecordingComplete = useCallback((blob, mimeType) => {
        if (!blob) {
            showToast('Recording Failed', 'No video data was captured.', 'error');
            return;
        }
        const telemetry = stopTelemetry();
        if (telemetry && telemetry.eventCount > 0) {
            serverRec.sendJson({
                type: 'cursor-telemetry',
                data: telemetry.serialize(),
            });
        }
        setPendingRecording({ blob, mimeType });
        serverRec.stop().then(result => {
            if (result) {
                setPendingRecording(prev => prev ? { ...prev, serverVideoUrl: result.videoUrl, serverProxyUrl: result.proxyUrl } : prev);
            }
        }).catch(() => {});
    }, [showToast, serverRec, stopTelemetry]);

    const {
        isRecording, isPaused, status: recStatus, startRecording: startMediaRecording, pauseRecording, resumeRecording, stopRecording, resetRecording
    } = useRecording({
        screenStream, audioStream, cameraStream,
        activeBg, screenScale, canvasRef,
        recordingQuality,
        bitrate: QUALITY_PRESETS[recordingQuality].bitrate,
        onComplete: handleRecordingComplete,
        chunkCallback: serverRec.sendChunk,
    });

    // Keep refs current for cleanup
    const stopStreamsRef = useRef(stopStreams);
    stopStreamsRef.current = stopStreams;

    // Cleanup streams on unmount
    useEffect(() => {
        return () => { stopStreamsRef.current(); };
    }, []);

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

    const handleSaveRecording = async (blob, fileName) => {
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
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = fileName; a.click();
                URL.revokeObjectURL(url);
                showToast('Direct save failed', 'Download triggered as fallback', 'error');
            }
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName; a.click();
            URL.revokeObjectURL(url);
            showToast('Recording Saved', 'Check your downloads folder', 'success');
        }
        setPendingRecording(null);
    };

    const handleEditNow = useCallback((blob, mimeType, serverInfo) => {
        if (serverInfo?.videoUrl) {
            recordingStore.set(null, null, null);
            setPendingRecording(null);
            navigate('/editor', { state: { serverVideoUrl: serverInfo.videoUrl, serverProxyUrl: serverInfo.proxyUrl } });
        } else {
            recordingStore.set(blob, mimeType);
            setPendingRecording(null);
            navigate('/editor');
        }
    }, [navigate]);

    const webcamPos = useRef({ x: 20, y: 410 });
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const countdownTimerRef = useRef(null);
    const elapsedTimerRef = useRef(null);

    const handleStopAll = useCallback(() => {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setCountdown(null); setElapsedTime(0);
        resetRecording(); stopStreams(); setActiveBg('none'); setScreenScale(1.0);
    }, [resetRecording, stopStreams]);

    const handleStopAllRef = useRef(handleStopAll);
    handleStopAllRef.current = handleStopAll;

    useEffect(() => {
        screenVideoRef.current = document.createElement('video');
        screenVideoRef.current.muted = true;
        screenVideoRef.current.autoplay = true;
        screenVideoRef.current.playsInline = true;
        cameraVideoRef.current = document.createElement('video');
        cameraVideoRef.current.muted = true;
        cameraVideoRef.current.autoplay = true;
        cameraVideoRef.current.playsInline = true;
        return () => handleStopAllRef.current();
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
        const isCanvasNeeded = cameraStream || activeBg !== 'none' || screenScale < 1.0;
        if (!isCanvasNeeded && tw > 1920) { th = 1920 * (th / tw); tw = 1920; }
        if (tw > 0 && th > 0 && (canvas.width !== tw || canvas.height !== th)) {
            canvas.width = tw; canvas.height = th; setCurrentDimensions({ width: tw, height: th });
        }
    }, [screenStream, cameraStream, activeBg, screenScale, recordingQuality, screenDimensions, cameraDimensions]);

    const renderFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        const roundRect = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath(); };
        const tpl = layoutTemplate;
        const isCanvasNeeded = cameraStream || activeBg !== 'none' || screenScale < 1.0 || (recordingQuality && recordingQuality !== 'native') || webcamOnly || annotationEnabled || zoomEnabled || cursorFxEnabled;
        if (!isCanvasNeeded && tpl !== 'side-by-side' && tpl !== 'stacked') return;

        // Background
        const preset = BACKGROUND_PRESETS.find(p => p.id === activeBg);
        if (preset && preset.colors) {
            const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            preset.colors.forEach((c, i) => grad.addColorStop(i / (preset.colors.length - 1), c));
            ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        applyZoom(ctx, canvas.width, canvas.height);

        const hasScreen = screenStream && screenVideoRef.current.readyState >= 2 && tpl !== 'camera-only';
        const hasCamera = cameraStream && cameraVideoRef.current.readyState >= 2 && tpl !== 'screen-only';

        if (tpl === 'camera-only' && hasCamera) {
            const v = cameraVideoRef.current;
            const a = v.videoWidth / v.videoHeight, ca = canvas.width / canvas.height;
            let dw, dh;
            if (a > ca) { dh = canvas.height; dw = canvas.height * a; } else { dw = canvas.width; dh = canvas.width / a; }
            ctx.drawImage(v, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
        } else if (tpl === 'side-by-side') {
            const hw = canvas.width / 2;
            if (hasScreen) {
                const v = screenVideoRef.current;
                const a = v.videoWidth / v.videoHeight;
                let dw, dh;
                if (a > (hw / canvas.height)) { dw = hw; dh = hw / a; } else { dh = canvas.height; dw = canvas.height * a; }
                ctx.drawImage(v, (hw - dw) / 2, (canvas.height - dh) / 2, dw, dh);
            }
            if (hasCamera) {
                const v = cameraVideoRef.current;
                const bSize = canvas.height * webcamScale;
                ctx.save(); ctx.beginPath();

                if (webcamShape === 'circle') ctx.arc(canvas.width - bSize / 2 - 16, canvas.height - bSize / 2 - 16, bSize / 2, 0, Math.PI * 2);
                else roundRect(canvas.width - bSize - 16, canvas.height - bSize - 16, bSize, bSize, 16);
                ctx.clip();
                const a2 = v.videoWidth / v.videoHeight;
                let dw2, dh2;
                if (a2 > 1) { dw2 = bSize * a2; dh2 = bSize; } else { dw2 = bSize; dh2 = bSize / a2; }
                ctx.drawImage(v, canvas.width - bSize - 16, canvas.height - bSize - 16, dw2, dh2);
                ctx.restore();
            }
        } else if (tpl === 'stacked') {
            const hh = canvas.height / 2;
            if (hasScreen) {
                const v = screenVideoRef.current;
                const a = v.videoWidth / v.videoHeight;
                let dw, dh;
                if (a > (canvas.width / hh)) { dw = canvas.width; dh = canvas.width / a; } else { dh = hh; dw = hh * a; }
                ctx.drawImage(v, (canvas.width - dw) / 2, (hh - dh) / 2, dw, dh);
            }
            if (hasCamera) {
                const v = cameraVideoRef.current;
                const bSize = hh * 0.5;
                ctx.save(); ctx.beginPath();
                if (webcamShape === 'circle') ctx.arc(canvas.width - bSize / 2 - 8, canvas.height - bSize / 2 - 8, bSize / 2, 0, Math.PI * 2);
                else roundRect(canvas.width - bSize - 8, canvas.height - bSize - 8, bSize, bSize, 16);
                ctx.clip();
                const a2 = v.videoWidth / v.videoHeight;
                let dw2, dh2;
                if (a2 > 1) { dw2 = bSize * a2; dh2 = bSize; } else { dw2 = bSize; dh2 = bSize / a2; }
                ctx.drawImage(v, canvas.width - bSize - 8, canvas.height - bSize - 8, dw2, dh2);
                ctx.restore();
            }
        } else {
            // screen-only or pip modes
            if (hasScreen) {
                const v = screenVideoRef.current;
                const a = v.videoWidth / v.videoHeight, ca = canvas.width / canvas.height;
                let dw, dh;
                if (a > ca) { dw = canvas.width; dh = canvas.width / a; } else { dh = canvas.height; dw = canvas.height * a; }
                const sw = dw * screenScale, sh = dh * screenScale;
                const sx = (canvas.width - sw) / 2, sy = (canvas.height - sh) / 2;
                if (screenScale < 1.0) { ctx.save(); ctx.beginPath(); roundRect(sx, sy, sw, sh, 16); ctx.clip(); ctx.drawImage(v, sx, sy, sw, sh); ctx.restore(); }
                else ctx.drawImage(v, sx, sy, sw, sh);
            }
            if ((tpl === 'pip-circle' || tpl === 'pip-rect') && hasCamera) {
                const v = cameraVideoRef.current;
                const bSize = canvas.height * webcamScale;
                const pad = 16;
                let px, py;
                switch (pipCorner) {
                    case 'tl': px = pad; py = pad; break;
                    case 'tr': px = canvas.width - bSize - pad; py = pad; break;
                    case 'bl': px = pad; py = canvas.height - bSize - pad; break;
                    default: px = canvas.width - bSize - pad; py = canvas.height - bSize - pad; break;
                }
                const a = v.videoWidth / v.videoHeight;
                let dw, dh, dx, dy;
                if (a > 1) { dw = bSize * a; dh = bSize; dx = px - (dw - bSize) / 2; dy = py; }
                else { dw = bSize; dh = bSize / a; dx = px; dy = py - (dh - bSize) / 2; }
                ctx.save(); ctx.beginPath();
                if (tpl === 'pip-circle') ctx.arc(px + bSize / 2, py + bSize / 2, bSize / 2, 0, Math.PI * 2);
                else { if (webcamShape !== 'square') roundRect(px, py, bSize, bSize, 32); else ctx.rect(px, py, bSize, bSize); }
                ctx.clip(); ctx.drawImage(v, dx, dy, dw, dh); ctx.restore();
            }
        }
        restoreZoom(ctx);
        drawCursorFx(ctx, canvas.width, canvas.height);
        annotation.drawAnnotations(ctx);
        overlays.drawOverlays(ctx, 0);
        applyFilters(ctx, canvas, activeFilters);
    }, [cameraStream, screenStream, activeBg, webcamScale, screenScale, webcamShape, recordingQuality, webcamOnly, annotationEnabled, zoomEnabled, cursorFxEnabled, drawCursorFx, annotation, applyZoom, restoreZoom, activeFilters, overlays, layoutTemplate, pipCorner]);

    const launchLoop = useCallback(() => {
        const needsTemplate = layoutTemplate === 'side-by-side' || layoutTemplate === 'stacked' || ((layoutTemplate === 'pip-circle' || layoutTemplate === 'pip-rect') && cameraStream);
        const isCanvasNeeded = cameraStream || activeBg !== 'none' || screenScale < 1.0 || recordingQuality !== 'native' || webcamOnly || cursorFxEnabled || annotationEnabled || zoomEnabled || needsTemplate;
        if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
        if (isCanvasNeeded) {
            workerRef.current = new Worker(new URL('../workers/heartbeat.worker.js', import.meta.url), { type: 'module' });
            workerRef.current.onmessage = (e) => { if (e.data.action === 'tick') renderFrame(); };
            workerRef.current.postMessage({ action: 'setFps', fps: 30 });
            workerRef.current.postMessage({ action: 'start' });
        }
    }, [cameraStream, activeBg, screenScale, recordingQuality, webcamOnly, cursorFxEnabled, annotationEnabled, zoomEnabled, renderFrame, layoutTemplate]);

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

    const handleStartRecording = useCallback(() => {
        if (isRecording || countdown !== null) return;
        serverRec.start();
        setCountdown(3);
        countdownTimerRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
                    startMediaRecording(); startTelemetry(); return null;
                }
                return prev - 1;
            });
        }, 1000);
    }, [isRecording, countdown, startMediaRecording, serverRec, startTelemetry]);

    const startFlow = useCallback(async () => {
        if (isStartingRef.current || isRecording) return;
        isStartingRef.current = true; setIsStarting(true);
        if (!screenStream && !cameraStream) { setIsStarting(false); isStartingRef.current = false; return; }
        handleStartRecording();
        setIsStarting(false); isStartingRef.current = false;
    }, [screenStream, cameraStream, isRecording, handleStartRecording]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'Space') { e.preventDefault(); if (isRecording) stopRecording(); else if (countdown === null) handleStartRecording(); }
            else if (e.code === 'KeyP' && isRecording) { e.preventDefault(); if (isPaused) resumeRecording(); else pauseRecording(); }
            else if (e.code === 'Escape' && countdown !== null) { e.preventDefault(); if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; } setCountdown(null); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isRecording, isPaused, countdown, handleStartRecording, stopRecording, pauseRecording, resumeRecording]);

    return (
        <div className="recorder-container">
            <header className="header-section" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ visibility: 'hidden' }}>Spacer</div>
                <div style={{ textAlign: 'center' }}>
                    <h1>OpenCam Studio</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Record your screen with webcam overlay</p>
                </div>
                <button className="btn btn-outline" onClick={() => setIsHistoryOpen(!isHistoryOpen)}>
                    History {libraryFiles.length > 0 && `(${libraryFiles.length})`}
                </button>
            </header>

            <PreviewStage canvasRef={canvasRef} screenVideoRef={screenVideoRef} cameraVideoRef={cameraVideoRef}
                cameraStream={cameraStream} screenStream={screenStream} activeBg={activeBg} screenScale={screenScale}
                isRecording={isRecording} status={recStatus} countdown={countdown} recordingQuality={recordingQuality}
                currentDimensions={currentDimensions} handleMouseDown={handleMouseDown} handleMouseMove={handleMouseMove}
                handleMouseUp={handleMouseUp} elapsedTime={formatTime(elapsedTime)} />

            {annotationEnabled && (
                <AnnotationToolbar tool={annotation.tool} setTool={annotation.setTool} color={annotation.color}
                    setColor={annotation.setColor} strokeWidth={annotation.strokeWidth} setStrokeWidth={annotation.setStrokeWidth}
                    undo={annotation.undo} redo={annotation.redo} clearAnnotations={annotation.clearAnnotations}
                    canUndo={annotation.hasAnnotations} canRedo={false} />
            )}
            {/* Toolbar */}
            <div className="control-bar">
                <button className={`btn-pill ${cameraStream ? 'active' : ''}`}
                    onClick={async () => {
                        try {
                            const stream = await toggleCamera();
                            if (stream) showToast('Camera On', 'Webcam is active', 'success');
                        } catch (e) {
                            showToast('Camera unavailable', 'Check camera connection or browser permissions', 'error');
                        }
                    }}>
                    📷 Cam
                </button>
                <button className={`btn-pill ${audioStream ? 'active' : ''}`}
                    onClick={async () => {
                        try {
                            const stream = await toggleMic();
                            if (stream) showToast('Mic On', 'Microphone is active', 'success');
                        } catch (e) {
                            showToast('Mic unavailable', 'Check microphone connection or browser permissions', 'error');
                        }
                    }}>
                    🎤 Mic
                </button>
                <button className={`btn-pill ${screenStream ? 'active' : ''}`}
                    onClick={async () => { await toggleScreen(); }}>
                    🖥️ Screen
                </button>
                <span style={{ color: 'var(--glass-border)', margin: '0 0.25rem' }}>|</span>
                <button className={`btn-pill ${drawer === 'layout' ? 'active' : ''}`}
                    onClick={() => setDrawer(drawer === 'layout' ? null : 'layout')}>
                    Layout
                </button>
                <button className={`btn-pill ${drawer === 'background' ? 'active' : ''}`}
                    onClick={() => setDrawer(drawer === 'background' ? null : 'background')}>
                    BG
                </button>
                <select className="btn-pill" value={recordingQuality}
                    onChange={e => setRecordingQuality(e.target.value)}
                    style={{ appearance: 'auto', paddingRight: '0.3rem' }}>
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                    <option value="1440p">1440p</option>
                </select>
                <button className="btn-pill" onClick={selectFolder}>📁 Folder</button>
                <span style={{ color: 'var(--glass-border)', margin: '0 0.25rem' }}>|</span>
                <button className={`btn-pill ${drawer === 'tools' ? 'active' : ''}`}
                    onClick={() => setDrawer(drawer === 'tools' ? null : 'tools')}>
                    🛠 Tools
                </button>
                {!isRecording ? (
                    <button className="btn-pill active" onClick={startFlow} disabled={isStarting}
                        style={{ background: 'var(--danger)', color: 'white' }}>
                        ⏺ Record
                    </button>
                ) : (
                    <>
                        <button className="btn-pill" onClick={pauseRecording}>
                            {isPaused ? '▶ Resume' : '⏸ Pause'}
                        </button>
                        <button className="btn-pill" onClick={() => { stopRecording(); stopStreams(); }}
                            style={{ background: 'var(--danger)', color: 'white' }}>
                            ⏹ Stop
                        </button>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 700 }}>
                            {formatTime(elapsedTime)}
                        </span>
                    </>
                )}
                <button className={`btn-pill ${layoutTemplate.startsWith('pip') ? 'active' : ''}`}
                    onClick={() => setLayoutTemplate(layoutTemplate.startsWith('pip') ? 'screen-only' : 'pip-circle')}>
                    PIP
                </button>
            </div>

            {/* Bottom drawer */}
            {drawer && (
                <div className="settings-panel-overlay" onClick={() => setDrawer(null)}>
                    <div className="settings-drawer" onClick={e => e.stopPropagation()}>
                        <div className="drawer-handle" />
                        <div className="drawer-header">
                            <h3>{drawer === 'layout' ? 'Recording Layout' : drawer === 'background' ? 'Background Presets' : drawer === 'test' ? 'Camera & Mic Test' : 'Advanced Tools'}</h3>
                            <button className="drawer-close" onClick={() => setDrawer(null)}>×</button>
                        </div>
                        {drawer === 'layout' && (
                            <div className="drawer-options">
                                {RECORDING_TEMPLATES.map(t => (
                                    <button key={t.id} className={`panel-option ${layoutTemplate === t.id ? 'selected' : ''}`}
                                        onClick={() => setLayoutTemplate(t.id)}>
                                        {t.icon} {t.label}
                                    </button>
                                ))}
                                {(layoutTemplate === 'pip-circle' || layoutTemplate === 'pip-rect') && (
                                    <div className="drawer-options" style={{ width: '100%', marginTop: '0.5rem' }}>
                                        {[{ id: 'tl', label: '↖ Top Left' }, { id: 'tr', label: '↗ Top Right' },
                                          { id: 'bl', label: '↙ Bot Left' }, { id: 'br', label: '↘ Bot Right' }].map(c => (
                                            <button key={c.id} className={`panel-option ${pipCorner === c.id ? 'selected' : ''}`}
                                                onClick={() => setPipCorner(c.id)}>{c.label}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {drawer === 'background' && (
                            <div className="drawer-options">
                                {BACKGROUND_PRESETS.map(b => (
                                    <button key={b.id} className={`panel-option bg-option ${activeBg === b.id ? 'selected' : ''}`}
                                        onClick={() => { setActiveBg(b.id); setDrawer(null); }}
                                        style={{ background: b.colors ? `linear-gradient(135deg,${b.colors.join(',')})` : '#1a1a1a', minWidth: 80, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                        {b.name}
                                    </button>
                                ))}
                            </div>
                        )}
                        {drawer === 'tools' && (
                            <div className="drawer-options" style={{ flexDirection: 'column', gap: '0.6rem' }}>
                                <div className="setting-row">
                                    <label>🎯 Cursor FX</label>
                                    <button className={`panel-option ${cursorFxEnabled ? 'selected' : ''}`}
                                        onClick={() => setCursorFxEnabled(!cursorFxEnabled)}>
                                        {cursorFxEnabled ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                                <div className="setting-row">
                                    <label>📷 Webcam Only</label>
                                    <button className={`panel-option ${webcamOnly ? 'selected' : ''}`}
                                        onClick={() => setWebcamOnly(!webcamOnly)} disabled={isRecording}>
                                        {webcamOnly ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                                <div className="setting-row">
                                    <label>✏️ Annotation</label>
                                    <button className={`panel-option ${annotationEnabled ? 'selected' : ''}`}
                                        onClick={() => setAnnotationEnabled(!annotationEnabled)}>
                                        {annotationEnabled ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                                <div className="setting-row">
                                    <label>🔍 Zoom</label>
                                    <button className={`panel-option ${zoomEnabled ? 'selected' : ''}`}
                                        onClick={() => setZoomEnabled(!zoomEnabled)}>
                                        {zoomEnabled ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                                <div className="setting-row">
                                    <label>🤖 AI Chat</label>
                                    <button className={`panel-option ${chatOpen ? 'selected' : ''}`}
                                        onClick={() => setChatOpen(!chatOpen)}>
                                        {chatOpen ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                                <div className="setting-row">
                                    <label>📺 YouTube</label>
                                    <button className={`panel-option ${ytOpen ? 'selected' : ''}`}
                                        onClick={() => setYtOpen(!ytOpen)}>
                                        {ytOpen ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                                <div className="setting-row">
                                    <label>🎨 Filters</label>
                                    <button className={`panel-option ${filterPanelOpen ? 'selected' : ''}`}
                                        onClick={() => setFilterPanelOpen(!filterPanelOpen)}>
                                        {filterPanelOpen ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

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
                    onMove={timeline.moveClip}
                    onResize={timeline.resizeClip}
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

            <HistorySidebar isHistoryOpen={isHistoryOpen} setIsHistoryOpen={setIsHistoryOpen}
                directoryHandle={directoryHandle} isHandleAuthorized={isHandleAuthorized}
                connectFolder={connectFolder} resumeSync={resumeSync} libraryFiles={libraryFiles}
                thumbnailMap={thumbnailMap} getThumbnailUrl={getThumbnailUrl} highlightedFile={highlightedFile}
                playVideo={playVideo} editingFileName={editingFileName} newName={newName} setNewName={setNewName}
                handleRename={handleRename} setEditingFileName={setEditingFileName} startRename={startRename} deleteFile={deleteFile} />

            <VideoPlayerModal url={selectedVideoUrl} onClose={() => setSelectedVideoUrl(null)} />
            <Toast toast={toast} onClose={() => setToast(null)} />

            <SaveRecordingModal blob={pendingRecording?.blob} mimeType={pendingRecording?.mimeType}
                serverVideoUrl={pendingRecording?.serverVideoUrl}
                serverProxyUrl={pendingRecording?.serverProxyUrl}
                serverProcessing={serverRec.isProcessing}
                onSave={handleSaveRecording} onDiscard={() => { serverRec.cancel(); setPendingRecording(null); }}
                onEditNow={handleEditNow}
                onYouTube={() => setYtOpen(true)} />

            <YouTubeUploadModal isOpen={ytOpen} onClose={() => setYtOpen(false)}
                onUpload={(metadata) => youtube.uploadVideo(pendingRecording?.blob, metadata)}
                isAuthenticated={youtube.isAuthenticated} channelName={youtube.channelName}
                clientId={youtube.clientId} onSetClientId={youtube.setClientId}
                onAuthenticate={youtube.authenticate} onDisconnect={youtube.disconnect}
                isUploading={youtube.isUploading} uploadProgress={youtube.uploadProgress} />

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
