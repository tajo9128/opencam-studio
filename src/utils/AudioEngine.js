// AudioEngine — Web Audio API based audio processing for recordings

export class AudioEngine {
    constructor() {
        this.context = null;
        this.nodes = {};
    }

    async init() {
        if (!this.context) {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.context;
    }

    async processBlob(blob, filters) {
        const ctx = await this.init();
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        // Create offline context for rendering
        const offline = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            audioBuffer.duration * audioBuffer.sampleRate,
            audioBuffer.sampleRate
        );

        const source = offline.createBufferSource();
        source.buffer = audioBuffer;

        let lastNode = source;

        // Apply filters
        if (filters.volume !== undefined && filters.volume !== 100) {
            const gain = offline.createGain();
            gain.gain.value = filters.volume / 100;
            lastNode.connect(gain);
            lastNode = gain;
        }

        if (filters.fadeIn > 0) {
            const gain = offline.createGain();
            gain.gain.setValueAtTime(0, 0);
            gain.gain.linearRampToValueAtTime(1, filters.fadeIn);
            lastNode.connect(gain);
            lastNode = gain;
        }

        if (filters.fadeOut > 0) {
            const gain = offline.createGain();
            const fadeStart = audioBuffer.duration - filters.fadeOut;
            gain.gain.setValueAtTime(1, Math.max(0, fadeStart));
            gain.gain.linearRampToValueAtTime(0, audioBuffer.duration);
            lastNode.connect(gain);
            lastNode = gain;
        }

        if (filters.eq) {
            if (filters.eq.low) {
                const low = offline.createBiquadFilter();
                low.type = 'lowshelf';
                low.frequency.value = 300;
                low.gain.value = filters.eq.low;
                lastNode.connect(low);
                lastNode = low;
            }
            if (filters.eq.mid) {
                const mid = offline.createBiquadFilter();
                mid.type = 'peaking';
                mid.frequency.value = 1000;
                mid.gain.value = filters.eq.mid;
                lastNode.connect(mid);
                lastNode = mid;
            }
            if (filters.eq.high) {
                const high = offline.createBiquadFilter();
                high.type = 'highshelf';
                high.frequency.value = 3000;
                high.gain.value = filters.eq.high;
                lastNode.connect(high);
                lastNode = high;
            }
        }

        if (filters.compressor) {
            const comp = offline.createDynamicsCompressor();
            comp.threshold.value = filters.compressor.threshold || -24;
            comp.ratio.value = filters.compressor.ratio || 4;
            lastNode.connect(comp);
            lastNode = comp;
        }

        lastNode.connect(offline.destination);
        source.start();

        const rendered = await offline.startRendering();
        return this.bufferToBlob(rendered, blob.type);
    }

    bufferToBlob(audioBuffer, mimeType) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length;

        // Use WAV encoding
        const buffer = new ArrayBuffer(44 + length * numChannels * 2);
        const view = new DataView(buffer);

        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * numChannels * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * 2, true);
        view.setUint16(32, numChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * numChannels * 2, true);

        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }

    // Analyze audio for waveforms, peak levels, etc.
    async analyze(blob) {
        const ctx = await this.init();
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        let peak = 0;
        let rms = 0;
        const samples = audioBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
            const abs = Math.abs(samples[i]);
            if (abs > peak) peak = abs;
            rms += abs * abs;
        }
        rms = Math.sqrt(rms / samples.length);

        return {
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            channels: audioBuffer.numberOfChannels,
            peak,
            rms,
            peakDb: 20 * Math.log10(peak),
            rmsDb: 20 * Math.log10(rms)
        };
    }
}

export const audioEngine = new AudioEngine();
