import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Ledger } from '../src/ledger.ts';
import { createReport, renderText } from '../src/report.ts';
import { ACCOUNTS, replay } from '../src/scenario.ts';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

test('structured report contains decimal strings, all days, decisions, fees, and exact interest fractions', () => {
  const report = createReport(replay());
  assert.doesNotThrow(() => JSON.stringify(report));
  assert.equal(report.daily.length, 6);
  assert.equal(report.events.length, 10);
  assert.equal(report.daily[5]!.accounts[0]!.closingBalance, '390.92');
  assert.equal(report.daily[5]!.accounts[1]!.closingBalance, '10.008');
  assert.equal(report.interest[0]!.days[3]!.rawMinorUnitsNumerator, '41500');
  assert.equal(report.interest[0]!.days[3]!.rawMinorUnitsDenominator, '2500');
  assert.equal(report.daily[4]!.feesRecorded.length, 3);
  assert.throws(() => createReport(new Ledger(ACCOUNTS)), /Finish/);
});

test('text output is deterministic and provides daily balances, states, errors, and reconciled interest', () => {
  const text = renderText(replay());
  assert.equal(text, renderText(replay()));
  for (const expected of ['DAY 1', 'DAY 6', 'closing -230.00', 'UNKNOWN_AUTHORIZATION',
    'Auth-B REJECTED', 'FINAL RESTATED', 'D6 0.15 = 0.92', 'D6 0.004 = 0.008']) {
    assert.ok(text.includes(expected), expected);
  }
});

test('CLI supports text, JSON, help, and rejects unknown arguments', () => {
  const json = spawnSync(process.execPath, [cli, '--json'], { encoding: 'utf8' });
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).daily[5].accounts[0].closingBalance, '390.92');
  const text = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /DAY 6/);
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
  const unknown = spawnSync(process.execPath, [cli, '--unknown'], { encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown arguments/);
});
