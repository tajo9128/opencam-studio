import { useState, useCallback } from 'react';
import { mediaManager } from '../utils/MediaManager';

export const useStreams = (screenVideoRef, cameraVideoRef, setStatus) => {
    const [screenStream, setScreenStream] = useState(null);
    const [audioStream, setAudioStream] = useState(null);
    const [cameraStream, setCameraStream] = useState(null);
    const [screenDimensions, setScreenDimensions] = useState({ width: 0, height: 0 });
    const [cameraDimensions, setCameraDimensions] = useState({ width: 0, height: 0 });

    const stopAll = useCallback(() => {
        [screenStream, cameraStream, audioStream].forEach(s => {
            s?.getTracks().forEach(t => t.stop());
        });
        setScreenStream(null);
        setCameraStream(null);
        setAudioStream(null);
        setScreenDimensions({ width: 0, height: 0 });
        setCameraDimensions({ width: 0, height: 0 });
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
        if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
        setStatus('idle');
    }, [screenStream, cameraStream, audioStream, screenVideoRef, cameraVideoRef, setStatus]);

    const toggleScreen = async () => {
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
            setScreenStream(null);
            setScreenDimensions({ width: 0, height: 0 });
            if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
            return;
        }

        try {
            const stream = await mediaManager.getScreenStream();
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();

            setScreenDimensions({
                width: settings.width || width || 1920,
                height: settings.height || height || 1080
            });

            setScreenStream(stream);
            if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;

            // Explicitly play to ensure readyState progresses
            await screenVideoRef.current?.play().catch(e => console.warn('Screen video play delayed:', e));

            track.onended = () => {
                setScreenStream(null);
                setScreenDimensions({ width: 0, height: 0 });
                if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
            };

            setStatus('ready');
        } catch (err) {
            console.error('Error starting screen stream:', err);
            alert(`Could not acquire screen: ${err.message}`);
        }
    };

    const toggleMic = async (deviceId) => {
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            setAudioStream(null);
            return;
        }

        try {
            const stream = await mediaManager.getAudioStream(deviceId);
            setAudioStream(stream);
            setStatus('ready');
            return stream;
        } catch (err) {
            console.error('Error starting mic stream:', err);
            alert(`Could not acquire microphone: ${err.message}`);
        }
    };

    const toggleCamera = async (deviceId) => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
            setCameraDimensions({ width: 0, height: 0 });
            if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
            return;
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

            await cameraVideoRef.current?.play().catch(e => console.warn('Camera video play delayed:', e));
            setStatus('ready');
            return stream;
        } catch (err) {
            console.error('Error starting camera stream:', err);
            alert(`Could not acquire camera: ${err.message}`);
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
        screenDimensions,
        cameraDimensions,
        toggleScreen,
        toggleMic,
        toggleCamera,
        stopAll,
        changeCamera,
        changeMic
    };
};
