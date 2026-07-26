// AudioEngine — Web Audio API based audio processing for recordings
// Phase 2.3: 10 additional effects (noise gate, de-esser, reverb, delay, chorus, etc.)

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

        // Phase 2.3: Additional audio effects
        if (filters.highpass) {
            const hp = offline.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = filters.highpass.frequency || 80;
            hp.Q.value = filters.highpass.q || 0.7;
            lastNode.connect(hp);
            lastNode = hp;
        }

        if (filters.lowpass) {
            const lp = offline.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = filters.lowpass.frequency || 12000;
            lp.Q.value = filters.lowpass.q || 0.7;
            lastNode.connect(lp);
            lastNode = lp;
        }

        if (filters.limiter) {
            const limiter = offline.createDynamicsCompressor();
            limiter.threshold.value = filters.limiter.threshold || -1;
            limiter.ratio.value = 20;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.01;
            lastNode.connect(limiter);
            lastNode = limiter;
        }

        if (filters.noiseGate) {
            // Simple noise gate using dynamics compressor
            const gate = offline.createDynamicsCompressor();
            gate.threshold.value = filters.noiseGate.threshold || -40;
            gate.ratio.value = 20;
            gate.attack.value = 0.003;
            gate.release.value = 0.1;
            lastNode.connect(gate);
            lastNode = gate;
        }

        if (filters.noiseReduction) {
            // Combined noise reduction: high-pass + low-pass + gate
            const strength = filters.noiseReduction.strength || 0.7;
            // High-pass to remove low-frequency rumble
            const hp = offline.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = 80 + strength * 120; // 80-200 Hz based on strength
            hp.Q.value = 0.7;
            lastNode.connect(hp);
            lastNode = hp;
            // Low-pass to remove high-frequency hiss
            const lp = offline.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 16000 - strength * 8000; // 16000-8000 Hz based on strength
            lp.Q.value = 0.7;
            lastNode.connect(lp);
            lastNode = lp;
            // Noise gate for silence
            const gate = offline.createDynamicsCompressor();
            gate.threshold.value = -40 + strength * 15; // -40 to -25 dB
            gate.ratio.value = 20;
            gate.attack.value = 0.003;
            gate.release.value = 0.1;
            lastNode.connect(gate);
            lastNode = gate;
        }

        if (filters.deEsser) {
            // Bandpass filter targeting sibilance (4-8kHz) + compressor
            const bandpass = offline.createBiquadFilter();
            bandpass.type = 'bandpass';
            bandpass.frequency.value = filters.deEsser.frequency || 6000;
            bandpass.Q.value = 2;
            const comp = offline.createDynamicsCompressor();
            comp.threshold.value = filters.deEsser.threshold || -20;
            comp.ratio.value = 8;
            comp.attack.value = 0.002;
            comp.release.value = 0.05;
            lastNode.connect(bandpass);
            bandpass.connect(comp);
            // Mix compressed sibilance back with original
            const dryGain = offline.createGain();
            const wetGain = offline.createGain();
            const mix = offline.createGain();
            dryGain.gain.value = 1;
            wetGain.gain.value = -(filters.deEsser.amount || 0.5);
            lastNode.connect(dryGain);
            comp.connect(wetGain);
            dryGain.connect(mix);
            wetGain.connect(mix);
            lastNode = mix;
        }

        if (filters.delay) {
            const delayTime = filters.delay.time || 0.3;
            const feedback = filters.delay.feedback || 0.3;
            const mix = filters.delay.mix || 0.3;
            const delayNode = offline.createDelay(2);
            delayNode.delayTime.value = delayTime;
            const feedbackGain = offline.createGain();
            feedbackGain.gain.value = Math.min(feedback, 0.9);
            const wetGain = offline.createGain();
            wetGain.gain.value = mix;
            const dryGain = offline.createGain();
            dryGain.gain.value = 1 - mix;
            const output = offline.createGain();
            lastNode.connect(delayNode);
            delayNode.connect(feedbackGain);
            feedbackGain.connect(delayNode);
            delayNode.connect(wetGain);
            wetGain.connect(output);
            lastNode.connect(dryGain);
            dryGain.connect(output);
            lastNode = output;
        }

        if (filters.reverb) {
            // Convolution reverb with generated impulse response
            const reverbTime = filters.reverb.time || 1.5;
            const mix = filters.reverb.mix || 0.3;
            const sampleRate = offline.sampleRate;
            const length = sampleRate * reverbTime;
            const impulse = offline.createBuffer(2, length, sampleRate);
            for (let ch = 0; ch < 2; ch++) {
                const channelData = impulse.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
                }
            }
            const convolver = offline.createConvolver();
            convolver.buffer = impulse;
            const wetGain = offline.createGain();
            wetGain.gain.value = mix;
            const dryGain = offline.createGain();
            dryGain.gain.value = 1 - mix;
            const output = offline.createGain();
            lastNode.connect(convolver);
            convolver.connect(wetGain);
            wetGain.connect(output);
            lastNode.connect(dryGain);
            dryGain.connect(output);
            lastNode = output;
        }

        if (filters.chorus) {
            const rate = filters.chorus.rate || 1.5;
            const depth = filters.chorus.depth || 0.002;
            const mix = filters.chorus.mix || 0.5;
            const delayNode = offline.createDelay(1);
            delayNode.delayTime.value = 0.025;
            const lfo = offline.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = rate;
            const lfoGain = offline.createGain();
            lfoGain.gain.value = depth;
            lfo.connect(lfoGain);
            lfoGain.connect(delayNode.delayTime);
            lfo.start(0);
            const wetGain = offline.createGain();
            wetGain.gain.value = mix;
            const dryGain = offline.createGain();
            dryGain.gain.value = 1 - mix;
            const output = offline.createGain();
            lastNode.connect(delayNode);
            delayNode.connect(wetGain);
            wetGain.connect(output);
            lastNode.connect(dryGain);
            dryGain.connect(output);
            lastNode = output;
        }

        if (filters.stereoWidener) {
            // M/S stereo widening
            const width = filters.stereoWidener.width || 1.5;
            if (audioBuffer.numberOfChannels >= 2) {
                const splitter = offline.createChannelSplitter(2);
                const merger = offline.createChannelMerger(2);
                const midGain = offline.createGain();
                const sideGain = offline.createGain();
                midGain.gain.value = 1;
                sideGain.gain.value = width;
                lastNode.connect(splitter);
                // Mid = L+R, Side = L-R
                const midNode = offline.createGain();
                const sideNode = offline.createGain();
                splitter.connect(midNode, 0);
                splitter.connect(midNode, 1);
                splitter.connect(sideNode, 0);
                splitter.connect(sideNode, 1, 1); // inverted
                midNode.connect(midGain);
                sideNode.connect(sideGain);
                midGain.connect(merger, 0, 0);
                midGain.connect(merger, 0, 1);
                sideGain.connect(merger, 0, 0);
                // sideGain inverted to R
                const sideInv = offline.createGain();
                sideInv.gain.value = -1;
                sideGain.connect(sideInv);
                sideInv.connect(merger, 0, 1);
                lastNode = merger;
            }
        }

        lastNode.connect(offline.destination);
        source.start();

        const rendered = await offline.startRendering();
        return this.bufferToBlob(rendered, blob.type);
    }

    bufferToBlob(audioBuffer, _mimeType) {
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

    // Generate waveform data for visualization
    async getWaveformData(blob, numSamples = 200) {
        const ctx = await this.init();
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const samples = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(samples.length / numSamples);
        const waveform = [];
        for (let i = 0; i < numSamples; i++) {
            let sum = 0;
            const start = i * blockSize;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(samples[start + j]);
            }
            waveform.push(sum / blockSize);
        }
        return waveform;
    }

    // Get audio effect definitions for UI
    static getEffectDefinitions() {
        return [
            {
                id: 'highpass', name: 'High-Pass Filter', category: 'EQ',
                params: { frequency: { min: 20, max: 2000, default: 80, step: 10, label: 'Freq (Hz)' }, q: { min: 0.1, max: 10, default: 0.7, step: 0.1, label: 'Q' } }
            },
            {
                id: 'lowpass', name: 'Low-Pass Filter', category: 'EQ',
                params: { frequency: { min: 1000, max: 20000, default: 12000, step: 100, label: 'Freq (Hz)' }, q: { min: 0.1, max: 10, default: 0.7, step: 0.1, label: 'Q' } }
            },
            {
                id: 'limiter', name: 'Limiter', category: 'Dynamics',
                params: { threshold: { min: -60, max: 0, default: -1, step: 1, label: 'Threshold (dB)' } }
            },
            {
                id: 'noiseReduction', name: 'Noise Reduction', category: 'Dynamics',
                params: { strength: { min: 0, max: 1, default: 0.7, step: 0.05, label: 'Strength' } }
            },
            {
                id: 'noiseGate', name: 'Noise Gate', category: 'Dynamics',
                params: { threshold: { min: -80, max: -10, default: -40, step: 1, label: 'Threshold (dB)' } }
            },
            {
                id: 'deEsser', name: 'De-Esser', category: 'Dynamics',
                params: { frequency: { min: 2000, max: 10000, default: 6000, step: 100, label: 'Freq (Hz)' }, threshold: { min: -40, max: 0, default: -20, step: 1, label: 'Threshold (dB)' }, amount: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Amount' } }
            },
            {
                id: 'delay', name: 'Delay / Echo', category: 'Time',
                params: { time: { min: 0.01, max: 2, default: 0.3, step: 0.01, label: 'Time (s)' }, feedback: { min: 0, max: 0.9, default: 0.3, step: 0.05, label: 'Feedback' }, mix: { min: 0, max: 1, default: 0.3, step: 0.05, label: 'Mix' } }
            },
            {
                id: 'reverb', name: 'Reverb', category: 'Time',
                params: { time: { min: 0.1, max: 5, default: 1.5, step: 0.1, label: 'Time (s)' }, mix: { min: 0, max: 1, default: 0.3, step: 0.05, label: 'Mix' } }
            },
            {
                id: 'chorus', name: 'Chorus', category: 'Modulation',
                params: { rate: { min: 0.1, max: 5, default: 1.5, step: 0.1, label: 'Rate (Hz)' }, depth: { min: 0.0001, max: 0.01, default: 0.002, step: 0.0001, label: 'Depth' }, mix: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Mix' } }
            },
            {
                id: 'stereoWidener', name: 'Stereo Widener', category: 'Stereo',
                params: { width: { min: 0, max: 3, default: 1.5, step: 0.1, label: 'Width' } }
            },
        ];
    }
}

export const audioEngine = new AudioEngine();
