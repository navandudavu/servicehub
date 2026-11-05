const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendNotification } = require('../utils/notifications');
const { buildNalogAssignedPush } = require('../utils/nalogPush');

const router = express.Router();

// Called by the Java nalog service (with the admin's own token) right after a nalog is assigned.
// Admin only, so a technician's token cannot be used to push messages at colleagues.
router.post('/nalog-assigned', requireAuth, requireRole('admin'), (req, res) => {
    let push;
    try {
        push = buildNalogAssignedPush(req.body);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    const target = db.prepare('SELECT id, active FROM users WHERE id = ?').get(push.userId);
    if (!target || !target.active) {
        return res.status(404).json({ error: 'User not found or inactive' });
    }

    // Fire and forget: delivery problems must never fail the assignment that triggered this.
    sendNotification(push.userId, push.title, push.body, push.data);
    res.status(202).json({ ok: true });
});

module.exports = router;
