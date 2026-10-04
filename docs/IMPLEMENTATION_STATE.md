# Implementation state

## Current milestone

**Phase 1 — Real vertical slice implemented.** Supplied specification is preserved in `docs/SDD.md`. Final validation commands and results are recorded below.

## Completed work

- Real React/Vite login: LoginPage, LoginForm, input/button components, useLogin, AuthClient and email normalization. Errors render in the form; successful authentication navigates to `/home`.
- Real Node HTTP API: JSON validation, bounded request body, explicit responses and no-store headers. Public demo fixtures are composed at startup.
- DDD/hexagonal backend: User aggregate enforces credentials/locked status, Email and PasswordHash value objects, UserRepository domain port, AuthenticateUser use case, HTTP controller and in-memory persistence adapter.
- Runtime POST /login contract validators shared with AuthClient; contract tests assert real server output plus independent consumer expectations.
- Deterministic engine with boundary evidence, journey-only crossing, contract-change exposure, causal paths, exclusions, cycles, validation and conservative full selection for unknown inputs.
- Generated graph with 30 nodes, 43 evidenced local edges and 12 real product tests. AST imports + reviewed metadata; no hardcoded scenario selection lists.
- `pnpm test:selected <entity>` runs the computed subset against the current checkout, verifies raw reporter IDs/status/durations, and saves reports under ignored `.impact-runs/`.
- Architecture dependency checks and engine regression tests; production builds for backend, frontend, contract and engine.

## Decisions and scope

Keep the Phase 0 architecture; see `ARCHITECTURE.md`. Domain depends only on domain and Node crypto. Application depends only on domain. Composition injects the concrete repository through its port. The port/adapter wiring and HTTP contract exposure have explicit graph evidence.

Unchanged contracts select boundary/journey evidence without selecting implementation tests across sides. Changed contracts traverse the explicit exposure subgraph. Graph/catalogue order does not affect output; unknown entity inputs fall back to full selection. Quality tests are outside the product catalogue.

CLI selection currently accepts explicit changed entities, with coarse module source ranges. It does not compute diffs, serve browser analysis requests or execute browser edits. No sessions are persisted by the login demo. `apps/demo` is intentionally still empty for Phase 3.

## Key modules

- `apps/backend/src/auth/{domain,application,infrastructure}`, `composition.ts`, `http.ts`, `main.ts`
- `apps/frontend/src/{auth,components}`, `LoginPage.tsx`, `main.tsx`
- `packages/api-contract/src/login.ts`
- `packages/impact-engine/src/{schema,index,index.test}.ts`
- `impact/{graph,catalogue}.json`, `impact/evidence/architecture.json`
- `scripts/{source-analysis,generate-graph,impact,test-selected}.ts`, `build.mjs`, `dev.mjs`, `e2e.mjs`
- Colocated product tests; `tests/{contract,integration,e2e,architecture,support}`

## Validation

Environment: Node 26.5.1 inside the workspace sandbox and Node 24.19.0 for elevated HTTP/browser runs; pnpm 11.19.0. Supported Node versions: 24.15+ (24.x) or 26+. TypeScript is pinned within 5.9 for its stable compiler API.

- `pnpm install --frozen-lockfile`: passes.
- `pnpm build`: passes (TypeScript, graph generation and production bundles).
- `pnpm test`: 23 passing Vitest cases: 11 product, 10 engine, 2 architecture.
- `pnpm test:e2e`: 1 passing Chromium journey against real frontend/backend (wrong password, then valid login and `/home`).
- `pnpm graph:check`: generated evidence is current.
- `pnpm test:selected LoginButton`: physically executed C1, C2 and E1; all 3 passed. Example measured report: ~13.1s wall time including process/service startup; this is not a hardcoded benchmark or a claimed speedup.
- `git diff --check`: passes.

Chromium was downloaded to `/private/tmp/test-impact-lab-browsers` in this environment, so executions here use `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/test-impact-lab-browsers`. For a fresh setup, use the ordinary `pnpm exec playwright install chromium` command. Sandbox execution required elevated permission to bind loopback ports and launch Chromium. Initial port-collision and worker-config port-allocation defects were fixed by the single launcher in `scripts/e2e.mjs`; tests never reuse an existing app.

## Known limitations / deferred work

- Product catalogue has 12 tests, not the target ~39.
- Fine-grained changed-method mapping, automatic source diff, incomplete evidence detection for new imports and immutable snapshot hashes are not implemented.
- Monaco, React Flow, browser APIs, source-overlay test isolation and selected/full comparison UI are pending.
- Explicit metadata is reviewed evidence, not runtime coverage. File-level conservatism can select more tests than a method-level analysis would.
- CLI runner is a local trusted-checkout tool, not the future public/browser execution service. Never expose arbitrary edited JavaScript without an isolation design; command allowlists alone are not a sandbox.

## Next phase and exact task

**Phase 2 — Complete test catalogue and impact relationships.**
SDD recommended model: **GPT-5.6 Sol**, thinking **Medium**. Model choice is advisory.

Read SDD, this state and architecture; inspect Git history; run `pnpm validate` (set the browser-path variable above in this environment). Expand to approximately 1 E2E, 8 component, 4 frontend unit, 3 contract, 6 integration and 17 backend unit product tests. Each must test distinct meaningful behavior and have local graph relationships. Extend graph granularity as needed without replacing working architecture; add all four source-change scenarios and engine assertions for their distinct selections and boundary behavior. Preserve reporter validation, actual HTTP/E2E execution and no scenario-to-test tables. Update this document with final counts, tests, limitations and the Phase 3 handoff.
