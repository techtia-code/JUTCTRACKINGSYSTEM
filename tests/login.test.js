import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginEmail } from '../JS/login.js';

test('the requested admin username maps only to the dedicated demonstration identity', () => {
  assert.equal(loginEmail(' JUTCAdmin2026 '), 'jutcadmin2026@example.invalid');
  assert.equal(loginEmail('jutcadmin2026'), 'jutcadmin2026@example.invalid');
  assert.equal(loginEmail(' member@example.com '), 'member@example.com');
});
