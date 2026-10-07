# Part 1 measured against the published evaluation criteria

Reviewed 7 October 2026 against implementation revision `e587cfc`. This is an
evidence-based self-review, not an invented interviewer score. The screenshot
provides no numerical weights or pass mark. Its strongest signal is the live,
unaided defense; code volume and visual polish do not substitute for that.

## Assessment

| Evaluation area | Assessment | Evidence and remaining exposure |
| --- | --- | --- |
| Correctness of the supplied replay and fee logic | Strong under the declared policy; not an unconditional proof | All 26 regression tests pass. An independent Decimal calculation reproduces fee days 2/4/5, AED interest 0.92, final AED 390.92 and BHD 10.008. Tests cover missing authorization, unavailable funds, append-only compensation, late input, rounding conservation and immutability. |
| Intellectual honesty | Substantial evidence, with wording corrected in this review | AMBIGUITIES explicitly distinguishes historical assessment day from discovery day, no-refund policy from append-only mechanics, and original closes from restated interest. REJECTED qualifies fee restoration as policy-dependent. This review moves a testing strategy choice out of the list of allegedly abandoned implementations and narrows README's immutability claim to actual core records. |
| Quality of trade-off reasoning | Now addressed directly in Part 2 | The architecture PDF names the actual scan bottlenecks, unbounded collections, cheapest improvement, UAE bank-error implications, absent authorization transitions and production obligations deferred. Proposed controls are not presented as implemented features. |
| Every number and decision explained precisely | Documented, but the candidate must own the explanation | NUMBERS gives units and derivations. Constants from the assignment are distinguished from selected rounding, fee/refund and lifecycle policies. Benchmark figures include their workload and limits. The documents do not establish whether the candidate can derive these without assistance. |
| Live defense without AI | Not assessable from repository artifacts | This work was AI-assisted. Preparation is not a substitute for being able to explain, calculate, change and critique it independently during the defense. Do not describe it as unaided work. |

## Findings that matter more than the test count

1. **The fee value-date interpretation is contestable.** The implementation
   takes “day assessed” to mean the effective historical day, with discovery on
   a later recording day. Reading it as discovery day produces different
   historical balances/interest. Show both meanings and defend the selected
   one; do not claim the screenshot resolves it conclusively.
2. **Retaining consequential fees is policy, not a consequence of append-only.**
   Compensating credits can refund fees without deleting history. The current
   reversal has no reason code. In a UAE consumer bank, a reversal correcting
   the institution's own error can require refunding direct costs; the toy
   policy cannot be promoted unchanged. See Part 2's official references.
3. **Interest is a final restatement.** The core does not persist a series of
   daily interest adjustments as events. It derives the final exact accrual
   schedule from the latest journal and records it at capitalization. Explain
   why that fits this batch and where a production statement/period engine
   needs versioned adjustments.
4. **BHD fail-closed behavior is a genuine restriction.** The annotated failing
   test demonstrates an intentionally unsupported valid use case, not a newly
   discovered accidental bug. That satisfies a counterexample to this design,
   but is weaker evidence of exploratory defect discovery. Say precisely what
   it demonstrates. Do not invent a bug-fix story.
5. **Duplicate posting prevention is not full network idempotency.** A repeated
   event gets a new rejection, not the original response; identity history also
   disappears at restart. The six-day CLI has no durable network contract.
6. **No active hold can end without settlement today.** An initial rejection
   never reserves funds; finish does not expire holds. Cancellation, expiry,
   administrative release and replacement in the architecture are proposals.
7. **The external boundary is intentionally incomplete.** For example, runtime
   authorization validation calls `.trim()` on a field assumed to be a string.
   A hostile non-string field can throw outside the domain-rejection path.
   TypeScript types are not runtime schema validation. This is a production
   risk, not a failure of the typed supplied fixture.
8. **Tests reflect selected policies.** They verify internal consistency, not
   regulatory approval or the assessor's preferred interpretation. The
   independent arithmetic check improves confidence but is not an independent
   full-engine implementation or a comprehensive property-based audit.

## Verification performed for this review

- Re-ran `npm run verify`: 26 ordinary tests pass, the named annotated
  counterexample fails as documented, type checking and JavaScript build pass.
- Cross-checked the scenario using separate Python Decimal arithmetic and
  compared it to the JSON replay output; no financial result changed.
- Reviewed source paths `#validate`, `#postings`, `#assessThrough`,
  `authorizations`, `#snapshot`, `finish`, and money allocation helpers.
- Measured 10 and 1,000 synthetic credits with fixed account/window dimensions;
  both completed. [Raw evidence](evidence/scale-review.json) and
  [reproducible benchmark](../scripts/benchmark-scale.ts) record the method.
  This is not a banking throughput or recovery benchmark.
- Preserved Part 1 accounting behavior; changes to existing Part 1 files are
  documentary corrections and links, not a silent policy rewrite.

## Unaided defense checklist

Practice these on paper and then locate the relevant code without assistance:

- Derive the pre-fee negative day and all three fee days, including why the
  intervening positive day does not get a fee.
- Separate ledger balance, reserved funds and available balance; show why the
  valid settlement releases an unused amount and why the later hold is refused.
- Explain why supplied order wins over booked-day sorting, and why the two
  daily reporting views legitimately differ.
- Derive the rational rate, aggregate rounding and daily residual allocation;
  show why independently rounded days differ from the rounded total.
- Demonstrate which exact objects are immutable, what is only a projection,
  and why crash durability is a separate property.
- Defend fee retention and historical fee dates as choices, then explain the
  changes if the reviewer selects another interpretation.
- Point to a real limitation without excusing it: the BHD policy, lifecycle,
  unsafe external boundary, retry semantics or unbounded history.
- Describe the minimal scale improvement, its added consistency burden and
  why it does not eliminate retention obligations.

Readiness is demonstrated by reproducing these explanations and handling a
changed assumption, not by memorizing the PDF or predicting an interviewer score.
