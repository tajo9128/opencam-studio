class MediaManager {
    async getScreenStream(sourceType = 'screen') {
        try {
            const videoConstraints = {
                cursor: 'always',
                frameRate: { ideal: 30, max: 30 }
            };

            // Source type hints for getDisplayMedia
            switch (sourceType) {
                case 'window':
                    videoConstraints.displaySurface = 'window';
                    break;
                case 'tab':
                    videoConstraints.displaySurface = 'browser';
                    break;
                case 'screen':
                default:
                    videoConstraints.displaySurface = 'monitor';
                    break;
            }

            return await navigator.mediaDevices.getDisplayMedia({
                video: videoConstraints,
                audio: true // captures system audio on supported browsers
            });
        } catch (err) {
            throw err;
        }
    }

    async getCameraStream(width, height, deviceId) {
        try {
            return await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    width: { max: width || 1920 },
                    height: { max: height || 1080 },
                    frameRate: { ideal: 30, max: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
        } catch (err) {
            throw err;
        }
    }

    async getAudioStream(deviceId) {
        try {
            return await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
        } catch (err) {
            throw err;
        }
    }

    async getSystemAudio() {
        try {
            // System audio via getDisplayMedia (browser must support it)
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: false,
                audio: {
                    suppressLocalAudioPlayback: false
                }
            });
            return stream;
        } catch {
            // System audio not supported or denied
            return null;
        }
    }

    async enumerateDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return {
                cameras: devices.filter(d => d.kind === 'videoinput'),
                microphones: devices.filter(d => d.kind === 'audioinput'),
            };
        } catch {
            return { cameras: [], microphones: [] };
        }
    }

    stopStream(stream) {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    }
}

export const mediaManager = new MediaManager();
