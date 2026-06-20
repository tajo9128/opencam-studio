class MediaManager {
    isScreenCaptureSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    }

    async getScreenStream(sourceType = 'screen') {
        if (!this.isScreenCaptureSupported()) {
            throw new Error('Screen capture not supported in this browser. Use Chrome, Edge, or Firefox.');
        }

        const videoConstraints = {
            cursor: 'always',
            frameRate: { ideal: 30, max: 30 }
        };

        // displaySurface is not supported in all browsers (Firefox rejects it)
        try {
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
                audio: true
            });
        } catch (err) {
            // If displaySurface constraint fails, retry without it (Firefox compat)
            if (err.name === 'OverconstrainedError' || err.name === 'TypeError') {
                const fallbackConstraints = { cursor: 'always', frameRate: { ideal: 30, max: 30 } };
                return navigator.mediaDevices.getDisplayMedia({
                    video: fallbackConstraints,
                    audio: true
                });
            }
            throw err;
        }
    }

    async getCameraStream(width, height, deviceId) {
        const video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
        if (deviceId) video.deviceId = { exact: deviceId };
        return navigator.mediaDevices.getUserMedia({ video });
    }

    async getAudioStream(deviceId) {
        const audio = true;
        if (deviceId) return navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
