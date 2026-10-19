import assert from 'node:assert/strict';
import { test } from 'node:test';

/** Garante formato de requestId usado na idempotência da venda externa mobile. */
test('mobile sale requestId is stable length and unique-ish', () => {
  const mk = () => {
    const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return `mob-${Date.now().toString(36)}-${rand}`.slice(0, 80);
  };
  const a = mk();
  const b = mk();
  assert.ok(a.length >= 16 && a.length <= 80);
  assert.ok(a.startsWith('mob-'));
  assert.notEqual(a, b);
});
