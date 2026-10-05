# Architecture decisions

## Implementation status after Phase 6

The login vertical slice, pure traversal engine, import-derived graph, complete 39-test catalogue, source-diff mapping, immutable browser snapshots, interactive explorer and isolated selected/full execution are implemented. Phase 6 hardened syntax-error fallback, catalogue command inputs, local API sessions, runner reports, process termination and environment filtering.

The graph combines source modules with reviewed behavior nodes such as `User.authenticate`, form validation and HTTP request parsing. This lets local evidence distinguish tests that share a file without encoding scenario-to-test tables. The CLI accepts changed entity IDs; the explorer maps real source diffs to versioned entity ranges. `test:selected` executes the current checkout, while the browser runner executes immutable edited copies in disposable overlays; both verify reporter results.

Node 24.15+ (24.x) or 26+ matches the installed test-tool requirements. TypeScript 5.9 provides the stable compiler API used for imports and architecture checks; the application is still ordinary TypeScript. Playwright allocates ports once in a launcher, then shares them through environment variables, because configuration is loaded again in worker processes.

## Scope and SDD review

The supplied SDD is the product brief. Its phased delivery is adopted as a useful milestone structure; model recommendations are advisory, not technical dependencies. Phase 0 creates design and scaffold only. Approximate selection counts are examples, not selection rules. Conservative over-selection is preferable to silent false negatives.

Two important gaps are resolved here: test runs must use the edited snapshot, and the dependency graph needs typed propagation rather than indiscriminate undirected reachability. A passing contract test provides bounded evidence, not proof of universal compatibility. This POC must communicate that limitation.

## Workspace and ownership

- `apps/frontend`: React/Vite login application and colocated unit/component tests.
- `apps/backend`: Node HTTP server, composition root and auth bounded context.
- `apps/demo`: React/Vite explorer and separate local Node service exposing snapshots, analyses and executions.
- `packages/api-contract`: transport request/response schemas and runtime validation; no domain dependencies.
- `packages/impact-engine`: pure diff/entity/selection logic and shared data types; no UI or process spawning.
- `tests/contract`, `tests/integration`, `tests/e2e`: actual adapter contract, composed HTTP and Playwright tests.
- `impact/graph.json`, `impact/evidence`: generated graph and reviewed relationship metadata, introduced with executable sources in Phase 1.

## DDD and dependency direction

`User` is the aggregate root: it owns identity, Email, PasswordHash and locked state and enforces authentication invariants. `Email` normalizes/validates; `PasswordHash` encapsulates salted hashing and verification (Node crypto is acceptable standard-library infrastructure, no external service). No plaintext password storage. `UserRepository` is a domain-owned outbound port returning aggregates. `AuthenticateUser` loads a user through that port and invokes its behavior. Unknown users and wrong passwords have the same external error; locked users cannot authenticate.

`LoginController` validates transport inputs using api-contract and maps use-case outcomes to status/body. `InMemoryUserRepository` implements the domain port. The composition root creates fixtures and injects the repository into the use case and controller. Domain imports neither application, transport nor infrastructure. Application imports domain only. Infrastructure can import application/domain/contract. Source import checks will enforce these rules, including type-only imports and aliases.

Login is a demonstration of credential checking and navigation to `/home`, not a production session/authentication service. Demo credentials are public fixtures. Request/response shape and error semantics live in api-contract.

## Graph model

See `schema.ts` for the serialization contract. IDs are stable strings, independent of line offsets. A dependency edge points **consumer → dependency**; impact normally travels in reverse. Test edges point **test → directly exercised entity**. No E2E-to-domain shortcut edges. Every edge includes evidence kind, source location and a reason. Explicit architecture metadata records composition, port binding and contract ownership that imports alone cannot establish.

TypeScript AST analysis will collect imports and exported entity ranges. Reviewed metadata supplements call/composition relationships. A change within an entity maps to that entity; deletions use old ranges. Ambiguous edits, syntax errors, shared configuration, new unmapped files or incomplete evidence trigger conservative full selection with a visible warning. Comments/format-only edits may over-select initially. Tests and graph metadata are not editable through the demo; local changes to either invalidate the snapshot and regenerate analysis.

Each edge has explicit capabilities: reverse impact, forward boundary evidence and contract-change exposure. These are relationship policies, never scenario labels. `implements` alone does not imply all implementations change together; composition metadata connects the injected adapter to its consumer so adapter changes reach that use case.

## Deterministic traversal

1. The demo API verifies the immutable snapshot ID and validates the graph/catalogue before analysis; the engine normalizes sorted IDs and rejects duplicate or dangling graph records.
2. Diff original versus edited files in sorted order and map changed hunks to the union of old/new entity ranges. A deleted entity remains addressable through the baseline graph. Include a deterministic edited graph where analysis succeeds; use the union for removed/new dependencies.
3. Run reverse dependency traversal from each changed entity, with stable sorted neighbor ordering and visited keys `(node, mode, origin)`. Ordinary frontend/backend traversal cannot cross a contract.
4. For application/client changes, follow only edges explicitly marked `forwardBoundaryEvidence` to discover a touched contract. This traversal gathers contract evidence, not tests on sibling dependencies. UI render/composition edges do not carry this capability, so a button-only edit does not require contract tests.
5. At an unchanged contract, select its directly attached contract tests and record the boundary stop. Continue reverse consumer paths in **journey-only** mode: intermediate nodes are shown as journey evidence but only E2E test nodes may be selected. Frontend component/unit tests remain excluded when only backend implementation changed.
6. If the contract node itself changed, traverse the explicit `contractExposure` subgraph in both directions from that node to establish the relevant implementation seeds on both sides. Then apply ordinary reverse traversal to those seeds. Exposure metadata must identify real schema producers/consumers and their local delegated dependencies; it must not turn all graph edges bidirectional. A domain entity seeded this way does not trigger unrelated aggregates.
7. Union selections across all origins/modes. Record one canonical shortest causal path per selected test (lexicographic edge-ID tie break), including traversal direction and policy; preserve boundary records. Stable sorting makes output independent of input array order.
8. For every unselected catalogue entry emit `unreachable` or `boundary-stopped`, with the applicable boundary ID and explanation. Graph nodes distinguish direct change, implementation impact, journey evidence and untouched state.

Return uncertainty warnings rather than claiming exact coverage. Selection guarantees are bounded by the versioned evidence. Engine tests must cover cycles, multiple changes on both sides, array permutations, missing mappings, edge removal, port implementation changes, contract changes and syntax errors. Changing a relationship must naturally change selection.

## Demo API and immutable snapshots

The browser receives allowlisted real source files plus snapshot/graph/catalogue digests and a per-process local session token. Edits are browser memory overlays, never writes to the checkout. `POST /api/analyses` submits a snapshot ID plus replacement file contents; the service checks the token/origin, resolves the immutable original, checks syntax and invokes the engine. The browser cannot submit authoritative changed-entity IDs or test selections. Analysis records bind the source overlay to the immutable snapshot.

`POST /api/executions` accepts a snapshot ID, analysis ID and `selected` or `full`. The service derives test IDs from the stored analysis/catalogue. Both modes execute the **same edited snapshot**. A full run against pristine source is a different comparison and is not silently mixed in. `GET /api/executions/:id` returns incremental results; polling is sufficient. Build/setup failures and missing reports are errors, never passes.

Application view initially embeds the baseline running app and labels that state explicitly; source edits affect the isolated test snapshot. An edited live preview is outside the required first implementation.

## Real execution and trust boundary

The runner materializes an immutable temporary workspace copy plus allowlisted source overlays, outside the checkout. The API rejects traversal, excessive payloads and edits outside graph-backed source files; execution adds a containment check before writing. Runner commands and argv are server-owned; process spawning uses no shell. Catalogue entries map stable IDs to exact escaped Vitest/Playwright title filters and safe files. Actual reports are checked against requested IDs; unexpected, missing, duplicate or unmeasured results fail the run. Distinct test IDs are included in runner titles.

**Edited source is executable code.** File allowlists and `shell: false` prevent command injection but do not sandbox JavaScript. The first runner is local-only and explicitly trusted-user: loopback binding, strict origin checks, per-session token, serial runs, timeouts, output caps, environment secret stripping and cleanup. It must never be deployed as an untrusted public service. Public execution requires a separately designed OS/container sandbox with filesystem/network restrictions. This limitation is not solved by JSON validation.

Each run uses ephemeral service ports injected into frontend/E2E configuration and kills its complete process tree on timeout. Dependencies are reused read-only where possible; source/test assets are copied to the run directory. Never edit the active checkout or shared compiled output.

Capture real reporter status and duration per test, plus measured runner wall time after overlay preparation. Compare only completed runs sharing the same stored analysis and snapshot. Show failed/skipped tests accurately. Test avoidance is count-based; measured time reduction can be negative. No fabricated PASS, timing or constant expected savings.

## Delivery and validation

0. Architecture/types/scaffold; validate structural consistency.
1. Real login vertical slice; one meaningful test per layer, Playwright, architecture enforcement, graph and pure selection.
2. Expand to approximately 39 tests and automated selection scenarios; do not hardcode scenario counts.
3. Explorer with Monaco, React Flow, memory overlays and explanations using the engine API.
4. Real isolated snapshot execution and measured comparisons.
5. Visual polish while preserving behavior.
6. Audit complete behavior, execution trust boundary and all real tests.
7. Optional documentation cleanup.

Phase 1 acceptance includes install, build, real HTTP login, all slice tests, a real selected subset and Playwright. The full-project validation checklist is deferred until those modules exist.
