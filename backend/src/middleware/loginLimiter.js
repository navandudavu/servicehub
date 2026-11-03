// Dependency-free login throttle: max 8 failed attempts per IP+email per 15 min.
// In-memory (resets on restart) - fine for a single-process server.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const fails = new Map(); // key -> { count, first }
// Second, wider cap: one IP trying many different emails (password spraying) hits this even though
// no single IP+email pair reaches MAX_FAILS. A successful login does not reset it.
const IP_MAX_FAILS = 40;
const ipFails = new Map();

function key(req) {
    return `${req.ip}|${String((req.body && req.body.email) || '').toLowerCase()}`;
}

function live(map, k) {
    const e = map.get(k);
    if (e && Date.now() - e.first > WINDOW_MS) { map.delete(k); return undefined; }
    return e;
}

function bump(map, k) {
    const c = live(map, k) || { count: 0, first: Date.now() };
    c.count++;
    map.set(k, c);
}

function loginLimiter(req, res, next) {
    const k = key(req);
    const ip = String(req.ip);
    const cur = live(fails, k);
    const curIp = live(ipFails, ip);
    const blocker = cur && cur.count >= MAX_FAILS ? cur : (curIp && curIp.count >= IP_MAX_FAILS ? curIp : null);
    if (blocker) {
        const wait = Math.ceil((WINDOW_MS - (Date.now() - blocker.first)) / 1000);
        res.set('Retry-After', String(wait));
        return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }
    res.on('finish', () => {
        if (res.statusCode === 401) {
            bump(fails, k);
            bump(ipFails, ip);
        } else if (res.statusCode === 200) {
            fails.delete(k);
        }
    });
    next();
}

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of fails) if (now - v.first > WINDOW_MS) fails.delete(k);
    for (const [k, v] of ipFails) if (now - v.first > WINDOW_MS) ipFails.delete(k);
}, WINDOW_MS).unref();

module.exports = { loginLimiter, MAX_FAILS, IP_MAX_FAILS };
