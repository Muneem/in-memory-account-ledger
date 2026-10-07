import assert from 'node:assert/strict';
import test from 'node:test';
import { Ledger } from '../src/ledger.ts';
import { ACCOUNTS, EVENTS, replay } from '../src/scenario.ts';
import type { LedgerEvent } from '../src/types.ts';

function prefix(count: number): Ledger {
  const ledger = new Ledger(ACCOUNTS);
  for (const event of EVENTS.slice(0, count)) ledger.ingest(event);
  return ledger;
}

const aed = { accountId: 'ACC-001', currency: 'AED', bookedDay: 1, valueDate: 1 } as const;
function credit(id: string, amount: string): LedgerEvent { return { ...aed, id, type: 'CREDIT', amount }; }
function debit(id: string, amount: string): LedgerEvent { return { ...aed, id, type: 'DEBIT', amount }; }

test('full replay preserves E1..E10 order and reports the two expected rejections', () => {
  const ledger = replay();
  assert.deepEqual(ledger.decisions.map(result => result.event.id), EVENTS.map(event => event.id));
  assert.deepEqual(ledger.decisions.filter(result => result.status === 'REJECTED').map(result => [result.event.id, result.code]), [
    ['E6', 'UNKNOWN_AUTHORIZATION'], ['E8', 'INSUFFICIENT_AVAILABLE_BALANCE'],
  ]);
  assert.equal(ledger.balance('ACC-001', 6), 39092n);
  assert.equal(ledger.balance('ACC-002', 6), 10008n);
});

test('daily snapshots preserve the balances known at each close and Day 6 includes interest', () => {
  const ledger = replay();
  assert.deepEqual(ledger.snapshots.map(snapshot => snapshot.accounts.map(account => account.ledgerBalance)), [
    [25000n, 0n], [25000n, 0n], [65000n, 0n], [46500n, 0n], [-23000n, 0n], [39092n, 10008n],
  ]);
  assert.deepEqual(ledger.snapshots.map(snapshot => snapshot.accounts[0]!.activeHolds), [0n, 20000n, 20000n, 0n, 0n, 0n]);
  assert.deepEqual(ledger.snapshots.map(snapshot => snapshot.errors.map(error => error.event.id)), [[], [], [], ['E6'], ['E8'], []]);
});

test('backdated E7 produces -370.00 on Day 2 before fees and assessments for Days 2, 4, 5', () => {
  const ledger = prefix(8);
  assert.equal(ledger.balance('ACC-001', 2, { excludeFees: true }), -37000n);
  assert.equal(ledger.balance('ACC-001', 3, { excludeFees: true }), 3000n);
  assert.equal(ledger.balance('ACC-001', 4, { excludeFees: true }), -15500n);
  // E9 advances the clock, closes Day 5, then reverses principal only.
  ledger.ingest(EVENTS[8]!);
  assert.deepEqual(ledger.entries.filter(entry => entry.kind === 'OVERDRAFT_FEE').map(entry =>
    [entry.assessmentDay, entry.valueDate, entry.recordedDay, entry.amount]), [
    [2, 2, 5, -2500n], [4, 4, 5, -2500n], [5, 5, 5, -2500n],
  ]);
});

test('settlement consumes 185.00, releases the unused 15.00, and rejects the unknown Auth-Z atomically', () => {
  const ledger = prefix(4);
  assert.equal(ledger.availableBalance('ACC-001'), 45000n);
  ledger.ingest(EVENTS[4]!);
  assert.equal(ledger.balance('ACC-001', 4), 46500n);
  assert.equal(ledger.activeHolds('ACC-001'), 0n);
  assert.equal(ledger.authorizations()[0]!.status, 'SETTLED');
  const before = ledger.entries;
  ledger.ingest(EVENTS[5]!);
  assert.deepEqual(ledger.entries, before);
});

test('Auth-B is rejected without a hold or a debit; it is never retroactively approved', () => {
  const ledger = replay();
  assert.equal(ledger.authorizations().find(auth => auth.id === 'Auth-B')!.status, 'REJECTED');
  assert.equal(ledger.activeHolds('ACC-001'), 0n);
  assert.equal(ledger.entries.filter(entry => entry.sourceId === 'E8').length, 0);
});

test('E9 appends compensation, retains fees, and leaves every prior record unchanged', () => {
  const ledger = prefix(8);
  const entries = ledger.entries;
  const decisions = ledger.decisions;
  const snapshots = ledger.snapshots;
  ledger.ingest(EVENTS[8]!);
  assert.deepEqual(ledger.entries.slice(0, entries.length), entries);
  assert.deepEqual(ledger.decisions.slice(0, decisions.length), decisions);
  assert.deepEqual(ledger.snapshots.slice(0, snapshots.length), snapshots);
  assert.equal(ledger.balance('ACC-001', 6), 39000n);
  assert.equal(ledger.entries.find(entry => entry.sourceId === 'E7')!.amount, -62000n);
  assert.equal(ledger.entries.find(entry => entry.kind === 'REVERSAL')!.amount, 62000n);
  assert.equal(ledger.entries.find(entry => entry.kind === 'REVERSAL')!.reversesEntryId, 'event:E7:1');
});

test('late E10 keeps Day 5 booking/value dates but records after E9 on Day 6', () => {
  const ledger = replay();
  const parts = ledger.entries.filter(entry => entry.sourceId === 'E10');
  assert.deepEqual(parts.map(entry => entry.amount), [3334n, 3333n, 3333n]);
  assert.ok(parts.every(entry => entry.bookedDay === 5 && entry.valueDate === 5 && entry.recordedDay === 6));
  assert.equal(ledger.balance('ACC-002', 5), 10000n);
  assert.equal(ledger.snapshots[4]!.accounts[1]!.ledgerBalance, 0n);
});

test('interest uses restated balances, excludes its own credit, and conserves rounding', () => {
  const ledger = replay();
  assert.deepEqual(ledger.interest[0]!.days.map(day => day.closingBase), [25000n, 22500n, 62500n, 41500n, 39000n, 39000n]);
  assert.deepEqual(ledger.interest[0]!.days.map(day => day.allocated), [10n, 9n, 25n, 17n, 16n, 15n]);
  assert.deepEqual(ledger.interest[1]!.days.map(day => day.allocated), [0n, 0n, 0n, 0n, 4n, 4n]);
  for (const interest of ledger.interest) {
    assert.equal(interest.days.reduce((sum, day) => sum + day.allocated, 0n), interest.total);
    const credits = ledger.entries.filter(entry => entry.accountId === interest.accountId && entry.kind === 'INTEREST');
    assert.equal(credits.length, 1);
    assert.equal(credits[0]!.amount, interest.total);
    assert.equal(credits[0]!.valueDate, 6);
  }
});

test('fee assessment and capitalization are idempotent, including repeated finish', () => {
  const ledger = replay();
  const entries = ledger.entries;
  ledger.finish().finish();
  assert.deepEqual(ledger.entries, entries);
  assert.equal(ledger.snapshots.length, 6);
  assert.throws(() => ledger.ingest(credit('late', '1.00')), /already finalized/);
});

test('external consumers cannot mutate input records, postings, snapshots, or nested report rows', () => {
  const input = { ...aed, id: 'mutable', type: 'CREDIT' as const, amount: '10.00' };
  const ledger = new Ledger(ACCOUNTS);
  ledger.ingest(input);
  input.amount = '999.00';
  ledger.finish();
  assert.equal(ledger.decisions[0]!.event.type === 'CREDIT' && ledger.decisions[0]!.event.amount, '10.00');
  assert.equal(Reflect.set(ledger.entries[0]!, 'amount', 0n), false);
  assert.ok(Object.isFrozen(ledger.entries));
  assert.ok(Object.isFrozen(ledger.entries[0]));
  assert.ok(Object.isFrozen(ledger.snapshots[0]!.accounts[0]));
  assert.ok(Object.isFrozen(ledger.interest[0]!.days[0]));
  assert.equal(ledger.balance('ACC-001', 1), 1000n);
});

test('authorization at exactly zero available succeeds; another hold cannot overcommit', () => {
  const ledger = new Ledger(ACCOUNTS);
  ledger.ingest(credit('fund', '10.00'));
  const hold = { ...aed, id: 'hold', type: 'AUTHORIZATION', authorizationId: 'A', amount: '10.00' } as const;
  assert.equal(ledger.ingest(hold).status, 'ACCEPTED');
  assert.equal(ledger.availableBalance('ACC-001'), 0n);
  assert.equal(ledger.balance('ACC-001', 1), 1000n);
  assert.equal(ledger.ingest({ ...hold, id: 'hold2', authorizationId: 'B', amount: '0.01' }).status, 'REJECTED');
  ledger.finish();
  assert.equal(ledger.activeHolds('ACC-001'), 1000n); // No implicit end-of-window expiry.
});

test('settlement rejects reused/over-limit/rejected/cross-account authorizations without postings', () => {
  const ledger = prefix(3);
  const settlement = { ...EVENTS[4]!, id: 'over', amount: '200.01' } as LedgerEvent;
  assert.equal(ledger.ingest(settlement).code, 'SETTLEMENT_EXCEEDS_HOLD');
  assert.equal(ledger.activeHolds('ACC-001'), 20000n);
  ledger.ingest(EVENTS[4]!);
  assert.equal(ledger.ingest({ ...EVENTS[4]!, id: 'twice' }).code, 'AUTHORIZATION_NOT_ACTIVE');
  assert.equal(ledger.ingest({ ...EVENTS[4]!, id: 'cross', accountId: 'ACC-002', currency: 'BHD' }).code, 'UNKNOWN_AUTHORIZATION');
  const complete = prefix(8);
  assert.equal(complete.ingest({ ...EVENTS[4]!, id: 'rejected', bookedDay: 5, valueDate: 5, authorizationId: 'Auth-B' } as LedgerEvent).code, 'AUTHORIZATION_NOT_ACTIVE');
});

test('duplicate IDs, dates, malformed amounts, currencies, accounts, and installments are rejected', () => {
  const ledger = new Ledger(ACCOUNTS);
  ledger.ingest(credit('once', '10.00'));
  const invalid: [LedgerEvent, string][] = [
    [credit('once', '99.00'), 'DUPLICATE_EVENT_ID'],
    [{ ...credit('currency', '1.00'), currency: 'BHD' }, 'CURRENCY_MISMATCH'],
    [{ ...credit('account', '1.00'), accountId: 'missing' }, 'UNKNOWN_ACCOUNT'],
    [{ ...credit('day', '1.00'), bookedDay: 7 }, 'INVALID_DATE'],
    [{ ...credit('future', '1.00'), valueDate: 2 }, 'INVALID_DATE'],
    [credit('negative', '-1.00'), 'INVALID_AMOUNT'],
    [credit('nan', 'NaN'), 'INVALID_AMOUNT'],
    [credit('zero', '0.001'), 'INVALID_AMOUNT'],
    [{ ...aed, id: 'parts', type: 'CREDIT', amount: '0.01', installments: 3 }, 'INVALID_INSTALLMENTS'],
  ];
  for (const [event, code] of invalid) assert.equal(ledger.ingest(event).code, code);
  assert.equal(ledger.balance('ACC-001', 1), 1000n);
  assert.equal(ledger.entries.length, 1);
});

test('reversal cannot target unknown, already reversed, cross-account, or non-principal events', () => {
  const ledger = prefix(9);
  const reversal = EVENTS[8]!;
  assert.equal(ledger.ingest({ ...reversal, id: 'again' }).code, 'ALREADY_REVERSED');
  assert.equal(ledger.ingest({ ...reversal, id: 'missing', reverses: 'absent' } as LedgerEvent).code, 'UNKNOWN_REVERSAL_TARGET');
  assert.equal(ledger.ingest({ ...reversal, id: 'wrong-account', accountId: 'ACC-002', currency: 'BHD' }).code, 'CROSS_ACCOUNT_REVERSAL');
  assert.equal(ledger.ingest({ ...reversal, id: 'auth', reverses: 'E3' } as LedgerEvent).code, 'UNSUPPORTED_REVERSAL');
  const fresh = prefix(8);
  assert.equal(fresh.ingest({ ...reversal, id: 'wrong-date', valueDate: 3 }).code, 'REVERSAL_DATE_MISMATCH');
});

test('all installments reverse together and source IDs cannot accidentally reverse fee postings', () => {
  const ledger = new Ledger(ACCOUNTS);
  ledger.ingest(debit('debt', '100.00'));
  ledger.ingest({ ...credit('assessment:1', '10.00'), bookedDay: 2, valueDate: 2, installments: 3 } as LedgerEvent);
  const result = ledger.ingest({ ...aed, id: 'reverse-parts', type: 'REVERSAL', bookedDay: 2, valueDate: 2, reverses: 'assessment:1' });
  assert.equal(result.status, 'ACCEPTED');
  assert.deepEqual(ledger.entries.filter(entry => entry.kind === 'REVERSAL').map(entry => entry.amount), [-334n, -333n, -333n]);
  assert.equal(ledger.entries.filter(entry => entry.kind === 'OVERDRAFT_FEE').length, 1);
});

test('six negative closes produce six fees, no interest, and never duplicate a daily assessment', () => {
  const ledger = new Ledger(ACCOUNTS);
  ledger.ingest(debit('overdraft', '0.01'));
  ledger.finish();
  assert.equal(ledger.entries.filter(entry => entry.kind === 'OVERDRAFT_FEE').length, 6);
  assert.equal(ledger.interest[0]!.total, 0n);
  assert.equal(ledger.balance('ACC-001', 6), -15001n);
  const empty = new Ledger(ACCOUNTS).finish();
  assert.equal(empty.entries.filter(entry => entry.kind === 'OVERDRAFT_FEE').length, 0);
  assert.equal(empty.balance('ACC-001', 6), 0n);
});

test('fees on earlier days can cause later overdrafts, and the scan propagates them', () => {
  const ledger = new Ledger(ACCOUNTS);
  ledger.ingest(credit('opening', '20.00'));
  ledger.ingest({ ...credit('later', '10.00'), bookedDay: 2, valueDate: 2 });
  ledger.ingest({ ...debit('backdated', '25.00'), bookedDay: 3, valueDate: 1 });
  assert.deepEqual(ledger.entries.filter(entry => entry.kind === 'OVERDRAFT_FEE').map(entry => entry.assessmentDay), [1, 2]);
  assert.equal(ledger.balance('ACC-001', 2), -4500n);
});

test('BHD remains isolated and unspecified BHD overdrafts fail atomically with a clear error', () => {
  const ledger = new Ledger(ACCOUNTS);
  ledger.ingest(credit('aed', '100.00'));
  const before = ledger.entries;
  const result = ledger.ingest({ ...debit('bhd', '1.000'), accountId: 'ACC-002', currency: 'BHD' });
  assert.equal(result.code, 'UNSPECIFIED_BHD_OVERDRAFT_FEE');
  assert.deepEqual(ledger.entries, before);
});

test('account definitions and duplicate authorization identities are validated', () => {
  assert.throws(() => new Ledger([]));
  assert.throws(() => new Ledger([ACCOUNTS[0]!, ACCOUNTS[0]!]));
  assert.throws(() => new Ledger([{ ...ACCOUNTS[1]!, openingBalance: '-1.000' }]));
  const ledger = prefix(3);
  assert.equal(ledger.ingest({ ...EVENTS[2]!, id: 'duplicate-auth' }).code, 'DUPLICATE_AUTHORIZATION_ID');
  assert.throws(() => ledger.balance('ACC-001', 0));
});
