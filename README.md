# In-memory account ledger

A Node.js / TypeScript implementation of the supplied six-day ledger assignment.
It replays **E1 through E10 in the supplied order**, keeps immutable source
decisions and postings, and prints daily balances, fees, authorization states,
and errors. No UI, HTTP server, database, persistence layer, or runtime dependency.

The assignment contains contradictions and under-specified accounting policy.
The implementation's explicit choices are in [AMBIGUITIES.md](AMBIGUITIES.md);
the eight acceptance claims are evaluated in [REJECTED.md](REJECTED.md).

## Run

Requires **Node.js 22.18.0 or newer** and npm. The minimum version supports
[native TypeScript execution](https://nodejs.org/api/typescript.html); a separate
type check is included because executing TypeScript does not type-check it.

```sh
npm ci
npm run replay
npm run verify
```

The replay also works without installing development dependencies:

```sh
node src/cli.ts
node src/cli.ts --json
```

`npm run verify` runs strict type checking, the 26 passing tests, a verifier for
the required intentional failure, and a JavaScript build. CI exercises Node
22.18.0 and Node 24, executes the compiled CLI, and compares replay output with
the committed [example transcript](examples/replay.txt).

Other commands:

```sh
npm test                     # Ordinary passing suite
npm run typecheck
npm run build
node dist/src/cli.js          # Compiled JavaScript, same output
npm run replay:json           # Full structured report
npm run test:known-limit      # Deliberately exits 1; see below
npm run check:known-limit     # Requires the documented failure; exits 0
```

To redirect machine-readable JSON without npm's script banners:

```sh
node src/cli.ts --json > /tmp/ledger-report.json
```

Expected business rejections E6 and E8 appear in the report and do not make the
replay command fail. Unknown CLI arguments exit with status 1.

## Expected result

Under the documented **retroactive assessment / retained fee / restated interest**
policy, these are the immutable balances as known at each daily close:

| Day | ACC-001 AED | Active AED holds | ACC-002 BHD | New observations |
| --- | ---: | ---: | ---: | --- |
| 1 | 250.00 | 0.00 | 0.000 | E1 and E2 posted |
| 2 | 250.00 | 200.00 | 0.000 | Auth-A approved |
| 3 | 650.00 | 200.00 | 0.000 | E4 posted |
| 4 | 465.00 | 0.00 | 0.000 | Auth-A settled; Auth-Z rejected |
| 5 | -230.00 | 0.00 | 0.000 | Fees for Days 2, 4, 5; Auth-B rejected |
| 6 | **390.92** | 0.00 | **10.008** | E7 reversed; late E10 posted; interest credited |

E10 appears after E9 in the specified stream even though its booked day is 5.
It is recorded on Day 6, retaining booked/value Day 5. The Day 5 snapshot remains
unchanged; the separately printed **final restated** Day 5 BHD balance is 10.000.

- AED fees: **3 × 25.00 = 75.00**, assessed for Days 2, 4, and 5.
- AED interest: **0.92**, one Day 6 credit.
- BHD interest: **0.008**, one Day 6 credit.
- E10 installments: **3.334 + 3.333 + 3.333 = 10.000**.
- E6: `UNKNOWN_AUTHORIZATION`, no financial posting.
- E8: `INSUFFICIENT_AVAILABLE_BALANCE`, no active hold or financial posting.

## Reading the report

1. **Daily closes** preserve what was known when each day ended. They include
   closing ledger and available balances, active holds, fees discovered that
   day, all known authorization states, and errors received that day.
2. **Final restated balances** apply all received postings by value date,
   including reversals and late postings. Day 6 includes capitalized interest.
3. **Reconciled daily interest** uses final restated positive balances after
   fees but before interest capitalization. Allocation conserves the rounded
   aggregate exactly; no rounding remainder is discarded.
4. **Posting journal** shows signed monetary entries with booked, recorded, and
   value dates. A source credit with installments has several postings.
5. **Event decisions** contain all ten original events, including rejections.
   Sequence numbers show reception order independently of booked dates.

Amounts in JSON are decimal strings with currency precision. Exact interest
fractions use integer numerator/denominator strings **in minor units**; for
example `41500 / 2500` is 16.6 fils, or AED 0.166, before allocation.

## Design

`Ledger.ingest(event)` records one event and advances the close clock when a
later booked day arrives. New principal postings trigger a forward scan of
previously closed days to discover retroactive overdrafts. Daily fee keys prevent
repeat assessments. `finish()` closes the window, allocates interest, appends
one interest posting per account, and records Day 6. Repeating `finish()` is safe.

Money uses `bigint` minor units throughout. Decimal input is rounded half away
from zero. Interest uses the exact rational rate `1 / 2500`, rounded once at the
aggregate level; largest-remainder allocation reconciles daily amounts.

The only state changes to the audit history are array appends. Entries, event
decisions, snapshots, and nested core projection records are frozen. Serialized
report objects are detached output copies, not a protected audit store. Authorization status
is a fresh projection over decisions; changing a projection does not rewrite a
source event. A reversal adds inverse principal postings linked to the originals.

The core deliberately uses simple scans over a six-day stream. It is not a
concurrent service or production banking engine. All data disappears when the
process exits. The committed transcript is a static example, not persisted
ledger state.

## Required failing test and known limit

[examples/known-limit.test.ts](examples/known-limit.test.ts) is an annotated,
ordinary failing test against **this implementation's BHD overdraft policy**.
The assignment supplies an AED fee without defining conversion or a BHD fee.
The core rejects a BHD debit that would create a negative effective-day balance,
rather than inventing FX. Consequently, it cannot process all otherwise valid
BHD debits. The supplied E1–E10 stream does not encounter this limitation.

Run `npm run test:known-limit` to see the genuine assertion failure. It is not
skipped, marked TODO, or replaced by an assertion that expects an exception.
The normal suite enforces the documented conservative behavior; the separate
counterexample expresses the broader behavior we cannot currently support.
The CI verifier checks that exactly this one test fails for its named assertion,
so syntax/import errors cannot masquerade as the required counterexample.

Additional scope choices include no automatic fee refunds, no authorization
expiry, single final settlement per hold, and no new events after finalization.
See [AMBIGUITIES.md](AMBIGUITIES.md) for their rationale and alternatives.

## Repository map and review

| File | Purpose |
| --- | --- |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Normalized transcription of the screenshot |
| [NUMBERS.md](NUMBERS.md) | Numeric choices, units, alternatives, and derivations |
| [AMBIGUITIES.md](AMBIGUITIES.md) | Explicit accounting and ordering decisions |
| [REJECTED.md](REJECTED.md) | Acceptance-claim analysis and abandoned approaches |
| [WORKLOG.md](WORKLOG.md) | Real UTC implementation/verification history |
| [src/money.ts](src/money.ts) | Exact parsing, formatting, splitting, allocation |
| [src/ledger.ts](src/ledger.ts) | Ledger core and immutable audit history |
| [src/scenario.ts](src/scenario.ts) | The exact supplied events and accounts |
| [src/report.ts](src/report.ts) | Human and JSON reports |
| [test](test) | Behavioral, invariant, and CLI tests |
| [examples/replay.txt](examples/replay.txt) | Actual replay output |

Commits are chronological implementation stages, not a retrospectively created
or squashed history. Review with `git log --oneline --reverse`.

## Architecture and evaluation review

- [Architecture & Trade-offs PDF](output/pdf/architecture-and-tradeoffs.pdf)
  (four pages), with [editable Markdown](docs/ARCHITECTURE.md).
- [Part 1 evaluation review](docs/PART1_REVIEW.md): evidence against the supplied
  criteria, policy risks, limits of the tests, and unaided-defense preparation.
- [Scale-probe evidence](docs/evidence/scale-review.json). Reproduce with
  `node --expose-gc scripts/benchmark-scale.ts`; timings are machine-dependent.
