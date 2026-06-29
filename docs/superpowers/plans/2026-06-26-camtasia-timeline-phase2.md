# Phase 2: Inline Visual Keyframing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add clickable keyframe diamonds on timeline clips with visual interpolation lines and audio volume rubber band envelopes.

**Architecture:** Canvas overlay per clip for keyframe diamonds + interpolation lines. SVG rubber band for audio volume envelopes. All state managed through existing Zustand store (addKeyframe/removeKeyframe already implemented).

**Tech Stack:** React 19, HTML5 Canvas, Zustand

## Global Constraints
- Browser-based React SPA, no server changes
- Must preserve all Phase 1 features (keyboard shortcuts, magnetic timeline, J/L cuts, markers)
- No new npm dependencies
- Follow existing code conventions

## File Structure

| File | Responsibility |
|------|---------------|
| `src/components/Timeline/KeyframeCanvas.jsx` | Canvas overlay on clips showing diamonds + interpolation lines |
| `src/components/Timeline/KeyframeCanvas.css` | Keyframe canvas styles |
| `src/components/Timeline/AudioEnvelope.jsx` | Rubber band volume envelope on audio clips |
| `src/components/Timeline/AudioEnvelope.css` | Audio envelope styles |
| `src/components/Timeline/Timeline.jsx` | Updated to render KeyframeCanvas + AudioEnvelope |
| `src/components/Timeline/KeyframeEditor.jsx` | Updated for inline editing |

---

### Task 1: KeyframeCanvas Component

**Files:**
- Create: `src/components/Timeline/KeyframeCanvas.jsx`
- Create: `src/components/Timeline/KeyframeCanvas.css`

- [ ] **Step 1: Create KeyframeCanvas.jsx**

Canvas overlay that renders keyframe diamonds and interpolation lines for a single clip.

```jsx
import React, { useRef, useEffect, useCallback } from 'react';
import './KeyframeCanvas.css';

const DIAMOND_SIZE = 8;
const CANVAS_HEIGHT = 24;

export const KeyframeCanvas = ({
    clip,
    zoom,
    onAddKeyframe,
    onRemoveKeyframe,
    onSelectKeyframe,
    selectedParam = null,
}) => {
    const canvasRef = useRef(null);
    const timeScale = 80 * zoom;

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const keyframes = clip.keyframes || {};
        const params = selectedParam ? { [selectedParam]: keyframes[selectedParam] || [] } : keyframes;

        for (const [param, kfs] of Object.entries(params)) {
            if (!kfs || kfs.length === 0) continue;

            // Draw interpolation lines
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(139, 92, 246, 0.6)';
            ctx.lineWidth = 1.5;

            for (let i = 0; i < kfs.length; i++) {
                const kf = kfs[i];
                const x = (kf.time / clip.duration) * w;
                const y = h / 2;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    // Draw curved line for easing
                    const prev = kfs[i - 1];
                    const prevX = (prev.time / clip.duration) * w;
                    const midX = (prevX + x) / 2;
                    ctx.quadraticCurveTo(midX, y - 4, x, y);
                }
            }
            ctx.stroke();

            // Draw diamonds
            for (const kf of kfs) {
                const x = (kf.time / clip.duration) * w;
                const y = h / 2;

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.PI / 4);
                ctx.fillStyle = '#8b5cf6';
                ctx.fillRect(-DIAMOND_SIZE / 2, -DIAMOND_SIZE / 2, DIAMOND_SIZE, DIAMOND_SIZE);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.strokeRect(-DIAMOND_SIZE / 2, -DIAMOND_SIZE / 2, DIAMOND_SIZE, DIAMOND_SIZE);
                ctx.restore();
            }
        }
    }, [clip, zoom, selectedParam]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = canvas.parentElement?.offsetWidth || 200;
        canvas.height = CANVAS_HEIGHT;
        draw();
    }, [draw]);

    const handleClick = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x / canvas.width) * clip.duration;

        // Check if clicking near existing keyframe (to select/remove)
        const keyframes = clip.keyframes || {};
        for (const [, kfs] of Object.entries(keyframes)) {
            for (const kf of kfs) {
                const kfX = (kf.time / clip.duration) * canvas.width;
                if (Math.abs(kfX - x) < DIAMOND_SIZE) {
                    // Double-click to remove
                    if (e.detail === 2) {
                        onRemoveKeyframe?.(clip.id, selectedParam || Object.keys(keyframes)[0], kf.time);
                    } else {
                        onSelectKeyframe?.(kf);
                    }
                    return;
                }
            }
        }

        // Click on empty space: add keyframe at this time
        if (selectedParam) {
            onAddKeyframe?.(clip.id, selectedParam, time, 1.0, 'linear');
        }
    }, [clip, selectedParam, onAddKeyframe, onRemoveKeyframe, onSelectKeyframe]);

    return (
        <canvas
            ref={canvasRef}
            className="tl-keyframe-canvas"
            onClick={handleClick}
            onDoubleClick={handleClick}
        />
    );
};
```

- [ ] **Step 2: Create KeyframeCanvas.css**

```css
.tl-keyframe-canvas {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 24px;
    pointer-events: auto;
    cursor: crosshair;
    z-index: 5;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Timeline/KeyframeCanvas.jsx src/components/Timeline/KeyframeCanvas.css
git commit -m "feat: add KeyframeCanvas with diamond rendering and click-to-add"
```

---

### Task 2: AudioEnvelope Component

**Files:**
- Create: `src/components/Timeline/AudioEnvelope.jsx`
- Create: `src/components/Timeline/AudioEnvelope.css`

- [ ] **Step 1: Create AudioEnvelope.jsx**

Rubber band line across audio clips for volume keyframing.

```jsx
import React, { useRef, useEffect, useCallback, useState } from 'react';
import './AudioEnvelope.css';

const ENVELOPE_HEIGHT = 32;

export const AudioEnvelope = ({
    clip,
    zoom,
    onAddVolumeKeyframe,
    onRemoveVolumeKeyframe,
    onMoveVolumeKeyframe,
}) => {
    const svgRef = useRef(null);
    const [dragging, setDragging] = useState(null);
    const timeScale = 80 * zoom;

    const volumeKeyframes = clip.keyframes?.volume || [];
    const clipWidth = clip.duration * timeScale;

    // Default envelope: line at 50% (volume = 1.0 maps to 50% height from top)
    const getY = (volume) => {
        // volume 0 = bottom (100%), volume 2 = top (0%)
        const normalized = 1 - (volume / 2);
        return normalized * ENVELOPE_HEIGHT;
    };

    const getTime = (x) => {
        return (x / clipWidth) * clip.duration;
    };

    const getX = (time) => {
        return (time / clip.duration) * clipWidth;
    };

    // Build path
    const buildPath = () => {
        if (volumeKeyframes.length === 0) {
            // Flat line at volume 1.0
            const y = getY(1.0);
            return `M 0 ${y} L ${clipWidth} ${y}`;
        }

        const sorted = [...volumeKeyframes].sort((a, b) => a.time - b.time);
        let d = '';

        // Line from start to first keyframe
        if (sorted[0].time > 0) {
            d += `M 0 ${getY(1.0)} `;
        }

        for (let i = 0; i < sorted.length; i++) {
            const x = getX(sorted[i].time);
            const y = getY(sorted[i].value);
            d += (i === 0 ? 'M ' : 'L ') + `${x} ${y} `;
        }

        // Line from last keyframe to end
        if (sorted[sorted.length - 1].time < clip.duration) {
            d += `L ${clipWidth} ${getY(sorted[sorted.length - 1].value)}`;
        }

        return d;
    };

    const handleDoubleClick = useCallback((e) => {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = getTime(x);
        const defaultVolume = 1.0;
        onAddVolumeKeyframe?.(clip.id, time, defaultVolume);
    }, [clip, onAddVolumeKeyframe]);

    const handlePointMouseDown = useCallback((e, kf) => {
        e.stopPropagation();
        setDragging({ time: kf.time, startY: e.clientY, startValue: kf.value });
    }, []);

    useEffect(() => {
        if (!dragging) return;
        const handleMouseMove = (e) => {
            const dy = dragging.startY - e.clientY;
            const newVolume = Math.max(0, Math.min(2, dragging.startValue + (dy / ENVELOPE_HEIGHT) * 2));
            onMoveVolumeKeyframe?.(clip.id, dragging.time, newVolume);
        };
        const handleMouseUp = () => setDragging(null);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, clip.id, onMoveVolumeKeyframe]);

    return (
        <svg
            ref={svgRef}
            className="tl-audio-envelope"
            width={clipWidth}
            height={ENVELOPE_HEIGHT}
            onDoubleClick={handleDoubleClick}
        >
            {/* Background fill */}
            <path
                d={`${buildPath()} L ${clipWidth} ${ENVELOPE_HEIGHT} L 0 ${ENVELOPE_HEIGHT} Z`}
                fill="rgba(139, 92, 246, 0.1)"
            />

            {/* Envelope line */}
            <path
                d={buildPath()}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2"
                strokeLinecap="round"
            />

            {/* Keyframe points */}
            {volumeKeyframes.map((kf, i) => (
                <circle
                    key={i}
                    cx={getX(kf.time)}
                    cy={getY(kf.value)}
                    r="4"
                    fill="#8b5cf6"
                    stroke="#fff"
                    strokeWidth="1.5"
                    className="tl-envelope-point"
                    onMouseDown={(e) => handlePointMouseDown(e, kf)}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        onRemoveVolumeKeyframe?.(clip.id, 'volume', kf.time);
                    }}
                />
            ))}
        </svg>
    );
};
```

- [ ] **Step 2: Create AudioEnvelope.css**

```css
.tl-audio-envelope {
    position: absolute;
    top: 4px;
    left: 0;
    pointer-events: auto;
    cursor: crosshair;
    z-index: 3;
}

.tl-envelope-point {
    cursor: grab;
    transition: r 0.1s;
}

.tl-envelope-point:hover {
    r: 6;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Timeline/AudioEnvelope.jsx src/components/Timeline/AudioEnvelope.css
git commit -m "feat: add AudioEnvelope rubber band for volume keyframing"
```

---

### Task 3: Integrate into Timeline.jsx

**Files:**
- Modify: `src/components/Timeline/Timeline.jsx`

- [ ] **Step 1: Read current Timeline.jsx**

Read the current `src/components/Timeline/Timeline.jsx` to understand current structure.

- [ ] **Step 2: Add imports**

Add at top of Timeline.jsx:

```js
import { KeyframeCanvas } from './KeyframeCanvas';
import { AudioEnvelope } from './AudioEnvelope';
import { useTimelineStore } from '../../store/timelineStore';
```

- [ ] **Step 3: Add state for selected param**

Inside the Timeline component, add:

```js
const [selectedKeyframeParam, setSelectedKeyframeParam] = useState(null);
```

- [ ] **Step 4: Render KeyframeCanvas on video clips**

In the `renderClip` function, after the existing clip content div and before the right handle, add:

```jsx
{clip.type !== 'audio' && clip.keyframes && Object.keys(clip.keyframes).length > 0 && (
    <KeyframeCanvas
        clip={clip}
        zoom={zoom}
        selectedParam={selectedKeyframeParam}
        onAddKeyframe={(clipId, param, time, value, interp) => {
            useTimelineStore.getState().addKeyframe(clipId, param, time, value, interp);
        }}
        onRemoveKeyframe={(clipId, param, time) => {
            useTimelineStore.getState().removeKeyframe(clipId, param, time);
        }}
        onSelectKeyframe={(kf) => {
            // Could open keyframe editor panel
        }}
    />
)}
```

- [ ] **Step 5: Render AudioEnvelope on audio clips**

In the `renderClip` function, for audio clips, add AudioEnvelope:

```jsx
{clip.type === 'audio' && (
    <AudioEnvelope
        clip={clip}
        zoom={zoom}
        onAddVolumeKeyframe={(clipId, time, value) => {
            useTimelineStore.getState().addKeyframe(clipId, 'volume', time, value, 'linear');
        }}
        onRemoveVolumeKeyframe={(clipId, param, time) => {
            useTimelineStore.getState().removeKeyframe(clipId, param, time);
        }}
        onMoveVolumeKeyframe={(clipId, time, value) => {
            // Update the keyframe value
            const store = useTimelineStore.getState();
            store.removeKeyframe(clipId, 'volume', time);
            store.addKeyframe(clipId, 'volume', time, value, 'linear');
        }}
    />
)}
```

- [ ] **Step 6: Verify and commit**

Run `npm run dev` to verify. Then:

```bash
git add src/components/Timeline/Timeline.jsx
git commit -m "feat: integrate KeyframeCanvas and AudioEnvelope into Timeline"
```

---

### Task 4: Update KeyframeEditor for Inline Editing

**Files:**
- Modify: `src/components/Timeline/KeyframeEditor.jsx`

- [ ] **Step 1: Read current KeyframeEditor.jsx**

Read the current file.

- [ ] **Step 2: Add visual parameter selector**

Add a row of buttons for common keyframe params (scale, position.x, position.y, opacity, volume) above the dropdown:

```jsx
<div className="kf-quick-params">
    {['scale', 'position.x', 'position.y', 'opacity', 'volume'].map(p => (
        <button
            key={p}
            className={`kf-quick-btn ${selectedParam === p ? 'active' : ''}`}
            onClick={() => setSelectedParam(p)}
        >
            {p}
        </button>
    ))}
</div>
```

- [ ] **Step 3: Add CSS for quick params**

```css
.kf-quick-params {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
    flex-wrap: wrap;
}

.kf-quick-btn {
    padding: 4px 8px;
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    background: var(--bg-tertiary, #2a2a3a);
    color: var(--text-secondary, #aaa);
    font-size: 11px;
    cursor: pointer;
}

.kf-quick-btn.active {
    background: var(--primary, #8b5cf6);
    color: #fff;
    border-color: var(--primary, #8b5cf6);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Timeline/KeyframeEditor.jsx
git commit -m "feat: add quick parameter buttons to KeyframeEditor"
```

---

### Task 5: Integration Test

- [ ] **Step 1: Start dev server and test**

Run: `npm run dev`

Test checklist:
1. Import a video clip with filters applied
2. Open keyframe editor, select "scale" param
3. Add keyframes at different times
4. See diamond markers appear on clip in timeline
5. See interpolation line between diamonds
6. Import an audio clip
7. Double-click on audio clip to add volume keyframe
8. See rubber band line appear
9. Drag volume keyframe up/down
10. Double-click keyframe to remove it

- [ ] **Step 2: Run lint**

Run: `npm run lint`

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: integration fixes for Phase 2 keyframing"
```
