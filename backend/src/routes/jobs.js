const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload, UPLOAD_DIR } = require('../middleware/upload');
const { sendNotification } = require('../utils/notifications');

const router = express.Router();

const VALID_STATUSES = ['pending', 'assigned', 'in_progress', 'finished', 'cancelled'];

function jobWithDetails(id) {
    const job = db.prepare(`
        SELECT j.*,
               c.name AS customer_name, c.phone AS customer_phone,
               a.type AS appliance_type, a.brand AS appliance_brand, a.model AS appliance_model,
               a.serial_number AS appliance_serial,
               u.name AS assigned_to_name
        FROM jobs j
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN appliances a ON j.appliance_id = a.id
        LEFT JOIN users u ON j.assigned_to = u.id
        WHERE j.id = ?
    `).get(id);

    if (!job) return null;

    job.notes = db.prepare(`
        SELECT n.*, u.name AS author_name FROM job_notes n
        LEFT JOIN users u ON n.author_id = u.id
        WHERE n.job_id = ? ORDER BY n.created_at DESC
    `).all(id);

    job.history = db.prepare(`
        SELECT h.*, u.name AS changed_by_name FROM job_status_history h
        LEFT JOIN users u ON h.changed_by = u.id
        WHERE h.job_id = ? ORDER BY h.changed_at ASC
    `).all(id);

    job.photos = db.prepare(`
        SELECT p.*, u.name AS uploaded_by_name FROM job_photos p
        LEFT JOIN users u ON p.uploaded_by = u.id
        WHERE p.job_id = ? ORDER BY p.created_at DESC
    `).all(id);

    return job;
}

// List jobs
router.get('/', requireAuth, (req, res) => {
    const { status, all } = req.query;
    let query = `
        SELECT j.*, c.name AS customer_name, u.name AS assigned_to_name,
               a.type AS appliance_type
        FROM jobs j
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN appliances a ON j.appliance_id = a.id
        LEFT JOIN users u ON j.assigned_to = u.id
        WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'technician') {
        query += ' AND j.assigned_to = ?';
        params.push(req.user.id);
    }
    if (status) {
        query += ' AND j.status = ?';
        params.push(status);
    }
    query += " ORDER BY CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, j.created_at DESC";

    res.json(db.prepare(query).all(...params));
});

router.get('/:id', requireAuth, (req, res) => {
    const job = jobWithDetails(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (req.user.role === 'technician' && job.assigned_to !== req.user.id) {
        return res.status(403).json({ error: 'This job is not assigned to you' });
    }
    res.json(job);
});

// Create job
router.post('/', requireAuth, (req, res) => {
    const { customer_id, appliance_id, title, description, priority, scheduled_at, address, assigned_to } = req.body;
    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'title is required' });
    }

    let customer = null;
    let finalCustomerId = null;
    let finalApplianceId = null;

    if (customer_id) {
        customer = db.prepare('SELECT id, address FROM customers WHERE id = ?').get(customer_id);
        if (!customer) return res.status(400).json({ error: 'customer_id does not exist' });
        finalCustomerId = customer.id;

        if (appliance_id) {
            const appliance = db.prepare('SELECT id FROM appliances WHERE id = ? AND customer_id = ?').get(appliance_id, customer.id);
            if (!appliance) return res.status(400).json({ error: 'appliance_id does not belong to this customer' });
            finalApplianceId = appliance.id;
        }
    }

    const initialStatus = assigned_to ? 'assigned' : 'pending';

    const info = db.prepare(`
        INSERT INTO jobs (customer_id, appliance_id, title, description, priority, scheduled_at, address, assigned_to, created_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        finalCustomerId, finalApplianceId, title.trim(), description ? description.trim() : null,
        priority || 'normal', scheduled_at || null, address || (customer ? customer.address : null) || null,
        assigned_to || null, req.user.id, initialStatus
    );

    db.prepare(
        'INSERT INTO job_status_history (job_id, old_status, new_status, changed_by) VALUES (?, NULL, ?, ?)'
    ).run(info.lastInsertRowid, initialStatus, req.user.id);

    if (assigned_to) {
        sendNotification(
            assigned_to,
            'Novi posao dodeljen',
            `Dodeljen vam je posao: ${title}`,
            { jobId: String(info.lastInsertRowid), type: 'new_job' }
        );
    } else if (priority === 'urgent') {
        // Notify all admins of an urgent unassigned job?
        // For now, let's just focus on technicians as per plan.
    }

    res.status(201).json(jobWithDetails(info.lastInsertRowid));
});

// Assign / reassign technician
router.patch('/:id/assign', requireAuth, requireRole('admin'), (req, res) => {
    const { assigned_to } = req.body;
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (assigned_to) {
        const tech = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(assigned_to);
        if (!tech) return res.status(400).json({ error: 'assigned_to user does not exist or is inactive' });
    }

    const newStatus = assigned_to
        ? (job.status === 'pending' ? 'assigned' : job.status)
        : 'pending';

    db.prepare(
        "UPDATE jobs SET assigned_to = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(assigned_to || null, newStatus, req.params.id);

    if (newStatus !== job.status) {
        db.prepare(
            'INSERT INTO job_status_history (job_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)'
        ).run(req.params.id, job.status, newStatus, req.user.id);
    }

    if (assigned_to && assigned_to !== job.assigned_to) {
        sendNotification(
            assigned_to,
            'Novi posao dodeljen',
            `Dodeljen vam je posao: ${job.title}`,
            { jobId: String(req.params.id), type: 'job_assigned' }
        );
    }

    res.json(jobWithDetails(req.params.id));
});

// Update status safely without raw SQL interpolation
router.patch('/:id/status', requireAuth, (req, res) => {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (req.user.role === 'technician' && job.assigned_to !== req.user.id) {
        return res.status(403).json({ error: 'This job is not assigned to you' });
    }
    if (status === 'cancelled' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only administrators can cancel jobs' });
    }

    if (status === 'finished') {
        db.prepare(
            "UPDATE jobs SET status = ?, updated_at = datetime('now'), finished_at = datetime('now') WHERE id = ?"
        ).run(status, req.params.id);
    } else {
        db.prepare(
            "UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(status, req.params.id);
    }

    db.prepare(
        'INSERT INTO job_status_history (job_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)'
    ).run(req.params.id, job.status, status, req.user.id);

    res.json(jobWithDetails(req.params.id));
});

// Log or update hours
router.patch('/:id/hours', requireAuth, (req, res) => {
    const { hours_logged } = req.body;
    const hours = hours_logged === null || hours_logged === '' ? null : Number(hours_logged);

    if (hours !== null && (Number.isNaN(hours) || hours < 0 || hours > 999)) {
        return res.status(400).json({ error: 'hours_logged must be a number between 0 and 999, or null to clear' });
    }

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (req.user.role === 'technician' && job.assigned_to !== req.user.id) {
        return res.status(403).json({ error: 'This job is not assigned to you' });
    }

    db.prepare(
        "UPDATE jobs SET hours_logged = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(hours, req.params.id);

    res.json(jobWithDetails(req.params.id));
});

// Schedule job
router.patch('/:id/schedule', requireAuth, (req, res) => {
    const { scheduled_at } = req.body;
    const job = db.prepare('SELECT id, assigned_to FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (req.user.role !== 'admin' && job.assigned_to !== req.user.id) {
        return res.status(403).json({ error: 'This job is not assigned to you' });
    }

    db.prepare(
        "UPDATE jobs SET scheduled_at = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(scheduled_at || null, req.params.id);

    res.json(jobWithDetails(req.params.id));
});

// Add job note
router.post('/:id/notes', requireAuth, (req, res) => {
    const { note } = req.body;
    if (!note || !note.trim()) return res.status(400).json({ error: 'note text is required' });

    const job = db.prepare('SELECT id, assigned_to FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (req.user.role === 'technician' && job.assigned_to !== req.user.id) {
        return res.status(403).json({ error: 'This job is not assigned to you' });
    }

    db.prepare(
        'INSERT INTO job_notes (job_id, author_id, note) VALUES (?, ?, ?)'
    ).run(req.params.id, req.user.id, note.trim());

    res.status(201).json(jobWithDetails(req.params.id));
});

// Upload photo safely
router.post('/:id/photos', requireAuth, upload.single('photo'), (req, res) => {
    const job = db.prepare('SELECT id, assigned_to FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Job not found' });
    }

    if (req.user.role === 'technician' && job.assigned_to !== req.user.id) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(403).json({ error: 'This job is not assigned to you' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No photo file provided (field name must be "photo")' });
    }

    try {
        db.prepare(
            'INSERT INTO job_photos (job_id, uploaded_by, filename, original_name, caption, category) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(req.params.id, req.user.id, req.file.filename, req.file.originalname || null, req.body.caption || null, req.body.category || 'other');

        res.status(201).json(jobWithDetails(req.params.id));
    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(500).json({ error: 'Failed to save photo details' });
    }
});

// Serve photo file
router.get('/photos/:filename', requireAuth, (req, res) => {
    const filename = path.basename(req.params.filename);
    const photo = db.prepare('SELECT id FROM job_photos WHERE filename = ?').get(filename);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const filePath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Photo file missing on disk' });
    res.sendFile(filePath);
});

// Find job by appliance serial number
router.get('/search/serial/:serial', requireAuth, (req, res) => {
    const serial = req.params.serial;
    const appliance = db.prepare('SELECT id FROM appliances WHERE serial_number = ?').get(serial);
    if (!appliance) return res.status(404).json({ error: 'Appliance not found' });

    // Return the latest active job for this appliance, or just the history
    const jobs = db.prepare(`
        SELECT j.*, c.name AS customer_name, u.name AS assigned_to_name
        FROM jobs j
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN users u ON j.assigned_to = u.id
        WHERE j.appliance_id = ?
        ORDER BY j.created_at DESC
    `).all(appliance.id);

    res.json({ appliance, jobs });
});

// Delete photo
router.delete('/:jobId/photos/:photoId', requireAuth, (req, res) => {
    const photo = db.prepare('SELECT * FROM job_photos WHERE id = ? AND job_id = ?').get(req.params.photoId, req.params.jobId);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    if (req.user.role !== 'admin' && photo.uploaded_by !== req.user.id) {
        return res.status(403).json({ error: 'You can only delete photos you uploaded' });
    }

    db.prepare('DELETE FROM job_photos WHERE id = ?').run(req.params.photoId);
    fs.unlink(path.join(UPLOAD_DIR, photo.filename), () => {});

    res.json(jobWithDetails(req.params.jobId));
});

// Dashboard stats
router.get('/stats/summary', requireAuth, (req, res) => {
    const counts = db.prepare(`
        SELECT status, COUNT(*) as count FROM jobs GROUP BY status
    `).all();

    const byTech = db.prepare(`
        SELECT u.name, COUNT(j.id) as count
        FROM users u LEFT JOIN jobs j ON j.assigned_to = u.id AND j.status NOT IN ('finished', 'cancelled')
        WHERE u.role = 'technician' AND u.active = 1
        GROUP BY u.id
    `).all();

    const finishedThisWeek = db.prepare(`
        SELECT COUNT(*) as count FROM jobs
        WHERE status = 'finished' AND finished_at >= datetime('now', '-7 days')
    `).get().count;

    const urgentOpen = db.prepare(`
        SELECT COUNT(*) as count FROM jobs
        WHERE priority = 'urgent' AND status NOT IN ('finished', 'cancelled')
    `).get().count;

    const unassigned = db.prepare(`
        SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'
    `).get().count;

    const hoursByTech = db.prepare(`
        SELECT u.name,
               COALESCE(SUM(j.hours_logged), 0) AS totalHours,
               COALESCE(SUM(CASE WHEN j.finished_at >= datetime('now', '-7 days') THEN j.hours_logged ELSE 0 END), 0) AS hoursThisWeek
        FROM users u LEFT JOIN jobs j ON j.assigned_to = u.id AND j.hours_logged IS NOT NULL
        WHERE u.role = 'technician' AND u.active = 1
        GROUP BY u.id
        ORDER BY u.name
    `).all();

    res.json({ byStatus: counts, byTechnician: byTech, finishedThisWeek, urgentOpen, unassigned, hoursByTechnician: hoursByTech });
});

// CSV Export (Safe against CSV injection)
router.get('/export/csv', requireAuth, requireRole('admin'), (req, res) => {
    const { from, to } = req.query;
    let query = `
        SELECT j.id, j.title, j.status, j.priority, j.hours_logged,
               j.scheduled_at, j.finished_at, j.created_at,
               c.name AS customer_name, u.name AS technician_name
        FROM jobs j
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN users u ON j.assigned_to = u.id
        WHERE 1=1
    `;
    const params = [];
    if (from) { query += ' AND j.created_at >= ?'; params.push(from); }
    if (to) { query += ' AND j.created_at <= ?'; params.push(to); }
    query += ' ORDER BY j.created_at DESC';

    const rows = db.prepare(query).all(...params);

    function csvField(value) {
        if (value === null || value === undefined) return '';
        let str = String(value);
        // Neutralize CSV formula injection characters
        if (/^[=+\-@\t\r]/.test(str)) {
            str = `'${str}`;
        }
        if (/[",\n]/.test(str)) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    const header = ['Job ID', 'Title', 'Customer', 'Technician', 'Status', 'Priority', 'Hours Logged', 'Scheduled', 'Finished', 'Created'];
    const lines = [header.map(csvField).join(',')];

    for (const r of rows) {
        lines.push([
            r.id, r.title, r.customer_name || 'N/A', r.technician_name || 'Unassigned',
            r.status, r.priority, r.hours_logged ?? '', r.scheduled_at || '', r.finished_at || '', r.created_at
        ].map(csvField).join(','));
    }

    const csv = lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="servicehub-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
});

// Calendar range
router.get('/calendar/range', requireAuth, (req, res) => {
    const { from, to, all } = req.query;
    let query = `
        SELECT j.id, j.title, j.status, j.priority, j.scheduled_at,
               c.name AS customer_name, u.name AS assigned_to_name
        FROM jobs j
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN users u ON j.assigned_to = u.id
        WHERE j.scheduled_at IS NOT NULL
    `;
    const params = [];
    if (req.user.role === 'technician') {
        query += ' AND j.assigned_to = ?';
        params.push(req.user.id);
    }
    if (from) { query += ' AND j.scheduled_at >= ?'; params.push(from); }
    if (to) { query += ' AND j.scheduled_at <= ?'; params.push(to); }
    query += ' ORDER BY j.scheduled_at ASC';

    res.json(db.prepare(query).all(...params));
});

// Delete a single job
router.delete('/:id', requireAuth, (req, res) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (req.user.role === 'technician' && job.assigned_to !== req.user.id && job.created_by !== req.user.id) {
        return res.status(403).json({ error: 'Permission denied' });
    }

    const photos = db.prepare('SELECT filename FROM job_photos WHERE job_id = ?').all(req.params.id);
    for (const p of photos) {
        fs.unlink(path.join(UPLOAD_DIR, p.filename), () => {});
    }

    db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// Bulk delete jobs
router.post('/bulk-delete', requireAuth, requireRole('admin'), (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids array is required' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const photos = db.prepare(`SELECT filename FROM job_photos WHERE job_id IN (${placeholders})`).all(...ids);
    for (const p of photos) {
        fs.unlink(path.join(UPLOAD_DIR, p.filename), () => {});
    }

    db.prepare(`DELETE FROM jobs WHERE id IN (${placeholders})`).run(...ids);
    res.json({ ok: true, deletedCount: ids.length });
});

// Bulk status update
router.post('/bulk-status', requireAuth, requireRole('admin'), (req, res) => {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Valid ids array and status required' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`).run(status, ...ids);

    res.json({ ok: true });
});

// Bulk assign technician
router.post('/bulk-assign', requireAuth, requireRole('admin'), (req, res) => {
    const { ids, assigned_to } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Valid ids array required' });
    }

    const techId = assigned_to ? Number(assigned_to) : null;
    if (techId) {
        const tech = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(techId);
        if (!tech) return res.status(400).json({ error: 'Assigned user does not exist or is inactive' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE jobs SET assigned_to = ?, status = CASE WHEN status = 'pending' AND ? IS NOT NULL THEN 'assigned' ELSE status END, updated_at = datetime('now') WHERE id IN (${placeholders})`).run(techId, techId, ...ids);

    res.json({ ok: true });
});

module.exports = router;