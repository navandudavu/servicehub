// Run: cd backend && node --test   (no dependencies, no database)
const test = require('node:test');
const assert = require('node:assert');
const { buildNalogAssignedPush } = require('../src/utils/nalogPush');

test('builds a fixed-text push from valid fields', () => {
    const p = buildNalogAssignedPush({ userId: 2, nalogId: 41, nalogNumber: 'RN-2026-000041' });
    assert.equal(p.userId, 2);
    assert.equal(p.title, 'Novi radni nalog');
    assert.equal(p.body, 'Dodeljen vam je nalog RN-2026-000041');
    assert.deepEqual(p.data, { nalogId: '41', type: 'nalog_assigned' });
});

test('ignores any extra text the caller sends (no arbitrary messages)', () => {
    const p = buildNalogAssignedPush({ userId: 2, nalogId: 1, nalogNumber: 'RN-1', title: 'evil', body: 'click here' });
    assert.equal(p.title, 'Novi radni nalog');
    assert.ok(!p.body.includes('click here'));
});

test('rejects bad input', () => {
    for (const bad of [
        undefined, null, 'x', {},
        { userId: '2', nalogId: 1, nalogNumber: 'RN-1' },
        { userId: 0, nalogId: 1, nalogNumber: 'RN-1' },
        { userId: 2, nalogId: -5, nalogNumber: 'RN-1' },
        { userId: 2, nalogId: 1.5, nalogNumber: 'RN-1' },
        { userId: 2, nalogId: 1, nalogNumber: '' },
        { userId: 2, nalogId: 1, nalogNumber: 'RN 1; drop' },
        { userId: 2, nalogId: 1, nalogNumber: 'R'.repeat(41) },
    ]) {
        assert.throws(() => buildNalogAssignedPush(bad), `should reject ${JSON.stringify(bad)}`);
    }
});
