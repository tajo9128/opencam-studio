import { useState, useCallback, useRef, useEffect } from 'react';

// Replay Buffer — keeps last N seconds of canvas recording in memory
// On save, exports the buffer as a video clip

export const useReplayBuffer = (bufferSeconds = 30) => {
    const [isBuffering, setIsBuffering] = useState(false);
    const [savedClips, setSavedClips] = useState([]);
    const [bufferDuration, setBufferDuration] = useState(bufferSeconds);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const canvasRef = useRef(null);
    const audioStreamRef = useRef(null);
    const intervalRef = useRef(null);

    const startBuffering = useCallback((canvas, audioStream) => {
        if (isBuffering) return;
        canvasRef.current = canvas;
        audioStreamRef.current = audioStream;

        const stream = canvas.captureStream(30);
        if (audioStream) {
            audioStream.getAudioTracks().forEach(t => stream.addTrack(t));
        }

        const recorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp8',
            videoBitsPerSecond: 4000000,
        });

        // Collect chunks
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunksRef.current.push(e.data);
                // Trim to buffer duration (approximate by chunk count)
                // Each chunk is ~1 second, so keep bufferDuration chunks
                const maxChunks = bufferDuration + 5; // +5 safety margin
                if (chunksRef.current.length > maxChunks) {
                    chunksRef.current = chunksRef.current.slice(-maxChunks);
                }
            }
        };

        // Restart recorder every bufferDuration seconds to manage memory
        const restartRecorder = () => {
            if (recorderRef.current?.state === 'recording') {
                recorderRef.current.stop();
            }
            const newRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp8',
                videoBitsPerSecond: 4000000,
            });
            newRecorder.ondataavailable = recorder.ondataavailable;
            newRecorder.start(1000); // 1-second chunks
            recorderRef.current = newRecorder;
        };

        recorder.start(1000);
        recorderRef.current = recorder;
        setIsBuffering(true);

        // Periodically restart to limit memory
        intervalRef.current = setInterval(() => {
            if (recorderRef.current?.state === 'recording') {
                const oldChunks = chunksRef.current;
                // Keep only last bufferDuration seconds
                if (oldChunks.length > bufferDuration) {
                    chunksRef.current = oldChunks.slice(-bufferDuration);
                }
            }
        }, 5000);
    }, [isBuffering, bufferDuration]);

    const stopBuffering = useCallback(() => {
        if (recorderRef.current?.state === 'recording') {
            recorderRef.current.stop();
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        recorderRef.current = null;
        chunksRef.current = [];
        setIsBuffering(false);
    }, []);

    const saveReplay = useCallback(() => {
        if (chunksRef.current.length === 0) return null;

        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const clip = {
            id: `replay_${Date.now()}`,
            blob,
            url,
            timestamp: new Date().toISOString(),
            duration: chunksRef.current.length, // approximate seconds
        };

        setSavedClips(prev => [clip, ...prev]);
        return clip;
    }, []);

    const downloadReplay = useCallback((clipId) => {
        const clip = savedClips.find(c => c.id === clipId);
        if (!clip) return;

        const a = document.createElement('a');
        a.href = clip.url;
        a.download = `replay_${clip.timestamp.replace(/[:.]/g, '-')}.webm`;
        a.click();
    }, [savedClips]);

    const deleteReplay = useCallback((clipId) => {
        setSavedClips(prev => {
            const clip = prev.find(c => c.id === clipId);
            if (clip) URL.revokeObjectURL(clip.url);
            return prev.filter(c => c.id !== clipId);
        });
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopBuffering();
            savedClips.forEach(c => URL.revokeObjectURL(c.url));
        };
    }, []);

    return {
        isBuffering, savedClips, bufferDuration,
        setBufferDuration, startBuffering, stopBuffering,
        saveReplay, downloadReplay, deleteReplay,
    };
};
