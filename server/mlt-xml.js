// Timeline JSON -> MLT XML generator
//
// Data model (saved by editor via PUT /api/projects/:id/timeline):
//   project.timeline.tracks = [{ id, type, clips: [{ clipId, sourceStart, sourceEnd, trackStart, speed }] }]
//
// Timing model:
//   timeline duration of a clip = (sourceEnd - sourceStart) / speed
//   speed == 1  -> plain avformat producer, in/out are source frames
//   speed != 1  -> timewarp producer, in/out are warped (timeline-rate) frames

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonToMlt(project, options = {}) {
    const resolveResource = options.resolveResource || ((clipId) => `/videos/${clipId}.mp4`);
    const width = project.width || 1920;
    const height = project.height || 1080;
    const fps = project.fps || 30;
    const darGcd = gcd(width, height);

    let out = '<?xml version="1.0" encoding="utf-8"?>\n';
    out += '<mlt LC_NUMERIC="C">\n';
    out += `  <profile description="${escapeXml(project.name || 'render')}" width="${width}" height="${height}" `
        + `progressive="1" sample_aspect_num="1" sample_aspect_den="1" `
        + `display_aspect_num="${width / darGcd}" display_aspect_den="${height / darGcd}" `
        + `frame_rate_num="${fps}" frame_rate_den="1" colorspace="bt709"/>\n`;

    const tracks = project.timeline?.tracks?.filter(t => (t.clips || []).length > 0) || [];
    if (tracks.length === 0) {
        // A valid MLT doc still needs a tractor/multitrack for melt to accept it.
        out += '  <producer id="black" in="0" out="' + (fps - 1) + '">\n';
        out += '    <property name="resource">0</property>\n';
        out += '    <property name="mlt_service">color</property>\n';
        out += `    <property name="length">${fps}</property>\n`;
        out += '  </producer>\n';
        out += '  <playlist id="track0"><entry producer="black"/></playlist>\n';
        out += '  <tractor id="maintractor"><multitrack><track producer="track0"/></multitrack></tractor>\n';
        out += '</mlt>';
        return out;
    }

    // ---- Collect unique producers (per clipId + speed combination) ----
    const producers = new Map(); // key -> { id, resource, speed }
    let producerSeq = 0;

    function producerFor(clipId, speed) {
        const key = `${clipId}@${speed}`;
        if (!producers.has(key)) {
            const resource = resolveResource(clipId);
            const id = `producer${producerSeq++}`;
            producers.set(key, { id, resource, speed });
        }
        return producers.get(key);
    }

    const skippedClips = [];
    const trackPlans = [];

    for (let ti = 0; ti < tracks.length; ti++) {
        const track = tracks[ti];
        const clips = [...(track.clips || [])].sort((a, b) => (a.trackStart || 0) - (b.trackStart || 0));
        const plan = [];
        let cursor = 0; // playlist position in frames

        for (const clip of clips) {
            if (!clip.clipId) { skippedClips.push('(no clipId)'); continue; }
            const speed = Number(clip.speed) > 0 ? Number(clip.speed) : 1;
            const sourceDur = Math.max(0, (Number(clip.sourceEnd) || 0) - (Number(clip.sourceStart) || 0));
            const timelineDur = sourceDur / speed;
            if (timelineDur <= 0) { skippedClips.push(clip.clipId); continue; }

            const prod = producerFor(clip.clipId, speed);
            if (!prod.resource) { skippedClips.push(clip.clipId); continue; }

            const startF = Math.round((Number(clip.trackStart) || 0) * fps);
            const lenF = Math.max(1, Math.round(timelineDur * fps));

            if (startF > cursor) {
                plan.push({ kind: 'blank', length: startF - cursor });
            } else if (startF < cursor && plan.length > 0 && plan[plan.length - 1].kind === 'entry') {
                // Overlap: trim previous entry to make room (editor should not produce overlaps).
                const prev = plan[plan.length - 1];
                prev.out -= (cursor - startF);
                if (prev.out <= prev.in) plan.pop();
            }

            let inF, outF;
            if (speed === 1) {
                inF = Math.round((Number(clip.sourceStart) || 0) * fps);
                outF = inF + lenF - 1;
            } else {
                inF = Math.round((Number(clip.sourceStart) || 0) * speed * fps);
                outF = inF + lenF - 1;
            }

            plan.push({ kind: 'entry', producer: prod, in: inF, out: outF });
            cursor = Math.max(cursor, startF + lenF);
        }

        trackPlans.push(plan);
    }

    // ---- Emit producers ----
    for (const { id, resource, speed } of producers.values()) {
        if (speed === 1) {
            out += `  <producer id="${id}" in="0" out="999999">\n`;
            out += `    <property name="resource">${escapeXml(resource)}</property>\n`;
            out += '    <property name="mlt_service">avformat</property>\n';
            out += '  </producer>\n';
        } else {
            out += `  <producer id="${id}" in="0" out="999999">\n`;
            out += `    <property name="resource">${Number(speed).toFixed(4)}:${escapeXml(resource)}</property>\n`;
            out += '    <property name="mlt_service">timewarp</property>\n';
            out += '  </producer>\n';
        }
    }

    // ---- Emit playlists with blank gap entries ----
    for (let ti = 0; ti < trackPlans.length; ti++) {
        out += `  <playlist id="playlist${ti}">\n`;
        for (const item of trackPlans[ti]) {
            if (item.kind === 'blank') {
                out += `    <blank length="${item.length}"/>\n`;
            } else {
                out += `    <entry producer="${item.producer.id}" in="${item.in}" out="${item.out}"/>\n`;
            }
        }
        out += '  </playlist>\n';
    }

    // ---- Emit tractor + multitrack + compositing transitions ----
    out += '  <tractor id="maintractor" global_feed="1">\n';
    out += '    <multitrack>\n';
    for (let ti = 0; ti < trackPlans.length; ti++) {
        out += `      <track producer="playlist${ti}"/>\n`;
    }
    out += '    </multitrack>\n';

    for (let ti = 1; ti < trackPlans.length; ti++) {
        out += `    <transition id="composite${ti}">\n`;
        out += '      <property name="a_track">0</property>\n';
        out += `      <property name="b_track">${ti}</property>\n`;
        out += '      <property name="mlt_service">composite</property>\n';
        out += `      <property name="geometry">0/0:${width}x${height}</property>\n`;
        out += '      <property name="aligned">1</property>\n';
        out += '      <property name="always_active">1</property>\n';
        out += '    </transition>\n';
    }
    out += '  </tractor>\n';
    out += '</mlt>';

    if (skippedClips.length > 0 && typeof options.onSkip === 'function') {
        options.onSkip(skippedClips);
    }

    return out;
}

module.exports = { jsonToMlt };
