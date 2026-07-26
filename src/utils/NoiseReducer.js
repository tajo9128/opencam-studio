/**
 * NoiseReducer — FFT-based spectral noise reduction for audio blobs.
 *
 * Usage:
 *   const reducer = new NoiseReducer();
 *   const cleanedBlob = await reducer.reduce(audioBlob, { strength: 0.7, noiseDuration: 0.5 });
 *
 * How it works:
 *   1. Decodes the audio blob into an AudioBuffer
 *   2. Learns a noise profile from the first N seconds (assumed to be silence/noise)
 *   3. Applies spectral subtraction across the entire audio
 *   4. Returns a cleaned audio blob
 */
export class NoiseReducer {
    constructor() {
        this.fftSize = 2048;
        this.hopSize = 512;
    }

    /**
     * Reduce noise in an audio blob.
     * @param {Blob} audioBlob - Input audio blob
     * @param {Object} options
     * @param {number} options.strength - Reduction strength 0-1 (default 0.7)
     * @param {number} options.noiseDuration - Seconds of audio to use for noise profile (default 0.5)
     * @returns {Promise<Blob>} Cleaned audio blob (WAV format)
     */
    async reduce(audioBlob, { strength = 0.7, noiseDuration = 0.5 } = {}) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

            const sampleRate = audioBuffer.sampleRate;
            const channels = audioBuffer.numberOfChannels;
            const noiseSamples = Math.floor(noiseDuration * sampleRate);

            // Process each channel
            const outputChannels = [];
            for (let ch = 0; ch < channels; ch++) {
                const input = audioBuffer.getChannelData(ch);
                const noiseProfile = this.learnNoiseProfile(input, noiseSamples);
                const cleaned = this.spectralSubtract(input, noiseProfile, strength);
                outputChannels.push(cleaned);
            }

            // Create output AudioBuffer
            const outputBuffer = audioCtx.createBuffer(channels, outputChannels[0].length, sampleRate);
            for (let ch = 0; ch < channels; ch++) {
                outputBuffer.copyToChannel(outputChannels[ch], ch);
            }

            // Convert to WAV blob
            return this.audioBufferToBlob(outputBuffer);
        } finally {
            await audioCtx.close();
        }
    }

    /**
     * Learn noise profile from the first N samples.
     * @param {Float32Array} samples - Full audio samples
     * @param {number} noiseSamples - Number of samples to use for noise learning
     * @returns {Float32Array} Noise magnitude spectrum (half FFT size)
     */
    learnNoiseProfile(samples, noiseSamples) {
        const fftSize = this.fftSize;
        const halfSize = fftSize / 2 + 1;
        const window = this.createHannWindow(fftSize);
        const noiseSpectrum = new Float32Array(halfSize);
        let frameCount = 0;

        const end = Math.min(noiseSamples, samples.length);
        for (let pos = 0; pos + fftSize <= end; pos += this.hopSize) {
            // Window the frame
            const real = new Float32Array(fftSize);
            for (let i = 0; i < fftSize; i++) {
                real[i] = samples[pos + i] * window[i];
            }
            const imag = new Float32Array(fftSize);
            this.fft(real, imag);

            // Accumulate magnitude
            for (let i = 0; i < halfSize; i++) {
                noiseSpectrum[i] += Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
            }
            frameCount++;
        }

        // Average
        if (frameCount > 0) {
            for (let i = 0; i < halfSize; i++) {
                noiseSpectrum[i] /= frameCount;
            }
        }

        return noiseSpectrum;
    }

    /**
     * Apply spectral subtraction to remove noise.
     * @param {Float32Array} samples - Input audio samples
     * @param {Float32Array} noiseProfile - Learned noise magnitude spectrum
     * @param {number} strength - Reduction strength 0-1
     * @returns {Float32Array} Cleaned audio samples
     */
    spectralSubtract(samples, noiseProfile, strength) {
        const fftSize = this.fftSize;
        const halfSize = fftSize / 2 + 1;
        const window = this.createHannWindow(fftSize);
        const output = new Float32Array(samples.length);
        const overlap = new Float32Array(fftSize);

        const floor = 0.01;
        const overSubtract = 1.0;

        for (let pos = 0; pos + fftSize <= samples.length; pos += this.hopSize) {
            // Window
            const real = new Float32Array(fftSize);
            for (let i = 0; i < fftSize; i++) {
                real[i] = samples[pos + i] * window[i];
            }
            const imag = new Float32Array(fftSize);
            this.fft(real, imag);

            // Magnitude + phase
            const magnitude = new Float32Array(halfSize);
            const phase = new Float32Array(halfSize);
            for (let i = 0; i < halfSize; i++) {
                magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
                phase[i] = Math.atan2(imag[i], real[i]);
            }

            // Spectral subtraction
            for (let i = 0; i < halfSize; i++) {
                const noiseMag = noiseProfile[i] * overSubtract * strength;
                const subtracted = magnitude[i] - noiseMag;
                magnitude[i] = Math.max(subtracted, magnitude[i] * floor);
            }

            // Reconstruct
            for (let i = 0; i < halfSize; i++) {
                real[i] = magnitude[i] * Math.cos(phase[i]);
                imag[i] = magnitude[i] * Math.sin(phase[i]);
            }
            for (let i = 1; i < halfSize - 1; i++) {
                real[fftSize - i] = real[i];
                imag[fftSize - i] = -imag[i];
            }

            this.ifft(real, imag);

            // Overlap-add
            for (let i = 0; i < fftSize; i++) {
                if (pos + i < output.length) {
                    output[pos + i] += real[i] * window[i];
                }
            }
        }

        return output;
    }

    createHannWindow(size) {
        const window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
        }
        return window;
    }

    fft(real, imag) {
        const n = real.length;
        if (n <= 1) return;

        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            while (j & bit) { j ^= bit; bit >>= 1; }
            j ^= bit;
            if (i < j) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
        }

        for (let len = 2; len <= n; len <<= 1) {
            const halfLen = len >> 1;
            const angle = -2 * Math.PI / len;
            const wReal = Math.cos(angle);
            const wImag = Math.sin(angle);

            for (let i = 0; i < n; i += len) {
                let curReal = 1;
                let curImag = 0;
                for (let j = 0; j < halfLen; j++) {
                    const uReal = real[i + j];
                    const uImag = imag[i + j];
                    const vReal = real[i + j + halfLen] * curReal - imag[i + j + halfLen] * curImag;
                    const vImag = real[i + j + halfLen] * curImag + imag[i + j + halfLen] * curReal;
                    real[i + j] = uReal + vReal;
                    imag[i + j] = uImag + vImag;
                    real[i + j + halfLen] = uReal - vReal;
                    imag[i + j + halfLen] = uImag - vImag;
                    const newCurReal = curReal * wReal - curImag * wImag;
                    curImag = curReal * wImag + curImag * wReal;
                    curReal = newCurReal;
                }
            }
        }
    }

    ifft(real, imag) {
        const n = real.length;
        for (let i = 0; i < n; i++) imag[i] = -imag[i];
        this.fft(real, imag);
        for (let i = 0; i < n; i++) {
            real[i] /= n;
            imag[i] = -imag[i] / n;
        }
    }

    audioBufferToBlob(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length;
        const bytesPerSample = 2;
        const blockAlign = numChannels * bytesPerSample;
        const dataSize = length * blockAlign;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        const writeString = (offset, str) => {
            for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bytesPerSample * 8, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = audioBuffer.getChannelData(ch)[i];
                const clamped = Math.max(-1, Math.min(1, sample));
                view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
                offset += 2;
            }
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }
}
