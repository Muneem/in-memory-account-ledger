import { performance } from 'node:perf_hooks';
import { Ledger } from '../src/ledger.ts';
import { ACCOUNTS } from '../src/scenario.ts';

// Optional review probe, not a regression test or production capacity claim.
// Run: node --expose-gc scripts/benchmark-scale.ts
if (!global.gc) {
  process.stderr.write('Run this probe with node --expose-gc scripts/benchmark-scale.ts\n');
  process.exit(1);
}
const collectGarbage = global.gc;
const trials = 7;
const counts = [10, 1000];
function run(count: number) {
  const events = Array.from({ length: count }, (_, index) => ({ id: `scale-${index}`,
    accountId: 'ACC-001', currency: 'AED', type: 'CREDIT', amount: '1.00', bookedDay: 6, valueDate: 6 } as const));
  collectGarbage();
  const start = performance.now();
  const ledger = new Ledger(ACCOUNTS);
  for (const event of events) ledger.ingest(event);
  ledger.finish();
  return { milliseconds: performance.now() - start, entries: ledger.entries.length,
    decisions: ledger.decisions.length, final: ledger.balance('ACC-001', 6).toString() };
}
for (const count of counts) run(count);
const results = counts.map(count => {
  const samples = Array.from({ length: trials }, () => run(count));
  const times = samples.map(sample => sample.milliseconds).sort((a, b) => a - b);
  return { count, medianMs: times[Math.floor(trials / 2)], samples, completed: true };
});
process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), node: process.version,
  platform: process.platform, architecture: process.arch, trials, warmupsPerSize: 1,
  workload: 'Unique AED 1.00 credits on booked/value Day 6; two accounts, six-day horizon; event construction, GC and report serialization outside timing; constructor + ingest + finish timed',
  results }, null, 2) + '\n');
