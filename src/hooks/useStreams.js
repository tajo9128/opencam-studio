import { useState, useCallback } from 'react';
import { mediaManager } from '../utils/MediaManager';

export const useStreams = (screenVideoRef, cameraVideoRef, setStatus) => {
    const [screenStream, setScreenStream] = useState(null);
    const [audioStream, setAudioStream] = useState(null);
    const [cameraStream, setCameraStream] = useState(null);
    const [systemAudioStream, setSystemAudioStream] = useState(null);
    const [screenDimensions, setScreenDimensions] = useState({ width: 0, height: 0 });
    const [cameraDimensions, setCameraDimensions] = useState({ width: 0, height: 0 });
    const [sourceType, setSourceType] = useState('screen'); // screen, window, tab

    const stopAll = useCallback(() => {
        [screenStream, cameraStream, audioStream, systemAudioStream].forEach(s => {
            s?.getTracks().forEach(t => t.stop());
        });
        setScreenStream(null);
        setCameraStream(null);
        setAudioStream(null);
        setSystemAudioStream(null);
        setScreenDimensions({ width: 0, height: 0 });
        setCameraDimensions({ width: 0, height: 0 });
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
        if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
        setStatus('idle');
    }, [screenStream, cameraStream, audioStream, systemAudioStream, screenVideoRef, cameraVideoRef, setStatus]);

    const toggleScreen = async (type) => {
        const captureType = type || sourceType;
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
            setScreenStream(null);
            setScreenDimensions({ width: 0, height: 0 });
            if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
            return null;
        }

        try {
            const stream = await mediaManager.getScreenStream(captureType);
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();

            setScreenDimensions({
                width: settings.width || 1920,
                height: settings.height || 1080
            });

            setScreenStream(stream);
            if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;

            await screenVideoRef.current?.play().catch(() => {});

            track.onended = () => {
                setScreenStream(null);
                setScreenDimensions({ width: 0, height: 0 });
                if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
            };

            setStatus('ready');
            return stream;
        } catch (err) {
            console.error('Screen capture failed:', err.message);
            return null;
        }
    };

    const toggleSystemAudio = async () => {
        if (systemAudioStream) {
            systemAudioStream.getTracks().forEach(track => track.stop());
            setSystemAudioStream(null);
            return;
        }
        try {
            const stream = await mediaManager.getSystemAudio();
            if (stream) {
                setSystemAudioStream(stream);
            } else {
                console.warn('System audio capture is not supported in this browser.');
            }
        } catch {
            console.warn('System audio capture not available.');
        }
    };

    const toggleMic = async (deviceId) => {
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            setAudioStream(null);
            return null;
        }

        try {
            const stream = await mediaManager.getAudioStream(deviceId);
            setAudioStream(stream);
            setStatus('ready');
            return stream;
        } catch (err) {
            console.error('Mic error:', err);
            throw err;
        }
    };

    const toggleCamera = async (deviceId) => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
            setCameraDimensions({ width: 0, height: 0 });
            if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
            return null;
        }

        try {
            const stream = await mediaManager.getCameraStream(1280, 720, deviceId);
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();

            setCameraDimensions({
                width: settings.width || 1280,
                height: settings.height || 720
            });

            setCameraStream(stream);
            if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream;

            await cameraVideoRef.current?.play().catch(() => {});
            setStatus('ready');
            return stream;
        } catch (err) {
            console.error('Camera error:', err);
            throw err;
        }
    };

    const changeCamera = async (deviceId) => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        return await toggleCamera(deviceId);
    };

    const changeMic = async (deviceId) => {
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            setAudioStream(null);
        }
        return await toggleMic(deviceId);
    };

    return {
        screenStream,
        audioStream,
        cameraStream,
        systemAudioStream,
        screenDimensions,
        cameraDimensions,
        sourceType,
        setSourceType,
        toggleScreen,
        toggleSystemAudio,
        toggleMic,
        toggleCamera,
        stopAll,
        changeCamera,
        changeMic,
    };
};
