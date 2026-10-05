# Architecture decisions

## Current extension: G2–G5 discovery, evidence, inventory HTTP and messaging

The original Phase 6 baseline below is extended by independently authorized G2–G5 phases; G6–G9 are not implemented. [Discovery configuration](../impact/discovery.json) inventories all text sources in explicit product roots, including disconnected files. The [TypeScript adapter](../scripts/graph/extract.ts) resolves local compiler declarations/imports/JSX/calls and a bounded React Router pattern. Unsupported/dynamic destinations become diagnostics, never guessed links. See the [v2 contract and implemented limits](GRAPH-V2-CONTRACT.md).

`graph:generate` now builds v2 rather than regenerating legacy metadata. The old [graph](../impact/graph.json) remains a compatibility seed; `--legacy-review` explicitly invokes the old generator. [Migration](../scripts/graph/snapshot.ts) revalidates imports/locations, preserves exact login propagation flags and reclassifies manual test subjects as reviewed declarations. A v1-shaped projection runs the existing typed traversal; new native relationships are displayed but do not acquire arbitrary reverse-propagation rules. Before/after topology changes and unknown scope select the full available catalogue. Missing current test subjects are allowed only in that explicit full-selection case.

[Snapshot storage](../scripts/graph/store.ts) atomically publishes complete content-addressed archives before switching the current pointer. Archives include source/test/configuration/runner bytes, catalogue, extractor implementation/version, policies and evidence locators. All manifests are verified on publish/read. A failed rebuild retains the old version; the API returns 503. Historical reads bypass rebuilding. The watcher uses debounced **full rebuilds**, verified equivalent to independent full extraction.

The [API](../apps/demo/server.ts) refreshes inputs before current analysis/execution requests, rejects stale snapshot IDs, accepts strict add/modify/delete operations under authorized roots, and archives the edited graph without updating the checkout's current pointer. It returns both graph IDs, full v2 discovery, the compatibility graph and delta. Executions use the exact captured baseline bytes plus stored edits, including the external template needed by the E2E launcher, not a late filesystem copy. Paths, symlinks, case/Unicode collisions and UTF-8 limits are enforced; this remains trusted-user local execution, not an OS sandbox.

The explorer's new controls modify browser memory only. Late responses from a superseded working copy are ignored. Snapshot history survives server restarts, while analysis/execution maps do not. [The inspector](../apps/demo/src/components/DiscoveryExplorer.tsx) uses the complete v2 graph; the login test selector still uses the v1-shaped compatibility projection. System view lists recorded repositories; service view means configured source areas, not detected runtime services. Code view filters typed facts, supports both directions and uses a bounded neighborhood canvas plus full keyboard-searchable index. Explicit before/after sides and the delta never merge evidence of different revisions. [The locator](../scripts/graph/locator.ts) accepts existing node/evidence IDs only, verifies source hash and reads archived bytes and exact TypeScript/JSON-pointer ranges, including the separately pinned external Git revision; the [HTTP endpoint](../apps/demo/server.ts) bypasses current checkout refresh. Absent/unverifiable source yields no code link. Reviewed declarations are not measured coverage. A guided example creates a component plus import/JSX in a browser overlay, without claiming a route. G5 adds declared/static broker facts; telemetry remains a future gated phase. [G2–G5 acceptance and measured results](DEPENDENCY-GRAPH-STATE.md) records verification separately from original milestones.

### G4 HTTP slice and trust boundary (persistence extended in G5)

[OrdersPage](../apps/frontend/src/OrdersPage.tsx) posts through the frontend's `/api/orders` proxy to [the orders controller](../apps/backend/src/orders/OrdersController.ts). Its [inventory client](../apps/backend/src/orders/InventoryClient.ts) performs a real `GET /v1/stock/:sku` to the separately running [inventory provider](../examples/external-inventory/src/server.ts); no provider implementation is imported into the orders product. The shared [stock contract](../packages/api-contract/src/inventory-contract.json) is version 1 and the [reviewed binding](../impact/inventory-binding.json) fixes local environment, service, method and route template. G4 initially held accepted orders in memory; G5 persists order+outbox atomically in SQLite. 409 means insufficient stock, 502 means external failure, 504 means timeout. There is no reservation, authentication for orders or distributed transaction with inventory. This is not an inventory consistency guarantee.

[Snapshot loading](../scripts/graph/snapshot.ts) captures independent Git source/tests/config and pins its clean commit, while the product remains content-revisioned. [The bounded HTTP extractor](../scripts/graph/inventory-http.ts) emits qualified client→endpoint→provider facts only with verified declarations/call sites and matching v1 contract. Divergence removes unsupported facts and emits a diagnostic; coincidence of URL in another environment is not an edge. Contract-only mode retains the qualified client endpoint but no provider implementation or fabricated source locator. External tests are listed separately as `not-integrated`; neither catalogued login runner nor its conservative full fallback runs them before G6. Older G2/G3 archives with no external repository/catalogue remain readable. The template is captured with runner inputs so login selected/full overlays can still launch the real E2E inventory service.

### G5 outbox and independent consumers

[OrderStore](../apps/backend/src/orders/OrderStore.ts) commits an accepted order and `OrderCreated` v1 in one SQLite transaction (WAL/FULL). The [publisher](../apps/backend/src/orders/OutboxPublisher.ts) sends persistent mandatory messages on a confirm channel and marks an outbox row published only after confirmation. A crash between confirmation and marking can duplicate delivery: this is at-least-once, not exactly-once.

[Notifications](../apps/notifications/src/main.ts) and [preparation](../apps/preparation/src/main.ts) are separate processes with separate SQLite files and durable queues. Each atomically stores an inbox ID/payload and its local effect. The [transport](../packages/messaging/src/consumer.ts) manually acknowledges only after persisting the effect or confirming a retry/failed-queue publication. Each queue has three attempts maximum for handler failures; an unavailable broker leaves deliveries/outbox pending and reconnects rather than falsely passing. Preparation status and mailbox contents are read through the consumer's HTTP API, never shared memory/databases. Effects are local persisted records; the handler is a pure projection, not a safe hook for arbitrary external side effects.

The [bounded messaging extractor](../scripts/graph/messaging.ts) combines compiler-resolved wrapper calls with verified AST/configuration forms from the [topology](../packages/messaging/src/topology.json). Channel/subscription identities include logical broker, environment, exchange, routing key and schema/version. `publishes`, `subscribes` and `processes` retain source and JSON-pointer evidence. Dynamic routing, removed handlers, substituted subscriptions, incompatible schema/config and unsupported forms remove authoritative relations and emit diagnostics. No shared-broker shortcut connects sibling consumers. This is declared/static evidence, not telemetry, coverage or a runtime namespace discovery mechanism. Selection/federated runners remain G6; tracing and mesh remain G7/G8. [Operations and measured G5 results](G5-MESSAGING.md).

## Historical baseline after Phase 6

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
