# Work log

Times are real UTC wall-clock times recorded during implementation. Commits are
made as each stage is completed; no dates or development history are fabricated.

- 2026-10-07T00:44:35Z — Inspected the supplied screenshot and empty project mirror;
  verified Node.js 25.3.0 and authenticated GitHub access. Chose an isolated
  repository so synced reference files remain untouched. Identified ambiguous
  retroactive fees, interest restatement, and E10 arriving after E9.
- Initial scaffold — TypeScript, the built-in Node test runner, pinned development
  dependencies, no runtime dependencies, and no web/UI/database layer.

- 2026-10-07T00:46:57.737Z — Implemented integer minor-unit money, half-away rounding, conserved installments, and largest-remainder interest allocation. Type checking and all four money tests passed.

- 2026-10-07T00:49:49.081Z — Implemented append-only postings and decisions, authorization projections, final settlements, principal reversals, retroactive daily fees, immutable close snapshots, and final interest. All 23 tests and type checking passed. Manual derivation agrees: fees AED 75.00; final AED 390.92 / BHD 10.008. Retain assessed fees on principal reversal; reject unspecified BHD overdrafts rather than invent FX. During review, restricted reversal matching to principal entries so source IDs cannot collide with fee references.

- 2026-10-07T00:52:55.624Z — Added text/JSON replay reports, a checked-in transcript, CLI integration tests, and a genuinely failing annotated BHD-overdraft counterexample. Added a verifier that requires that exact failure, plus a two-version CI workflow. Full verification passed: 26 passing tests, expected counterexample confirmed, strict type check and JavaScript build. Executed compiled CLI successfully.

- 2026-10-07T00:54:41.877Z — Completed README, NUMBERS, AMBIGUITIES (22 decisions), and REJECTED (all eight claims plus abandoned approaches). Explicitly distinguished policy-dependent fee retention from the append-only invariant. Reused the window constant in reports. Full verification passed again after this code edit; generated output matches the committed transcript, and diff whitespace checks pass. Confirmed the intended GitHub repository name is available.

- 2026-10-07T00:59:08.689Z — Published all five implementation-stage commits, without squashing, to https://github.com/Muneem/in-memory-account-ledger. GitHub CI run 37554437928 passed on Node 22.18.0 and Node 24, including clean dependency installation, 26 passing tests, the exact expected counterexample, type checking, build, compiled replay, and transcript comparison. Verified anonymous HTTP 200 and opened the repository in a new Chrome Incognito window: Public label, file list, README, commit history, and Sign in link were visible without authentication. Closed only the temporary incognito window afterward. This final documentation commit records those completed checks; no accounting code changes.
