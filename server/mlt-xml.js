const { xml } = require('@xmldom/xmldom');

function jsonToMlt(project, clips) {
    const { id, name, width, height, fps, timeline } = project;

    let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
    xml += '<mlt LC_NUMERIC="C">\n';

    xml += `  <profile description="HD ${height}p" width="${width}" height="${height}"
               progressive="1" frame_rate_num="${fps}" frame_rate_den="1"
               display_aspect_num="16" display_aspect_den="9"
               colorspace="bt709"/>\n`;

    if (!timeline || !timeline.tracks || timeline.tracks.length === 0) {
        xml += '</mlt>';
        return xml;
    }

    const addedClips = new Set();

    for (const track of timeline.tracks) {
        for (const clip of (track.clips || [])) {
            if (clip.clipId && !addedClips.has(clip.clipId)) {
                addedClips.add(clip.clipId);
                const resource = `/videos/${clip.clipId}.mp4`;
                xml += `  <producer id="clip-${clip.clipId}">
                <property name="resource">${escapeXml(resource)}</property>
                <property name="mlt_service">avformat</property>
              </producer>\n`;
            }
        }
    }

    for (const track of timeline.tracks) {
        xml += `  <playlist id="track-${track.id}">\n`;
        for (const clip of (track.clips || [])) {
            const inFrames = Math.round((clip.sourceStart || 0) * fps);
            const outFrames = Math.round((clip.sourceEnd || 10) * fps);
            const startFrame = Math.round((clip.trackStart || 0) * fps);
            xml += `    <entry producer="clip-${clip.clipId}" in="${inFrames}" out="${outFrames}">
              <property name="start">${startFrame}</property>
            </entry>\n`;
        }
        xml += `  </playlist>\n`;
    }

    xml += `  <tractor id="maintractor" global_feed="1">\n`;
    xml += `    <multitrack>\n`;
    for (const track of timeline.tracks) {
        xml += `      <track producer="track-${track.id}"/>\n`;
    }
    xml += `    </multitrack>\n`;

    if (timeline.tracks.length > 1) {
        for (let i = 1; i < timeline.tracks.length; i++) {
            xml += `    <transition id="trans-${i}">
              <property name="a_track">0</property>
              <property name="b_track">${i}</property>
              <property name="mlt_service">composite</property>
              <property name="always_active">1</property>
            </transition>\n`;
        }
    }

    xml += `  </tractor>\n`;
    xml += '</mlt>';

    return xml;
}

function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { jsonToMlt };
