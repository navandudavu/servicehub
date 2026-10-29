// Dependency-free login throttle: max 8 failed attempts per IP+email per 15 min.
// In-memory (resets on restart) - fine for a single-process server.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const fails = new Map(); // key -> { count, first }

function key(req) {
    return `${req.ip}|${String((req.body && req.body.email) || '').toLowerCase()}`;
}

function loginLimiter(req, res, next) {
    const k = key(req);
    const e = fails.get(k);
    if (e && Date.now() - e.first > WINDOW_MS) fails.delete(k);
    const cur = fails.get(k);
    if (cur && cur.count >= MAX_FAILS) {
        const wait = Math.ceil((WINDOW_MS - (Date.now() - cur.first)) / 1000);
        res.set('Retry-After', String(wait));
        return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }
    res.on('finish', () => {
        if (res.statusCode === 401) {
            const c = fails.get(k) || { count: 0, first: Date.now() };
            c.count++;
            fails.set(k, c);
        } else if (res.statusCode === 200) {
            fails.delete(k);
        }
    });
    next();
}

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of fails) if (now - v.first > WINDOW_MS) fails.delete(k);
}, WINDOW_MS).unref();

module.exports = { loginLimiter };
