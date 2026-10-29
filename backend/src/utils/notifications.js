let admin;
try {
    admin = require('firebase-admin');
} catch (e) {
    console.warn('firebase-admin not installed. Push notifications will be disabled.');
}
const db = require('../db');
const path = require('path');
const fs = require('fs');

let firebaseReady = false;

if (admin) {
    try {
        const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');
        if (fs.existsSync(serviceAccountPath)) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccountPath)
            });
            firebaseReady = true;
            console.log('Firebase Admin initialized successfully');
        } else {
            console.warn('Firebase service account key not found at:', serviceAccountPath);
            console.warn('Push notifications will be disabled.');
        }
    } catch (err) {
        console.error('Failed to initialize Firebase Admin:', err);
    }
}

async function sendNotification(userId, title, body, data = {}) {
    if (!firebaseReady) return;

    const tokens = db.prepare('SELECT token FROM user_tokens WHERE user_id = ?').all(userId);
    if (tokens.length === 0) return;

    const registrationTokens = tokens.map(t => t.token);

    const message = {
        notification: { title, body },
        data: {
            ...data,
            click_action: 'FLUTTER_NOTIFICATION_CLICK' // For backward compatibility if needed
        },
        tokens: registrationTokens,
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`Successfully sent ${response.successCount} notifications for user ${userId}`);

        // Clean up invalid tokens
        if (response.failureCount > 0) {
            const tokensToRemove = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const code = resp.error.code;
                    if (code === 'messaging/invalid-registration-token' ||
                        code === 'messaging/registration-token-not-registered') {
                        tokensToRemove.push(registrationTokens[idx]);
                    }
                }
            });

            if (tokensToRemove.length > 0) {
                const placeholders = tokensToRemove.map(() => '?').join(',');
                db.prepare(`DELETE FROM user_tokens WHERE token IN (${placeholders})`).run(...tokensToRemove);
                console.log(`Cleaned up ${tokensToRemove.length} invalid tokens for user ${userId}`);
            }
        }
    } catch (error) {
        console.error('Error sending multicast message:', error);
    }
}

module.exports = { sendNotification };
