# Implementation state

## Current milestone

Phase 0 complete: architecture and planning. No functional application has been implemented. Supplied specification is preserved in `docs/SDD.md`.

## Completed

- Reviewed SDD, defined five-package pnpm workspace and auth architecture directories.
- Defined actual aggregate/port/adapter responsibilities and allowed dependency directions.
- Specified typed local graph evidence, boundary policies, deterministic paths and conservative fallback.
- Specified test catalogue metadata, immutable snapshot analysis and controlled runner API in `packages/impact-engine/src/schema.ts`.
- Resolved modified-source execution semantics, comparison identity and local trusted-code limitation.
- Documented delivery order and structural validation.

## Decisions

See `ARCHITECTURE.md`. Edges point consumer to dependency. Impact normally reverses them; explicit forward evidence edges reach contracts. Unchanged contracts permit only contract tests and E2E journey traversal across the boundary. Changed contracts expose relevant seeds on both sides. No scenario-to-test rules. Runtime engine remains pure and contains no AI.

Browser edits stay in memory; runner executes a temporary snapshot with those edits. Both selected/full runs use identical snapshot hashes. Initial execution is local trusted-user only; arbitrary edited JavaScript is not safely sandboxed by command allowlists.

## Modules/files

Five private package manifests; empty source scaffolds; auth domain/application/adapters directories; test and evidence directories; shared schema design; README; architecture document; SDD; plan validation script. Graph and test catalogue are intentionally deferred until real code exists.

## Validation

- Node v26.5.1 and pnpm 11.19.0 available.
- `pnpm install --ignore-scripts`: checked during Phase 0 (no external dependencies yet).
- `pnpm validate:plan`: structural and TypeScript syntax checks only.
- `git diff --check`: whitespace validation.
- Passing application tests: none yet. Build/dev/test scripts intentionally absent.

## Known limitations

All runtime modules, AST diff mapping, generated graph, catalogue, UI, isolated runner and real tests remain unimplemented. Schema is a design contract, not a runtime validator. Selection accuracy will depend on completeness of evidence. Approximate scenario counts must not drive behavior.

## Next phase and exact task

Phase 1 — Real vertical slice.
SDD recommended model: **GPT-6 Astra**, thinking **Medium**. Model choice is advisory.

Read SDD, this state and architecture; inspect Git history; run `pnpm validate:plan`. Then implement real login through the DDD/hexagonal layers, React form/hook/client and POST /login contract. Add at least one domain, application, component, contract, integration and Playwright test; enforce dependency rules; generate the first real graph and implement deterministic selection producing a real subset. Add install/build/dev/test commands, run the entire slice and update this document with measured validation outcomes. Keep UI polish and the full 39-test catalogue for later phases.
