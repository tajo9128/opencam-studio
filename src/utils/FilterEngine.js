// FilterEngine — canvas-based video filters applied during rendering
// Each filter is a function (ctx, canvas, params) => void

export const FILTERS = {
    brightness: {
        name: 'Brightness',
        icon: '☀',
        params: { value: { min: -100, max: 100, default: 0, step: 1 } },
        apply: (ctx, canvas, { value }) => {
            ctx.filter = `brightness(${1 + value / 100})`;
        }
    },
    contrast: {
        name: 'Contrast',
        icon: '◐',
        params: { value: { min: -100, max: 100, default: 0, step: 1 } },
        apply: (ctx, canvas, { value }) => {
            ctx.filter = `contrast(${1 + value / 100})`;
        }
    },
    saturation: {
        name: 'Saturation',
        icon: '🎨',
        params: { value: { min: -100, max: 100, default: 0, step: 1 } },
        apply: (ctx, canvas, { value }) => {
            ctx.filter = `saturate(${1 + value / 100})`;
        }
    },
    hue: {
        name: 'Hue Rotate',
        icon: '🔄',
        params: { degrees: { min: 0, max: 360, default: 0, step: 1 } },
        apply: (ctx, canvas, { degrees }) => {
            ctx.filter = `hue-rotate(${degrees}deg)`;
        }
    },
    blur: {
        name: 'Blur',
        icon: 'Blur',
        params: { radius: { min: 0, max: 20, default: 0, step: 0.5 } },
        apply: (ctx, canvas, { radius }) => {
            if (radius > 0) ctx.filter = `blur(${radius}px)`;
        }
    },
    grayscale: {
        name: 'Grayscale',
        icon: 'Gray',
        params: { enabled: { type: 'toggle', default: false } },
        apply: (ctx, canvas, { enabled }) => {
            if (enabled) ctx.filter = 'grayscale(1)';
        }
    },
    sepia: {
        name: 'Sepia',
        icon: 'Sepia',
        params: { enabled: { type: 'toggle', default: false } },
        apply: (ctx, canvas, { enabled }) => {
            if (enabled) ctx.filter = 'sepia(1)';
        }
    },
    invert: {
        name: 'Invert',
        icon: 'Invert',
        params: { enabled: { type: 'toggle', default: false } },
        apply: (ctx, canvas, { enabled }) => {
            if (enabled) ctx.filter = 'invert(1)';
        }
    },
    vignette: {
        name: 'Vignette',
        icon: 'Vig',
        params: { strength: { min: 0, max: 100, default: 0, step: 1 } },
        apply: (ctx, canvas, { strength }) => {
            if (strength <= 0) return;
            const gradient = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
                canvas.width / 2, canvas.height / 2, canvas.width * 0.7
            );
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, `rgba(0,0,0,${strength / 100})`);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    },
    mirror: {
        name: 'Mirror',
        icon: 'Mirror',
        params: { horizontal: { type: 'toggle', default: false }, vertical: { type: 'toggle', default: false } },
        apply: (ctx, canvas, { horizontal, vertical }) => {
            if (horizontal || vertical) {
                ctx.translate(horizontal ? canvas.width : 0, vertical ? canvas.height : 0);
                ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
            }
        }
    },
    opacity: {
        name: 'Opacity',
        icon: 'Op',
        params: { value: { min: 0, max: 100, default: 100, step: 1 } },
        apply: (ctx, canvas, { value }) => {
            ctx.globalAlpha = value / 100;
        }
    },
    pixelate: {
        name: 'Pixelate',
        icon: 'Pixel',
        params: { size: { min: 1, max: 50, default: 1, step: 1 } },
        apply: (ctx, canvas, { size }) => {
            if (size <= 1) return;
            const w = Math.max(1, Math.floor(canvas.width / size));
            const h = Math.max(1, Math.floor(canvas.height / size));
            const temp = document.createElement('canvas');
            temp.width = w; temp.height = h;
            const tctx = temp.getContext('2d');
            tctx.drawImage(canvas, 0, 0, w, h);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(temp, 0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = true;
        }
    },
    border: {
        name: 'Border',
        icon: 'Border',
        params: {
            width: { min: 0, max: 50, default: 0, step: 1 },
            color: { type: 'color', default: '#ffffff' }
        },
        apply: (ctx, canvas, { width, color }) => {
            if (width <= 0) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.strokeRect(width / 2, width / 2, canvas.width - width, canvas.height - width);
        }
    },
    temperature: {
        name: 'Temperature',
        icon: 'Temp',
        params: { value: { min: -100, max: 100, default: 0, step: 1 } },
        apply: (ctx, canvas, { value }) => {
            if (value === 0) return;
            ctx.fillStyle = value > 0
                ? `rgba(255, 160, 0, ${Math.abs(value) / 500})`
                : `rgba(0, 100, 255, ${Math.abs(value) / 500})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    },
    tint: {
        name: 'Tint',
        icon: 'Tint',
        params: { color: { type: 'color', default: '#000000' }, strength: { min: 0, max: 100, default: 0, step: 1 } },
        apply: (ctx, canvas, { color, strength }) => {
            if (strength <= 0) return;
            ctx.globalAlpha = strength / 200;
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
        }
    },
    noise: {
        name: 'Noise',
        icon: 'Noise',
        params: { amount: { min: 0, max: 100, default: 0, step: 1 } },
        apply: (ctx, canvas, { amount }) => {
            if (amount <= 0) return;
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const intensity = amount * 2.55;
            for (let i = 0; i < data.length; i += 4) {
                const noise = (Math.random() - 0.5) * intensity;
                data[i] += noise;
                data[i + 1] += noise;
                data[i + 2] += noise;
            }
            ctx.putImageData(imageData, 0, 0);
        }
    },
    crop: {
        name: 'Crop',
        icon: 'Crop',
        params: {
            x: { min: 0, max: 100, default: 0, step: 1 },
            y: { min: 0, max: 100, default: 0, step: 1 },
            width: { min: 0, max: 100, default: 100, step: 1 },
            height: { min: 0, max: 100, default: 100, step: 1 }
        },
        apply: (ctx, canvas, { x, y, width, height }) => {
            const sx = (x / 100) * canvas.width;
            const sy = (y / 100) * canvas.height;
            const sw = (width / 100) * canvas.width;
            const sh = (height / 100) * canvas.height;
            const imageData = ctx.getImageData(sx, sy, sw, sh);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.putImageData(imageData, 0, 0);
        }
    }
};

// Apply a pipeline of filters to the current canvas state
export function applyFilters(ctx, canvas, activeFilters) {
    if (!activeFilters || activeFilters.length === 0) return;

    activeFilters.forEach(({ filterId, params }) => {
        const filter = FILTERS[filterId];
        if (filter && filter.apply) {
            ctx.save();
            filter.apply(ctx, canvas, { ...getDefaultParams(filterId), ...params });
            ctx.restore();
        }
    });
}

export function getDefaultParams(filterId) {
    const filter = FILTERS[filterId];
    if (!filter) return {};
    const defaults = {};
    Object.entries(filter.params).forEach(([key, config]) => {
        defaults[key] = config.default;
    });
    return defaults;
}

export function getFilterList() {
    return Object.entries(FILTERS).map(([id, filter]) => ({
        id,
        name: filter.name,
        icon: filter.icon,
        params: filter.params
    }));
}
