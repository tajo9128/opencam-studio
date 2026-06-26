export class CursorTelemetry {
    constructor() {
        this.events = [];
        this.recording = false;
        this.startTime = 0;
        this._lastSampleTime = 0;
        this._sampleInterval = 1000 / 30;
    }

    start() {
        this.events = [];
        this.recording = true;
        this.startTime = performance.now();
        this._lastSampleTime = 0;
    }

    stop() {
        this.recording = false;
    }

    onMouseMove(x, y) {
        if (!this.recording) return;
        const now = performance.now() - this.startTime;
        if (now - this._lastSampleTime < this._sampleInterval) return;
        this._lastSampleTime = now;
        this.events.push({ t: now, x, y, click: false, key: null });
    }

    onClick(x, y) {
        if (!this.recording) return;
        const now = performance.now() - this.startTime;
        this.events.push({ t: now, x, y, click: true, key: null });
    }

    onKey(key) {
        if (!this.recording) return;
        const now = performance.now() - this.startTime;
        const last = this.events[this.events.length - 1];
        if (last && Math.abs(last.t - now) < 16) {
            last.key = key;
        } else {
            this.events.push({ t: now, x: last?.x ?? 0.5, y: last?.y ?? 0.5, click: false, key });
        }
    }

    getEvents() {
        return this.events;
    }

    getEventsInRange(startMs, endMs) {
        let lo = 0, hi = this.events.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.events[mid].t < startMs) lo = mid + 1;
            else hi = mid;
        }
        const result = [];
        for (let i = lo; i < this.events.length && this.events[i].t <= endMs; i++) {
            result.push(this.events[i]);
        }
        return result;
    }

    smoothPath(tension = 0.5) {
        if (this.events.length < 3) return [...this.events];

        const pts = this.events;
        const smooth = [pts[0]];

        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[Math.max(0, i - 1)];
            const p1 = pts[i];
            const p2 = pts[Math.min(pts.length - 1, i + 1)];
            const p3 = pts[Math.min(pts.length - 1, i + 2)];

            for (let t = 1; t <= 4; t++) {
                const s = t / 4;
                const s2 = s * s;
                const s3 = s2 * s;

                const x = 0.5 * (
                    (2 * p1.x) +
                    (-p0.x + p2.x) * s +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 +
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3
                );
                const y = 0.5 * (
                    (2 * p1.y) +
                    (-p0.y + p2.y) * s +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3
                );

                smooth.push({
                    t: p1.t + (p2.t - p1.t) * s,
                    x: Math.max(0, Math.min(1, x)),
                    y: Math.max(0, Math.min(1, y)),
                    click: false,
                    key: null,
                });
            }
        }

        for (const ev of pts) {
            if (ev.click) {
                const closest = smooth.reduce((best, sp) =>
                    Math.abs(sp.t - ev.t) < Math.abs(best.t - ev.t) ? sp : best
                );
                closest.click = true;
                closest.x = ev.x;
                closest.y = ev.y;
            }
        }

        return smooth;
    }

    serialize() {
        return JSON.stringify(this.events);
    }

    static deserialize(json) {
        const telemetry = new CursorTelemetry();
        telemetry.events = JSON.parse(json);
        return telemetry;
    }

    getPositionAt(timeMs) {
        if (this.events.length === 0) return null;
        if (timeMs <= this.events[0].t) return { x: this.events[0].x, y: this.events[0].y };
        if (timeMs >= this.events[this.events.length - 1].t) {
            const last = this.events[this.events.length - 1];
            return { x: last.x, y: last.y };
        }

        let lo = 0, hi = this.events.length - 1;
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (this.events[mid].t <= timeMs) lo = mid;
            else hi = mid;
        }

        const a = this.events[lo];
        const b = this.events[hi];
        const t = (timeMs - a.t) / (b.t - a.t || 1);
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
        };
    }

    hasClickAt(timeMs, tolerance = 50) {
        return this.events.some(e => e.click && Math.abs(e.t - timeMs) < tolerance);
    }

    getClicks() {
        return this.events.filter(e => e.click);
    }

    get duration() {
        if (this.events.length === 0) return 0;
        return this.events[this.events.length - 1].t - this.events[0].t;
    }

    get eventCount() {
        return this.events.length;
    }
}
