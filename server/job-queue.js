const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { jsonToMlt } = require('./mlt-xml');

const JOBS_RETENTION_MS = 24 * 60 * 60 * 1000; // prune done/error records after 24h
const SIGKILL_GRACE_MS = 5000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

class JobQueue {
    constructor(opts = {}) {
        this.projectsDir = opts.projectsDir || process.env.PROJECTS_DIR || '/projects';
        this.outputDir = opts.outputDir || process.env.OUTPUT_DIR || '/output';
        this.videosDir = opts.videosDir || process.env.VIDEOS_DIR || '/videos';
        this.jobsFile = opts.jobsFile || path.join(this.outputDir, 'jobs.json');
        this.loadProject = opts.loadProject || (() => null);
        this.timeoutMs = opts.timeoutMs
            || parseInt(process.env.RENDER_TIMEOUT_MS, 10)
            || DEFAULT_TIMEOUT_MS;

        this.jobs = new Map();      // jobId -> job record (persisted)
        this.queue = [];            // [{ jobId }] (persisted)
        this.active = null;         // { jobId, proc, timer }
        this._shuttingDown = false;

        for (const dir of [this.projectsDir, this.outputDir]) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this._load();
        setInterval(() => this._prune(), 60 * 60 * 1000).unref();
        setImmediate(() => this.processNext());
    }

    // ---------- persistence ----------

    _save() {
        try {
            const data = {
                jobs: Array.from(this.jobs.values()).map(j => ({
                    id: j.id, projectId: j.projectId, status: j.status,
                    progress: j.progress, params: j.params,
                    createdAt: j.createdAt, outputPath: j.outputPath, error: j.error,
                })),
                queue: this.queue.map(q => ({ jobId: q.jobId })),
            };
            fs.writeFileSync(this.jobsFile, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('[job-queue] persist failed:', err.message);
        }
    }

    _load() {
        if (!fs.existsSync(this.jobsFile)) return;
        try {
            const data = JSON.parse(fs.readFileSync(this.jobsFile, 'utf8'));
            for (const j of data.jobs || []) {
                // Anything that was mid-render when we died is now an interrupted error.
                if (j.status === 'rendering') {
                    j.status = 'error';
                    j.error = 'Render interrupted by server restart';
                }
                this.jobs.set(j.id, j);
            }
            this.queue = (data.queue || [])
                .filter(q => { const j = this.jobs.get(q.jobId); return j && j.status === 'queued'; });
            console.log(`[job-queue] restored ${this.jobs.size} job(s), ${this.queue.length} queued`);
        } catch (err) {
            console.error('[job-queue] load failed:', err.message);
        }
    }

    _prune() {
        const cutoff = Date.now() - JOBS_RETENTION_MS;
        let changed = false;
        for (const [id, j] of this.jobs) {
            if ((j.status === 'done' || j.status === 'error' || j.status === 'cancelled')
                && j.createdAt < cutoff) {
                this.jobs.delete(id);
                changed = true;
            }
        }
        if (changed) this._save();
    }

    // ---------- public API ----------

    createJob(projectId, params) {
        const jobId = crypto.randomBytes(8).toString('hex');
        const job = {
            id: jobId,
            projectId,
            status: 'queued',
            progress: 0,
            params: params || {},
            createdAt: Date.now(),
            outputPath: null,
            error: null,
        };
        this.jobs.set(jobId, job);
        this.queue.push({ jobId });
        this._save();
        this.processNext();
        return job;
    }

    getJob(jobId) {
        return this.jobs.get(jobId) || null;
    }

    getProjectJobs(projectId) {
        return Array.from(this.jobs.values()).filter(j => j.projectId === projectId);
    }

    cancelJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job || job.status === 'done' || job.status === 'cancelled') return false;
        job.cancelRequested = true;
        job.status = 'cancelled';
        this.queue = this.queue.filter(q => q.jobId !== jobId);

        if (this.active && this.active.jobId === jobId && this.active.proc) {
            try { this.active.proc.kill('SIGTERM'); } catch { /* already dead */ }
            const proc = this.active.proc;
            setTimeout(() => {
                try { if (proc.exitCode === null) proc.kill('SIGKILL'); } catch { /* already dead */ }
            }, SIGKILL_GRACE_MS).unref();
        }
        this._save();
        return true;
    }

    // ---------- processing ----------

    processNext() {
        if (this.active || this._shuttingDown || this.queue.length === 0) return;

        const next = this.queue.shift();
        const job = this.jobs.get(next.jobId);
        if (!job || job.status !== 'queued') {
            this._save();
            this.processNext();
            return;
        }

        const data = this.loadProject(job.projectId);
        if (!data || !data.project.timeline?.tracks?.some(t => (t.clips || []).length > 0)) {
            job.status = 'error';
            job.error = 'Project has no renderable timeline';
            this._save();
            this.processNext();
            return;
        }

        this.active = { jobId: job.id, proc: null, timer: null };
        job.status = 'rendering';

        // Resolve real media file paths on disk (extension varies per upload).
        const videos = this._listVideos();
        const resolveResource = (clipId) => {
            const base = String(clipId).split('/')[0].replace(/\.[a-z0-9]+$/i, '');
            const match = videos.find(f => f.startsWith(base + '.'));
            return match ? `${this.videosDir}/${match}` : null;
        };

        const mltPath = path.join(this.projectsDir, job.projectId, `render-${job.id}.mlt`);
        fs.mkdirSync(path.dirname(mltPath), { recursive: true });

        const warnings = [];
        const mltXml = jsonToMlt(data.project, { resolveResource, onSkip: ids => warnings.push(...ids) });
        if (warnings.length > 0) {
            console.warn(`[job-queue] skipped unresolvable clips: ${warnings.join(', ')}`);
        }

        const ext = job.params.format === 'webm' ? 'webm' : 'mp4';
        const outPath = path.join(this.outputDir, `${job.projectId}-${job.id}.${ext}`);
        fs.writeFileSync(mltPath, mltXml);

        // Project fps must be forced on the consumer too - melt does not reliably
        // honor an XML-embedded <profile> for the avformat frame rate.
        const fps = data.project.fps || 30;

        const meltArgs = [
            mltPath,
            '-consumer', `avformat:${outPath}`,
            `crf=${job.params.crf || 23}`,
            `preset=${job.params.preset || 'medium'}`,
            `width=${job.params.width || data.project.width || 1920}`,
            `height=${job.params.height || data.project.height || 1080}`,
            `r=${job.params.fps || fps}`,
        ];
        if (job.params.format === 'webm') {
            meltArgs.push('mlt_service=avformat', 'vcodec=libvpx', 'acodec=libvorbis');
        } else {
            meltArgs.push('mlt_service=avformat', 'vcodec=libx264', 'acodec=aac');
        }

        const env = { ...process.env };
        if (fs.existsSync('/usr/local/lib/mlt-7')) env.MLT_REPOSITORY = '/usr/local/lib/mlt-7';

        let proc;
        try {
            proc = spawn('melt', meltArgs, { env });
        } catch (err) {
            this._finish(job, 'error', err.message, outPath);
            this.processNext();
            return;
        }

        this.active.proc = proc;

        let stderr = '';
        let lastFrame = 0;
        let timedOut = false;

        // Hard timeout so one hung melt can never block the whole queue.
        this.active.timer = setTimeout(() => {
            timedOut = true;
            job.cancelRequested = false; // treat as failure, not user-cancel
            try { proc.kill('SIGTERM'); } catch { /* */ }
            setTimeout(() => {
                try { if (proc.exitCode === null) proc.kill('SIGKILL'); } catch { /* */ }
            }, SIGKILL_GRACE_MS);
        }, this.timeoutMs);

        proc.stderr.on('data', d => {
            stderr += d.toString();
            if (stderr.length > 64 * 1024) stderr = stderr.slice(-32 * 1024);
            const match = d.toString().match(/Current [Ff]rame:\s*(\d+)/);
            if (match) lastFrame = parseInt(match[1], 10);
        });

        proc.on('close', code => {
            clearTimeout(this.active.timer);
            this.active = null;

            if (job.cancelRequested) {
                // User cancel wins regardless of exit code - melt may exit cleanly
                // while shutting down or race a natural completion.
                this._finish(job, 'cancelled', 'Cancelled by user', outPath);
            } else if (timedOut) {
                this._finish(job, 'error', `Render timed out after ${Math.round(this.timeoutMs / 60000)} min`, outPath);
            } else if (code === 0) {
                this._finish(job, 'done', null, outPath);
            } else {
                this._finish(job, 'error', stderr.slice(-500), outPath);
            }
            this.processNext();
        });

        proc.on('error', err => {
            clearTimeout(this.active.timer);
            this.active = null;
            this._finish(job, 'error', err.message, outPath);
            this.processNext();
        });

        // Progress: total length = furthest clip end across ALL tracks.
        const totalFrames = this._totalFrames(data.project);
        job._progressInterval = setInterval(() => {
            if (job.status === 'rendering' && totalFrames > 0) {
                job.progress = Math.min(99, Math.round((lastFrame / totalFrames) * 100));
            }
        }, 1000);
        if (typeof job._progressInterval.unref === 'function') job._progressInterval.unref();
    }

    _finish(job, status, error, outPath) {
        clearInterval(job._progressInterval);
        job.status = status;
        if (status === 'done') {
            job.progress = 100;
            job.outputPath = outPath;
        } else {
            job.error = error;
            // Remove partial output so clients can never download a broken file.
            try { if (fs.existsSync(outPath) && status !== 'done') fs.unlinkSync(outPath); } catch { /* */ }
        }
        delete job.cancelRequested;
        this._save();
    }

    _listVideos() {
        try { return fs.readdirSync(this.videosDir); } catch { return []; }
    }

    _totalFrames(project) {
        const fps = project.fps || 30;
        let maxEndSec = 0;
        for (const track of project.timeline?.tracks || []) {
            for (const c of track.clips || []) {
                const speed = Number(c.speed) > 0 ? Number(c.speed) : 1;
                const dur = ((Number(c.sourceEnd) || 0) - (Number(c.sourceStart) || 0)) / speed;
                maxEndSec = Math.max(maxEndSec, (Number(c.trackStart) || 0) + dur);
            }
        }
        return Math.round(maxEndSec * fps);
    }
}

module.exports = { JobQueue };
