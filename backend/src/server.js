require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const customerRoutes = require('./routes/customers');
const jobRoutes = require('./routes/jobs');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/jobs', jobRoutes);

// Rukovalac greshkama. Za Multer greshke (prevelika datoteka, pogreshan tip) potrebne su posebne,
// razumljive poruke – u suprotnom bi potpadale pod opštu grešku 500 (navedenu ispod),
// pa bi tehnicar koji otprema fotografiju od 55 MB video samo „Internal server error”
// (interna greska servera), ne znajuci zasto se to desava.
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Velicina slike je prevelika (max 25MB)' });
        }
        return res.status(400).json({ error: `Greska prikacivanja slike: ${err.message}` });
    }
    if (err && err.message && err.message.includes('Samo JPEG, PNG, WEBP')) {
        return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Greska u internom serveru' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`ServiceHub backend running on port ${PORT}`);
});