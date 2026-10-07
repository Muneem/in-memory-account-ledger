# Numbers, units, and why these values

Financial arithmetic uses integer minor units (`bigint`). Numbers used as day
indexes, array lengths, or test metadata are ordinary integers. No principal,
fee, interest numerator, or rounded allocation uses binary floating point.

## Contract constants

| Value | Meaning / location | Why this value, not half? |
| --- | --- | --- |
| Days 1–6; `WINDOW_DAYS = 6` | Inclusive processing and interest window | Required. Three days omit the settlement, backdated debit, reversal, and capitalization. |
| AED precision 2 | `PRECISION.AED`; scale `10² = 100` | Required currency quantum is 0.01. One decimal or scale 50 would represent a different unit. |
| BHD precision 3 | `PRECISION.BHD`; scale `10³ = 1000` | Required quantum is 0.001. Half a precision digit is meaningless; scale 500 is wrong. |
| AED 25.00 / `2500n` minor units | `AED_OVERDRAFT_FEE` | Explicit charge. 12.50 changes the contract. No BHD fee is guessed. |
| 0.04% per day | Positive closing balance interest | Explicit rate. 0.02% would halve earned interest. |
| `1 / 2500` | Exact rational representation of 0.0004 | `0.04 / 100 = 1 / 2500`. Halving the denominator doubles the rate; halving the numerator halves it. |
| AED 0.00; BHD 0.000 | Opening balances | Explicit balances. Half of zero is still zero. |
| One fee per account/day | Assessment uniqueness | Required. Half a fee occurrence is not a valid record; charging half the amount is a different policy. |
| One interest credit per account at Day 6 | Capitalization | Required. Splitting it or using Day 3 changes the contract. A zero-total credit is retained as an audit marker. |
| Three installments | E10 split count | Required. 1.5 installments is not an integer operation. |
| Two accounts; ten source events | Supplied scenario | Both accounts and every event must be replayed. Halving either count drops required cases. |

## Supplied monetary event values

These are input data, not tuning parameters. Halving any changes the scenario
and all dependent results. Booked/value dates and authorization/event identifiers
are transcribed in [REQUIREMENTS.md](REQUIREMENTS.md) and [src/scenario.ts](src/scenario.ts).

| Event | Specified amount | Minor units | Half would be |
| --- | ---: | ---: | ---: |
| E1 credit | AED 1,200.00 | 120000 | AED 600.00 |
| E2 debit | AED 950.00 | 95000 | AED 475.00 |
| E3 Auth-A hold | AED 200.00 | 20000 | AED 100.00 |
| E4 credit | AED 400.00 | 40000 | AED 200.00 |
| E5 settlement | AED 185.00 | 18500 | AED 92.50 |
| E6 invalid settlement | AED 180.00 | 18000 | AED 90.00 |
| E7 debit | AED 620.00 | 62000 | AED 310.00 |
| E8 Auth-B hold attempt | AED 90.00 | 9000 | AED 45.00 |
| E9 reversal | AED 620.00, derived from E7 | 62000 | AED 310.00 would not reverse E7 |
| E10 credit | BHD 10.000 | 10000 | BHD 5.000 |

Event dates are labels in a six-day discrete calendar, not durations that can be
scaled: E7 is booked Day 5/value Day 2; E9 Day 6/value Day 2; E10 Day 5/value Day 5.
Changing them changes the exercise. Account and authorization IDs are opaque.

## Representation and allocation choices

| Constant / choice | Reason and alternative |
| --- | --- |
| Decimal radix 10; integer powers of 10 | Inputs and currency precision are decimal. Radix 5 cannot represent the required units the same way. |
| Zero lower bound for authorization availability | Explicit nonnegative rule; exactly zero succeeds. Zero is also the threshold for fees and interest. Half is unchanged. |
| One minor unit as smallest positive posting/installment | Smallest representable money value. Half a minor unit is not storable after currency rounding. |
| Digit 5 as rounding tie threshold | Half-away rounding at the first discarded decimal digit. Threshold 2.5 would systematically round values upward too early. |
| `2 × remainder >= denominator` | Exact integer half comparison for rational rounding. Dropping the factor 2 would compare to a whole unit instead. |
| Half away from zero | Predictable symmetric decimal input rule; ties could instead use half-even, but that is not specified. One consistent rule is documented and tested. |
| `+1n` or `−1n` residual adjustments | Move exactly one minor unit. A half-unit adjustment is unrepresentable. |
| Largest fractional remainder first | Minimizes allocation error while preserving rounded total. Earlier day wins an exact tie. This choice is deterministic; a reverse tie order would conserve money but change the daily schedule. |
| Earliest installment gets the residual | Stable, deterministic division: 3.334, 3.333, 3.333. Putting it last would also conserve money; making each 3.334 would not. |
| Index 0 / day and sequence start 1 | JavaScript arrays start at zero; source days/sequences are one-based. Offsets of 0.5 are invalid array/day identities. |
| No arbitrary epsilon | Integers/rationals need no tolerance. Half an epsilon is still unnecessary. |
| No maximum balance, exchange rate, expiry duration, retry, or timeout constant | The assignment supplies none; the core invents none. Values beyond JavaScript's safe integer range remain exact. |

`Number(residual)` is used only as a loop count in a six-element allocation. It
is bounded by the number of days, never a monetary balance. Parsing a discarded
decimal digit as a number is exact because it is an integer between 0 and 9.

## Derived accounting results (not hardcoded into the core)

| Quantity | Derivation |
| --- | --- |
| Day 1 AED 250.00 | 1,200.00 − 950.00 |
| E3 available AED 50.00 | 250.00 − 200.00 hold |
| Day 3 AED 650.00 | 250.00 + 400.00 |
| Pre-E7 AED 465.00 | 650.00 − 185.00 settlement |
| Released hold AED 15.00 | 200.00 − 185.00 |
| Day 2 before fees, after E7: −370.00 | 250.00 − 620.00 |
| Day 3 before fees, after E7: 30.00 | −370.00 + 400.00 |
| Day 4/5 before fees: −155.00 | 30.00 − 185.00 |
| Day 2 after fee: −395.00 | −370.00 − 25.00 |
| Day 3 after earlier fee: 5.00 | 30.00 − 25.00 |
| Day 4 after fees: −205.00 | −155.00 − 2 × 25.00 |
| Day 5 close: −230.00 | −155.00 − 3 × 25.00 |
| Total fees 75.00 | Days 2, 4, 5 × 25.00 |
| Day 6 before interest 390.00 | −230.00 + 620.00 reversal |
| Final restated AED bases | 250.00, 225.00, 625.00, 415.00, 390.00, 390.00 |
| Exact AED interest 0.918 | Sum of those bases, 2,295.00, divided by 2,500 |
| Rounded AED interest 0.92 | Aggregate half-away rounding to two decimals |
| Allocated daily AED interest | 0.10, 0.09, 0.25, 0.17, 0.16, 0.15 |
| BHD interest 0.008 | 10.000 × 0.0004 × two effective positive days |
| Final AED 390.92 | 390.00 + 0.92 |
| Final BHD 10.008 | 10.000 + 0.008 |

These values appear as independent expected results in tests/documentation.
Halving them would make the arithmetic assertions false, not make the core more
accurate. The core derives them from postings.

## Test and tooling numbers

- Node **22.18.0** is the minimum supported runtime for executing the `.ts`
  source without a transpiler or an experimental strip-types flag. CI also
  tests **24** for a second supported line. Halving a version is not a compatible
  substitute. Development validation used Node **25.3.0** on this machine.
- TypeScript **5.9.3** and `@types/node` **24.10.4** are pinned development-only
  tools in the lockfile. They support this configuration and built-in APIs.
  Semver components are identities, not magnitudes to halve. There are **zero**
  runtime dependencies.
- ECMAScript target **ES2022** provides supported modern JavaScript/private
  fields and BigInt. GitHub workflow actions use major **v4**, and run on **two**
  Node versions. One version would omit minimum-version compatibility coverage.
- Package version **1.0.0** identifies the first deliverable. Exit code **0**
  means success and **1** means invalid CLI use or an actual failing test.
  The expected-failure checker requires **one** test, **one** assertion failure,
  and **zero** passes, so an accidentally broadened test run cannot silently pass.
- The main suite currently has **26** tests. That count is descriptive, not
  enforced as a magic constant; correctness is enforced by their assertions.
- Conservation checks sample integer totals from **3** to **10,000** in steps
  of **37**. Three ensures three nonzero installments; 10,000 includes the scale
  of E10; 37 is a small prime stride that cycles residue classes rather than
  repeatedly hitting the same split/rounding boundary. Half the minimum creates
  invalid cases; half the upper bound or stride changes coverage, not policy.
- **9,007,199,254,740,993.123 BHD** tests beyond binary floating-point safe integer
  precision (integer part is 2⁵³+1). Halving loses that adversarial boundary.
- **1.005**, **−1.005**, **1,200.005**, **3.3335**, **0.0049**, and **0.001** probe
  exact ties, sign handling, and amounts below a currency unit. **1,250/2,500**
  tests an exact half minor unit. Halving would stop testing those boundaries.
- **200.01** tests settlement one fils above a 200.00 hold. **0.01** tests the
  smallest overdraft/overcommit. Day **0**, Day **7**, and installment count
  **1.5** are invalid boundary inputs. Halving changes the property exercised.
- Synthetic **10.00**, **20.00**, **25.00**, and **100.00** funding/debit cases
  isolate hold, fee-cascade, and installment-reversal behavior. They are small
  exact fixtures; they have no runtime-policy role. The **1.000 BHD** known-limit
  debit is the simplest readable overdraft counterexample; any positive
  overdraft would expose the same missing policy, including half this amount.
- Other expected test values (`1000n`, `−334n`, `−333n`, `−4500n`, `−15001n`,
  etc.) are exact consequences of those fixtures, not additional parameters.
  No test uses random seeds or timing thresholds.
