# Ambiguities and chosen resolutions

The screenshot is not a complete accounting contract. These are explicit
implementation policies, not claims that one interpretation is uniquely correct.
The test suite locks them down so a reviewer can reproduce the result.

## 1. Source order conflicts with calendar order

E9 is booked on Day 6; the following E10 is booked on Day 5. “Replay in this
order” takes precedence over sorting. Record sequence is E1…E10. The processing
clock never moves backward. E10 has bookedDay=5, valueDate=5, recordedDay=6.
Do not finalize Day 6 before the entire stream has been received.

## 2. What is “the Day 2 closing balance” after a late event?

There are two valid views: the close observed on Day 2, and the Day 2 value-date
balance restated using information received later. The API's `balance` computes
the latter from currently known entries; `snapshots` preserves the former.
Reports print both. The pre-fee acceptance query explicitly excludes every fee
posting, rather than silently mixing principal and retained fees.

## 3. Does a Day 5 backdated debit create fees for earlier days?

Yes. On acceptance of new principal postings, scan previously closed effective
days in increasing order, append any missing negative-close fee, and include it
when evaluating later days. The current day is assessed only when it closes.
This avoids an intraday overdraft automatically creating a current-day fee.
Reassessing all prior days is cheap in a six-day window and avoids invalidation
bugs. A fee is unique per account and assessment day, not per triggering event.

## 4. Does “value_date equal to the day assessed” mean discovery day?

We interpret **assessment day** as the day whose closing balance is being
assessed. Its fee has that same value date. A retroactive assessment can be
recorded/booked later: Day 2 and Day 4 fees are discovered on Day 5 but valued
on Days 2 and 4. Fields expose both dates. The alternative interpretation would
value every retroactive fee on its discovery day and change historical interest.
The wording does not resolve this; this choice is declared rather than hidden.

## 5. Can fees cause later fees, and can a fee trigger itself?

Earlier fees are ledger entries, so they affect subsequent balances. Scan
chronologically to propagate them. Check a day's balance before appending its
own fee; a zero or positive day cannot create an initial fee. A day that already
has a fee cannot be charged a second one. Exactly zero earns no interest and
incurs no fee.

## 6. Does reversing E7 also refund its consequential fees?

No. E9 names E7, so it reverses E7's principal only, using a compensating entry.
Already-assessed fees remain until an explicit fee-refund policy/event exists.
This is a policy choice: append-only accounting WOULD permit separate fee-refund
credits. Append-only alone is not an argument against refunds. The specification
does not say to generate those credits, so we do not. The resulting balance is
465.00 − 75.00 = 390.00 before interest.

## 7. Are prior interest accruals frozen or restated?

Use final value-date balances across all six days, including E9, E10, and retained
fees. Before capitalization there are no interest postings to mutate: daily
accruals are an exact rational projection. At finalization, retain the frozen
daily calculation and post a single total credit per account. Daily snapshots
remain historical observations; they are not the final interest bases.
Freezing the initially observed accruals would produce a different total.

## 8. Does Day 6 interest earn interest on itself?

No. Calculate all daily bases before appending that account's capitalized
interest. Accrual is simple interest, with no intra-window compounding. Holds
do not reduce the interest base because the rule names closing ledger balance.

## 9. How are rounding and residuals handled?

Parse decimal strings and round input amounts to currency precision, half away
from zero. Sum exact rational daily interest, round the total with the same
rule, then distribute minor units by largest fractional remainder. Ties go to
earlier days. This may differ from independently rounding each daily amount;
the exact conservation requirement takes precedence. Nothing is discarded.

## 10. How can three installments of BHD 10.000 be equal?

They cannot be exactly equal at three decimal places. Make them as equal as
representable, conserving the total: 3.334, 3.333, 3.333. Put the residual minor
unit in the first installment for deterministic behavior. All share E10's value
date, as specified. Reject a count that cannot give each part one minor unit.

## 11. Does the AED 25.00 fee apply to the BHD account, and at what rate?

The assignment gives neither a BHD fee nor an FX rate, conversion date, or
cross-currency fee account. Never book 25.00 AED as 25.000 BHD. Fail atomically
with `UNSPECIFIED_BHD_OVERDRAFT_FEE` when a proposed BHD principal posting would
make any already-observed effective day negative. This conservative rule is a
real limitation, exposed by the required annotated failing test. Accepting such
debits requires an additional policy decision. The supplied BHD flow stays
positive, so its required calculations are fully supported.

## 12. Can authorizations be retroactively re-decided?

No. Evaluate a hold against currently known ledger balance minus active holds
at reception time. At E3, Auth-A is approved with 50.00 available afterward.
Backdating E7 does not retroactively invalidate that approval or its settlement.
At E8, Auth-B is rejected; E9 does not later approve it automatically.
For late authorizations, the same reception-time rule applies.

## 13. What happens to the unused part of Auth-A?

Treat E5 as one final settlement of 185.00 against the 200.00 hold. Debit 185.00,
consume the authorization, and release the unused 15.00. The alternative of
leaving a 15.00 active remainder would need an explicit partial-settlement flag.
Over-limit, repeat, rejected, and cross-account settlements are rejected.
An accepted hold promises settlement within its remaining amount; it does not
undergo a new available-balance approval check at settlement.

## 14. Does an unsettled hold expire at the window end?

No expiry rule is supplied. Active holds stay active after `finish()`. Auth-B
is a recorded rejected authorization with zero remaining amount, so “never
settled” does not imply an active Day 6 hold.

## 15. What does “append-only” include?

Original source event payloads, acceptance/rejection decisions, financial
postings, and daily snapshots are copied/frozen and never mutated or deleted.
Derived authorization maps are rebuilt from decisions. Reversals append linked
opposite postings. Rejected events remain in decision history without financial
postings. Duplicate submissions append a rejection, never repeat the debit.
Opening balances are account definitions, not invented source events.

## 16. Which events may be reversed?

Only an accepted credit or debit on the same account, once, preserving its
original value date. An installment credit reverses every part atomically.
Authorization, settlement, fee, and interest reversal semantics are unspecified
and are rejected by this principal-reversal interface. Source/derived IDs have
separate posting prefixes; reversal matching also filters to principal kinds.

## 17. What if events or account definitions are malformed?

Validate unique nonempty event/account IDs, existing account, matching currency,
integer dates in the window, value date no later than booked day, positive
rounded amounts, and valid installment counts. Amounts must be plain decimal
strings (no floating-point JSON numbers, exponent notation, separators, or
whitespace). Event rejections have stable codes; invalid account definitions
throw before ledger creation. A structurally invalid event does not advance
the clock. A validly dated event rejected by a business rule may advance it.

## 18. How are identities and rejected authorizations reused?

Event IDs are globally unique across all received decisions, including rejected
ones. Authorization IDs are scoped to accounts and cannot be reused once an
approval or insufficient-funds rejection has been recorded. A corrected attempt
must have a new identity. This avoids confusing a rejected hold with an active
one and makes replay deterministic.

## 19. When is a day closed, and can the window be reopened?

A new event with a later booked day closes all intervening days before its own
processing. `finish()` closes the remaining days and capitalizes once. Repeated
finish calls are idempotent. After finalization, further ingestion throws; a
caller must start a new replay. The task is a fixed-window batch, with no ongoing
period-reopening or durability contract.

## 20. Does “one failing test” mean a permanently broken normal suite?

Keep the required annotated counterexample runnable separately, genuinely
failing with exit code 1. The regular suite stays useful for regression checks.
CI separately asserts that the counterexample still fails for exactly its named
assertion, not for a syntax error. No skipped tests or TODO markers conceal it.

## 21. What is a daily error report and a zero interest credit?

Errors belong to their reception/recorded day; accepted events have no error.
Each daily snapshot lists all authorization states known at that close. One
capitalization record per account is emitted even if its calculated total is
zero, providing a uniform audit marker without changing money.

## 22. Are performance, concurrency, persistence, and UI expected?

No. The screenshot explicitly excludes a UI and persistence. Use one process,
integer arithmetic, and straightforward scans, with a CLI and tests. No network
calls or filesystem reads/writes occur inside the core. Runtime dependencies,
fees for infrastructure, scalability settings, and arbitrary timeouts are absent.
