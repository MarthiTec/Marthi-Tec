import assert from 'node:assert/strict';
import { test } from 'node:test';
import { looksLikeImei, normalizeScanPayload } from './scanCode';

test('normalizeScanPayload extracts 15-digit IMEI from noise', () => {
  const n = normalizeScanPayload('IMEI: 356938035643809 OK');
  assert.equal(n.kind, 'imei');
  assert.equal(n.code, '356938035643809');
});

test('normalizeScanPayload reads imei query and JSON', () => {
  assert.equal(normalizeScanPayload('https://x/?imei=356938035643809').code, '356938035643809');
  assert.equal(normalizeScanPayload(JSON.stringify({ imei: '356938035643809' })).code, '356938035643809');
});

test('normalizeScanPayload keeps EAN-13', () => {
  const n = normalizeScanPayload('7891234567890');
  assert.equal(n.kind, 'ean');
  assert.equal(n.code, '7891234567890');
});

test('looksLikeImei accepts known-good Luhn sample', () => {
  assert.equal(looksLikeImei('356938035643809'), true);
  assert.equal(looksLikeImei('123'), false);
});
