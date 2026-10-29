const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../data/uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 8MB - telefonske slike, ne samo RAW fajlovi sa kamere (ako se to uopste koristi)

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        const random = crypto.randomBytes(16).toString('hex');
        cb(null, `${random}${ext}`);
    }
});

function fileFilter(req, file, cb) {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
        return cb(new Error('Samo JPEG, PNG, WEBP, ili HEIC fotografije su dozvoljene'));
    }
    cb(null, true);
}

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_SIZE_BYTES }
});

module.exports = { upload, UPLOAD_DIR };
