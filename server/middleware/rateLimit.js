const rateLimit = new Map();

function createRateLimiter({ windowMs = 60000, max = 100 } = {}) {
    return (req, res, next) => {
        const key = req.ip || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        
        if (!rateLimit.has(key)) {
            rateLimit.set(key, { count: 1, resetTime: now + windowMs });
            return next();
        }
        
        const entry = rateLimit.get(key);
        if (now > entry.resetTime) {
            entry.count = 1;
            entry.resetTime = now + windowMs;
            return next();
        }
        
        entry.count++;
        if (entry.count > max) {
            return res.status(429).json({ error: 'Too many requests' });
        }
        next();
    };
}

module.exports = { createRateLimiter };
