function sanitizeString(str, maxLength = 1000) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>"'&]/g, '').trim().slice(0, maxLength);
}

function validateProjectBody(req, res, next) {
    const { name, width, height, fps } = req.body;
    if (name !== undefined) {
        if (typeof name !== 'string' || name.length > 200) {
            return res.status(400).json({ error: 'Invalid project name' });
        }
    }
    if (width !== undefined && (typeof width !== 'number' || width < 1 || width > 7680)) {
        return res.status(400).json({ error: 'Invalid width (1-7680)' });
    }
    if (height !== undefined && (typeof height !== 'number' || height < 1 || height > 4320)) {
        return res.status(400).json({ error: 'Invalid height (1-4320)' });
    }
    if (fps !== undefined && (typeof fps !== 'number' || fps < 1 || fps > 120)) {
        return res.status(400).json({ error: 'Invalid fps (1-120)' });
    }
    next();
}

function validateTimelineBody(req, res, next) {
    const { tracks } = req.body;
    if (!Array.isArray(tracks)) {
        return res.status(400).json({ error: 'Invalid timeline: tracks must be an array' });
    }
    if (tracks.length > 100) {
        return res.status(400).json({ error: 'Too many tracks (max 100)' });
    }
    next();
}

module.exports = { sanitizeString, validateProjectBody, validateTimelineBody };
