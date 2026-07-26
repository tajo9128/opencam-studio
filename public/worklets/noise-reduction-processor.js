/**
 * AudioWorklet processor for real-time spectral noise reduction.
 * Uses FFT-based spectral subtraction with a learned noise profile.
 *
 * Message protocol (via port):
 *   { type: 'noiseProfile', profile: Float32Array } — set noise profile
 *   { type: 'strength', value: number } — set reduction strength (0-1)
 */
class NoiseReductionProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.fftSize = 2048;
        this.hopSize = 512;
        this.windowSize = this.fftSize;
        this.strength = 0.7;
        this.noiseProfile = null;
        this.inputBuffer = new Float32Array(this.fftSize);
        this.outputBuffer = new Float32Array(this.fftSize);
        this.inputWritePos = 0;
        this.outputReadPos = 0;
        this.window = this.createHannWindow(this.fftSize);
        this.overlapFactor = 2;

        this.port.onmessage = (e) => {
            if (e.data.type === 'noiseProfile') {
                this.noiseProfile = new Float32Array(e.data.profile);
            } else if (e.data.type === 'strength') {
                this.strength = Math.max(0, Math.min(1, e.data.value));
            }
        };
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

        // Bit-reversal permutation
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            while (j & bit) {
                j ^= bit;
                bit >>= 1;
            }
            j ^= bit;
            if (i < j) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
        }

        // Cooley-Tukey FFT
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
        for (let i = 0; i < n; i++) {
            imag[i] = -imag[i];
        }
        this.fft(real, imag);
        for (let i = 0; i < n; i++) {
            real[i] /= n;
            imag[i] = -imag[i] / n;
        }
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || !input[0] || !output || !output[0]) return true;

        const inputChannel = input[0];
        const outputChannel = output[0];
        const blockSize = inputChannel.length;

        // Accumulate input into buffer
        for (let i = 0; i < blockSize; i++) {
            this.inputBuffer[this.inputWritePos] = inputChannel[i];
            this.inputWritePos++;

            if (this.inputWritePos >= this.fftSize) {
                // Process FFT frame
                this.processFrame();

                // Shift input buffer by hop size
                const remaining = this.fftSize - this.hopSize;
                for (let j = 0; j < remaining; j++) {
                    this.inputBuffer[j] = this.inputBuffer[j + this.hopSize];
                }
                this.inputWritePos = remaining;
                this.outputReadPos = 0;
            }
        }

        // Output from buffer
        for (let i = 0; i < blockSize; i++) {
            outputChannel[i] = this.outputBuffer[this.outputReadPos] || 0;
            this.outputReadPos = Math.min(this.outputReadPos + 1, this.fftSize - 1);
        }

        return true;
    }

    processFrame() {
        const fftSize = this.fftSize;
        const halfSize = fftSize / 2 + 1;

        // Apply window
        const windowed = new Float32Array(fftSize);
        for (let i = 0; i < fftSize; i++) {
            windowed[i] = this.inputBuffer[i] * this.window[i];
        }

        // FFT
        const real = new Float32Array(windowed);
        const imag = new Float32Array(fftSize);
        this.fft(real, imag);

        // Compute magnitude spectrum
        const magnitude = new Float32Array(halfSize);
        const phase = new Float32Array(halfSize);
        for (let i = 0; i < halfSize; i++) {
            magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
            phase[i] = Math.atan2(imag[i], real[i]);
        }

        // Apply spectral subtraction if noise profile is set
        if (this.noiseProfile && this.noiseProfile.length >= halfSize) {
            const floor = 0.01; // Spectral floor to avoid complete silence
            const overSubtract = 1.0; // Over-subtraction factor

            for (let i = 0; i < halfSize; i++) {
                const noiseMag = this.noiseProfile[i] * overSubtract * this.strength;
                const subtracted = magnitude[i] - noiseMag;
                magnitude[i] = Math.max(subtracted, magnitude[i] * floor);
            }
        }

        // Reconstruct complex spectrum
        for (let i = 0; i < halfSize; i++) {
            real[i] = magnitude[i] * Math.cos(phase[i]);
            imag[i] = magnitude[i] * Math.sin(phase[i]);
        }
        // Mirror for negative frequencies
        for (let i = 1; i < halfSize - 1; i++) {
            real[fftSize - i] = real[i];
            imag[fftSize - i] = -imag[i];
        }

        // IFFT
        this.ifft(real, imag);

        // Overlap-add with window
        for (let i = 0; i < fftSize; i++) {
            this.outputBuffer[i] = (this.outputBuffer[i] || 0) + real[i] * this.window[i];
        }
    }
}

registerProcessor('noise-reduction-processor', NoiseReductionProcessor);
