// Filter Pipeline — applies a chain of filters to a canvas frame
// Each filter is a function: (ctx, canvas, params) => void

export const applyFilters = (ctx, canvas, filters) => {
    if (!filters || filters.length === 0) return;

    filters.forEach(filter => {
        const filterFn = VIDEO_FILTERS[filter.type];
        if (filterFn) {
            ctx.save();
            filterFn(ctx, canvas, filter.params || {});
            ctx.restore();
        }
    });
};

// Build CSS filter string from params (for simple filters)
export const buildCSSFilter = (filters) => {
    const parts = [];
    filters.forEach(f => {
        switch (f.type) {
            case 'brightness': parts.push(`brightness(${f.params.value || 1})`); break;
            case 'contrast': parts.push(`contrast(${f.params.value || 1})`); break;
            case 'saturate': parts.push(`saturate(${f.params.value || 1})`); break;
            case 'hue-rotate': parts.push(`hue-rotate(${f.params.degrees || 0}deg)`); break;
            case 'blur': parts.push(`blur(${f.params.radius || 0}px)`); break;
            case 'grayscale': parts.push(`grayscale(${f.params.value || 1})`); break;
            case 'sepia': parts.push(`sepia(${f.params.value || 1})`); break;
            case 'invert': parts.push(`invert(${f.params.value || 1})`); break;
            case 'opacity': parts.push(`opacity(${f.params.value || 1})`); break;
        }
    });
    return parts.length > 0 ? parts.join(' ') : 'none';
};

// Video filter implementations
const VIDEO_FILTERS = {
    brightness: (ctx, canvas, params) => {
        ctx.filter = `brightness(${params.value ?? 1})`;
    },

    contrast: (ctx, canvas, params) => {
        ctx.filter = `contrast(${params.value ?? 1})`;
    },

    saturate: (ctx, canvas, params) => {
        ctx.filter = `saturate(${params.value ?? 1})`;
    },

    'hue-rotate': (ctx, canvas, params) => {
        ctx.filter = `hue-rotate(${params.degrees ?? 0}deg)`;
    },

    blur: (ctx, canvas, params) => {
        ctx.filter = `blur(${params.radius ?? 0}px)`;
    },

    grayscale: (ctx, canvas, params) => {
        ctx.filter = `grayscale(${params.value ?? 1})`;
    },

    sepia: (ctx, canvas, params) => {
        ctx.filter = `sepia(${params.value ?? 1})`;
    },

    invert: (ctx, canvas, params) => {
        ctx.filter = `invert(${params.value ?? 1})`;
    },

    opacity: (ctx, canvas, params) => {
        ctx.globalAlpha = params.value ?? 1;
    },

    vignette: (ctx, canvas, params) => {
        const strength = params.strength ?? 0.5;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const r = Math.max(cx, cy);
        const grad = ctx.createRadialGradient(cx, cy, r * (1 - strength), cx, cy, r);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(0,0,0,${strength})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    },

    mirror: (ctx, canvas) => {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    },

    flip: (ctx, canvas) => {
        ctx.translate(0, canvas.height);
        ctx.scale(1, -1);
    },

    rotate: (ctx, canvas, params) => {
        const angle = (params.degrees ?? 0) * Math.PI / 180;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angle);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
    },

    pixelate: (ctx, canvas, params) => {
        const size = params.size ?? 8;
        const w = canvas.width;
        const h = canvas.height;
        // Draw at small size then scale up
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.max(1, Math.floor(w / size));
        tempCanvas.height = Math.max(1, Math.floor(h / size));
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, w, h);
        ctx.imageSmoothingEnabled = true;
    },

    noise: (ctx, canvas, params) => {
        const strength = params.strength ?? 0.1;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const amount = strength * 255;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * amount;
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
        }
        ctx.putImageData(imageData, 0, 0);
    },

    border: (ctx, canvas, params) => {
        const width = params.width ?? 4;
        const color = params.color ?? '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.strokeRect(width / 2, width / 2, canvas.width - width, canvas.height - width);
    },

    'color-grade': (ctx, canvas, params) => {
        // 3-way color grading: shadows, mids, highlights
        const shadows = params.shadows ?? { r: 0, g: 0, b: 0 };
        const mids = params.mids ?? { r: 0, g: 0, b: 0 };
        const highlights = params.highlights ?? { r: 0, g: 0, b: 0 };

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
            let r = 0, g = 0, b = 0;
            if (lum < 0.33) {
                const t = lum / 0.33;
                r = shadows.r * (1 - t);
                g = shadows.g * (1 - t);
                b = shadows.b * (1 - t);
            } else if (lum < 0.66) {
                const t = (lum - 0.33) / 0.33;
                r = mids.r * (1 - Math.abs(t - 0.5) * 2);
                g = mids.g * (1 - Math.abs(t - 0.5) * 2);
                b = mids.b * (1 - Math.abs(t - 0.5) * 2);
            } else {
                const t = (lum - 0.66) / 0.34;
                r = highlights.r * t;
                g = highlights.g * t;
                b = highlights.b * t;
            }
            data[i] = Math.min(255, Math.max(0, data[i] + r));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + g));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + b));
        }
        ctx.putImageData(imageData, 0, 0);
    },

    'white-balance': (ctx, canvas, params) => {
        const temperature = params.temperature ?? 0; // -100 to 100
        const tint = params.tint ?? 0; // -100 to 100
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const tempFactor = temperature / 100;
        const tintFactor = tint / 100;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, data[i] + tempFactor * 30)); // Red
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + tintFactor * 15)); // Green
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] - tempFactor * 30)); // Blue
        }
        ctx.putImageData(imageData, 0, 0);
    },

    sharpen: (ctx, canvas) => {
        const w = canvas.width;
        const h = canvas.height;
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const copy = new Uint8ClampedArray(data);
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y + ky) * w + (x + kx)) * 4 + c;
                            sum += copy[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                        }
                    }
                    data[(y * w + x) * 4 + c] = Math.min(255, Math.max(0, sum));
                }
            }
        }
        ctx.putImageData(imageData, 0, 0);
    },
};

// Metadata for filter UI
export const FILTER_CATALOG = [
    { type: 'brightness', name: 'Brightness', icon: 'B', category: 'color', params: { value: { min: 0, max: 3, default: 1, step: 0.05, label: 'Value' } } },
    { type: 'contrast', name: 'Contrast', icon: 'C', category: 'color', params: { value: { min: 0, max: 3, default: 1, step: 0.05, label: 'Value' } } },
    { type: 'saturate', name: 'Saturation', icon: 'S', category: 'color', params: { value: { min: 0, max: 3, default: 1, step: 0.05, label: 'Value' } } },
    { type: 'hue-rotate', name: 'Hue Rotate', icon: 'H', category: 'color', params: { degrees: { min: 0, max: 360, default: 0, step: 1, label: 'Degrees' } } },
    { type: 'blur', name: 'Blur', icon: 'B', category: 'effect', params: { radius: { min: 0, max: 50, default: 5, step: 1, label: 'Radius' } } },
    { type: 'grayscale', name: 'Grayscale', icon: 'G', category: 'effect', params: { value: { min: 0, max: 1, default: 1, step: 0.1, label: 'Amount' } } },
    { type: 'sepia', name: 'Sepia', icon: 'S', category: 'effect', params: { value: { min: 0, max: 1, default: 1, step: 0.1, label: 'Amount' } } },
    { type: 'invert', name: 'Invert', icon: 'I', category: 'effect', params: { value: { min: 0, max: 1, default: 1, step: 0.1, label: 'Amount' } } },
    { type: 'opacity', name: 'Opacity', icon: 'O', category: 'color', params: { value: { min: 0, max: 1, default: 1, step: 0.05, label: 'Value' } } },
    { type: 'vignette', name: 'Vignette', icon: 'V', category: 'effect', params: { strength: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Strength' } } },
    { type: 'mirror', name: 'Mirror', icon: 'M', category: 'transform', params: {} },
    { type: 'flip', name: 'Flip', icon: 'F', category: 'transform', params: {} },
    { type: 'rotate', name: 'Rotate', icon: 'R', category: 'transform', params: { degrees: { min: -180, max: 180, default: 0, step: 1, label: 'Degrees' } } },
    { type: 'pixelate', name: 'Pixelate', icon: 'P', category: 'effect', params: { size: { min: 2, max: 64, default: 8, step: 1, label: 'Block Size' } } },
    { type: 'noise', name: 'Noise', icon: 'N', category: 'effect', params: { strength: { min: 0, max: 1, default: 0.1, step: 0.05, label: 'Strength' } } },
    { type: 'sharpen', name: 'Sharpen', icon: 'S', category: 'effect', params: {} },
    { type: 'border', name: 'Border', icon: 'B', category: 'overlay', params: { width: { min: 1, max: 20, default: 4, step: 1, label: 'Width' }, color: { type: 'color', default: '#ffffff', label: 'Color' } } },
    { type: 'white-balance', name: 'White Balance', icon: 'WB', category: 'color', params: { temperature: { min: -100, max: 100, default: 0, step: 5, label: 'Temperature' }, tint: { min: -100, max: 100, default: 0, step: 5, label: 'Tint' } } },
    { type: 'color-grade', name: 'Color Grade', icon: 'CG', category: 'color', params: {} },
];
