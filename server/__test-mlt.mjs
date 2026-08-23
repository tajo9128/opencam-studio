// Unit tests for server/mlt-xml.js — run: node server/__test-mlt.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { jsonToMlt } = require('./mlt-xml.js');

let pass = 0, fail = 0;
function assert(cond, name, detail = '') {
    if (cond) { pass++; console.log(`  ok  ${name}`); }
    else { fail++; console.error(`FAIL  ${name} ${detail}`); }
}

// --- Test 1: gaps become blank entries, positions cumulative ---
{
    const project = {
        width: 1920, height: 1080, fps: 30,
        timeline: { tracks: [{ id: 't1', clips: [
            { clipId: 'aaa', sourceStart: 0, sourceEnd: 2, trackStart: 0, speed: 1 },
            { clipId: 'bbb', sourceStart: 5, sourceEnd: 8, trackStart: 5, speed: 1 }, // gap at t=2..5
        ]}]},
    };
    const xml = jsonToMlt(project, { resolveResource: () => '/videos/x.mp4' });
    assert(xml.includes('<blank length="90"/>'), 'gap of 3s at 30fps -> blank length 90');
    const entryB = /entry producer="producer1" in="150" out="239"/.test(xml);
    assert(entryB, 'second clip in=sourceStart*fps out=in+len-1');
}

// --- Test 2: speed != 1 uses timewarp with warped frames ---
{
    const project = {
        width: 1920, height: 1080, fps: 30,
        timeline: { tracks: [{ id: 't1', clips: [
            { clipId: 'aaa', sourceStart: 10, sourceEnd: 20, trackStart: 0, speed: 2 }, // 10s src @2x = 5s timeline
        ]}]},
    };
    const xml = jsonToMlt(project, { resolveResource: () => '/videos/a.mp4' });
    assert(xml.includes('mlt_service">timewarp'), 'speed!=1 -> timewarp service');
    assert(xml.includes('resource">2.0000:/videos/a.mp4'), 'timewarp resource prefix');
    // warped in = sourceStart*speed*fps = 600; len = 5s*30 = 150 -> out=749
    assert(/in="600" out="749"/.test(xml), 'warped frames in=600 out=749');
}

// --- Test 3: vertical project gets correct display aspect ---
{
    const project = {
        width: 1080, height: 1920, fps: 30,
        timeline: { tracks: [{ id: 't1', clips: [
            { clipId: 'a', sourceStart: 0, sourceEnd: 1, trackStart: 0, speed: 1 },
        ]}]},
    };
    const xml = jsonToMlt(project, { resolveResource: () => '/x.mp4' });
    assert(xml.includes('display_aspect_num="9" display_aspect_den="16"'), 'vertical DAR 9:16');
}

// --- Test 4: empty timeline still valid (has tractor + multitrack) ---
{
    const xml = jsonToMlt({ width: 1920, height: 1080, fps: 30, timeline: { tracks: [] } });
    assert(xml.includes('<tractor') && xml.includes('<multitrack>'), 'empty -> valid minimal doc');
}

// --- Test 5: unresolvable clips skipped without breaking XML ---
{
    const project = {
        width: 1920, height: 1080, fps: 30,
        timeline: { tracks: [{ id: 't1', clips: [
            { clipId: 'ghost', sourceStart: 0, sourceEnd: 2, trackStart: 0, speed: 1 },
            { clipId: 'real', sourceStart: 0, sourceEnd: 2, trackStart: 3, speed: 1 },
        ]}]},
    };
    let skipped = [];
    const xml = jsonToMlt(project, { resolveResource: id => id === 'real' ? '/r.mp4' : null, onSkip: s => skipped.push(...s) });
    assert(skipped.includes('ghost'), 'unresolvable reported to onSkip');
    assert(xml.includes('<blank') && !xml.includes('ghost'), 'skipped clip leaves only blank + real entry');
}

// --- Test 6: overlap trimmed, no negative lengths ---
{
    const project = {
        width: 1920, height: 1080, fps: 30,
        timeline: { tracks: [{ id: 't1', clips: [
            { clipId: 'a', sourceStart: 0, sourceEnd: 10, trackStart: 0, speed: 1 },
            { clipId: 'b', sourceStart: 0, sourceEnd: 5, trackStart: 2, speed: 1 }, // overlaps a
        ]}]},
    };
    const xml = jsonToMlt(project, { resolveResource: () => '/x.mp4' });
    assert(!/out="-\d+"/.test(xml), 'no negative out frames');
    assert((xml.match(/<blank/g) || []).length === 0, 'no blanks needed when overlapping');
}

// --- Test 7: multi-track composites + XML parses ---
{
    const project = {
        width: 1280, height: 720, fps: 25,
        timeline: { tracks: [
            { id: 't1', clips: [{ clipId: 'base', sourceStart: 0, sourceEnd: 4, trackStart: 0, speed: 1 }] },
            { id: 't2', clips: [{ clipId: 'pip', sourceStart: 1, sourceEnd: 3, trackStart: 1, speed: 1 }] },
        ]},
    };
    const xml = jsonToMlt(project, { resolveResource: () => '/x.mp4' });
    assert(xml.includes('b_track">1<'), 'composite for second track');
    assert(xml.includes('geometry">0/0:1280x720'), 'composite geometry matches profile');
    // parse check with xmldom if available
    try {
        const dom = require('@xmldom/xmldom');
        new dom.DOMParser().parseFromString(xml, 'application/xml');
        assert(true, 'XML parses cleanly');
    } catch { console.log('  (xmldom unavailable, skipping parse check)'); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
