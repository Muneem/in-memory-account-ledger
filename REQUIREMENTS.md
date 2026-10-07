# Assignment transcription

Source: user-supplied screenshot, “1. In-Memory Account Ledger Core”. Formatting
has been normalized; no source image or unrelated project material is published.

Build an in-memory account ledger core in any language. No web layer,
persistence, UI, or database. A runnable test suite or script replays the stream
and prints, per day, closing balances, fee assessments, authorization states,
and errors. Window: Day 1 through Day 6.

Accounts: ACC-001 / AED / 0.00; ACC-002 / BHD / 0.000.

Rules:

- AED 25.00 overdraft fee once per account per day if that day's closing ledger
  balance (all entries with value date <= that day) is negative. Fee value date
  equals the assessed day.
- Daily interest 0.04% on positive closing ledger balances only. Capitalize as
  one credit at end of Day 6. Rounded daily accruals must sum to that total.
- AED precision 2, BHD precision 3. Store and round each amount to its currency.
- Append-only ledger: no event record is mutated or deleted.
- Approve authorization only if ledger balance minus active holds stays >= 0
  after applying the new hold.

Replay in this order:

| ID | Booked day | Event | Account | Amount / reference | Value day |
| --- | --- | --- | --- | --- | --- |
| E1 | 1 | CREDIT | ACC-001 | AED 1,200.00 | 1 |
| E2 | 1 | DEBIT | ACC-001 | AED 950.00 | 1 |
| E3 | 2 | AUTHORIZATION | ACC-001 | Auth-A / AED 200.00 | 2 |
| E4 | 3 | CREDIT | ACC-001 | AED 400.00 | 3 |
| E5 | 4 | SETTLEMENT | ACC-001 | Auth-A / AED 185.00 | 4 |
| E6 | 4 | SETTLEMENT | ACC-001 | Auth-Z / AED 180.00 (unknown auth) | 4 |
| E7 | 5 | DEBIT | ACC-001 | AED 620.00 | 2 |
| E8 | 5 | AUTHORIZATION | ACC-001 | Auth-B / AED 90.00 | 5 |
| E9 | 6 | REVERSAL | ACC-001 | Reverses E7 | 2 |
| E10 | 5 | CREDIT | ACC-002 | BHD 10.000 in three equal installments | 5 |

Auth-B is never settled in the window.

Acceptance claims (some deliberately wrong; evaluate in REJECTED.md):

1. Day 2 closing balance evaluated at end of Day 5 before any fee is AED -370.00.
2. E7 causes exactly one overdraft fee, on Day 2.
3. Day 4 settlement of Auth-A must be accepted.
4. Unknown authorization settlements must be rejected without funds leaving.
5. Auth-B is approved and affects available balance only.
6. After E9, all balances and fees return to pre-E7 values.
7. The three installments must each be BHD 3.334.
8. Discard any remainder if rounded daily interest does not equal capitalization.

Deliver one publicly readable GitHub repository with intact, unsquashed commit
history; README.md; NUMBERS.md (every chosen constant and why not half it);
AMBIGUITIES.md (every ambiguity found and its resolution); REJECTED.md (refused
criteria and abandoned approaches); one annotated failing test against your
own design; and a real timestamped WORKLOG.md. Verify access without signing in.
