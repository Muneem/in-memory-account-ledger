import type { Currency } from './money.ts';

export interface Account {
  readonly id: string;
  readonly currency: Currency;
  readonly openingBalance: string;
}

interface EventBase {
  readonly id: string;
  readonly bookedDay: number;
  readonly valueDate: number;
  readonly accountId: string;
  readonly currency: Currency;
}

export type LedgerEvent = EventBase & (
  | { readonly type: 'CREDIT'; readonly amount: string; readonly installments?: number }
  | { readonly type: 'DEBIT'; readonly amount: string }
  | { readonly type: 'AUTHORIZATION' | 'SETTLEMENT'; readonly amount: string; readonly authorizationId: string }
  | { readonly type: 'REVERSAL'; readonly reverses: string }
);

export type EntryKind = 'CREDIT' | 'DEBIT' | 'SETTLEMENT' | 'REVERSAL' | 'OVERDRAFT_FEE' | 'INTEREST';

export interface Entry {
  readonly id: string;
  readonly kind: EntryKind;
  readonly accountId: string;
  readonly currency: Currency;
  readonly amount: bigint;
  readonly bookedDay: number;
  readonly recordedDay: number;
  readonly valueDate: number;
  readonly sourceId: string;
  readonly reversesEntryId?: string;
  readonly assessmentDay?: number;
}

export interface Decision {
  readonly sequence: number;
  readonly event: LedgerEvent;
  readonly recordedDay: number;
  readonly status: 'ACCEPTED' | 'REJECTED';
  readonly code: string;
  readonly message: string;
}

export interface Authorization {
  readonly id: string;
  readonly accountId: string;
  readonly currency: Currency;
  readonly amount: bigint;
  readonly remaining: bigint;
  readonly status: 'ACTIVE' | 'SETTLED' | 'REJECTED';
}

export interface AccountClose {
  readonly accountId: string;
  readonly currency: Currency;
  readonly ledgerBalance: bigint;
  readonly activeHolds: bigint;
  readonly availableBalance: bigint;
}

export interface DaySnapshot {
  readonly day: number;
  readonly sequence: number;
  readonly accounts: readonly AccountClose[];
  readonly feesRecorded: readonly Entry[];
  readonly authorizations: readonly Authorization[];
  readonly errors: readonly Decision[];
}

export interface InterestDay {
  readonly day: number;
  readonly closingBase: bigint;
  readonly rawNumerator: bigint;
  readonly rawDenominator: bigint;
  readonly allocated: bigint;
}

export interface InterestResult {
  readonly accountId: string;
  readonly currency: Currency;
  readonly days: readonly InterestDay[];
  readonly total: bigint;
}
