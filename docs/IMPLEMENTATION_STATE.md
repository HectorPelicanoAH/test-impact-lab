# Implementation state

## Current milestone

**Phase 4 — Real test execution from the demo complete.** The supplied specification is preserved in `docs/SDD.md`.

## Completed work

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

The API stores source edits only after the Phase 3 allowlist and snapshot validation. Starting an execution references that stored analysis. The server chooses either the engine's selected IDs or every catalogue ID, groups them by the catalogue's fixed runner/file/title metadata, and spawns argument arrays with `shell: false`.

Source overlays include application, packages, tests, scripts, impact evidence and pinned workspace configuration. Dependencies are linked from the local pnpm store with `--offline --frozen-lockfile --ignore-scripts`. The original checkout is never edited. Each child process has a three-minute limit and runs in its own process group so its test services can be terminated together.

Runner failures remain results. A behavior-changing `User.authenticate` edit correctly produced 10 passing and 3 failing selected tests; the same three failures appeared among 39 full-suite results. Missing or malformed runner reports become explicit failed results rather than simulated passes or durations.

## Key modules

- `apps/demo/execution.ts`: overlay lifecycle, controlled Vitest/Playwright processes and report parsing.
- `apps/demo/server.ts`: analysis storage, strict execution requests, concurrency guard and job polling.
- `apps/demo/src/components/ExecutionPanel.tsx`: actions, progress, failures, output and comparison.
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
- `git diff --check`: passes.

Timings vary with machine load and dependency cache state. The UI always displays reporter/run measurements from its own executions.

## Known limitations / deferred work

- Execution progress is near-live at runner-group and polling granularity rather than a streaming event per assertion.
- One execution runs at a time per demo API process to avoid port and resource contention.
- A fresh machine must install dependencies and Chromium once before offline overlays can execute.
- Monaco and language workers keep the production bundle large.
- Responsive refinement, graph readability, visual hierarchy, motion and accessibility polish belong to Phase 5.
- The login remains a credential-checking demonstration without a persistent session or protected server-rendered route.

## Next phase and exact task

**Phase 5 — UX and visual polish.**
SDD recommended model: **GPT-5.6 Terra**, thinking **Medium**.

Read the SDD, this state and architecture; inspect Git history; run `pnpm validate` and `pnpm test:execution` with the documented browser path. Treat architecture and algorithms as frozen unless a real defect is found. Improve only visual hierarchy, graph readability, contract-boundary emphasis, transitions, responsive behavior, empty/loading/error states and accessibility. Preserve all real execution and deterministic-selection behavior.
