import assert from 'node:assert/strict';
import test from 'node:test';
import { Ledger } from '../src/ledger.ts';
import { ACCOUNTS } from '../src/scenario.ts';

// This is an intentionally failing test AGAINST OUR DESIGN, not one of the
// deliberately wrong acceptance claims. The assignment permits two currencies,
// but specifies an overdraft fee in AED only. We fail closed for BHD overdrafts.
// That protects currency integrity, but prevents a legitimate principal debit.
// The limitation is real: a general-purpose ledger needs a configured BHD fee,
// an explicit FX policy, or a separate fee payable before it can accept this.
// Run directly with `npm run test:known-limit` to see the actual failure.
// It is not skipped, marked TODO, inverted into assert.throws, or hidden in CI.
test('KNOWN_LIMIT_BHD_OVERDRAFT_POLICY: a legitimate BHD overdraft should be representable', () => {
  const ledger = new Ledger(ACCOUNTS);
  const decision = ledger.ingest({ id: 'BHD-OVERDRAFT', type: 'DEBIT', accountId: 'ACC-002',
    currency: 'BHD', amount: '1.000', bookedDay: 1, valueDate: 1 });

  // Desired broader behavior. Actual: REJECTED / UNSPECIFIED_BHD_OVERDRAFT_FEE.
  // Supporting this requires resolving the missing policy, not weakening the
  // assertion or treating AED 25.00 as BHD 25.000 without authorization.
  assert.equal(decision.status, 'ACCEPTED', 'KNOWN_LIMIT_BHD_OVERDRAFT_POLICY');
});
