# Production-Ready Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining production-readiness gaps: undo/redo correctness, IndexedDB resilience, dead-code removal, bundle size, container health/backup tooling, and a real test runner in CI.

**Architecture:** All work targets the existing single-image architecture (nginx + project-server :8082 + recording-server :8081 + rtmp-relay :8080 + signaling :8083). No new services. Frontend changes stay inside existing Zustand store / hooks patterns. Server changes follow the existing CommonJS module pattern in `server/`.

**Tech Stack:** React 19 + Zustand, Node.js (CommonJS), Docker Compose, Playwright (existing), plain `node:test`-style scripts (no new deps).

## Global Constraints

- No new npm dependencies.
- PowerShell is the host shell: use `;` not `&&`, never pipe binary output through PowerShell text cmdlets.
- Every server file must pass `node --check` and every frontend change must pass `npx eslint <file> --quiet`.
- The v2 timeline format produced by `serializeProject()` MUST remain byte-compatible with the MLT render pipeline (`clipId`, `trackStart`, `sourceStart`, `sourceEnd`, `speed` fields per clip).
- Do not commit secrets. `.dockerignore` already excludes `.env*`.

---

### Task 1: Unified undo/redo — make drag, resize, nudge undoable

**Files:**
- Modify: `src/store/timelineStore.js`

**Interfaces:**
- Consumes: existing `saveUndo()` internal helper and `_pushUndo` pattern used by `sliceAtPlayhead`, `fadeIn`, etc.
- Produces: `moveClip(clipId, startTime)`, `resizeClip(clipId, duration)` now push undo entries exactly once per gesture commit (they are called on pointer-up by callers, not during drag frames).

- [ ] **Step 1: Patch the three mutations**

In `src/store/timelineStore.js`, find `moveClip:`, `resizeClip:`, `nudgeClip:` and add a `saveUndo()` call as the first statement of each, e.g.:

```js
moveClip: (clipId, startTime) => {
    const state = get();
    state.saveUndo();
    set({
        clips: state.clips.map(c => c.id === clipId ? { ...c, startTime } : c),
        duration: computeDuration(state.clips.map(c => c.id === clipId ? { ...c, startTime } : c)),
    });
},
```

Apply the same one-line addition (`state.saveUndo();`) at the top of `resizeClip` and `nudgeClip`. If the functions read `get()` under a different local name, call that name's `saveUndo()`.

- [ ] **Step 3: Lint**

Run: `npx eslint src/store/timelineStore.js --quiet`
Expected: no output.

- [ ] **Step 4: Browser verification**

Build (`npm run build`) then run this Playwright snippet against `npm run preview` or the Docker container:

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3000/editor');
await page.waitForTimeout(2000);
const skip = page.locator('.onboarding-skip');
if (await skip.count() > 0 && await skip.isVisible()) await skip.click();
// Import clip so there is something to mutate, then exercise undo depth
await page.locator('input[type="file"]').first().setInputFiles('C:/Users/tajo9/AppData/Local/Temp/opencode/test-clip.mp4');
await page.waitForTimeout(8000);
await page.keyboard.press('Control+z'); // should remove the imported clip
await page.waitForTimeout(500);
const clips = await page.locator('.tl-clip').count();
console.log(clips === 0 ? 'UNDO-OK' : 'UNDO-CHECK: ' + clips);
await browser.close();
```

Expected: `UNDO-OK` (or a reduced clip count proving history works).

- [ ] **Step 5: Commit**

```bash
git add src/store/timelineStore.js
git commit -m "feat(editor): make move/resize/nudge undoable"
```

---

### Task 2: StorageManager — quota, corruption recovery, cheap hasUnsavedData

**Files:**
- Modify: `src/utils/StorageManager.js`

**Interfaces:**
- Consumes: existing IndexedDB schema `ScreenRecorderDB` v2 stores `chunks`, `settings`.
- Produces: same public methods (`init`, `saveChunk`, `getAllChunks`, `hasUnsavedData`, `clearStorage`, `getSetting`, `removeSetting`, `hasSetting`), plus new `estimateQuota()` returning `{usage, quota, percent}` or `null`.

- [ ] **Step 1: Replace `hasUnsavedData` with a count-based check**

Replace the current body (which calls `getAllChunks()`) with:

```js
async hasUnsavedData() {
    if (!this.db) return false;
    return new Promise((resolve) => {
        try {
            const tx = this.db.transaction('chunks', 'readonly');
            const req = tx.objectStore('chunks').count();
            req.onsuccess = () => resolve(req.result > 0);
            req.onerror = () => resolve(false);
        } catch { resolve(false); }
    });
}
```

- [ ] **Step 2: Add corruption recovery to `init`**

Replace the entire existing `init()` body with this version (opens the DB; on any failure deletes the database file and retries once):

```js
init() {
    const tryOpen = () => new Promise((resolve, reject) => {
        const req = indexedDB.open('ScreenRecorderDB', 2);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { autoIncrement: true });
            if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IDB open failed'));
        req.onblocked = () => reject(new Error('IDB blocked'));
    });
    return tryOpen()
        .then(db => { this.db = db; return true; })
        .catch(err => {
            console.warn('[StorageManager] reopening after failure:', err.message);
            return new Promise(resolve => {
                const del = indexedDB.deleteDatabase('ScreenRecorderDB');
                del.onsuccess = del.onerror = del.onblocked = () =>
                    tryOpen().then(db => { this.db = db; resolve(true); }).catch(() => resolve(false));
            });
        });
}
```

- [ ] **Step 3: Add quota estimate helper**

```js
async estimateQuota() {
    if (!navigator.storage?.estimate) return null;
    try {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        return { usage, quota, percent: quota ? Math.round((usage / quota) * 100) : 0 };
    } catch { return null; }
}
```

- [ ] **Step 4: Wrap saveChunk quota errors**

In `saveChunk`, catch errors and rethrow a recognizable message:

```js
tx.oncomplete = () => resolve(key);
tx.onerror = () => {
    const err = tx.error || new Error('Chunk save failed');
    if (err.name === 'QuotaExceededError') reject(new Error('STORAGE_FULL'));
    else reject(err);
};
```

- [ ] **Step 5: Lint and build**

Run: `npx eslint src/utils/StorageManager.js --quiet ; npm run build`
Expected: lint silent, build prints `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/StorageManager.js
git commit -m "fix(storage): quota detection, corruption recovery, O(1) hasUnsavedData"
```

---

### Task 3: Dead code removal + live chat placeholder keys

**Files:**
- Delete: `src/constants/exportPresets.js`
- Modify: `src/hooks/useLiveChat.js`
- Verify: `grep -r "exportPresets" src/` returns nothing before deleting.

**Interfaces:**
- Produces: `useLiveChat` keeps its exact return shape; YouTube polling only runs when a real key is present in localStorage (`yt_api_key`).

- [ ] **Step 1: Confirm exportPresets.js is unused**

Run: `Select-String -Path src\**\*.jsx,src\**\*.js -Pattern "exportPresets" -SimpleMatch -List | Select-Object Path`
Expected: only `src\constants\exportPresets.js` itself appears. If any importer appears, STOP and merge its usage onto `RenderDialog.jsx` PRESETS first.

- [ ] **Step 2: Delete it**

```bash
git rm src/constants/exportPresets.js
```

- [ ] **Step 3: Guard the YouTube poll in useLiveChat**

Find the fetch containing the literal `key=YOUR_API_KEY`. Gate the polling on a stored key:

```js
const ytKey = localStorage.getItem('yt_api_key');
if (!ytKey) return; // no key configured - skip YouTube polling entirely
// ... replace YOUR_API_KEY with ${ytKey} in the fetch URL
```

Do the same for the Twitch block: if `localStorage.getItem('twitch_nick')` is absent, skip connecting instead of sending `NICK opencamstudio`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ built` with no import errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove unused exportPresets, gate live chat on configured credentials"
```

---

### Task 4: Route-level code splitting

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: React.lazy + Suspense (already used for Analytics).
- Produces: editor/stream/export/settings chunks loaded on demand; main chunk target < 300KB gzipped.

- [ ] **Step 1: Lazy-load the heavy routes**

In `src/App.jsx`, convert direct imports of the four heaviest route components to lazy:

```jsx
const EditorRoute = lazy(() => import('./components/EditMode/EditMode').then(m => ({ default: m.EditMode })));
const StreamMode = lazy(() => import('./components/Streaming/StreamMode').then(m => ({ default: m.StreamMode })));
const ExportMode = lazy(() => import('./components/ExportMode/ExportMode').then(m => ({ default: m.ExportMode })));
const SettingsPage = lazy(() => import('./components/Settings/SettingsPage').then(m => ({ default: m.SettingsPage })));
```

Wrap those `<Route>` elements' parent in `<Suspense fallback={<LoadingSpinner />}>` (LoadingSpinner is already imported by App or available at `./components/LoadingSpinner`). Keep `/recorder` and `/` eager so first paint stays fast.

Note: if EditMode exports `EditMode` as a named export, keep the `.then(m => ({ default: m.EditMode }))` mapping; adjust names to match actual exports.

- [ ] **Step 2: Build and measure**

Run: `npm run build`
Expected: multiple JS chunks; largest main chunk materially smaller than 565KB minified (record the number in the commit message).

- [ ] **Step 3: Smoke-test all routes**

Run the route spec against a deployed image (Task 6 rebuilds): `npx playwright test tests/routes.spec.mjs`
Expected: 7 passed.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "perf: lazy-load editor/stream/export/settings routes"
```

---

### Task 5: Healthchecks, backup tooling, production compose profile

**Files:**
- Modify: `docker-compose.yml`
- Create: `server/backup-volumes.sh`
- Create: `server/restore-volumes.sh`

**Interfaces:**
- Consumes: existing named volumes `videos/proxies/projects/output/recordings`.
- Produces: tar.gz backups in a host directory `${BACKUP_DIR:-./backups}`; compose service `healthcheck` blocks using each service's HTTP health endpoint.

- [ ] **Step 1: Add healthchecks to docker-compose.yml**

Inside the `opencam-studio` service:

```yaml
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
```

(`wget` exists in alpine; nginx serves `/health`.)

- [ ] **Step 2: Create server/backup-volumes.sh**

```sh
#!/bin/sh
# Usage: ./server/backup-volumes.sh [backup-dir]
set -e
DIR="${1:-./backups}"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DIR"
for VOL in videos proxies projects output recordings; do
    echo "Backing up $VOL..."
    docker run --rm \
        -v "opencam-studio_${VOL}:/data:ro" \
        -v "$(cd "$DIR" && pwd):/backup" \
        alpine tar czf "/backup/${VOL}-${STAMP}.tar.gz" -C /data .
done
echo "Backups written to $DIR"
```

Mark executable: `git update-index --chmod=+x server/backup-volumes.sh` (or create with executable bit via git).

- [ ] **Step 3: Create server/restore-volumes.sh**

```sh
#!/bin/sh
# Usage: ./server/restore-volumes.sh <backup-dir> <timestamp>
set -e
DIR="${1:?backup dir required}"
STAMP="${2:?timestamp required, e.g. 20260823-101500}"
for VOL in videos proxies projects output recordings; do
    echo "Restoring $VOL..."
    docker run --rm \
        -v "opencam-studio_${VOL}:/data" \
        -v "$(cd "$DIR" && pwd):/backup:ro" \
        alpine sh -c "rm -rf /data/* && tar xzf /backup/${VOL}-${STAMP}.tar.gz -C /data"
done
echo "Restore complete. Restart the stack."
```

Same chmod treatment.

- [ ] **Step 4: Verify healthcheck goes green**

```bash
docker compose up -d ; Start-Sleep -Seconds 40 ; docker ps --format "{{.Names}} {{.Status}}"
```

Expected: `(healthy)` in the status column.

- [ ] **Step 5: Round-trip backup/restore test**

Run backup script; confirm 5 tarballs exist; delete one volume's contents via `docker exec`; run restore; confirm content back (`docker exec opencam ls /projects` non-empty).

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml server/backup-volumes.sh server/restore-volumes.sh
git commit -m "ops: container healthcheck + volume backup/restore scripts"
```

---

### Task 6: Wire real tests into CI

**Files:**
- Modify: `package.json` (scripts section)
- Modify: `.github/workflows/ci.yml`
- Rename: `server/__test-mlt.mjs` → `tests/mlt-xml.test.mjs`

**Interfaces:**
- Consumes: existing `node server/__test-mlt.mjs` (14 assertions, exits non-zero on failure) and `tests/routes.spec.mjs` (needs a running app — NOT wired into CI; documented as manual/pre-release).
- Produces: `npm test` runs MLT unit suite locally and in CI.

- [ ] **Step 1: Move and rename the unit test**

```bash
git mv server/__test-mlt.mjs tests/mlt-xml.test.mjs
```

Fix its internal require path from `'./mlt-xml.js'` to `'../server/mlt-xml.js'`:

```js
const { jsonToMlt } = require('../server/mlt-xml.js');
```

- [ ] **Step 2: Point npm test at it**

In `package.json`:

```json
"test": "node tests/mlt-xml.test.mjs"
```

- [ ] **Step 3: Verify locally**

Run: `npm test`
Expected: `14 passed, 0 failed`, exit code 0.

- [ ] **Step 4: CI picks it up automatically**

The existing ci.yml step `npm test -- --passWithNoTests` will now run the real suite. Remove the `-- --passWithNoTests` suffix so failures actually fail CI:

```yaml
      - run: npm test
```

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/ci.yml tests/
git commit -m "ci: run MLT unit suite as real test gate"
```

---

## Final Verification (after all tasks)

1. `npm run lint` — clean
2. `npm test` — 14 passed
3. `npm run build` — chunks reported, note main size
4. Rebuild image: `docker build -f server/Dockerfile.allinone -t tajo9128/opencam-studio:v2.1.0 .`
5. Run container; `npx playwright test tests/routes.spec.mjs` — 7 passed
6. Editor round-trip: upload → edit → reload → restore intact (Phase 2 behavior unchanged)
7. Render smoke: create project → render → ffprobe duration matches timeline
8. Commit any stragglers; push; tag `v2.1.0`; `docker push` both tags
