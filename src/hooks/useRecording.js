import { useState, useRef, useCallback } from 'react';

export const useRecording = ({
    screenStream,
    audioStream,
    cameraStream,
    systemAudioStream: _systemAudioStream,
    activeBg = 'none',
    screenScale = 1.0,
    canvasRef,
    recordingQuality = 'native',
    bitrate = 8000000,
    mimeType: preferredMimeType,
    useCanvas: useCanvasProp,
    multiTrack = false,
    canvasElement,
    onComplete
} = {}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [status, setStatus] = useState('idle');
    const [multiTrackMode, setMultiTrackMode] = useState(false);
    const videoRecorderRef = useRef(null);
    const audioRecorderRef = useRef(null);
    const videoChunksRef = useRef([]);
    const audioChunksRef = useRef([]);
    const isStartingRef = useRef(false);
    const recordStartRef = useRef(0);
    const cursorDataRef = useRef([]);
    const cursorCaptureRef = useRef(null);

    const pickMimeType = (hasAudio) => {
        if (preferredMimeType && MediaRecorder.isTypeSupported(preferredMimeType)) return preferredMimeType;
        const fallbacks = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=h264,opus',
            'video/webm',
            'video/mp4'
        ];
        let mt = fallbacks.find(t => MediaRecorder.isTypeSupported(t)) || '';
        if (!hasAudio && mt.includes('opus')) mt = mt.replace(',opus', '');
        return mt;
    };

    const startCursorCapture = useCallback(() => {
        const el = canvasElement?.current || canvasRef?.current;
        if (!el) return;
        recordStartRef.current = Date.now();
        cursorDataRef.current = [];

        const onMouseMove = (e) => {
            const rect = el.getBoundingClientRect();
            cursorDataRef.current.push({
                t: (Date.now() - recordStartRef.current) / 1000,
                x: (e.clientX - rect.left) / rect.width,
                y: (e.clientY - rect.top) / rect.height,
                click: false,
            });
            // Cap at 1800 entries (~60s at 30fps mouse movement)
            if (cursorDataRef.current.length > 50000) cursorDataRef.current.shift();
        };
        const onMouseDown = (e) => {
            const rect = el.getBoundingClientRect();
            cursorDataRef.current.push({
                t: (Date.now() - recordStartRef.current) / 1000,
                x: (e.clientX - rect.left) / rect.width,
                y: (e.clientY - rect.top) / rect.height,
                click: true,
            });
        };
        el.addEventListener('mousemove', onMouseMove);
        el.addEventListener('mousedown', onMouseDown);
        cursorCaptureRef.current = { onMouseMove, onMouseDown, el };
    }, [canvasRef, canvasElement]);

    const stopCursorCapture = useCallback(() => {
        const cap = cursorCaptureRef.current;
        if (cap?.el) {
            cap.el.removeEventListener('mousemove', cap.onMouseMove);
            cap.el.removeEventListener('mousedown', cap.onMouseDown);
        }
        cursorCaptureRef.current = null;
        return cursorDataRef.current;
    }, []);

    const startRecording = useCallback(async () => {
        if (isStartingRef.current) return;
        isStartingRef.current = true;

        try {
            if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') return;
            if (!screenStream && !cameraStream) {
                setStatus('error');
                isStartingRef.current = false;
                return;
            }

            setStatus('initializing');
            setMultiTrackMode(multiTrack);

            const useCanvas = useCanvasProp ?? (cameraStream || activeBg !== 'none' || (screenScale && screenScale < 1.0) || recordingQuality !== 'native');

            // --- VIDEO TRACKS ---
            const videoTracks = [];
            if (useCanvas) {
                if (canvasRef?.current) {
                    const canvasStream = canvasRef.current.captureStream(30);
                    const ct = canvasStream.getVideoTracks();
                    if (ct.length > 0) videoTracks.push(...ct);
                }
            }
            // Fallback: if canvas has no tracks, use direct streams
            if (videoTracks.length === 0) {
                if (screenStream) videoTracks.push(...screenStream.getVideoTracks());
                if (cameraStream) videoTracks.push(...cameraStream.getVideoTracks());
            }

            const videoMimeType = pickMimeType(false);
            const hasAudio = !!audioStream;

            if (multiTrack && hasAudio) {
                // === MULTI-TRACK MODE: separate video + audio recorders ===
                
                // Video recorder (no audio)
                const videoStream = new MediaStream(videoTracks);
                const vRecorder = new MediaRecorder(videoStream, {
                    mimeType: videoMimeType.replace(/,?opus/, '').replace(/,?aac/, '') || 'video/webm',
                    videoBitsPerSecond: bitrate,
                });
                videoChunksRef.current = [];
                vRecorder.ondataavailable = (e) => { if (e.data?.size > 0) videoChunksRef.current.push(e.data); };
                vRecorder.onerror = () => { setIsRecording(false); setStatus('error'); };
                vRecorder.onstop = () => {
                    const videoBlob = new Blob(videoChunksRef.current, { type: videoMimeType });
                    const cursorData = stopCursorCapture();

                    // If audio recorder already stopped, call onComplete
                    if (!audioRecorderRef.current || audioRecorderRef.current.state === 'inactive') {
                        const audioBlob = audioChunksRef.current.length > 0
                            ? new Blob(audioChunksRef.current, { type: 'audio/webm' })
                            : null;
                        if (onComplete) onComplete(videoBlob, videoMimeType, { audioBlob, cursorData, multiTrack: true });
                        setStatus('ready');
                    }
                };
                videoRecorderRef.current = vRecorder;

                // Audio recorder (mic only)
                const audioMimeType = 'audio/webm;codecs=opus';
                const supportedAudioMime = MediaRecorder.isTypeSupported(audioMimeType) ? audioMimeType : 'audio/webm';
                const aRecorder = new MediaRecorder(audioStream, {
                    mimeType: supportedAudioMime,
                    audioBitsPerSecond: 128000,
                });
                audioChunksRef.current = [];
                aRecorder.ondataavailable = (e) => { if (e.data?.size > 0) audioChunksRef.current.push(e.data); };
                aRecorder.onerror = () => { console.warn('Audio recorder error'); };
                aRecorder.onstop = () => {
                    // Check if video also stopped
                    if (!videoRecorderRef.current || videoRecorderRef.current.state === 'inactive') {
                        const videoBlob = videoChunksRef.current.length > 0
                            ? new Blob(videoChunksRef.current, { type: videoMimeType })
                            : null;
                        const audioBlob = audioChunksRef.current.length > 0
                            ? new Blob(audioChunksRef.current, { type: supportedAudioMime })
                            : null;
                        const cursorData = stopCursorCapture();
                        if (onComplete) onComplete(videoBlob, videoMimeType, { audioBlob, cursorData, multiTrack: true });
                        setStatus('ready');
                    }
                };
                audioRecorderRef.current = aRecorder;

                startCursorCapture();
                vRecorder.start(1000);
                aRecorder.start(1000);

            } else {
                // === SINGLE-TRACK MODE: combined video+audio ===
                const tracks = [...videoTracks];
                if (audioStream) {
                    const at = audioStream.getAudioTracks()[0];
                    if (at) tracks.push(at);
                }
                if (tracks.length === 0) throw new Error('No tracks available');

                const combinedMime = pickMimeType(hasAudio);
                const recordingStream = new MediaStream(tracks);
                const recorder = new MediaRecorder(recordingStream, {
                    mimeType: combinedMime,
                    videoBitsPerSecond: bitrate,
                    audioBitsPerSecond: hasAudio ? 128000 : 0,
                });
                videoChunksRef.current = [];
                recorder.ondataavailable = (e) => { if (e.data?.size > 0) videoChunksRef.current.push(e.data); };
                recorder.onerror = () => { setIsRecording(false); setIsPaused(false); setStatus('error'); };
                recorder.onstop = () => {
                    const blob = new Blob(videoChunksRef.current, { type: combinedMime });
                    const cursorData = stopCursorCapture();
                    if (onComplete) onComplete(blob, combinedMime, { cursorData, multiTrack: false });
                    videoChunksRef.current = [];
                    setStatus('ready');
                };
                videoRecorderRef.current = recorder;

                startCursorCapture();
                recorder.start(1000);
            }

            setIsRecording(true);
            setStatus('recording');
        } catch {
            setStatus('error');
        } finally {
            isStartingRef.current = false;
        }
    }, [screenStream, cameraStream, audioStream, activeBg, screenScale, canvasRef, recordingQuality, bitrate, preferredMimeType, useCanvasProp, multiTrack, onComplete, startCursorCapture, stopCursorCapture]);

    const pauseRecording = useCallback(() => {
        if (videoRecorderRef.current?.state === 'recording') videoRecorderRef.current.pause();
        if (audioRecorderRef.current?.state === 'recording') audioRecorderRef.current.pause();
        setIsPaused(true);
        setStatus('paused');
    }, []);

    const resumeRecording = useCallback(() => {
        if (videoRecorderRef.current?.state === 'paused') videoRecorderRef.current.resume();
        if (audioRecorderRef.current?.state === 'paused') audioRecorderRef.current.resume();
        setIsPaused(false);
        setStatus('recording');
    }, []);

    const stopRecording = useCallback(() => {
        if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') videoRecorderRef.current.stop();
        if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') audioRecorderRef.current.stop();
        setIsRecording(false);
        setIsPaused(false);
    }, []);

    const resetRecording = useCallback(() => {
        if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') videoRecorderRef.current.stop();
        if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') audioRecorderRef.current.stop();
        setIsRecording(false);
        setIsPaused(false);
        setStatus('idle');
    }, []);

    return {
        isRecording,
        isPaused,
        status,
        setStatus,
        multiTrackMode,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopRecording,
        resetRecording,
        mediaRecorderRef: videoRecorderRef,
    };
};
