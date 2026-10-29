const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// List all users (technicians need this too, to see who's who - but strip password hash)
router.get('/', requireAuth, (req, res) => {
    const users = db.prepare(
        'SELECT id, name, email, role, phone, active FROM users ORDER BY name'
    ).all();
    res.json(users);
});

// Create user - admin only
router.post('/', requireAuth, requireRole('admin'), (req, res) => {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password || !role) {
        return res.status(400).json({ error: 'name, email, password, role are required' });
    }
    if (!['admin', 'technician'].includes(role)) {
        return res.status(400).json({ error: 'role must be admin or technician' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(
        'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)'
    ).run(name, email, hash, role, phone || null);

    res.status(201).json({ id: info.lastInsertRowid, name, email, role, phone: phone || null });
});

// Deactivate a user - admin only (we don't hard-delete, jobs reference users)
router.patch('/:id/active', requireAuth, requireRole('admin'), (req, res) => {
    const { active } = req.body;
    const info = db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
});

// Admin resets someone else's password - this is the "forgot password" fix
// for a tool with no email server: no self-service reset link, an admin
// just sets a new temporary password and tells the person directly.
router.patch('/:id/reset-password', requireAuth, requireRole('admin'), (req, res) => {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 4) {
        return res.status(400).json({ error: 'new_password is required (min 4 characters)' });
    }
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    res.json({ ok: true });
});

// Self-service: change your own password, requires knowing the current one
router.patch('/me/password', requireAuth, (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    if (new_password.length < 4) {
        return res.status(400).json({ error: 'new_password must be at least 4 characters' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ ok: true });
});

// Update user profile (name, email, role, phone) - admin or self
router.put('/:id', requireAuth, (req, res) => {
    const targetId = Number(req.params.id);
    const isAdmin = req.user.role === 'admin';
    const isSelf = req.user.id === targetId;

    if (!isAdmin && !isSelf) {
        return res.status(403).json({ error: 'Permission denied' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, email, role, phone } = req.body;

    if (name !== undefined && (!name || !name.trim())) {
        return res.status(400).json({ error: 'Name cannot be empty' });
    }

    if (email && email !== user.email) {
        const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, targetId);
        if (existing) return res.status(409).json({ error: 'Email already in use' });
    }

    const newName = name !== undefined ? name.trim() : user.name;
    const newEmail = email !== undefined ? email.trim() : user.email;
    const newRole = (isAdmin && role) ? role : user.role;
    const newPhone = phone !== undefined ? (phone ? phone.trim() : null) : user.phone;

    db.prepare('UPDATE users SET name = ?, email = ?, role = ?, phone = ? WHERE id = ?')
      .run(newName, newEmail, newRole, newPhone, targetId);

    const updated = db.prepare('SELECT id, name, email, role, phone, active FROM users WHERE id = ?').get(targetId);
    res.json(updated);
});

// Delete a user.
// Blocked from deleting yourself, and from deleting the last active admin.
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
    const targetId = Number(req.params.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (targetId === req.user.id) {
        return res.status(400).json({ error: "You can't delete your own account." });
    }

    if (user.role === 'admin') {
        const activeAdminCount = db.prepare(
            "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND active = 1"
        ).get().count;
        if (activeAdminCount <= 1) {
            return res.status(409).json({ error: 'Cannot delete the last active admin.' });
        }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    res.json({ ok: true });
});

module.exports = router;
