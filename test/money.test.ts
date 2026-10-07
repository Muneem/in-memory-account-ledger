import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateInterest, formatMoney, parseMoney, roundRatio, splitMoney } from '../src/money.ts';

test('decimal arithmetic preserves precision, signs, ties, and values beyond Number safety', () => {
  assert.equal(parseMoney('1200.005', 'AED'), 120001n);
  assert.equal(parseMoney('-1.005', 'AED'), -101n);
  assert.equal(parseMoney('3.3335', 'BHD'), 3334n);
  assert.equal(parseMoney('0.0049', 'AED'), 0n);
  assert.equal(formatMoney(parseMoney('9007199254740993.123', 'BHD'), 'BHD'), '9007199254740993.123');
  assert.equal(formatMoney(-1n, 'AED'), '-0.01');
  assert.equal(roundRatio(-5n, 2n), -3n);
  for (const invalid of ['1e3', '1,000', 'NaN', ' 1', '1.', '.5', '']) {
    assert.throws(() => parseMoney(invalid, 'AED'));
  }
});

test('three BHD installments conserve 10.000 with the earliest receiving the residual', () => {
  assert.deepEqual(splitMoney(10000n, 3), [3334n, 3333n, 3333n]);
  assert.throws(() => splitMoney(2n, 3));
  assert.throws(() => splitMoney(10n, 0));
  assert.throws(() => splitMoney(10n, 1.5));
});

test('interest rounds the aggregate then allocates residuals, with stable ties', () => {
  assert.deepEqual(allocateInterest([25000n, 22500n, 62500n, 41500n, 39000n, 39000n]),
    [10n, 9n, 25n, 17n, 16n, 15n]);
  assert.deepEqual(allocateInterest([1250n, 1250n, 1250n]), [1n, 1n, 0n]);
  assert.deepEqual(allocateInterest([0n, 0n]), [0n, 0n]);
  assert.throws(() => allocateInterest([-1n]));
});

test('allocation conservation holds across both currency precisions and rounding boundaries', () => {
  for (let total = 3n; total <= 10000n; total += 37n) {
    const parts = splitMoney(total, 3);
    assert.equal(parts.reduce((sum, part) => sum + part, 0n), total);
    assert.ok(parts[0]! - parts[2]! <= 1n);
    const bases = [total, total * 2n, total * 3n, 0n, total * 5n, total * 6n];
    const allocation = allocateInterest(bases);
    assert.equal(allocation.reduce((sum, part) => sum + part, 0n),
      roundRatio(bases.reduce((sum, part) => sum + part, 0n), 2500n));
  }
});
