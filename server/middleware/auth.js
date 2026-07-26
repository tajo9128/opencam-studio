function apiKeyAuth(req, res, next) {
    const apiKey = process.env.OPENCAM_API_KEY;

    // If no API key is configured, allow all requests (development mode)
    if (!apiKey) {
        return next();
    }

    const providedKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!providedKey || providedKey !== apiKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    }

    next();
}

module.exports = { apiKeyAuth };
