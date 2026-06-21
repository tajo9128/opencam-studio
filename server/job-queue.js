const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { jsonToMlt } = require('./mlt-xml');

class JobQueue {
    constructor() {
        this.jobs = new Map();
        this.queue = [];
        this.active = null;
    }

    createJob(projectId, params, project, clips) {
        const jobId = require('crypto').randomBytes(8).toString('hex');
        const job = {
            id: jobId,
            projectId,
            status: 'queued',
            progress: 0,
            params,
            createdAt: Date.now(),
            outputPath: null,
            error: null,
        };
        this.jobs.set(jobId, job);
        this.queue.push({ jobId, projectId, project, clips });
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
        if (!job || job.status === 'done') return false;
        job.status = 'cancelled';
        if (this.active && this.active.jobId === jobId) {
            this.active.proc.kill('SIGTERM');
        }
        this.queue = this.queue.filter(q => q.jobId !== jobId);
        return true;
    }

    processNext() {
        if (this.active || this.queue.length === 0) return;

        const next = this.queue.shift();
        const job = this.jobs.get(next.jobId);
        if (!job) { this.processNext(); return; }

        this.active = next;
        job.status = 'rendering';

        const mltXml = jsonToMlt(next.project, next.clips);
        const mltPath = path.join(next.projectDir || '/projects', next.projectId, `render-${job.id}.mlt`);
        const ext = job.params.format === 'webm' ? 'webm' : 'mp4';
        const outPath = path.join(next.outputDir || '/output', `${next.projectId}-${job.id}.${ext}`);

        fs.writeFileSync(mltPath, mltXml);

        const meltArgs = [
            mltPath,
            '-consumer', `avformat:${outPath}`,
            `crf=${job.params.crf || 23}`,
            `preset=${job.params.preset || 'medium'}`,
            `width=${job.params.width || next.project.width || 1920}`,
            `height=${job.params.height || next.project.height || 1080}`,
        ];

        if (job.params.format === 'webm') {
            meltArgs.push('mlt_service=avformat', 'vcodec=libvpx', 'acodec=libvorbis');
        } else {
            meltArgs.push('mlt_service=avformat', 'vcodec=libx264', 'acodec=aac');
        }

        const proc = spawn('melt', meltArgs, {
            env: { ...process.env, MLT_REPOSITORY: '/usr/local/lib/mlt-7' },
        });
        this.active.proc = proc;

        let stderr = '';
        let lastFrame = 0;

        proc.stderr.on('data', d => {
            stderr += d.toString();
            const match = d.toString().match(/Current frame:\s*(\d+)/);
            if (match) lastFrame = parseInt(match[1], 10);
        });

        proc.on('close', code => {
            this.active = null;
            if (code === 0) {
                job.status = 'done';
                job.progress = 100;
                job.outputPath = outPath;
            } else {
                job.status = 'error';
                job.error = stderr.slice(-500);
            }
            this.processNext();
        });

        proc.on('error', err => {
            this.active = null;
            job.status = 'error';
            job.error = err.message;
            this.processNext();
        });

        job._progressInterval = setInterval(() => {
            if (job.status === 'rendering') {
                if (!job._totalFrames) {
                    const totalSec = next.project.timeline?.tracks?.[0]?.clips?.reduce((sum, c) => {
                        return sum + (c.sourceEnd || 0) - (c.sourceStart || 0);
                    }, 0) || 30;
                    const fps = next.project.fps || 30;
                    job._totalFrames = totalSec * fps;
                }
                job.progress = Math.min(99, Math.round((lastFrame / job._totalFrames) * 100));
            }
        }, 1000);

        proc.on('close', () => {
            clearInterval(job._progressInterval);
        });
    }
}

module.exports = { JobQueue };
