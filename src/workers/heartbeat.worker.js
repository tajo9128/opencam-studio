/**
 * heartbeat.worker.js
 * 
 * This worker provides a high-precision timer that is not subject to 
 * aggressive browser background throttling. It pings the main thread
 * 30 times a second (every ~33.3ms) to keep the recording loop alive.
 */

let timer = null;
let fps = 30;
let interval = 1000 / fps;

self.onmessage = (e) => {
    const { action } = e.data;

    if (action === 'start') {
        if (timer) clearInterval(timer);

        // Use setInterval for consistent timing in the background
        timer = setInterval(() => {
            self.postMessage({ action: 'tick', timestamp: Date.now() });
        }, interval);

        // Heartbeat started
    }
    else if (action === 'stop') {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        // Heartbeat stopped
    }
    else if (action === 'setFps') {
        fps = e.data.fps || 30;
        interval = 1000 / fps;
        if (timer) {
            clearInterval(timer);
            timer = setInterval(() => {
                self.postMessage({ action: 'tick', timestamp: Date.now() });
            }, interval);
        }
    }
};
