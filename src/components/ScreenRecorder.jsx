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

// UI Components
import { ControlBar } from './Controls/ControlBar';
import { HistorySidebar } from './Sidebar/HistorySidebar';
import { PreviewStage } from './Preview/PreviewStage';
import { Toast } from './Notifications/Toast';
import { VideoPlayerModal } from './Modals/VideoPlayerModal';
import SaveRecordingModal from './Modals/SaveRecordingModal';
import { AnnotationToolbar } from './Annotation/AnnotationToolbar';

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

    const [status, setStatus] = useState('idle');
    const {
        screenStream, audioStream, cameraStream,
        screenDimensions, cameraDimensions,
        toggleScreen, toggleMic, toggleCamera, stopAll: stopStreams, changeCamera, changeMic
    } = useStreams(screenVideoRef, cameraVideoRef, setStatus);

    const [webcamShape, setWebcamShape] = useState('circle');
    const [webcamScale, setWebcamScale] = useState(0.40);
    const [activeBg, setActiveBg] = useState('none');
    const [screenScale, setScreenScale] = useState(1.0);
    const [recordingQuality, setRecordingQuality] = useState('1080p');
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [toast, setToast] = useState(null);
    const [highlightedFile, setHighlightedFile] = useState(null);
    const [pendingRecording, setPendingRecording] = useState(null);
    const [recordingFormat, setRecordingFormat] = useState(getDefaultFormat());
    const [countdown, setCountdown] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [cursorFxEnabled, setCursorFxEnabled] = useState(false);
    const [webcamOnly, setWebcamOnly] = useState(false);
    const [annotationEnabled, setAnnotationEnabled] = useState(false);
    const [zoomEnabled, setZoomEnabled] = useState(false);
    const audioLevel = useAudioLevel(audioStream);
    const { drawCursorFx } = useCursorFx(canvasRef, cursorFxEnabled);
    const {
        tool, setTool, color, setColor, strokeWidth, setStrokeWidth,
        drawAnnotations, handleMouseDown: annotationMouseDown, handleMouseMove: annotationMouseMove,
        handleMouseUp: annotationMouseUp, undo, redo, clearAnnotations, canUndo, canRedo
    } = useAnnotation(annotationEnabled);
    const { applyZoom, restoreZoom } = useZoom(canvasRef, zoomEnabled);

    const showToast = useCallback((title, message, type = 'info') => {
        setToast({ title, message, type });
        setTimeout(() => setToast(null), 4000);
    }, []);

    const {
        directoryHandle, setDirectoryHandle,
        isHandleAuthorized, setIsHandleAuthorized,
        libraryFiles,
        thumbnailMap,
        editingFileName, setEditingFileName,
        newName, setNewName,
        selectedVideoUrl, setSelectedVideoUrl,
        connectFolder, resumeSync, syncLibrary,
        playVideo, startRename, handleRename, deleteFile,
        generateThumbnail, getThumbnailUrl
    } = useFileSystem(showToast, setHighlightedFile);

    const handleRecordingComplete = useCallback((blob, mimeType) => {
        if (!blob) {
            showToast('Recording Failed', 'No video data was captured. If your mic is disabled, try enabling it.', 'error');
            return;
        }
        setPendingRecording({ blob, mimeType });
    }, [showToast]);

    const {
        isRecording, isPaused, startRecording: startMediaRecording, pauseRecording, resumeRecording, stopRecording, resetRecording
    } = useRecording({
        screenStream, audioStream, cameraStream,
        activeBg, screenScale, canvasRef,
        recordingQuality,
        bitrate: QUALITY_PRESETS[recordingQuality].bitrate,
        mimeType: EXPORT_FORMATS.find(f => f.id === recordingFormat)?.mimeType,
        onComplete: handleRecordingComplete
    });

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

                generateThumbnail(blob, fileName, directoryHandle).then(() => {
                    syncLibrary(directoryHandle);
                });

                setTimeout(() => setHighlightedFile(null), 5000);
            } catch {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Direct save failed', 'Download triggered as fallback', 'error');
            }
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Recording Saved', 'Check your downloads folder', 'success');
        }
        setPendingRecording(null);
    };

    // Position State (using Ref for 0-lag updates)
    const webcamPos = useRef({ x: 20, y: 410 });
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const countdownTimerRef = useRef(null);
    const elapsedTimerRef = useRef(null);

    // Initialize hidden video elements
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

    // Recording timer
    useEffect(() => {
        if (isRecording && !isPaused) {
            elapsedTimerRef.current = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        } else {
            if (elapsedTimerRef.current) {
                clearInterval(elapsedTimerRef.current);
                elapsedTimerRef.current = null;
            }
        }
        return () => {
            if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
        };
    }, [isRecording, isPaused]);

    // Reset timer when recording stops
    useEffect(() => {
        if (!isRecording) setElapsedTime(0);
    }, [isRecording]);

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const handleStopAll = () => {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setCountdown(null);
        setElapsedTime(0);
        resetRecording();
        stopStreams();
        setActiveBg('none');
        setScreenScale(1.0);
    };

    const [currentDimensions, setCurrentDimensions] = useState({ width: 0, height: 0 });

    // 1. Sync Canvas Dimensions
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const quality = QUALITY_PRESETS[recordingQuality];
        let targetWidth = quality.width;
        let targetHeight = quality.height;

        if (!targetWidth || !targetHeight) {
            if (screenStream) {
                targetWidth = screenDimensions.width;
                targetHeight = screenDimensions.height;
            } else if (cameraStream) {
                targetWidth = cameraDimensions.width;
                targetHeight = cameraDimensions.height;
            } else {
                targetWidth = 1920;
                targetHeight = 1080;
            }
        }

        const isCanvasNeeded = cameraStream || activeBg !== 'none' || screenScale < 1.0;
        if (!isCanvasNeeded && targetWidth > 1920) {
            const ratio = targetHeight / targetWidth;
            targetWidth = 1920;
            targetHeight = 1920 * ratio;
        }

        if (targetWidth > 0 && targetHeight > 0) {
            if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                setCurrentDimensions({ width: targetWidth, height: targetHeight });
            }
        }
    }, [screenStream, cameraStream, activeBg, screenScale, recordingQuality, screenDimensions, cameraDimensions]);

    // 2. High-Performance Render Function
    const renderFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });

        const isCanvasNeeded = cameraStream || activeBg !== 'none' || screenScale < 1.0 || (recordingQuality && recordingQuality !== 'native') || webcamOnly || annotationEnabled || zoomEnabled;
        if (!isCanvasNeeded) return;

        const bubbleSize = canvas.height * webcamScale;
        const { x, y } = webcamPos.current;

        // Apply zoom transform (wraps screen+webcam drawing)
        applyZoom(ctx, canvas.width, canvas.height);

        // Background
        const preset = BACKGROUND_PRESETS.find(p => p.id === activeBg);
        if (preset && preset.colors) {
            const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            preset.colors.forEach((c, i) => grad.addColorStop(i / (preset.colors.length - 1), c));
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Webcam-only mode: fill canvas with webcam
        if (webcamOnly && cameraStream && cameraVideoRef.current.readyState >= 2) {
            const webcamVideo = cameraVideoRef.current;
            const vWidth = webcamVideo.videoWidth;
            const vHeight = webcamVideo.videoHeight;
            const vAspect = vWidth / vHeight;
            const cAspect = canvas.width / canvas.height;

            let drawWidth, drawHeight;
            if (vAspect > cAspect) {
                drawHeight = canvas.height;
                drawWidth = canvas.height * vAspect;
            } else {
                drawWidth = canvas.width;
                drawHeight = canvas.width / vAspect;
            }
            const dx = (canvas.width - drawWidth) / 2;
            const dy = (canvas.height - drawHeight) / 2;
            ctx.drawImage(webcamVideo, dx, dy, drawWidth, drawHeight);
        } else {
            // Normal mode: screen + webcam overlay
            if (screenStream && screenVideoRef.current.readyState >= 2) {
                const videoData = screenVideoRef.current;
                const vWidth = videoData.videoWidth;
                const vHeight = videoData.videoHeight;
                const vAspect = vWidth / vHeight;
                const cAspect = canvas.width / canvas.height;

                let drawWidth, drawHeight;
                if (vAspect > cAspect) {
                    drawWidth = canvas.width;
                    drawHeight = canvas.width / vAspect;
                } else {
                    drawHeight = canvas.height;
                    drawWidth = canvas.height * vAspect;
                }

                const sw = drawWidth * screenScale;
                const sh = drawHeight * screenScale;
                const sx = (canvas.width - sw) / 2;
                const sy = (canvas.height - sh) / 2;

                if (screenScale < 1.0) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.roundRect(sx, sy, sw, sh, 16);
                    ctx.clip();
                    ctx.drawImage(videoData, sx, sy, sw, sh);
                    ctx.restore();
                } else {
                    ctx.drawImage(videoData, sx, sy, sw, sh);
                }
            }

            if (cameraStream && cameraVideoRef.current.readyState >= 2) {
                const webcamVideo = cameraVideoRef.current;
                const vWidth = webcamVideo.videoWidth;
                const vHeight = webcamVideo.videoHeight;
                const vAspect = vWidth / vHeight;

                let dw, dh, dx, dy;
                if (vAspect > 1) {
                    dw = bubbleSize * vAspect; dh = bubbleSize;
                    dx = x - (dw - bubbleSize) / 2; dy = y;
                } else {
                    dw = bubbleSize; dh = bubbleSize / vAspect;
                    dx = x; dy = y - (dh - bubbleSize) / 2;
                }

                if (webcamShape !== 'square') {
                    ctx.save();
                    ctx.beginPath();
                    if (webcamShape === 'circle') {
                        ctx.arc(x + bubbleSize / 2, y + bubbleSize / 2, bubbleSize / 2, 0, Math.PI * 2);
                    } else {
                        ctx.roundRect(x, y, bubbleSize, bubbleSize, 32);
                    }
                    ctx.clip();
                    ctx.drawImage(webcamVideo, dx, dy, dw, dh);
                    ctx.restore();
                } else {
                    ctx.drawImage(webcamVideo, dx, dy, dw, dh);
                }
            }
        }

        // Restore zoom before drawing overlays at normal scale
        restoreZoom(ctx);

        // Restore zoom before drawing overlays at normal scale
        restoreZoom(ctx);

        // Cursor effects overlay
        drawCursorFx(ctx, canvas.width, canvas.height);

        // Annotation overlay
        drawAnnotations(ctx);
    }, [cameraStream, screenStream, activeBg, webcamScale, screenScale, webcamShape, recordingQuality, webcamOnly, annotationEnabled, zoomEnabled, drawCursorFx, drawAnnotations, applyZoom, restoreZoom]);

    const launchLoop = useCallback(() => {
        const isCanvasNeeded = cameraStream || activeBg !== 'none' || screenScale < 1.0 || recordingQuality !== 'native' || webcamOnly || cursorFxEnabled || annotationEnabled || zoomEnabled;

        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }

        if (isCanvasNeeded) {
            workerRef.current = new Worker(new URL('../workers/heartbeat.worker.js', import.meta.url), { type: 'module' });

            workerRef.current.onmessage = (e) => {
                if (e.data.action === 'tick') {
                    renderFrame();
                }
            };

            workerRef.current.postMessage({ action: 'setFps', fps: 30 });
            workerRef.current.postMessage({ action: 'start' });
        }
    }, [cameraStream, activeBg, screenScale, recordingQuality, webcamOnly, cursorFxEnabled, annotationEnabled, zoomEnabled, renderFrame]);

    useEffect(() => {
        launchLoop();
        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, [launchLoop]);

    const getCanvasMousePos = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
    }, []);

    const handleMouseDown = useCallback((e) => {
        if (annotationEnabled) {
            annotation.handleMouseDown(e);
            return;
        }
        const pos = getCanvasMousePos(e);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const bubbleSize = canvas.height * webcamScale;
        const { x, y } = webcamPos.current;
        if (pos.x >= x && pos.x <= x + bubbleSize && pos.y >= y && pos.y <= y + bubbleSize) {
            isDragging.current = true;
            dragOffset.current = { x: pos.x - x, y: pos.y - y };
        }
    }, [getCanvasMousePos, webcamScale, annotationEnabled, annotation]);

    const handleMouseMove = useCallback((e) => {
        if (annotationEnabled) {
            annotation.handleMouseMove(e);
            return;
        }
        if (!isDragging.current) return;
        const pos = getCanvasMousePos(e);
        webcamPos.current = { x: pos.x - dragOffset.current.x, y: pos.y - dragOffset.current.y };
    }, [getCanvasMousePos, annotationEnabled, annotation]);

    const handleMouseUp = useCallback((e) => {
        if (annotationEnabled) {
            annotation.handleMouseUp(e);
            return;
        }
        isDragging.current = false;
    }, [annotationEnabled, annotation]);

    useEffect(() => {
        const loadSavedState = async () => {
            const savedHandle = await storageManager.getSetting('workspace_handle');
            if (savedHandle) {
                setDirectoryHandle(savedHandle);
                const state = await savedHandle.queryPermission({ mode: 'readwrite' });
                setIsHandleAuthorized(state === 'granted');
            }
        };
        loadSavedState();
    }, [setDirectoryHandle, setIsHandleAuthorized]);

    useEffect(() => {
        if (isHistoryOpen && directoryHandle) {
            syncLibrary(directoryHandle);
        }
    }, [isHistoryOpen, directoryHandle, syncLibrary]);

    const startRecording = useCallback(() => {
        if (isRecording || countdown !== null) return;
        setCountdown(3);
        countdownTimerRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    if (countdownTimerRef.current) {
                        clearInterval(countdownTimerRef.current);
                        countdownTimerRef.current = null;
                    }
                    startMediaRecording();
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
    }, [isRecording, countdown, startMediaRecording]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.code === 'Space') {
                e.preventDefault();
                if (isRecording) {
                    stopRecording();
                } else if (countdown === null) {
                    startRecording();
                }
            } else if (e.code === 'KeyP' && isRecording) {
                e.preventDefault();
                if (isPaused) {
                    resumeRecording();
                } else {
                    pauseRecording();
                }
            } else if (e.code === 'Escape' && countdown !== null) {
                e.preventDefault();
                if (countdownTimerRef.current) {
                    clearInterval(countdownTimerRef.current);
                    countdownTimerRef.current = null;
                }
                setCountdown(null);
            }
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

            <PreviewStage
                canvasRef={canvasRef}
                screenVideoRef={screenVideoRef}
                cameraVideoRef={cameraVideoRef}
                cameraStream={cameraStream}
                screenStream={screenStream}
                activeBg={activeBg}
                screenScale={screenScale}
                isRecording={isRecording}
                status={status}
                countdown={countdown}
                recordingQuality={recordingQuality}
                currentDimensions={currentDimensions}
                handleMouseDown={handleMouseDown}
                handleMouseMove={handleMouseMove}
                handleMouseUp={handleMouseUp}
                elapsedTime={formatTime(elapsedTime)}
            />

            {annotationEnabled && (
                <AnnotationToolbar
                    tool={annotation.tool}
                    setTool={annotation.setTool}
                    color={annotation.color}
                    setColor={annotation.setColor}
                    strokeWidth={annotation.strokeWidth}
                    setStrokeWidth={annotation.setStrokeWidth}
                    undo={annotation.undo}
                    redo={annotation.redo}
                    clearAnnotations={annotation.clearAnnotations}
                    canUndo={annotation.hasAnnotations}
                    canRedo={false}
                />
            )}

            <ControlBar
                screenStream={screenStream}
                cameraStream={cameraStream}
                audioStream={audioStream}
                activeBg={activeBg}
                setActiveBg={setActiveBg}
                isRecording={isRecording}
                webcamShape={webcamShape}
                setWebcamShape={setWebcamShape}
                webcamScale={webcamScale}
                setWebcamScale={setWebcamScale}
                screenScale={screenScale}
                setScreenScale={setScreenScale}
                toggleScreen={toggleScreen}
                toggleCamera={toggleCamera}
                toggleMic={toggleMic}
                recordingQuality={recordingQuality}
                setRecordingQuality={setRecordingQuality}
                qualityPresets={QUALITY_PRESETS}
                recordingFormat={recordingFormat}
                setRecordingFormat={setRecordingFormat}
                startRecording={startRecording}
                pauseRecording={pauseRecording}
                resumeRecording={resumeRecording}
                stopRecording={stopRecording}
                isPaused={isPaused}
                handleStopAll={handleStopAll}
                changeCamera={changeCamera}
                changeMic={changeMic}
                audioLevel={audioLevel}
                cursorFxEnabled={cursorFxEnabled}
                setCursorFxEnabled={setCursorFxEnabled}
                webcamOnly={webcamOnly}
                setWebcamOnly={setWebcamOnly}
                annotationEnabled={annotationEnabled}
                setAnnotationEnabled={setAnnotationEnabled}
                zoomEnabled={zoomEnabled}
                setZoomEnabled={setZoomEnabled}
            />

            <div className="mode-info">
                <div className="status-dot" style={{ background: cameraStream ? 'var(--primary)' : 'var(--success)' }}></div>
                <span>Current Mode: {cameraStream ? 'Optimized Canvas' : 'Direct Hardware'}</span>
                <span style={{ marginLeft: '1rem', opacity: 0.5, fontSize: '0.7rem' }}>
                    Space: record/stop | P: pause | Esc: cancel
                </span>
            </div>

            <footer style={{ marginTop: 'auto', paddingTop: '4rem', color: 'var(--text-muted)', fontSize: '0.75rem', width: '100%', maxWidth: '600px', textAlign: 'center', lineHeight: '1.5' }}>
                <p>ScreenStudio &mdash; Free &amp; Open Source</p>
            </footer>

            <HistorySidebar
                isHistoryOpen={isHistoryOpen}
                setIsHistoryOpen={setIsHistoryOpen}
                directoryHandle={directoryHandle}
                isHandleAuthorized={isHandleAuthorized}
                connectFolder={connectFolder}
                resumeSync={resumeSync}
                libraryFiles={libraryFiles}
                thumbnailMap={thumbnailMap}
                getThumbnailUrl={getThumbnailUrl}
                highlightedFile={highlightedFile}
                playVideo={playVideo}
                editingFileName={editingFileName}
                newName={newName}
                setNewName={setNewName}
                handleRename={handleRename}
                setEditingFileName={setEditingFileName}
                startRename={startRename}
                deleteFile={deleteFile}
            />

            <VideoPlayerModal
                url={selectedVideoUrl}
                onClose={() => setSelectedVideoUrl(null)}
            />

            <Toast
                toast={toast}
                onClose={() => setToast(null)}
            />

            <SaveRecordingModal
                blob={pendingRecording?.blob}
                mimeType={pendingRecording?.mimeType}
                onSave={handleSaveRecording}
                onDiscard={() => setPendingRecording(null)}
            />
        </div>
    );
};

export default ScreenRecorder;
