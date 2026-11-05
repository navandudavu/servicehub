// Pure helper (no database, no Firebase) so the rules can be unit-tested on their own.
// The push text is built HERE from validated fields only: the caller (the Java nalog service,
// forwarding an admin's token) cannot make this endpoint send arbitrary text to a technician.

const NUMBER_RE = /^[A-Za-z0-9-]{1,40}$/;

function isPositiveInt(v) {
    return Number.isSafeInteger(v) && v > 0;
}

// Returns { userId, title, body, data } or throws an Error whose message is safe to send back (HTTP 400).
function buildNalogAssignedPush(input) {
    const b = input && typeof input === 'object' ? input : {};
    if (!isPositiveInt(b.userId)) throw new Error('userId must be a positive integer');
    if (!isPositiveInt(b.nalogId)) throw new Error('nalogId must be a positive integer');
    if (typeof b.nalogNumber !== 'string' || !NUMBER_RE.test(b.nalogNumber)) {
        throw new Error('nalogNumber must be 1-40 letters, digits or dashes');
    }
    return {
        userId: b.userId,
        title: 'Novi radni nalog',
        body: `Dodeljen vam je nalog ${b.nalogNumber}`,
        data: { nalogId: String(b.nalogId), type: 'nalog_assigned' },
    };
}

module.exports = { buildNalogAssignedPush };
