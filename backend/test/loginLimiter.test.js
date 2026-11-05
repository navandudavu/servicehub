// Run: cd backend && node --test   (no dependencies, no database)
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { loginLimiter, MAX_FAILS, IP_MAX_FAILS } = require('../src/middleware/loginLimiter');

// Runs one fake login attempt through the middleware; `outcome` is the status the route would send.
function attempt(ip, email, outcome) {
    const req = { ip, body: { email } };
    const res = new EventEmitter();
    res.headers = {};
    res.statusCode = 200;
    res.set = (k, v) => { res.headers[k] = v; return res; };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    let passed = false;
    loginLimiter(req, res, () => { passed = true; });
    if (passed) { res.statusCode = outcome; res.emit('finish'); }
    return { blocked: !passed, res };
}

test('blocks one IP+email after MAX_FAILS wrong passwords, with Retry-After', () => {
    for (let i = 0; i < MAX_FAILS; i++) assert.equal(attempt('10.0.0.1', 'a@x.rs', 401).blocked, false);
    const r = attempt('10.0.0.1', 'a@x.rs', 401);
    assert.equal(r.blocked, true);
    assert.equal(r.res.statusCode, 429);
    assert.ok(Number(r.res.headers['Retry-After']) > 0);
});

test('another IP is not affected by that block', () => {
    assert.equal(attempt('10.0.0.2', 'a@x.rs', 401).blocked, false);
});

test('a successful login clears the IP+email counter', () => {
    for (let i = 0; i < MAX_FAILS - 1; i++) attempt('10.0.0.3', 'b@x.rs', 401);
    attempt('10.0.0.3', 'b@x.rs', 200);
    for (let i = 0; i < MAX_FAILS - 1; i++) assert.equal(attempt('10.0.0.3', 'b@x.rs', 401).blocked, false);
});

test('one IP guessing many different emails is stopped by the per-IP cap', () => {
    for (let i = 0; i < IP_MAX_FAILS; i++) assert.equal(attempt('10.0.0.4', `u${i}@x.rs`, 401).blocked, false);
    const r = attempt('10.0.0.4', 'fresh@x.rs', 401);
    assert.equal(r.blocked, true);
    assert.equal(r.res.statusCode, 429);
});

test('a successful login does not reset the per-IP cap', () => {
    for (let i = 0; i < IP_MAX_FAILS - 1; i++) attempt('10.0.0.5', `v${i}@x.rs`, 401);
    attempt('10.0.0.5', 'mine@x.rs', 200);
    attempt('10.0.0.5', 'w@x.rs', 401); // reaches the cap
    assert.equal(attempt('10.0.0.5', 'z@x.rs', 401).blocked, true);
});
