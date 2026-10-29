const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// List customers, optional search by name/phone
router.get('/', requireAuth, (req, res) => {
    const { search } = req.query;
    let customers;
    if (search) {
        const like = `%${search}%`;
        customers = db.prepare(
            'SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name'
        ).all(like, like);
    } else {
        customers = db.prepare('SELECT * FROM customers ORDER BY name').all();
    }
    res.json(customers);
});

router.get('/:id', requireAuth, (req, res) => {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const appliances = db.prepare('SELECT * FROM appliances WHERE customer_id = ?').all(req.params.id);
    const jobs = db.prepare('SELECT * FROM jobs WHERE customer_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json({ ...customer, appliances, jobs });
});

router.post('/', requireAuth, (req, res) => {
    const { name, phone, email, address, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const info = db.prepare(
        'INSERT INTO customers (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)'
    ).run(name, phone || null, email || null, address || null, notes || null);

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(customer);
});

router.put('/:id', requireAuth, (req, res) => {
    const { name, phone, email, address, notes } = req.body;
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    db.prepare(
        'UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, notes = ? WHERE id = ?'
    ).run(
        name ?? existing.name,
        phone ?? existing.phone,
        email ?? existing.email,
        address ?? existing.address,
        notes ?? existing.notes,
        req.params.id
    );

    res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id));
});

// --- Appliances nested under a customer ---

router.post('/:id/appliances', requireAuth, (req, res) => {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const { type, brand, model, serial_number, purchase_date, notes } = req.body;
    if (!type) return res.status(400).json({ error: 'type is required (e.g. washing machine)' });

    const info = db.prepare(
        `INSERT INTO appliances (customer_id, type, brand, model, serial_number, purchase_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(req.params.id, type, brand || null, model || null, serial_number || null, purchase_date || null, notes || null);

    res.status(201).json(db.prepare('SELECT * FROM appliances WHERE id = ?').get(info.lastInsertRowid));
});

// Delete a customer.
router.delete('/:id', requireAuth, (req, res) => {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
