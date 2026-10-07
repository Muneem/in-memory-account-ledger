import { formatMoney } from './money.ts';
import type { Ledger } from './ledger.ts';

export function createReport(ledger: Ledger) {
  if (!ledger.finalized) throw new Error('Finish the replay before generating the report');
  return {
    window: { firstDay: 1, lastDay: 6 },
    conventions: {
      amounts: 'Decimal currency strings, not floating-point numbers',
      daily: 'Immutable snapshots as known at each close; Day 6 includes capitalization',
      restated: 'Value-date balances after all events, including late E10; Day 6 includes capitalization',
      fees: 'Assessment day is the value date; recordedDay is the later discovery day when applicable',
      interest: 'Final restated positive balances after fees, before capitalization; largest-remainder allocation',
    },
    events: ledger.decisions,
    daily: ledger.snapshots.map(snapshot => ({
      day: snapshot.day, afterSequence: snapshot.sequence,
      accounts: snapshot.accounts.map(account => ({ accountId: account.accountId, currency: account.currency,
        closingBalance: formatMoney(account.ledgerBalance, account.currency),
        activeHolds: formatMoney(account.activeHolds, account.currency),
        availableBalance: formatMoney(account.availableBalance, account.currency) })),
      feesRecorded: snapshot.feesRecorded.map(entry => ({ accountId: entry.accountId, currency: entry.currency,
        amount: formatMoney(-entry.amount, entry.currency), assessmentDay: entry.assessmentDay, recordedDay: entry.recordedDay })),
      authorizations: snapshot.authorizations.map(auth => ({ ...auth,
        amount: formatMoney(auth.amount, auth.currency), remaining: formatMoney(auth.remaining, auth.currency) })),
      errors: snapshot.errors.map(error => ({ eventId: error.event.id, code: error.code, message: error.message })),
    })),
    restated: Array.from({ length: 6 }, (_, index) => ({ day: index + 1,
      accounts: ledger.accounts.map(account => ({ accountId: account.id, currency: account.currency,
        closingBalance: formatMoney(ledger.balance(account.id, index + 1), account.currency) })) })),
    interest: ledger.interest.map(result => ({ accountId: result.accountId, currency: result.currency,
      total: formatMoney(result.total, result.currency),
      days: result.days.map(day => ({ day: day.day, closingBase: formatMoney(day.closingBase, result.currency),
        rawMinorUnitsNumerator: String(day.rawNumerator), rawMinorUnitsDenominator: String(day.rawDenominator),
        allocated: formatMoney(day.allocated, result.currency) })) })),
    journal: ledger.entries.map(entry => ({ ...entry, amount: formatMoney(entry.amount, entry.currency) })),
  };
}

export function renderText(ledger: Ledger): string {
  const report = createReport(ledger);
  const lines = [
    'IN-MEMORY ACCOUNT LEDGER — DAYS 1–6',
    'Source order: ' + report.events.map(decision => decision.event.id).join(' → '),
    'Daily closes preserve what was known then. Day 6 includes interest.',
    'Late E10 retains booked/value Day 5 and is received on Day 6 after E9.',
    '',
  ];
  for (const day of report.daily) {
    lines.push(`DAY ${day.day} (after event sequence ${day.afterSequence})`);
    for (const account of day.accounts) {
      lines.push(`  ${account.accountId} ${account.currency} | closing ${account.closingBalance} | holds ${account.activeHolds} | available ${account.availableBalance}`);
    }
    lines.push('  Fees recorded: ' + (day.feesRecorded.map(fee => `${fee.accountId} ${fee.currency} ${fee.amount} for Day ${fee.assessmentDay}`).join('; ') || 'none'));
    lines.push('  Authorizations: ' + (day.authorizations.map(auth => `${auth.accountId}/${auth.id} ${auth.status} (remaining ${auth.currency} ${auth.remaining})`).join('; ') || 'none'));
    lines.push('  Errors: ' + (day.errors.map(error => `${error.eventId} ${error.code}: ${error.message}`).join('; ') || 'none'), '');
  }
  lines.push('FINAL RESTATED CLOSING BALANCES (after all events)');
  for (const day of report.restated) {
    lines.push(`  Day ${day.day}: ` + day.accounts.map(account => `${account.accountId} ${account.currency} ${account.closingBalance}`).join(' | '));
  }
  lines.push('', 'RECONCILED DAILY INTEREST (pre-capitalization bases)');
  for (const interest of report.interest) {
    lines.push(`  ${interest.accountId} ${interest.currency}: ` + interest.days.map(day => `D${day.day} ${day.allocated}`).join(' + ') + ` = ${interest.total}`);
  }
  lines.push('', 'APPEND-ONLY POSTING JOURNAL');
  for (const entry of report.journal) {
    lines.push(`  ${entry.id} | ${entry.kind} | ${entry.accountId} ${entry.currency} ${entry.amount} | booked D${entry.bookedDay} | recorded D${entry.recordedDay} | value D${entry.valueDate}`);
  }
  lines.push('', 'EVENT DECISIONS');
  for (const decision of report.events) {
    lines.push(`  ${decision.event.id} ${decision.status} ${decision.code} (booked D${decision.event.bookedDay}, recorded D${decision.recordedDay})`);
  }
  return lines.join('\n') + '\n';
}
