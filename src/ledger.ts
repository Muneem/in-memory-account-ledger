import { allocateInterest, INTEREST_DENOMINATOR, parseMoney, splitMoney } from './money.ts';
import type { Account, AccountClose, Authorization, DaySnapshot, Decision, Entry, InterestResult, LedgerEvent } from './types.ts';

export const WINDOW_DAYS = 6;
export const AED_OVERDRAFT_FEE = 2500n;

class Rejection extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

function reject(code: string, message: string): never { throw new Rejection(code, message); }
function validDay(day: number): boolean { return Number.isInteger(day) && day >= 1 && day <= WINDOW_DAYS; }

/** Source events and postings are immutable. All balances/holds are projections. */
export class Ledger {
  readonly #accounts: readonly Account[];
  readonly #entries: Entry[] = [];
  readonly #decisions: Decision[] = [];
  readonly #snapshots: DaySnapshot[] = [];
  readonly #interest: InterestResult[] = [];
  #currentDay = 1;
  #closedThrough = 0;
  #finalized = false;

  constructor(accounts: readonly Account[]) {
    if (accounts.length === 0) throw new Error('At least one account is required');
    const ids = new Set<string>();
    this.#accounts = Object.freeze(accounts.map(account => {
      if (!account.id || ids.has(account.id)) throw new Error('Account IDs must be nonempty and unique');
      if (account.currency !== 'AED' && account.currency !== 'BHD') throw new Error('Unsupported currency');
      const opening = parseMoney(account.openingBalance, account.currency);
      if (account.currency === 'BHD' && opening < 0n) throw new Error('No BHD overdraft fee policy supplied');
      ids.add(account.id);
      return Object.freeze({ ...account });
    }));
  }

  get accounts(): readonly Account[] { return this.#accounts; }
  get entries(): readonly Entry[] { return Object.freeze([...this.#entries]); }
  get decisions(): readonly Decision[] { return Object.freeze([...this.#decisions]); }
  get snapshots(): readonly DaySnapshot[] { return Object.freeze([...this.#snapshots]); }
  get interest(): readonly InterestResult[] { return Object.freeze([...this.#interest]); }
  get finalized(): boolean { return this.#finalized; }

  #account(id: string): Account {
    const account = this.#accounts.find(item => item.id === id);
    if (!account) reject('UNKNOWN_ACCOUNT', `Unknown account ${id}`);
    return account;
  }

  balance(accountId: string, day: number, options: { excludeFees?: boolean; excludeInterest?: boolean } = {}): bigint {
    if (!validDay(day)) throw new Error('Day must be an integer in the six-day window');
    const account = this.#account(accountId);
    return this.#entries.reduce((balance, entry) =>
      entry.accountId === accountId && entry.valueDate <= day &&
      !(options.excludeFees && entry.kind === 'OVERDRAFT_FEE') &&
      !(options.excludeInterest && entry.kind === 'INTEREST') ? balance + entry.amount : balance,
    parseMoney(account.openingBalance, account.currency));
  }

  authorizations(): readonly Authorization[] {
    const projected = new Map<string, Authorization>();
    for (const decision of this.#decisions) {
      const event = decision.event;
      const key = event.accountId + '\u0000' + ('authorizationId' in event ? event.authorizationId : '');
      if (event.type === 'AUTHORIZATION' &&
          (decision.status === 'ACCEPTED' || decision.code === 'INSUFFICIENT_AVAILABLE_BALANCE')) {
        const amount = parseMoney(event.amount, event.currency);
        projected.set(key, Object.freeze({ id: event.authorizationId, accountId: event.accountId,
          currency: event.currency, amount, remaining: decision.status === 'ACCEPTED' ? amount : 0n,
          status: decision.status === 'ACCEPTED' ? 'ACTIVE' : 'REJECTED' }));
      } else if (event.type === 'SETTLEMENT' && decision.status === 'ACCEPTED') {
        const previous = projected.get(key)!;
        projected.set(key, Object.freeze({ ...previous, remaining: 0n, status: 'SETTLED' }));
      }
    }
    return Object.freeze([...projected.values()]);
  }

  activeHolds(accountId: string): bigint {
    this.#account(accountId);
    return this.authorizations().filter(auth => auth.accountId === accountId)
      .reduce((total, auth) => total + auth.remaining, 0n);
  }

  availableBalance(accountId: string): bigint {
    return this.balance(accountId, this.#currentDay) - this.activeHolds(accountId);
  }

  ingest(input: LedgerEvent): Decision {
    if (this.#finalized) throw new Error('Window already finalized; start a new replay for additional events');
    const event = Object.freeze({ ...input });
    try {
      this.#validate(event);
      // Calendar time advances, but the source stream is never sorted by booked day.
      while (this.#currentDay < event.bookedDay) {
        this.#close(this.#currentDay);
        this.#currentDay += 1;
      }
      const postings = this.#postings(event);
      this.#guardBhdOverdraft(event, postings);
      for (const posting of postings) this.#append(posting);
      const result = this.#record(event, 'ACCEPTED', 'OK', 'Accepted');
      // A late posting can alter already-closed days. Catch up in value-date order.
      this.#assessThrough(this.#closedThrough);
      return result;
    } catch (error) {
      if (!(error instanceof Rejection)) throw error;
      return this.#record(event, 'REJECTED', error.code, error.message);
    }
  }

  #validate(event: LedgerEvent): void {
    if (typeof event.id !== 'string' || !event.id.trim()) reject('INVALID_EVENT_ID', 'Event ID is required');
    if (this.#decisions.some(item => item.event.id === event.id)) reject('DUPLICATE_EVENT_ID', `Event ID ${event.id} already recorded`);
    const account = this.#account(event.accountId);
    if (event.currency !== account.currency) reject('CURRENCY_MISMATCH', 'Event and account currencies must match');
    if (!validDay(event.bookedDay) || !validDay(event.valueDate) || event.valueDate > event.bookedDay) {
      reject('INVALID_DATE', 'Dates must be in Days 1–6 and value date cannot exceed booked day');
    }
    if (!['CREDIT', 'DEBIT', 'AUTHORIZATION', 'SETTLEMENT', 'REVERSAL'].includes(event.type)) {
      reject('UNKNOWN_EVENT_TYPE', 'Unsupported event type');
    }
    if ('authorizationId' in event && !event.authorizationId?.trim()) reject('INVALID_AUTHORIZATION_ID', 'Authorization ID is required');
  }

  #positiveAmount(event: Exclude<LedgerEvent, { type: 'REVERSAL' }>): bigint {
    let amount: bigint;
    try { amount = parseMoney(event.amount, event.currency); }
    catch { return reject('INVALID_AMOUNT', 'Amount must be plain decimal text'); }
    if (amount <= 0n) reject('INVALID_AMOUNT', 'Amount must round to at least one positive minor unit');
    return amount;
  }

  #postings(event: LedgerEvent): readonly Entry[] {
    const base = { accountId: event.accountId, currency: event.currency, bookedDay: event.bookedDay,
      recordedDay: this.#currentDay, valueDate: event.valueDate, sourceId: event.id };
    if (event.type === 'REVERSAL') {
      const target = this.#decisions.find(item => item.event.id === event.reverses && item.status === 'ACCEPTED');
      if (!target) reject('UNKNOWN_REVERSAL_TARGET', `No accepted event ${event.reverses}`);
      if (target.event.accountId !== event.accountId) reject('CROSS_ACCOUNT_REVERSAL', 'Reversal must use the original account');
      if (target.event.type !== 'CREDIT' && target.event.type !== 'DEBIT') {
        reject('UNSUPPORTED_REVERSAL', 'Only principal credits and debits may be reversed');
      }
      if (event.valueDate !== target.event.valueDate) reject('REVERSAL_DATE_MISMATCH', 'Reversal must preserve the original value date');
      if (this.#decisions.some(item => item.status === 'ACCEPTED' && item.event.type === 'REVERSAL' && item.event.reverses === event.reverses)) {
        reject('ALREADY_REVERSED', 'Event has already been reversed');
      }
      return this.#entries.filter(entry => entry.sourceId === event.reverses &&
        (entry.kind === 'CREDIT' || entry.kind === 'DEBIT')).map((original, index) => ({
        ...base, id: `event:${event.id}:${index + 1}`, kind: 'REVERSAL', amount: -original.amount,
        reversesEntryId: original.id,
      }));
    }
    const amount = this.#positiveAmount(event);
    if (event.type === 'AUTHORIZATION') {
      if (this.authorizations().some(auth => auth.accountId === event.accountId && auth.id === event.authorizationId)) {
        reject('DUPLICATE_AUTHORIZATION_ID', 'Authorization ID has already been used on this account');
      }
      if (this.availableBalance(event.accountId) - amount < 0n) {
        reject('INSUFFICIENT_AVAILABLE_BALANCE', 'Ledger balance minus active holds cannot cover this authorization');
      }
      return [];
    }
    if (event.type === 'SETTLEMENT') {
      const auth = this.authorizations().find(auth => auth.accountId === event.accountId && auth.id === event.authorizationId);
      if (!auth) reject('UNKNOWN_AUTHORIZATION', `No authorization ${event.authorizationId} on this account`);
      if (auth.status !== 'ACTIVE') reject('AUTHORIZATION_NOT_ACTIVE', 'Authorization is rejected or already settled');
      if (amount > auth.remaining) reject('SETTLEMENT_EXCEEDS_HOLD', 'Settlement cannot exceed the authorized hold');
      // A single final settlement consumes the hold and releases any unused amount.
      return [{ ...base, id: `event:${event.id}:1`, kind: 'SETTLEMENT', amount: -amount }];
    }
    if (event.type === 'CREDIT') {
      let amounts: readonly bigint[];
      try { amounts = splitMoney(amount, event.installments ?? 1); }
      catch { return reject('INVALID_INSTALLMENTS', 'Installment count must be positive and each part at least one minor unit'); }
      return amounts.map((part, index) => ({ ...base, id: `event:${event.id}:${index + 1}`, kind: 'CREDIT', amount: part }));
    }
    return [{ ...base, id: `event:${event.id}:1`, kind: 'DEBIT', amount: -amount }];
  }

  #guardBhdOverdraft(event: LedgerEvent, postings: readonly Entry[]): void {
    if (event.currency !== 'BHD' || postings.length === 0) return;
    for (let day = 1; day <= this.#currentDay; day++) {
      const delta = postings.filter(entry => entry.valueDate <= day).reduce((sum, entry) => sum + entry.amount, 0n);
      if (this.balance(event.accountId, day) + delta < 0n) {
        reject('UNSPECIFIED_BHD_OVERDRAFT_FEE', 'BHD overdraft requires a supplied fee or FX policy; no currency conversion is invented');
      }
    }
  }

  #append(entry: Entry): void { this.#entries.push(Object.freeze({ ...entry })); }

  #record(event: LedgerEvent, status: Decision['status'], code: string, message: string): Decision {
    const decision = Object.freeze({ sequence: this.#decisions.length + 1, event,
      recordedDay: this.#currentDay, status, code, message });
    this.#decisions.push(decision);
    return decision;
  }

  #assessThrough(through: number): void {
    for (let day = 1; day <= through; day++) {
      for (const account of this.#accounts) {
        if (this.balance(account.id, day) >= 0n) continue;
        if (this.#entries.some(entry => entry.accountId === account.id && entry.assessmentDay === day)) continue;
        // Non-AED negative balances are rejected atomically before they can reach close.
        if (account.currency !== 'AED') throw new Error('Invariant: unsupported currency overdraft reached fee assessment');
        this.#append({ id: `fee:${account.id}:${day}`, kind: 'OVERDRAFT_FEE', accountId: account.id,
          currency: account.currency, amount: -AED_OVERDRAFT_FEE, bookedDay: this.#currentDay,
          recordedDay: this.#currentDay, valueDate: day, sourceId: `assessment:${day}`, assessmentDay: day });
      }
    }
  }

  #snapshot(day: number): void {
    const accounts: AccountClose[] = this.#accounts.map(account => {
      const ledgerBalance = this.balance(account.id, day);
      const activeHolds = this.activeHolds(account.id);
      return Object.freeze({ accountId: account.id, currency: account.currency,
        ledgerBalance, activeHolds, availableBalance: ledgerBalance - activeHolds });
    });
    this.#snapshots.push(Object.freeze({ day, sequence: this.#decisions.length,
      accounts: Object.freeze(accounts),
      feesRecorded: Object.freeze(this.#entries.filter(entry => entry.kind === 'OVERDRAFT_FEE' && entry.recordedDay === day)),
      authorizations: this.authorizations(),
      errors: Object.freeze(this.#decisions.filter(item => item.recordedDay === day && item.status === 'REJECTED')) }));
  }

  #close(day: number): void {
    this.#assessThrough(day);
    this.#snapshot(day);
    this.#closedThrough = day;
  }

  /** Idempotent; capitalization occurs only after the full E1..E10 stream. */
  finish(): this {
    if (this.#finalized) return this;
    while (this.#currentDay < WINDOW_DAYS) {
      this.#close(this.#currentDay);
      this.#currentDay += 1;
    }
    this.#assessThrough(WINDOW_DAYS);
    for (const account of this.#accounts) {
      const bases = Array.from({ length: WINDOW_DAYS }, (_, index) =>
        this.balance(account.id, index + 1, { excludeInterest: true }));
      const numerators = bases.map(base => base > 0n ? base : 0n);
      const allocated = allocateInterest(numerators);
      const total = allocated.reduce((sum, amount) => sum + amount, 0n);
      this.#interest.push(Object.freeze({ accountId: account.id, currency: account.currency, total,
        days: Object.freeze(bases.map((closingBase, index) => Object.freeze({ day: index + 1, closingBase,
          rawNumerator: numerators[index]!, rawDenominator: INTEREST_DENOMINATOR, allocated: allocated[index]! }))) }));
      this.#append({ id: `interest:${account.id}`, kind: 'INTEREST', accountId: account.id,
        currency: account.currency, amount: total, bookedDay: WINDOW_DAYS, recordedDay: WINDOW_DAYS,
        valueDate: WINDOW_DAYS, sourceId: 'capitalization' });
    }
    this.#snapshot(WINDOW_DAYS);
    this.#closedThrough = WINDOW_DAYS;
    this.#finalized = true;
    return this;
  }
}
