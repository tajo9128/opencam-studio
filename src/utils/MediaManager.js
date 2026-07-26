class MediaManager {
    isScreenCaptureSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    }

    async getScreenStream() {
        if (!this.isScreenCaptureSupported()) {
            throw new Error('Screen capture not supported. Use Chrome, Edge, or Firefox.');
        }
        try {
            return await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always', frameRate: { ideal: 30 } },
                audio: false
            });
        } catch (err) {
            if (err.name === 'OverconstrainedError' || err.name === 'TypeError') {
                return navigator.mediaDevices.getDisplayMedia({
                    video: { cursor: 'always', frameRate: { ideal: 30 } },
                    audio: false
                });
            }
            throw err;
        }
    }

    async getCameraStream() {
        return navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        });
    }

    async getAudioStream({ noiseSuppression = true, echoCancellation = true, autoGainControl = true } = {}) {
        return navigator.mediaDevices.getUserMedia({
            audio: {
                noiseSuppression,
                echoCancellation,
                autoGainControl,
            },
            video: false
        });
    }

    async getSystemAudio() {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: false,
                audio: { suppressLocalAudioPlayback: false }
            });
            return stream;
        } catch {
            return null;
        }
    }

    stopStream(stream) {
        if (stream) { stream.getTracks().forEach(t => t.stop()); }
    }
}

export const mediaManager = new MediaManager();
