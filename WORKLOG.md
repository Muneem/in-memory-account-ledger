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
