# Implementation state

## Current milestone

**Phase 7 — Documentation cleanup complete.** The supplied specification is preserved in `docs/SDD.md`. The implementation and its audit findings are documented against the current behavior.

## Completed work

- Made syntactically invalid edited TypeScript/TSX fail closed to the full 39-test catalogue with an explicit uncertainty warning.
- Canonicalized source edits before hashing and storage, so the same edit set produces the same analysis identity and selection regardless of request ordering.
- Added a random local-session token and localhost-origin enforcement to analysis, execution and result polling routes; tightened analysis request shapes as well as execution requests.
- Filtered runner environments to required tool/runtime variables so edited executable source does not inherit ambient passwords, tokens or credential-agent variables.
- Hardened execution inputs and reports: overlay path containment, safe catalogue files and stable titles, unique runner identities, duplicate/unrequested-result rejection, required measured durations, nonzero-exit handling and forced process termination after timeout grace.
- Corrected comparison math so a slower selected run displays a negative reduction instead of being silently clamped to zero.
- Tightened architecture tests to exact backend domain/application roots rather than substring matches.
- Reconciled README, architecture notes and state handoff with the implemented `/api/executions` API, local-session model, syntax fallback, runner report validation and trusted-user limitation.
- Added a compact guided-flow ribbon that makes the sequence visible: change source, calculate impact, inspect selection and execute real runners. Each step reflects the current in-memory analysis or execution state and links to the relevant view.
- Improved repository browsing with accessible expandable folders, modified-file markers and keyboard focus treatment.
- Added a graph legend for changed source, affected code, contract journeys, selected tests and double-bordered contract nodes.
- Made every reported contract boundary visible in the impact summary, so held and changed boundaries have equal prominence.
- Made the test catalogue reflect measured runner outcomes after selected or full execution, including passed and failed states, while retaining selection reasons.
- Refined the dark technical visual system with stronger hierarchy, restrained transitions, reduced-motion support and responsive reflow for narrower desktop/tablet widths.
- Preserved the Phase 3 explorer, immutable snapshots, real diff mapping and shared impact-engine selection.
- Added RUN SELECTED TESTS and RUN FULL SUITE to the TESTS view.
- Added a controlled execution API. Browser requests contain exactly `snapshotId`, `analysisId` and `mode`; extra fields such as commands are rejected.
- The server resolves the stored analysis and derives test IDs from the trusted 39-test catalogue. Browser input cannot choose files, test IDs, executables or command arguments.
- Each run copies the required workspace into a disposable OS temporary directory, applies only the already validated source replacements, installs from the pinned lockfile in offline mode, executes there, and removes the overlay afterward.
- Added near-live polling with queued, running, passed and failed states. Vitest results appear before Playwright finishes.
- Captured real test ID, type, status, per-test duration, run wall time and failure output from Vitest and Playwright JSON reporters.
- Added side-by-side selected/full comparison with selected count, full count, tests avoided, measured wall times and calculated time reduction.
- Stored raw runner reports and final execution summaries under ignored `.impact-runs/<execution-id>/` directories for audit.
- Added `pnpm test:execution` to physically verify selected and full browser-style runs against a real edited source overlay.

## Execution trust boundary

The API stores source edits only after the allowlist, snapshot, local-session and syntax validation. Starting an execution references that stored analysis. The server chooses either the engine's selected IDs or every catalogue ID, validates fixed runner/file/title metadata, and spawns argument arrays with `shell: false`.

Source overlays include application, packages, tests, scripts, impact evidence and pinned workspace configuration. Dependencies are linked from the local pnpm store with `--offline --frozen-lockfile --ignore-scripts`. Child environments contain only explicit runtime/tool paths. The original checkout is never edited. Each child process has a three-minute limit, runs in its own process group and receives a forced kill if graceful termination does not complete.

Runner failures remain results. A behavior-changing `User.authenticate` edit correctly produced 10 passing and 3 failing selected tests; the same three failures appeared among 39 full-suite results. Missing or malformed runner reports become explicit failed results rather than simulated passes or durations.

Edited source is still executable code. This is an intentionally loopback-only, trusted-user tool rather than an OS sandbox; the current user filesystem and network remain accessible. A public execution service requires a separately designed container/VM boundary.

## Audit conclusions

- `User` is the aggregate root: identity, normalized email, password hash and locked state remain inside the aggregate, and authentication behavior enforces the locked credential invariant.
- Dependency direction is hexagonal: the application depends on the domain-owned `UserRepository` port; the in-memory secondary adapter implements it; the composition root performs injection; domain/application imports are checked for type imports, re-exports, dynamic imports and aliases.
- The API contract is a first-class graph boundary. Unchanged contracts admit only contract/journey evidence, changed contracts expose reviewed implementation paths on both sides, and cross-side bypass edges fail graph validation.
- Selection is deterministic: inputs, edges, outputs and causal tie breaks are sorted; edit order is canonical; uncertainty selects the full catalogue. Suggested scenarios only edit source text and never provide test IDs.
- Selected and full modes execute the same stored source overlay. Test IDs, files, titles, commands and arguments are server-derived; statuses and durations come from Vitest/Playwright reports and runner wall clocks.

## Key modules

- `apps/demo/execution.ts`: overlay lifecycle, controlled Vitest/Playwright processes and report parsing.
- `apps/demo/server.ts`: analysis storage, strict execution requests, concurrency guard and job polling.
- `apps/demo/src/components/ExecutionPanel.tsx`: actions, progress, failures, output and comparison.
- `apps/demo/src/components/{ImpactGraph,ImpactSummary,RepositoryTree}.tsx`: graph legend, contract-boundary presentation and expandable repository navigation.
- `apps/demo/src/{App,styles}.tsx` / `.css`: guided workflow, catalogue result states, visual hierarchy and responsive behavior.
- `apps/demo/src/{App,types}.tsx` / `.ts`: execution orchestration and API contracts.
- `scripts/verify-demo-execution.ts`: physical selected/full verification.

## Validation

Environment: Node 26.5.1 inside the workspace sandbox and Node 24.19.0 for elevated HTTP/browser runs; pnpm 11.19.0. Chromium was read from `/private/tmp/test-impact-lab-browsers`.

- Phase 3 baseline `pnpm validate`: passed before changes.
- `pnpm build`: passes type checking, graph generation and production bundles.
- `pnpm test`: 59 passing Vitest cases across 17 files, including strict execution request behavior and server-derived test selection.
- `pnpm test:execution`: physically ran both modes in disposable overlays. Selected: 13 results, 10 passed / 3 failed, 17.3 s. Full: 39 results, 36 passed / 3 failed, 22.1 s. All tests had measured durations and the checkout remained unchanged.
- Browser verification: selected and full runs progressed through queued/running states; the final view showed 26 avoided tests, individual durations, the three expected failure traces, and a measured comparison. One observed browser run measured 22.38 s selected versus 26.81 s full, a 16.5% reduction.
- `pnpm validate`: passes the complete build, graph consistency, 59 Vitest cases and the unchanged real Chromium E2E baseline.
- Phase 5 browser review: confirmed the default code view exposes the guided flow, accessible expand/collapse controls, source editor and empty impact state without UI errors.
- Phase 5 final `pnpm validate`: passed production builds, 69 nodes / 84 evidenced graph edges, 59 Vitest cases and the Chromium E2E login journey.
- Phase 5 final `pnpm test:execution`: completed selected and full disposable overlays. Selected: 13 results, 10 passed / 3 failed, 19.4 s. Full: 39 results, 36 passed / 3 failed, 27.6 s. The same three intentional behavior-change failures occurred in both modes, and the checkout remained unchanged.
- Phase 6 targeted audit checks: impact-engine, architecture and demo API suites passed, including syntax fallback, canonical edit identity, session/origin enforcement, environment filtering and safe catalogue metadata.
- Phase 6 final `pnpm validate`: passed production builds, 69 nodes / 84 evidenced graph edges, 64 Vitest cases across 17 files and the Chromium E2E login journey.
- Phase 6 final `pnpm test:execution`: completed hardened selected and full overlays. Selected: 13 results, 10 passed / 3 failed, 20.3 s. Full: 39 results, 36 passed / 3 failed, 29.0 s. The same three intentional behavior-change failures occurred in both modes, all results retained measured durations, and the checkout remained unchanged.
- Phase 7 final documentation pass: README, architecture notes and implementation state now describe the current API names, validation boundaries and local execution model without planned-phase wording.
- Phase 7 final validation: `pnpm build` passed; `pnpm test` passed with 64 tests; `pnpm test:impact` passed with 17 tests; contract and integration suites passed with 9 tests; Playwright E2E passed with 1 test.
- `git diff --check`: passes.

Timings vary with machine load and dependency cache state. The UI always displays reporter/run measurements from its own executions.

## Known limitations / deferred work

- Execution progress is near-live at runner-group and polling granularity rather than a streaming event per assertion.
- One execution runs at a time per demo API process to avoid port and resource contention.
- A fresh machine must install dependencies and Chromium once before offline overlays can execute.
- Monaco and language workers keep the production bundle large.
- The login remains a credential-checking demonstration without a persistent session or protected server-rendered route.
- Edited source runs with the current user's filesystem and network permissions; loopback/session controls and environment filtering reduce exposure but do not replace an OS sandbox.

## Next phase and exact task

No further engineering phase is required. The SDD's optional documentation cleanup is complete; stop here unless a new product request is added.
