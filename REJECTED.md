# Acceptance criteria reviewed

The screenshot explicitly requires challenging incorrect criteria. Correct
claims are retained. Claims dependent on unspecified policy are marked as such.

## 1. Day 2 before-fee balance evaluated at end of Day 5 is AED −370.00

**Accepted.** At that knowledge cutoff E7 is present and E9 is absent:

```text
E1  +1,200.00
E2    −950.00
E7    −620.00  (value Day 2)
      -------
      −370.00
```

E4 has value Day 3 and E5 has value Day 4, so neither belongs in Day 2. Holds
do not affect ledger balance. Exclude every fee for this explicitly pre-fee view.

## 2. E7 causes exactly one fee, on Day 2

**Rejected.** Closing principal balances at the end-of-Day-5 knowledge cutoff:

| Effective day | Before any fees | After fees assessed through that day |
| --- | ---: | ---: |
| 1 | 250.00 | 250.00 |
| 2 | -370.00 | -395.00 |
| 3 | 30.00 | 5.00 |
| 4 | -155.00 | -205.00 |
| 5 | -155.00 | -230.00 |

Days 2, 4, and 5 are negative closes, so the selected retrospective-assessment
policy produces three fees totaling AED 75.00. Day 3 stays positive after the
Day 2 fee. The assessment is once per account/day, not once per triggering debit.

## 3. Day 4 settlement of Auth-A must be accepted

**Accepted.** Auth-A was approved at E3 for 200.00. E5 settles 185.00, within
the active hold. It debits 185.00 and releases the full hold, including 15.00
unused. The later backdated debit does not rewrite the earlier decision.

## 4. A settlement referencing an unknown authorization must be rejected

**Accepted.** E6 names Auth-Z, which does not exist on ACC-001. The decision is
`UNKNOWN_AUTHORIZATION`; no debit or other financial posting is created.

## 5. Auth-B is approved and reduces available balance but not ledger balance

**Approval rejected; the general hold mechanic accepted.** Before any fee,
current ledger balance after E7 is 1,200 − 950 + 400 − 185 − 620 = −155.00.
It is −205.00 after catching up closed-day fees and −230.00 at Day 5 close.
There is no active Auth-A remainder. In every interpretation here, subtracting
a further 90.00 cannot leave available balance nonnegative. E8 is rejected and
creates no hold. A valid approved hold does reduce available balance only.

## 6. E9 restores all balances and fees to their pre-E7 values

**Rejected as a required oracle under our declared policy.** E9 reverses only
the named AED 620.00 principal debit. The three assessed fees remain, so the
current balance is 465.00 − 75.00 = 390.00 before interest, not 465.00.
The original debit, reversal, fees, and decisions remain in the audit trail.

This criterion is also **under-specified**, not mathematically impossible:
append-only fee-refund credits could restore monetary balances under a different
policy. The assignment supplies no fee-refund event or automatic-refund rule.
We retain fees and document that choice instead of claiming append-only forbids
refunds. Interest is then recomputed using the retained fees.

## 7. Three installments must each be BHD 3.334

**Rejected.** 3 × 3.334 = 10.002, which creates BHD 0.002. Three exactly equal
representable thirds of 10.000 do not exist. Allocate 3.334, 3.333, 3.333:
the total is exactly 10.000 and parts differ by at most one minor unit.

## 8. Discard an interest remainder if rounded daily accruals differ from the total

**Rejected.** This directly contradicts exact reconciliation. Final restated
AED bases are 250, 225, 625, 415, 390, 390. Exact daily interest is:

```text
0.100 + 0.090 + 0.250 + 0.166 + 0.156 + 0.156 = 0.918
Aggregate rounded to AED precision: 0.92
Independently rounded daily values: 0.10 + 0.09 + 0.25 + 0.17 + 0.16 + 0.16 = 0.93
Conserved allocation:               0.10 + 0.09 + 0.25 + 0.17 + 0.16 + 0.15 = 0.92
```

Floor each exact daily value, then allocate the two residual fils to the largest
remainders, breaking ties by earliest day. This retains the rounded aggregate
and records every unit. BHD interest is 0.004 on each of Days 5 and 6: 0.008 total.

## Approaches abandoned during implementation

- **Matching reversal postings on source ID alone.** The first implementation
  did this. Review identified a collision with generated fee references such as
  `assessment:1`. Before the core commit, matching was restricted to CREDIT and
  DEBIT posting kinds. A regression test reverses a three-part credit using
  that source ID and proves the fee is retained.
- **Offline dependency installation.** Attempted against the available npm
  cache; package metadata was incomplete. Switched to a real install of pinned
  development dependencies and committed the resulting lockfile.

The following alternatives were considered at design time, not claimed as
implemented-and-removed code:

- Sorting E10 before E9 would violate the explicit input sequence.
- Binary floating point would risk precision loss and rounding drift.
- Example-only arithmetic testing would miss residual cases. The money tests
  included conservation and boundary checks from their first committed version;
  this was a testing strategy choice, not an abandoned implementation.
- Mutating original entries or deleting E7 would destroy the required history.
- Independently rounding daily interest would produce 0.93 against a 0.92 total.
- Posting three rounded-up thirds would create money.
- Inventing an AED/BHD rate would hide missing policy; the failing test instead
  exposes the cost of our fail-closed choice.
- React, an API, or database would violate the requested scope.

## Counterexample against our own design

The required [annotated test](examples/known-limit.test.ts) asks for acceptance
of a legitimate BHD overdraft. Our implementation rejects it because no BHD fee
or FX policy exists. It is a deliberate, reproducible limitation of our own
design, separate from refusing the screenshot's incorrect criteria.
