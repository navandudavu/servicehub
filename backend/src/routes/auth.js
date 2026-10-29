const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/loginLimiter');

const router = express.Router();

router.post('/login', loginLimiter, (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
        { id: user.id, role: user.role, name: user.name },
        JWT_SECRET,
        { expiresIn: '12h' }
    );

    res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
});

router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT id, name, email, role, phone FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
});

router.post('/token', requireAuth, (req, res) => {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    try {
        db.prepare(`
            INSERT INTO user_tokens (user_id, token, platform)
            VALUES (?, ?, ?)
            ON CONFLICT(token) DO UPDATE SET
                user_id = excluded.user_id,
                platform = excluded.platform,
                created_at = datetime('now')
        `).run(req.user.id, token, platform || 'android');

        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: 'Failed to save token' });
    }
});

module.exports = router;
