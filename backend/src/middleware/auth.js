const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured and contain at least 32 characters');
}

function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed authorization header' });
    }
    const token = header.slice(7);
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (!Number.isSafeInteger(Number(payload.id)) || Number(payload.id) <= 0) {
            return res.status(401).json({ error: 'Invalid authentication token' });
        }

        // Resolve permissions from the current database record, not stale JWT claims.
        // This makes deactivation and role changes effective immediately.
        const user = db.prepare(
            'SELECT id, name, role, active, tokens_valid_after FROM users WHERE id = ?'
        ).get(Number(payload.id));

        if (!user || user.active !== 1) {
            return res.status(401).json({ error: 'Account is inactive or no longer exists' });
        }

        // Password changed/reset or account deactivated after this token was issued: log in again.
        if (user.tokens_valid_after > 0 && !(Number(payload.iat) >= user.tokens_valid_after)) {
            return res.status(401).json({ error: 'Session expired, please log in again' });
        }

        req.user = { id: user.id, role: user.role, name: user.name };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/** The one place that issues tokens (12 h). The Java service validates the same token. */
function signToken(user) {
    return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
}

/** Every token issued before now stops working (for this user only). */
function revokeTokens(userId) {
    db.prepare('UPDATE users SET tokens_valid_after = ? WHERE id = ?')
      .run(Math.floor(Date.now() / 1000), Number(userId));
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

module.exports = { requireAuth, requireRole, signToken, revokeTokens, JWT_SECRET };
