import { Ledger } from './ledger.ts';
import type { Account, LedgerEvent } from './types.ts';

export const ACCOUNTS: readonly Account[] = Object.freeze([
  Object.freeze({ id: 'ACC-001', currency: 'AED', openingBalance: '0.00' }),
  Object.freeze({ id: 'ACC-002', currency: 'BHD', openingBalance: '0.000' }),
]);

const aed = { accountId: 'ACC-001', currency: 'AED' } as const;
export const EVENTS: readonly LedgerEvent[] = Object.freeze([
  { ...aed, id: 'E1', bookedDay: 1, type: 'CREDIT', amount: '1200.00', valueDate: 1 },
  { ...aed, id: 'E2', bookedDay: 1, type: 'DEBIT', amount: '950.00', valueDate: 1 },
  { ...aed, id: 'E3', bookedDay: 2, type: 'AUTHORIZATION', authorizationId: 'Auth-A', amount: '200.00', valueDate: 2 },
  { ...aed, id: 'E4', bookedDay: 3, type: 'CREDIT', amount: '400.00', valueDate: 3 },
  { ...aed, id: 'E5', bookedDay: 4, type: 'SETTLEMENT', authorizationId: 'Auth-A', amount: '185.00', valueDate: 4 },
  { ...aed, id: 'E6', bookedDay: 4, type: 'SETTLEMENT', authorizationId: 'Auth-Z', amount: '180.00', valueDate: 4 },
  { ...aed, id: 'E7', bookedDay: 5, type: 'DEBIT', amount: '620.00', valueDate: 2 },
  { ...aed, id: 'E8', bookedDay: 5, type: 'AUTHORIZATION', authorizationId: 'Auth-B', amount: '90.00', valueDate: 5 },
  { ...aed, id: 'E9', bookedDay: 6, type: 'REVERSAL', reverses: 'E7', valueDate: 2 },
  { id: 'E10', accountId: 'ACC-002', currency: 'BHD', bookedDay: 5, type: 'CREDIT', amount: '10.000', installments: 3, valueDate: 5 },
].map(event => Object.freeze(event as LedgerEvent)));

export function replay(events: readonly LedgerEvent[] = EVENTS): Ledger {
  const ledger = new Ledger(ACCOUNTS);
  for (const event of events) ledger.ingest(event);
  return ledger.finish();
}
