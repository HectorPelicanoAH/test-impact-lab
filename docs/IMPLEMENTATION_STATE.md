# Implementation state

## Current milestone

**Phase 3 — Interactive test-impact explorer complete.** The supplied specification is preserved in `docs/SDD.md`.

## Completed work

- Preserved the Phase 1 login application and the Phase 2 catalogue of exactly 39 meaningful product tests.
- Built `apps/demo` with APPLICATION, CODE, IMPACT GRAPH and TESTS views.
- Added a repository tree and self-hosted Monaco editor over allowlisted real source files. Browser edits remain in memory and never modify the checkout.
- Added four suggested changes that replace actual source text for `LoginButton`, `normalizeEmail`, `User.authenticate` and the POST `/login` contract.
- Added an immutable startup snapshot containing SHA-256 hashes for source, graph and catalogue data.
- Added deterministic line diffs and source-range mapping in the shared impact-engine package. Mapped edits invoke the existing engine; unknown or uncovered edits retain conservative full selection.
- Added TypeScript-AST symbol ranges for reviewed behavior nodes so a change to `User.authenticate` maps to that method instead of every entity in `User.ts`.
- Added the local snapshot/analysis API with a fixed allowlist, input limits and no filesystem writes.
- Added React Flow visualization for all 69 graph nodes and 84 evidenced edges, including architectural layers, contract boundary, changed/affected/journey states, selected/muted tests and focused causal paths.
- Added selected and excluded test views, taxonomy counts, boundary explanations and WHY navigation from a selected test to its graph path.
- Embedded the real login application in APPLICATION view. Physical test execution remains in the trusted CLI until Phase 4.

## Architecture decisions

The Phase 0/1 architecture and Phase 2 impact semantics remain in force; see `ARCHITECTURE.md`. The demo imports engine types and sends source replacements to the local API. Impact traversal is implemented only in `@test-impact/impact-engine`.

The API captures source files, graph and catalogue once at startup and returns their hashes as one snapshot identity. Only paths already referenced by non-test graph nodes may be read or submitted. An analysis request contains the matching snapshot ID plus complete replacement text for modified files. It cannot provide entity IDs, scenario names, test IDs or commands.

Diff mapping uses deterministic common-prefix/common-suffix line hunks. Each hunk maps to the narrowest intersecting graph range marked as changeable. Reviewed behavior-only anchors that lack distinct source syntax are traversal nodes and cannot become direct diff origins. Mapping uncertainty becomes the engine's conservative full-selection mode.

## Interactive behavior

| Suggested source edit | Mapped entity | Selected product tests |
| --- | --- | ---: |
| `LoginButton` label | `LoginButton` | 4 / 39 |
| Email normalization | `normalizeEmail` | 11 / 39 |
| Locked-user outcome | `User.authenticate` | 13 / 39 |
| Login path constant | `POST /login` | 29 / 39 |

The CODE view shows the modified file in Monaco and calculates through the API. IMPACT GRAPH reflects the returned engine result and highlights the chosen WHY path. TESTS shows all 39 tests, selected/avoided state, and either a causal link or the engine's boundary/unreachable explanation. APPLICATION loads the same real login journey represented by the graph.

## Key modules

- `apps/demo/server.ts`, `apps/demo/src/App.tsx`, `apps/demo/src/components/*`
- `apps/demo/src/{monaco,suggestions,types}.ts`, `apps/demo/src/styles.css`
- `packages/impact-engine/src/{analysis,schema,index}.ts`
- `scripts/{source-analysis,generate-graph,build,dev}.mjs` / `.ts`
- `impact/{graph,catalogue}.json`, `impact/evidence/architecture.json`

## Validation

Environment: Node 26.5.1 inside the workspace sandbox and Node 24.19.0 for elevated HTTP/browser runs; pnpm 11.19.0. Supported Node versions are 24.15+ (24.x) or 26+.

- `pnpm build`: passes type checking, graph generation and the frontend/demo/server production builds. Monaco workers are local build assets.
- `pnpm graph:generate` / `pnpm graph:check`: 69 nodes, 84 evidenced edges and 39 catalogued product tests.
- `pnpm test`: 58 passing Vitest cases across 17 files, including source-edit mapping and the snapshot/analysis API.
- `pnpm test:impact`: all scenario, determinism, cycle, validation, conservative-fallback and real-source mapping checks pass.
- `pnpm validate`: passes the complete build, graph consistency, 58 Vitest cases and the real Chromium E2E.
- Browser verification: all four views load; Monaco applies the real `User.authenticate` edit; analysis returns 13 / 39; selected/excluded explanations render; WHY shows `User.authenticate → test:BU1`; the embedded login renders.
- `git diff --check`: passes.

Chromium is cached at `/private/tmp/test-impact-lab-browsers` in this environment, so validation here sets `PLAYWRIGHT_BROWSERS_PATH` to that directory. A fresh setup uses `pnpm exec playwright install chromium`.

## Known limitations / deferred work

- The browser calculates impact but does not execute tests. `RUN SELECTED TESTS`, `RUN FULL SUITE`, streamed results and measured comparison belong to Phase 4.
- The current trusted CLI selected runner executes the checkout. Phase 4 must isolate browser source overlays and continue to reject arbitrary commands and paths.
- Source mapping intentionally falls back to all tests for edits outside reviewed ranges or files.
- Evidence metadata is reviewed architectural/test evidence, not measured universal coverage.
- Monaco makes the production demo bundle large; bundle/perceived-load optimization and responsive visual polish can be handled after functional execution.
- The login remains a credential-checking demonstration without a persistent session or protected server-rendered route.

## Next phase and exact task

**Phase 4 — Real test execution from the demo.**
SDD recommended model: **GPT-5.6 Sol**, thinking **Medium**.

Read the SDD, this state and architecture; inspect Git history; run `pnpm validate` with the browser-path variable documented above. Add RUN SELECTED TESTS and RUN FULL SUITE. The browser must request a controlled local/server-side runner using known test IDs and must never supply commands. Execute against an isolated source overlay, capture real test ID/type/status/duration and useful output, show live or near-live progress, represent failures, and compare selected/full counts, measured duration, avoided tests and time reduction. Do not simulate status or timing.
