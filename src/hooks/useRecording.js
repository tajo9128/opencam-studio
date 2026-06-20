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
    const [multiTrackMode, setMultiTrackMode] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const audioChunksRef = useRef([]);
    const isStartingRef = useRef(false);

    const startRecording = useCallback(async () => {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') return;
            if (!screenStream && !cameraStream) { setStatus('error'); isStartingRef.current = false; return; }
            setStatus('initializing');

            const useCanvas = useCanvasProp ?? (cameraStream || activeBg !== 'none' || (screenScale && screenScale < 1.0) || recordingQuality !== 'native');
            const videoTracks = [];

            if (useCanvas) {
                if (canvasRef?.current) {
                    const canvasStream = canvasRef.current.captureStream(30);
                    const ct = canvasStream.getVideoTracks();
                    if (ct.length > 0) videoTracks.push(...ct);
                }
                if (videoTracks.length === 0) {
                    if (screenStream) videoTracks.push(...screenStream.getVideoTracks());
                    if (cameraStream) videoTracks.push(...cameraStream.getVideoTracks());
                }
            } else {
                if (screenStream) videoTracks.push(...screenStream.getVideoTracks());
                if (cameraStream) videoTracks.push(...cameraStream.getVideoTracks());
            }

            const hasAudio = !!audioStream;
            const hasAudioTrack = audioStream ? !!audioStream.getAudioTracks()[0] : false;
            const tracks = [...videoTracks];
            if (audioStream) { const at = audioStream.getAudioTracks()[0]; if (at) tracks.push(at); }
            if (tracks.length === 0) { isStartingRef.current = false; return; }

            const findMime = (hasA) => {
                if (preferredMimeType && MediaRecorder.isTypeSupported(preferredMimeType)) return preferredMimeType;
                const fb = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
                let m = fb.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
                if (!hasA) m = m.replace(/,?opus/, '').replace(/,?aac/, '');
                return m;
            };

            if (multiTrack && hasAudio) {
                setMultiTrackMode(true);
                const vmime = findMime(false);
                const vRecorder = new MediaRecorder(new MediaStream(videoTracks), { mimeType: vmime, videoBitsPerSecond: bitrate });
                chunksRef.current = [];
                vRecorder.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
                vRecorder.onstop = () => {
                    const vb = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: vmime }) : null;
                    if (!audioRecorderRef.current || audioRecorderRef.current.state === 'inactive') {
                        const ab = audioChunksRef.current.length > 0 ? new Blob(audioChunksRef.current, { type: 'audio/webm' }) : null;
                        if (onComplete) onComplete(vb, vmime, { audioBlob: ab, multiTrack: true });
                        setStatus('ready');
                    }
                };
                mediaRecorderRef.current = vRecorder;

                const amime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
                const aRecorder = new MediaRecorder(audioStream, { mimeType: amime, audioBitsPerSecond: 128000 });
                audioChunksRef.current = [];
                aRecorder.ondataavailable = (e) => { if (e.data?.size > 0) audioChunksRef.current.push(e.data); };
                aRecorder.onstop = () => {
                    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
                        const vb = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: vmime }) : null;
                        const ab = audioChunksRef.current.length > 0 ? new Blob(audioChunksRef.current, { type: amime }) : null;
                        if (onComplete) onComplete(vb, vmime, { audioBlob: ab, multiTrack: true });
                        setStatus('ready');
                    }
                };
                audioRecorderRef.current = aRecorder;
                vRecorder.start(1000);
                aRecorder.start(1000);
            } else {
                const mime = findMime(hasAudioTrack);
                const recordingStream = new MediaStream(tracks);
                const recorder = new MediaRecorder(recordingStream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: hasAudioTrack ? 128000 : 0 });
                mediaRecorderRef.current = recorder;
                chunksRef.current = [];
                recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
                recorder.onerror = () => { setIsRecording(false); setStatus('error'); };
                recorder.onstop = () => {
                    const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mime }) : null;
                    if (onComplete) onComplete(blob, mime, { multiTrack: false });
                    chunksRef.current = [];
                    setStatus('ready');
                };
                recorder.start(1000);
            }

            setIsRecording(true);
            setStatus('recording');
        } catch {
            setStatus('error');
        } finally {
            isStartingRef.current = false;
        }
    }, [screenStream, cameraStream, audioStream, activeBg, screenScale, canvasRef, recordingQuality, bitrate, preferredMimeType, useCanvasProp, multiTrack, onComplete]);

    const pauseRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.pause();
        if (audioRecorderRef.current?.state === 'recording') audioRecorderRef.current.pause();
        setIsPaused(true); setStatus('paused');
    }, []);
    const resumeRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'paused') mediaRecorderRef.current.resume();
        if (audioRecorderRef.current?.state === 'paused') audioRecorderRef.current.resume();
        setIsPaused(false); setStatus('recording');
    }, []);
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
        if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') audioRecorderRef.current.stop();
        setIsRecording(false); setIsPaused(false);
    }, []);
    const resetRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
        if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') audioRecorderRef.current.stop();
        setIsRecording(false); setIsPaused(false); setStatus('idle');
    }, []);

    return { isRecording, isPaused, status, setStatus, multiTrackMode, startRecording, pauseRecording, resumeRecording, stopRecording, resetRecording, mediaRecorderRef };
};
