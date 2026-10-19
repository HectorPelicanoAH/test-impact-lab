# State — Portable graph generation and test selection

Last updated: **2026-10-19**.

SDD: [SDD.md](SDD.md).

## Authorized scope

The user requested a comprehensive SDD (P0), then an independent foundation on their branch that can become another repository (E0). Full P1–P8 implementation remains pending.

The SDD is general: the first stack and repository are chosen after inspection. Neither frontend, backend, nor their coexistence is assumed.

## Phases

| Phase | Status | Result / next condition |
| --- | --- | --- |
| P0 — Specification | Complete | SDD, this log, and a README link. |
| E0 — Extraction and packaging | Complete | Self-contained root, exporter, inspection CLI, viewer, v2 bridge, and initial skill validated. |
| P1 — Inspection and needs | Pending | Designate an accessible repository and start the inspection scope. |
| P2 — Contract and corpus | Pending | Schemas, validators, identity, and conformance. |
| P3 — Graph and catalogue | Pending | First adapter chosen using P1 evidence. |
| P4 — Instrumentation | Pending | Coverage attribution, baseline, and OTel as needed. |
| P5 — Impact | Pending | Exclusion, validity, incrementality, and selected/full. |
| P6 — CLI and CI | Pending | Reproducible operation and first validated wrapper. |
| P7 — Common UI | Pending | Portable inspection, filters, and scale measurements. |
| P8 — Skill and audit | Pending | Second onboarding and final adoption evidence. |

## Established decisions

- Prioritize determinism, verifiable evidence, and ecosystem tools.
- Per-test or demonstrable group coverage as code-execution evidence.
- OpenTelemetry for context, correlation, and observations; it does not replace coverage.
- E2E→product-code links only through attributable instrumentation.
- Other test types may have static dependencies, preserving the distinction from coverage.
- No manual QA associations as a basis for excluding regression tests.
- Group units when individual capture mixes counters or is infeasible.
- Expensive initial baseline and subsequent checks without executing tests.
- Positive historical evidence plus before/after analysis and expansion under uncertainty.
- Inherit evidence only with demonstrated compatibility, not merely absence of hits.
- Contracts as explicit boundaries, without confusing equal schemas with semantic compatibility.
- Common artifacts for CLI, CI, and UI; the engine does not consult an LLM.
- Recommended reasoning levels per task/phase, without specific models.

## P0 work

- Reviewed existing SDDs and contracts, base/target analysis, and G7 limitations.
- Consulted official OTel/W3C, coverage, JSON Schema, JCS, and source-map references.
- Documented R01–R18 requirements, artifacts, capture, validity, algorithm, CLI experience, CI, UI, skill, and operation.
- Defined P0–P8 phases, acceptance, traceability matrix, and open decisions.
- Added a discovery link to README.

## Delivery validation

The original P0 delivery was documentation. E0 adds inspection/query CLI, view-format normalization/validation, v2 import, and an initial skill. It does not implement selection, an instrumented baseline, or CI integration.

Closure review:

- Checked diff formatting and whitespace, including new documents.
- Resolved local links and contents anchors; code fences are closed.
- R01–R18 requirements and P0–P8 phases are present and traceable.
- Recommendations use reasoning levels without specific models.
- Reviewed reuse conditions, absence of hits, concurrent attribution, contracts, and CI fallback.

## E0 delivery

- Independent root with a Node package, CLI binary, and zero external runtime dependencies.
- Available CLI: `inspect`, `validate`, `import-v2`, `view`, and `info`.
- Read-only viewer with global search, filters, node/link/diagnostic pagination, and evidence inspector.
- v2 bridge preserving reviewed declarations without certifying the dataset as a baseline.
- Self-contained skill with a reference and onboarding SDD template.
- Exporter preparing an empty directory without Git history, services, or demo data.
- SDD/state moved into this root; previous lab locations retain continuation links.
- README covering available usage, local installation, export, and future workflow.

### E0 verification

Validated with Node.js 24.18.0:

- `node --test` from the package root: **7/7 passed**, no skips. Includes executing the CLI from an exported copy and rejecting unavailable commands.
- Export to a temporary root and offline installation in another consuming project: passed; the installed binary runs `info` and `inspect`.
- Official skill-creator validator: **Skill is valid!** PyYAML was installed only in a temporary directory removed afterward.
- Chromium against a real lab v2 archive: **382 nodes, 545 relationships, and 452 diagnostics**. Search, evidence, filters, pagination, and a 390 px viewport passed without page errors.
- Desktop/mobile screenshots retained under `.impact-runs/portable-browser/` in the validation lab; they are local evidence and are not exported with the tool.
- Local documentation links stay within the exportable root; JS syntax and diff formatting were reviewed.

The browser experiment is reproduced in the lab with `node scripts/verify-portable-browser.mjs --snapshot <v2-archive>`. It uses the lab's Playwright installation without adding that dependency to the toolkit.

Resolved incidents: the initial sandbox prevented the HTTP test from opening its local port; verification ran with that permission. The first mobile experiment detected overflow from long content; containers/sources were corrected and diagnostics paginated before closure.

### Current limitations

`test-impact-view/1` is an experimental inspection contract. P2 remains pending for complete bundles. There is no instrumented baseline, selector, selected-test runner, or operational CI wrapper. Inspection candidates are not an authoritative catalogue. Future commands fail explicitly.

## Continuation

Read the SDD and this state first. After E0, the next work is P1: audit reuse and inspect the repository designated by the user, producing capabilities, needs, and an onboarding SDD.

Without an accessible pilot repository, authorized internal auditing can proceed while actual inspection remains pending. Do not invent results or mark P1 complete.
