import { useState, useRef, useCallback } from 'react';

export const useRecording = ({
    screenStream,
    audioStream,
    cameraStream,
    systemAudioStream: _systemAudioStream,
    activeBg = 'none',
    screenScale = 1.0,
    canvasRef,
    recordingQuality = '1080p',
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
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const isStartingRef = useRef(false);

    const startRecording = useCallback(async () => {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') return;
            
            setStatus('initializing');
            const videoTracks = [];

            // Priority 1: Canvas capture (composited screen + camera)
            if (canvasRef?.current) {
                try {
                    const canvasStream = canvasRef.current.captureStream(30);
                    const ct = canvasStream.getVideoTracks();
                    if (ct.length > 0) videoTracks.push(...ct);
                } catch (e) { /* canvas capture failed, try direct */ }
            }

            // Priority 2: Direct screen stream
            if (videoTracks.length === 0 && screenStream) {
                try { videoTracks.push(...screenStream.getVideoTracks()); } catch (e) { }
            }

            // Priority 3: Direct camera stream
            if (videoTracks.length === 0 && cameraStream) {
                try { videoTracks.push(...cameraStream.getVideoTracks()); } catch (e) { }
            }

            // Priority 4: Combined screen + camera
            if (videoTracks.length === 0 && screenStream && cameraStream) {
                try {
                    videoTracks.push(...screenStream.getVideoTracks());
                    videoTracks.push(...cameraStream.getVideoTracks());
                } catch (e) { }
            }

            const tracks = [...videoTracks];
            if (audioStream) { try { const at = audioStream.getAudioTracks()[0]; if (at) tracks.push(at); } catch (e) { } }
            if (tracks.length === 0) { setStatus('idle'); isStartingRef.current = false; return; }

            const hasAudioTrack = tracks.some(t => t.kind === 'audio');
            let mime = 'video/webm';
            const fb = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
            for (const m of fb) { if (MediaRecorder.isTypeSupported(m)) { mime = m; break; } }
            if (!hasAudioTrack) mime = mime.replace(/,?opus/, '');

            const recordingStream = new MediaStream(tracks);
            const recorder = new MediaRecorder(recordingStream, {
                mimeType: mime,
                videoBitsPerSecond: bitrate || 8000000,
                audioBitsPerSecond: hasAudioTrack ? 128000 : 0
            });
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
            recorder.onerror = () => { setIsRecording(false); setStatus('error'); };
            recorder.onstop = () => {
                const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mime }) : null;
                if (onComplete) onComplete(blob, mime);
                chunksRef.current = [];
                setStatus('ready');
            };

            recorder.start(1000);
            setIsRecording(true);
            setStatus('recording');
        } catch (e) {
            setStatus('error');
        } finally {
            isStartingRef.current = false;
        }
    }, [screenStream, cameraStream, audioStream, canvasRef, bitrate, onComplete]);

    const pauseRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.pause(); setIsPaused(true); setStatus('paused'); }
    }, []);
    const resumeRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'paused') { mediaRecorderRef.current.resume(); setIsPaused(false); setStatus('recording'); }
    }, []);
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
        setIsRecording(false); setIsPaused(false);
    }, []);
    const resetRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
        setIsRecording(false); setIsPaused(false); setStatus('idle');
    }, []);

    return { isRecording, isPaused, status, setStatus, startRecording, pauseRecording, resumeRecording, stopRecording, resetRecording, mediaRecorderRef };
};
