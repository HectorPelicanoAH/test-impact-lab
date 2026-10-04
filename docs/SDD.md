# SDD — Test Impact Lab

## 1. Goal

Build a functional, self-explanatory proof of concept demonstrating deterministic
Test Impact Analysis on a real monorepo.

This is NOT a mocked visualization.

The repository must contain:

- a functional frontend
- a functional backend designed with DDD + Hexagonal Architecture
- real unit tests
- real component tests
- real contract tests
- real integration tests
- real Playwright E2E tests
- a deterministic impact-analysis engine
- an interactive demo application

A user must be able to:

1. Inspect the real source code in the browser.
2. Modify a demo copy of that code.
3. Calculate regression impact.
4. See why each test was selected or excluded.
5. Execute the selected tests.
6. Execute the complete suite.
7. Compare both executions.
8. Explore the dependency/impact graph visually.

No LLM may participate in test selection at runtime.

Same repository state + same diff + same graph = same selected tests.

---

## 2. Core principle

AI can help build the system.

AI does NOT decide which tests execute.

Runtime test selection must be:

- deterministic
- reproducible
- explainable
- evidence-based

The demo should make this obvious.

---

## 3. Monorepo

Use:

- pnpm workspaces
- TypeScript
- React + Vite
- Node.js
- Vitest
- Playwright
- React Flow
- Monaco Editor

Suggested structure:

```text
/
├── apps/
│   ├── frontend/
│   ├── backend/
│   └── demo/
│
├── packages/
│   ├── api-contract/
│   └── impact-engine/
│
├── tests/
│   ├── contract/
│   ├── integration/
│   └── e2e/
│
├── impact/
│   ├── graph.json
│   └── evidence/
│
├── docs/
│   └── IMPLEMENTATION_STATE.md
│
├── pnpm-workspace.yaml
└── README.md
```

Keep dependencies and infrastructure minimal.

Do NOT introduce databases, Neo4j, Kafka, Docker, etc. unless strictly necessary.

The graph may initially be persisted as JSON.

---

## 4. Example application

Implement a small but real authentication application.

UI:

- Email
- Password
- Login button

Successful credentials redirect to:

`/home`

Invalid credentials display an error.

This application exists primarily to demonstrate architecture and test impact.

---

## 5. Backend architecture

The backend MUST intentionally demonstrate DDD + Hexagonal Architecture.

Do not merely create folders with architectural names.

Dependencies must respect the architecture.

Structure:

```text
apps/backend/src/auth/

domain/
    User.ts
    Email.ts
    PasswordHash.ts
    UserRepository.ts

application/
    AuthenticateUser.ts

infrastructure/
    inbound/http/
        LoginController.ts

    outbound/persistence/
        InMemoryUserRepository.ts
```

Domain:

- `User` = Aggregate Root
- `Email` = Value Object
- `PasswordHash` = Value Object
- `UserRepository` = outbound Port
- `AuthenticateUser` = Application Use Case
- `LoginController` = inbound / primary Adapter
- `InMemoryUserRepository` = outbound / secondary Adapter

The domain MUST NOT import infrastructure.

Application may depend on domain and ports.

Infrastructure implements ports.

---

## 6. Backend flow

```text
POST /login
    ↓
LoginController
    ↓
AuthenticateUser
    ↓
UserRepository (Port)
    ↓
User Aggregate
    ↓
User.authenticate()
```

Persistence:

```text
InMemoryUserRepository
    implements
UserRepository
```

Make these relationships visible in the demo.

---

## 7. Frontend architecture

Implement:

- `LoginPage`
- `LoginForm`
- `EmailInput`
- `PasswordInput`
- `LoginButton`
- `useLogin`
- `AuthClient`

Flow:

```text
login.e2e
    ↓
LoginPage
    ↓
LoginForm
    ↓
useLogin
    ↓
AuthClient
    ↓
POST /login
```

---

## 8. Contract boundary

The API contract is a FIRST-CLASS NODE in the impact model.

Represent:

`POST /login`

as the boundary between frontend and backend.

Create real contract tests.

The contract boundary acts as a propagation boundary.

Conceptually:

```text
FRONTEND
    ↓
AuthClient
    ↓

========================
POST /login
CONTRACT TESTS
========================

    ↓
LoginController
    ↓
BACKEND
```

If frontend implementation changes but the API contract remains unchanged,
backend internal tests must NOT automatically be selected.

If backend implementation changes without changing the contract,
frontend unit/component tests must NOT automatically be selected.

Contract tests provide evidence at the boundary.

E2E may still be selected as journey-level evidence.

If the API contract itself changes, impact propagation is allowed to cross the boundary.

---

## 9. Test catalogue

Create approximately 39 meaningful tests.

Exact numbers may vary slightly if technically justified, but target:

- E2E: 1
- Component: 8
- Frontend Unit: 4
- Contract: 3
- Backend Integration: 6
- Backend Unit: 17

TOTAL ≈ 39

Do NOT create meaningless duplicate tests just to reach the number.

Each test must have explicit impact relationships.

---

## 10. Example test relationships

Component:

- C1 LoginButton renders
- C2 LoginButton disabled
- C3 LoginButton loading
- C4 LoginForm valid
- C5 LoginForm validation
- C6 LoginForm empty
- C7 Login success
- C8 Login error

Frontend Unit:

- FU1 normalizeEmail
- FU2 buildLoginRequest
- FU3 validation
- FU4 AuthClient mapping

Contract:

- CT1 POST /login success contract
- CT2 POST /login invalid credentials contract
- CT3 POST /login validation/error contract

Backend Integration:

- I1 POST /login OK
- I2 wrong password
- I3 unknown user
- I4 locked user
- I5 malformed request
- I6 repository failure

Backend Unit:

Include tests for:

- User Aggregate
- User.authenticate()
- Email Value Object
- PasswordHash
- AuthenticateUser Use Case
- repository-related behaviour

---

## 11. Impact graph

The graph must NOT contain artificial direct relationships such as:

```text
login.e2e -> User.authenticate()
```

Instead model LOCAL relationships:

```text
E2E -> UI
UI -> frontend logic
frontend logic -> API client
API client -> API contract
API contract -> inbound adapter
adapter -> use case
use case -> aggregate
use case -> port
secondary adapter -> port
```

Test relationships must also be local.

Example:

```text
C1 -> LoginButton

FU1 -> normalizeEmail

CT1 -> POST /login contract

I1 -> LoginController / AuthenticateUser

BU7 -> User.authenticate()
```

The global impact relationship emerges by graph traversal.

---

## 12. Evidence types

Every graph edge must contain a reason/source.

Example:

```json
{
  "from": "AuthClient.login",
  "to": "POST /login",
  "type": "calls",
  "evidence": "static"
}
```

Possible evidence types:

- static
- runtime
- contract
- architecture
- test-coverage

The demo must allow inspecting why an edge exists.

Do NOT use AI-generated semantic relationships as authoritative edges.

---

## 13. Impact engine

Create:

`packages/impact-engine`

Responsibilities:

1. Receive original repository state.
2. Receive modified demo state.
3. Calculate diff.
4. Identify changed entities.
5. Traverse impact graph.
6. Respect contract boundaries.
7. Determine affected tests.
8. Explain every selected test.
9. Explain why unrelated test groups were excluded.

API concept:

```ts
calculateImpact(diff, graph)
```

returns:

```json
{
  "changedEntities": [],
  "affectedNodes": [],
  "selectedTests": [],
  "excludedTests": [],
  "boundaries": [],
  "explanations": []
}
```

Selection MUST be deterministic.

No LLM.
No embeddings.
No vector search.

---

## 14. Initial implementation strategy

For the POC, prefer correctness and explainability over building a universal
static-analysis framework.

It is acceptable to generate part of `graph.json` during build using deterministic
TypeScript analysis and supplement architectural relationships through explicit,
version-controlled metadata.

However:

DO NOT hardcode:

`scenario X => tests A,B,C`

The engine must actually traverse relationships.

Changing graph relationships must change selection results naturally.

---

## 15. Demo application

`apps/demo`

The demo should feel like a combination of:

- GitHub repository browser
- lightweight IDE
- architecture explorer
- CI visualization

Dark technical visual style.

Avoid presentation-slide aesthetics.

---

## 16. Main layout

Left:

Repository tree.

Example:

```text
apps
 ├ frontend
 │  ├ LoginPage.tsx
 │  ├ LoginButton.tsx
 │  ├ useLogin.ts
 │  └ AuthClient.ts
 │
 └ backend
    └ auth
       ├ domain
       │  ├ User.ts
       │  ├ Email.ts
       │  └ UserRepository.ts
       ├ application
       │  └ AuthenticateUser.ts
       └ infrastructure
          └ LoginController.ts
```

Center:

Monaco Editor.

Display real repository files.

Allow editing an in-memory/demo copy.

Never modify the actual repository from the browser.

Right/bottom:

Impact information.

---

## 17. Suggested changes

Provide quick demo actions:

- Change LoginButton
- Change frontend login logic
- Change User.authenticate()
- Break API contract

Clicking one should produce a realistic source-code modification in Monaco.

The user may also manually edit files.

---

## 18. Calculate regression

Primary CTA:

`CALCULATE REGRESSION`

On click:

```text
modified files
    ↓
diff
    ↓
changed entities
    ↓
impact graph
    ↓
contract boundaries
    ↓
selected tests
```

Animate the graph traversal.

Do NOT fake this by selecting tests based on scenario name.

---

## 19. Impact visualization

Use React Flow.

Show architectural levels clearly:

```text
E2E
UI
Frontend Application
API Client

--------------------
API CONTRACT
--------------------

Primary Adapter
Application / Use Case
Domain
Ports
Secondary Adapters
```

Nodes:

- normal = neutral
- changed = visually highlighted
- affected = highlighted
- unaffected = muted

Selected test nodes must be visible.

Excluded tests should remain visible but muted.

---

## 20. Test selection panel

Example:

```text
Regression calculated

E2E             1 / 1
Component       4 / 8
Frontend Unit   2 / 4
Contract        3 / 3
Integration     0 / 6
Backend Unit    0 / 17

10 / 39 selected
29 tests avoided
```

Each selected test must have:

`WHY?`

Clicking WHY shows the graph path that caused its selection.

Example:

```text
useLogin
  → LoginForm
  → login.e2e
```

or:

```text
User.authenticate
  → AuthenticateUser
  → LoginController
  → POST /login
  → login.e2e
```

---

## 21. Contract boundary behaviour

This is one of the most important educational parts.

Scenario:

Change frontend `useLogin()`.

Expected:

- affected frontend unit tests
- affected component tests
- contract tests
- login E2E

NOT:

- backend unit tests
- backend integration tests

Explain visually:

`API contract unchanged. Impact propagation stops at the contract boundary.`

Backend change:

`User.authenticate()`

Expected:

- affected backend unit tests
- affected integration tests
- contract tests
- login E2E

NOT:

- frontend unit tests
- frontend component tests

Explain:

`Frontend implementation unchanged. Contract provides the boundary evidence.`

Contract change:

`POST /login` contract itself changes.

Expected:

- propagation crosses both sides
- relevant frontend tests
- contract tests
- relevant backend tests
- E2E

Explain:

`Contract changed. The architectural boundary itself is affected.`

---

## 22. Run tests

Provide:

`RUN SELECTED TESTS`

This must execute the ACTUAL selected tests.

Show:

- test name
- type
- status
- duration

Example:

```text
✓ User authenticates valid password     21ms
✓ User rejects invalid password         18ms
✓ POST /login OK                        93ms
✓ POST /login locked                    87ms
✓ POST /login contract                  41ms
✓ login happy path                    1100ms
```

Do not simulate execution.

---

## 23. Full regression

Provide:

`RUN FULL SUITE`

Execute all tests.

Compare:

```text
Selected regression
10 tests
2.1 sec

Full regression
39 tests
8.4 sec

Execution avoided
74%
```

Use measured values, not hardcoded values.

---

## 24. Application view

Provide navigation:

- APPLICATION
- CODE
- IMPACT GRAPH
- TESTS

APPLICATION:

Show the actual login app running.

CODE:

Repository + Monaco.

IMPACT GRAPH:

Interactive graph.

TESTS:

Catalogue and latest execution.

The user should understand that all four views represent the SAME application.

---

## 25. Educational UX

The application should explain itself through interaction rather than long text.

Suggested guided flow:

1. Choose or make a code change.
2. Calculate regression.
3. See how impact propagates.
4. Inspect why tests were selected.
5. Run selected tests.
6. Compare with full regression.

Use small contextual explanations.

Avoid walls of documentation.

A developer should understand the concept within ~30 seconds.

---

## 26. Important scenarios

Ensure these work end-to-end.

### Scenario A — UI

Modify `LoginButton`.

Expected approximate selection:

- 3 / 8 component
- 1 / 1 E2E

No backend tests.

Show why.

### Scenario B — Frontend logic

Modify `useLogin` / `normalizeEmail`.

Expected approximate selection:

- 2 / 4 frontend unit
- 4 / 8 component
- 3 / 3 contract
- 1 / 1 E2E

No backend unit/integration tests.

Contract boundary stops propagation.

### Scenario C — Domain

Modify:

`User.authenticate()`

Expected approximate selection:

- 5 / 17 backend unit
- 4 / 6 integration
- 3 / 3 contract
- 1 / 1 E2E

No frontend unit/component tests.

Contract boundary stops unnecessary propagation.

### Scenario D — Contract

Modify `POST /login` contract.

This is deliberately different.

The boundary itself changed.

Impact MUST propagate to both sides.

Select relevant:

- frontend
- contract
- backend
- E2E

Use this scenario to demonstrate why contracts are architectural anchors.

---

## 27. Determinism

Display somewhere in the UI:

`DETERMINISTIC SELECTION`

Allow opening an explanation:

```text
No AI is used to select tests.

Selection is calculated from:
- code changes
- graph relationships
- test evidence
- architectural boundaries

Same change + same graph = same selection.
```

---

## 28. Validation

Before considering the task complete:

- `pnpm install` works
- `pnpm build` works
- frontend runs
- backend runs
- demo runs
- login actually works
- all tests pass initially
- Playwright E2E really runs
- Calculate Regression works
- each scenario produces a different selection
- Run Selected Tests executes real tests
- Run Full Suite executes real tests
- measured durations are displayed
- graph explains selection paths
- contract boundaries stop propagation correctly
- contract-change scenario crosses the boundary
- no LLM is used at runtime
- architecture dependency rules are respected

Add automated architecture tests if practical to ensure:

- domain cannot import application/infrastructure
- application cannot import infrastructure

---

## 29. README

Document:

- goal
- architecture
- DDD model
- hexagonal boundaries
- test taxonomy
- impact engine
- deterministic guarantees
- how to run
- how to add a new graph node/test relationship

Include one architecture diagram.

Keep README concise.

---

## 30. Implementation approach

Work autonomously.

Before coding:

1. inspect this specification
2. produce a short implementation plan
3. establish monorepo structure
4. implement vertical slice first

Recommended first vertical slice:

```text
real Login app
→ User Aggregate
→ POST /login
→ one test of each type
→ impact graph
→ one deterministic selection
→ demo visualization
```

Once this works end-to-end, expand to the complete test catalogue and scenarios.

Do NOT build all UI first and fake the backend later.

The proof of concept is successful only if the underlying system is real.

Commit coherent milestones.

Prioritize:

1. correctness
2. architecture
3. determinism
4. explainability
5. visual polish

---

# 31. Phased execution and model handoff

This project MUST be implemented in phases.

Do not attempt to complete the entire project in one uninterrupted run.

Each phase has:
- a clear scope
- validation criteria
- a recommended model
- a mandatory checkpoint
- an explicit handoff instruction to the user when a model change is recommended

The agent MUST NOT silently continue into the next phase if the next phase recommends a different model.

Instead, once the phase is complete and validated, stop and tell the user exactly:

> Phase X complete and validated.  
> Recommended next model: `<MODEL>` with `<THINKING LEVEL>`.  
> Please switch to that model and tell me to continue with Phase Y.

Preserve all repository state, commits, TODOs and implementation notes so the next model can continue without rediscovering the project.

Maintain a small file:

`/docs/IMPLEMENTATION_STATE.md`

Update it at the end of every phase with:

- completed work
- architecture decisions
- files/modules created
- tests currently passing
- known limitations
- next phase
- exact recommended model
- exact next task

This file is the handoff contract between model phases.

---

## PHASE 0 — Architecture and planning

Recommended model:

**GPT-6 Astra**  
Thinking: **Medium**

Goal:

Design the system before implementation.

Tasks:

- validate the SDD
- define workspace structure
- define DDD model
- define hexagonal boundaries
- define dependency direction
- define test taxonomy
- define graph node and edge types
- define contract boundary behaviour
- define impact-selection algorithm
- define execution architecture for running selected tests from the demo UI

Produce:

- repository structure
- architecture decisions
- minimal implementation plan
- graph schema
- test metadata schema
- API between demo and impact-engine

Do NOT build visual polish.

Do NOT create the full test catalogue yet.

Exit criteria:

- architecture is internally consistent
- domain/application/infrastructure boundaries are explicit
- impact engine design is deterministic
- no AI is required at runtime
- implementation plan is written to `IMPLEMENTATION_STATE.md`

Commit:

`chore: define test impact architecture`

Then STOP.

Output:

> Phase 0 complete and validated.  
> Recommended next model: GPT-6 Astra with Medium thinking.  
> Please stay on/switch to Astra Medium and tell me to continue with Phase 1.

---

## PHASE 1 — Real vertical slice

Recommended model:

**GPT-6 Astra**  
Thinking: **Medium**

This is the most important implementation phase.

Build ONE complete vertical slice:

Frontend:
- LoginPage
- LoginForm
- useLogin
- AuthClient

Contract:
- POST /login

Backend:
- LoginController
- AuthenticateUser
- User Aggregate
- UserRepository Port
- InMemoryUserRepository Adapter

Tests:
- at least 1 domain unit test
- at least 1 application unit test
- at least 1 component test
- at least 1 contract test
- at least 1 integration test
- 1 Playwright E2E

Impact engine:
- real graph
- real changed-entity input
- deterministic traversal
- real test selection

The vertical slice must work end-to-end.

Run and validate all tests.

Do not fake test execution.
Do not fake graph selection.

Exit criteria:

- login application works
- backend follows DDD + hexagonal architecture
- all test levels execute
- impact engine can select at least one real subset
- Playwright E2E runs successfully
- architecture rules are validated

Commit:

`feat: implement functional login impact vertical slice`

Then update `IMPLEMENTATION_STATE.md` and STOP.

Output:

> Phase 1 complete and validated.  
> Recommended next model: GPT-5.6 Sol with Medium thinking.  
> Please switch to Sol Medium and tell me to continue with Phase 2.

---

## PHASE 2 — Complete test catalogue and impact relationships

Recommended model:

**GPT-5.6 Sol**  
Thinking: **Medium**

Goal:

Expand the working architecture without redesigning it.

Create approximately:

- 1 E2E
- 8 component
- 4 frontend unit
- 3 contract
- 6 backend integration
- 17 backend unit

≈ 39 meaningful tests.

Each test MUST have real local relationships with graph nodes.

Do not create duplicate tests only to achieve a target count.

Implement the four scenarios:

- A — LoginButton UI change
- B — useLogin frontend logic change
- C — User.authenticate domain change
- D — API contract change

Expected behaviour:

### A

select:
- component subset
- E2E

### B

select:
- frontend unit subset
- component subset
- contract tests
- E2E

do not propagate into backend internals

### C

select:
- backend unit subset
- integration subset
- contract tests
- E2E

do not propagate into frontend internals

### D

contract itself changes

propagation crosses both sides

select relevant:
- frontend
- contract
- backend
- E2E

Add automated tests for the impact engine itself.

Exit criteria:

- each scenario selects a different deterministic subset
- selection is validated through automated tests
- contract boundaries behave as specified
- explanations exist for every selected test

Commit:

`feat: complete deterministic impact scenarios`

Update `IMPLEMENTATION_STATE.md` and STOP.

Output:

> Phase 2 complete and validated.  
> Recommended next model: GPT-5.6 Sol with Medium thinking.  
> Please stay on/switch to Sol Medium and tell me to continue with Phase 3.

---

## PHASE 3 — Interactive demo application

Recommended model:

**GPT-5.6 Sol**  
Thinking: **Medium**

Build `apps/demo`.

Required views:

- APPLICATION
- CODE
- IMPACT GRAPH
- TESTS

Implement:

- repository tree
- Monaco editor
- in-memory code modifications
- suggested changes
- Calculate Regression
- selected/excluded tests
- WHY explanation
- React Flow graph
- architectural layers
- anchors / contract boundaries
- changed nodes
- affected nodes
- unaffected nodes

The UI must operate against the REAL impact engine.

Do not duplicate impact logic inside the frontend.

Exit criteria:

- changing demo code produces a diff
- Calculate Regression invokes the real engine
- graph matches engine output
- selected tests match CLI/engine results
- explanations are visible

Commit:

`feat: add interactive test impact explorer`

Update `IMPLEMENTATION_STATE.md` and STOP.

Output:

> Phase 3 complete and validated.  
> Recommended next model: GPT-5.6 Sol with Medium thinking.  
> Please stay on/switch to Sol Medium and tell me to continue with Phase 4.

---

## PHASE 4 — Real test execution from the demo

Recommended model:

**GPT-5.6 Sol**  
Thinking: **Medium**

Goal:

Turn the visualization into a functional proof.

Implement:

- RUN SELECTED TESTS
- RUN FULL SUITE

The browser must request execution from a local/server-side runner.

Never execute arbitrary browser-provided shell commands.

Use known test IDs mapped to controlled commands.

Capture:

- test ID
- type
- status
- duration
- stdout/stderr when useful

Display live or near-live progress.

Compare:

- selected count
- full count
- selected duration
- full duration
- tests avoided
- execution time reduction

Values MUST come from real executions.

Exit criteria:

- selected tests execute physically
- full suite executes physically
- results are shown correctly
- failures are represented correctly
- no simulated timing
- no simulated PASS status

Commit:

`feat: execute selected regression from demo`

Update `IMPLEMENTATION_STATE.md` and STOP.

Output:

> Phase 4 complete and validated.  
> Recommended next model: GPT-5.6 Terra with Medium thinking.  
> Please switch to Terra Medium and tell me to continue with Phase 5.

---

## PHASE 5 — UX and visual polish

Recommended model:

**GPT-5.6 Terra**  
Thinking: **Medium**

The architecture and algorithms are now FROZEN unless a real defect is found.

Focus only on:

- visual hierarchy
- graph readability
- transitions
- dark technical design
- repository browsing experience
- selected vs excluded test clarity
- contract-boundary visualization
- onboarding hints
- responsive layout
- wording

The demo should explain itself through interaction.

A developer seeing it for the first time should understand:

1. something changed
2. impact propagated through the graph
3. some tests were selected
4. other tests were excluded for a reason
5. contract tests stopped unnecessary propagation
6. the selected tests can actually execute

within approximately 30 seconds.

Avoid adding unnecessary text.

Exit criteria:

- no architecture regressions
- all existing tests still pass
- visual experience is coherent
- desktop experience is presentation-ready

Commit:

`style: polish test impact demo`

Update `IMPLEMENTATION_STATE.md` and STOP.

Output:

> Phase 5 complete and validated.  
> Recommended next model: GPT-5.6 Sol with High thinking.  
> Please switch to Sol High and tell me to continue with Phase 6.

---

## PHASE 6 — Technical audit

Recommended model:

**GPT-5.6 Sol**  
Thinking: **High**

Do NOT add features unless required to fix a defect.

Audit the complete project as a skeptical senior engineer.

Specifically challenge:

- Is DDD actually respected?
- Is the architecture truly hexagonal?
- Are dependency directions correct?
- Is User genuinely acting as Aggregate Root?
- Are ports/adapters correctly located?
- Are contract tests really providing a boundary?
- Can impact accidentally propagate past a boundary?
- Is selection truly deterministic?
- Are any scenario-to-test mappings hardcoded?
- Are graph relationships explainable?
- Can the same diff produce different selection?
- Are selected tests really executed?
- Could the demo execute arbitrary code?
- Are there hidden mocked/simulated results?
- Are tests meaningless or duplicated?
- Is full-suite comparison real?
- Are architecture tests sufficient?

Fix discovered issues.

Run the complete validation suite.

Commit:

`fix: harden deterministic impact analysis demo`

Update `IMPLEMENTATION_STATE.md` and STOP.

Output:

> Phase 6 complete and validated.  
> Recommended next model: GPT-5.6 Luna with Low thinking for documentation cleanup, or stop here if no additional work is needed.

---

## PHASE 7 — Documentation cleanup (optional)

Recommended model:

**GPT-5.6 Luna**  
Thinking: **Low**

Only mechanical work:

- README cleanup
- command examples
- typo fixes
- small comments
- remove dead code
- formatting
- minor naming consistency

Do not redesign architecture.
Do not modify selection behaviour.

Final validation:

- `pnpm build`
- `pnpm test`
- all impact-engine tests
- all contract tests
- all integration tests
- Playwright E2E

Commit:

`docs: finalize test impact lab`

---

## Model escalation rule

If during any phase the assigned model encounters an architectural ambiguity or cannot satisfy validation after two reasonable attempts:

STOP.

Do not repeatedly patch around the problem.

Recommend escalation:

- Terra → Sol Medium
- Sol Medium → Sol High
- Sol High → Astra Medium
- Astra Medium → Astra High

State:

1. what is failing
2. why it appears to require stronger reasoning
3. current repository state
4. next concrete action

Then ask the user to switch models.

---

## Model downgrade rule

Likewise, do not waste an expensive model on mechanical work.

If the remaining work in the current phase becomes purely repetitive or cosmetic, finish the coherent unit of work, update `IMPLEMENTATION_STATE.md` and recommend moving to the cheaper model assigned to the next phase.

---

## Critical handoff rule

A new model must NEVER start by redesigning the project.

At the beginning of every continuation:

1. Read this SDD.
2. Read `/docs/IMPLEMENTATION_STATE.md`.
3. Inspect recent git history.
4. Run the existing validation relevant to the previous phase.
5. Continue from the documented next task.

Do not repeat already completed work.
Do not replace working architecture because another pattern is preferred.
Only change previous architectural decisions when there is a concrete defect and document why.

---

## Final success criteria

The demo is successful only if all of the following are true:

- the monorepo is real
- the login app is real
- the backend genuinely follows DDD + hexagonal architecture
- User is a real Aggregate Root
- ports/adapters are real architectural boundaries
- contract tests are real and actively used as impact boundaries
- test selection is deterministic
- graph traversal drives selection
- no scenario-to-test hardcoding exists
- all test categories execute for real
- selected tests can be executed from the demo
- full regression can be executed from the demo
- execution timing is measured
- test avoidance is measured
- every selected test can be explained
- excluded test groups can be explained
- contract changes propagate across both sides
- non-contract changes stop at the boundary
- no AI is used at runtime for selection
- the same diff + graph always yields the same selected tests
- a developer can understand the concept in roughly 30 seconds
