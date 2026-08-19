/**
 * Accurately calculates the duration of a video or audio file/blob/URL in seconds.
 * Handles WebM missing duration header bug by seeking to compute duration.
 */
export async function getVideoDuration(fileOrBlobOrUrl) {
    return new Promise((resolve) => {
        let url = typeof fileOrBlobOrUrl === 'string' ? fileOrBlobOrUrl : null;
        let createdUrl = false;
        if (!url && fileOrBlobOrUrl) {
            try {
                url = URL.createObjectURL(fileOrBlobOrUrl);
                createdUrl = true;
            } catch {
                return resolve(10);
            }
        }
        if (!url) return resolve(10);

        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        let isFinished = false;
        const cleanup = (dur) => {
            if (isFinished) return;
            isFinished = true;
            video.removeAttribute('src');
            video.load();
            if (createdUrl) {
                try { URL.revokeObjectURL(url); } catch {}
            }
            const valid = typeof dur === 'number' && Number.isFinite(dur) && dur > 0 ? dur : 10;
            resolve(valid);
        };

        video.onloadedmetadata = () => {
            if (Number.isFinite(video.duration) && video.duration > 0) {
                cleanup(video.duration);
            } else {
                // Workaround for WebM missing duration header (sets duration to Infinity)
                video.currentTime = Number.MAX_SAFE_INTEGER || 1e10;
                video.ontimeupdate = () => {
                    video.ontimeupdate = null;
                    if (Number.isFinite(video.duration) && video.duration > 0) {
                        cleanup(video.duration);
                    } else if (Number.isFinite(video.currentTime) && video.currentTime > 0) {
                        cleanup(video.currentTime);
                    } else {
                        cleanup(10);
                    }
                };
            }
        };

        video.onerror = () => cleanup(10);

        // Fallback safety timeout if browser takes too long
        setTimeout(() => {
            if (!isFinished) {
                if (Number.isFinite(video.duration) && video.duration > 0) {
                    cleanup(video.duration);
                } else if (Number.isFinite(video.currentTime) && video.currentTime > 0) {
                    cleanup(video.currentTime);
                } else {
                    cleanup(10);
                }
            }
        }, 3000);

        video.src = url;
    });
}
