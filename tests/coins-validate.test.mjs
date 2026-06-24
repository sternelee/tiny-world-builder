// tests/coins-validate.test.mjs
// EC1: the pure amount-validation gate every coin credit/debit/transfer passes through.
// The atomic DB behaviour (advisory lock, idempotency, balance >= 0) is covered by the
// live-DB rollback smoke test + integration plan, not unit tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCoinAmount, MAX_COIN_AMOUNT } from '../netlify/functions/lib/coins.mjs';

test('accepts positive integers within range', () => {
  assert.equal(validateCoinAmount(1), 1);
  assert.equal(validateCoinAmount(500), 500);
  assert.equal(validateCoinAmount(MAX_COIN_AMOUNT), MAX_COIN_AMOUNT);
});

test('rejects zero, negative, and over-cap amounts', () => {
  assert.equal(validateCoinAmount(0), null);
  assert.equal(validateCoinAmount(-5), null);
  assert.equal(validateCoinAmount(MAX_COIN_AMOUNT + 1), null);
});

test('rejects non-integers and junk', () => {
  assert.equal(validateCoinAmount(1.5), null);
  assert.equal(validateCoinAmount('10'), 10); // numeric string coerces to a valid integer
  assert.equal(validateCoinAmount('abc'), null);
  assert.equal(validateCoinAmount(null), null);
  assert.equal(validateCoinAmount(undefined), null);
  assert.equal(validateCoinAmount(NaN), null);
  assert.equal(validateCoinAmount(Infinity), null);
});
