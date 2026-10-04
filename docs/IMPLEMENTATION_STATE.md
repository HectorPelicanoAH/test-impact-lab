# Implementation state

## Current milestone

**Phase 2 — Complete test catalogue and deterministic impact scenarios implemented.** The supplied specification is preserved in `docs/SDD.md`.

## Completed work

- Preserved the Phase 1 React/Vite login and DDD/hexagonal Node backend.
- Expanded the real product catalogue to exactly 39 meaningful tests: 17 backend unit, 4 frontend unit, 8 component, 3 contract, 6 integration and 1 Playwright E2E.
- Added frontend request building and field validation as real application behavior. Component coverage now includes rendering, disabled/loading states, valid submission, field validation, pending requests and service errors.
- Expanded backend coverage for User, Email, PasswordHash, AuthenticateUser and InMemoryUserRepository. Integration tests cover success, wrong password, unknown user privacy, locked user, malformed JSON and repository failure.
- Expanded contract evidence for success, invalid credentials and request validation responses, including independent consumer assertions around the shared validators.
- Added reviewed behavior nodes such as `User.authenticate`, `AuthenticateUser.success`, `LoginForm.validation` and `HttpServer.requestParsing`. This distinguishes local behavior while retaining source-module relationships.
- Validated four distinct graph-derived scenarios. No scenario contains an authoritative list of tests; changing or removing a graph edge changes the result naturally.
- The selected-test runner physically executed and verified the 13-test domain subset using Vitest and Chromium reporter output.

## Architecture decisions

The Phase 0/1 architecture remains in force; see `ARCHITECTURE.md`. User remains the aggregate root. Domain/application dependency checks still reject inward-boundary violations, including type imports, re-exports and dynamic imports.

Edges point consumer to dependency. Ordinary impact travels in reverse. The unchanged POST `/login` contract selects contract evidence and continues only in journey mode across the boundary, so backend implementation changes do not select frontend unit/component tests and frontend changes do not select backend tests. A change to the contract node traverses reviewed exposure edges on both sides.

Behavior nodes are evidence anchors inside real source modules. They do not contain test lists. Tests connect only to their closest exercised behavior; production relationships produce the global selection.

## Catalogue and scenarios

| Scenario / changed entity | Selected product tests | Boundary behavior |
| --- | ---: | --- |
| A — `LoginButton` | 4 / 39: C1–C3 + E1 | Does not touch the contract |
| B — `normalizeEmail` | 11 / 39: 3 frontend unit, 4 component, 3 contract, E1 | Stops before backend internals |
| C — `User.authenticate` | 13 / 39: 5 backend unit, 4 integration, 3 contract, E1 | Stops before frontend internals |
| D — `POST /login` | 29 / 39 across frontend, contract and backend | Contract changed; exposure crosses both sides |

Every selected test has a validated causal path. Every excluded test reports `unreachable` or `boundary-stopped`. Input order, graph order and duplicate changed IDs do not alter the result. Unknown changes conservatively select the full catalogue.

## Key modules

- `apps/backend/src/auth/{domain,application,infrastructure}`, `composition.ts`, `http.ts`, `main.ts`
- `apps/frontend/src/{auth,components}`, `LoginPage.tsx`, `main.tsx`
- `packages/api-contract/src/login.ts`
- `packages/impact-engine/src/{schema,index,index.test}.ts`
- `impact/{graph,catalogue}.json`, `impact/evidence/architecture.json`
- `scripts/{source-analysis,generate-graph,impact,test-selected}.ts`, `build.mjs`, `dev.mjs`, `e2e.mjs`
- Product tests colocated with code plus `tests/{contract,integration,e2e}`; quality checks in `tests/architecture` and the engine package.

## Validation

Environment: Node 26.5.1 inside the workspace sandbox and Node 24.19.0 for elevated HTTP/browser runs; pnpm 11.19.0. Supported Node versions are 24.15+ (24.x) or 26+. TypeScript stays on 5.9 for its stable compiler API.

- Phase 1 validation passed before changes: build, graph check, 23 Vitest tests and the real E2E.
- `pnpm graph:generate` / `pnpm graph:check`: 69 nodes, 84 evidenced edges and 39 catalogued product tests.
- `pnpm install --frozen-lockfile`: passes and restores all workspace links from the pinned lockfile.
- `pnpm build`: passes TypeScript, graph generation and all production bundles.
- `pnpm test`: 51 passing Vitest cases: 38 product, 11 engine and 2 architecture checks.
- `pnpm test:e2e`: the catalogued Playwright journey passes against real frontend/backend services in Chromium. Together with Vitest, all 39 product tests pass.
- `pnpm test:impact`: scenario, determinism, cycle, relationship mutation, validation and conservative-fallback checks pass.
- `pnpm test:selected 'User.authenticate'`: physically executed the 13 selected tests; all passed. Measured example: ~16.3s wall time including service and browser startup. Individual durations came from Vitest/Playwright reports.
- `pnpm validate`: passes the complete build, graph consistency, 51 Vitest cases and the real Chromium E2E.
- `git diff --check`: passes.

Chromium is cached at `/private/tmp/test-impact-lab-browsers` in this environment, so local validation here sets `PLAYWRIGHT_BROWSERS_PATH` to that directory. A fresh setup uses `pnpm exec playwright install chromium`.

## Known limitations / deferred work

- CLI analysis still accepts explicit changed entity IDs. Fine-grained diff-to-entity mapping, immutable snapshot hashes and edited graph generation are pending.
- Monaco, React Flow, browser analysis APIs and the four explorer views are pending Phase 3.
- Source-overlay isolation and browser-triggered selected/full execution are Phase 4. The current runner executes the trusted current checkout.
- Evidence metadata is reviewed architectural/test evidence, not measured universal coverage. Unknown or unmapped edits use conservative full selection.
- The login remains a credential-checking demonstration without a persistent session or protected server-rendered route.

## Next phase and exact task

**Phase 3 — Interactive demo application.**
SDD recommended model: **GPT-5.6 Sol**, thinking **Medium**.

Read SDD, this state and architecture; inspect Git history; run `pnpm validate` with the browser-path variable documented above. Build `apps/demo` with APPLICATION, CODE, IMPACT GRAPH and TESTS views. Serve allowlisted real repository files and immutable baseline snapshots from a local API. Monaco edits must remain in memory. Calculate a real diff, map changed source ranges to graph entities, invoke the shared impact engine, and show selected/excluded tests, causal WHY paths, boundary explanations and the React Flow graph. Suggested changes must edit source text rather than submit scenario names or test IDs. Keep physical test execution in the CLI until Phase 4.
