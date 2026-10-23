---
name: test-impact-onboard
description: Inspect a repository and implement deterministic test-impact tooling through a project-specific SDD, explicit adapters and attributable test coverage. Use to onboard a project or extend its test-impact support.
---

# Test Impact Onboarding

Produce a working, repeatable integration for the repository the user selects. Inspect its stack before choosing extractors, runners or coverage providers.

## Locate the tools

If the portable CLI is available, run `impact info` to locate its SDD and actual capabilities. Otherwise use its checkout with `node /path/to/toolkit/bin/impact.mjs info`. Read the project's own instructions first.

The extraction preview implements inspection and a read-only viewer. It does **not** implement a coverage baseline, impact selection or selected-test execution. Never present those future commands as working. Inspect the installed version rather than assuming capabilities.

## Incorporate a project

Run `impact inspect --root <project>` when available. Treat file-pattern matches as candidates; obtain authoritative identities from the runner before implementing selection. Inspection must not execute package scripts.

Read [the onboarding reference](references/onboarding.md) when preparing the project profile and SDD. Use [the template](assets/ONBOARDING-SDD.template.md) as a starting point, adapting its sections to the actual project.

Record capabilities, needs, unresolved constructions, variants, contract boundaries, execution units and a measurable acceptance plan. Implement only within the user's authorized scope; an existing authorization may span multiple phases.

Prefer compiler/runtime APIs, native coverage, OpenTelemetry and existing contract formats when they meet the project's requirements. Add an adapter with explicit supported versions and a corpus; do not add project-name special cases to the common engine.

## Evidence rules

- Imports and calls are static dependencies; coverage demonstrates execution, not assertions.
- Create E2E-to-product execution links only from attributable instrumentation.
- Other test types may have static dependency links, clearly separate from measured coverage.
- Trace context does not separate global coverage counters. Isolate processes, validate contextual counters, or measure/select a group.
- Do not split aggregate coverage into invented per-case coverage.
- Consider dependencies before and after the change, including deleted files and unobserved new paths.
- Missing, stale or ambiguous evidence broadens selection; no hits alone do not prove no impact.
- An unchanged schema does not establish behavioral compatibility with a provider.
- Human declarations may describe intent or add mandatory tests; they do not establish coverage or justify exclusions.

Use medium reasoning for bounded implementation and higher reasoning only for unresolved attribution, identity/invalidation or exclusion rules. Keep full regression available while validating against selected runs.

## Deliver

Leave project configuration, versioned adapters, reproducible commands, CI integration within scope, validation evidence and a resumable state document. Distinguish implemented operations, untested integrations and planned work. Runtime selection must work without an LLM.

## Common viewer requirement

Use the packaged Code / Graph / Tests viewer, including its precompiled browser
and presentation backend, when exporting or onboarding the toolkit. Preserve
full graph exploration and inline source/relationship-origin inspection. Keep
project-specific profiles, measurements and development evidence in the
consuming repository; never promote those into the reusable toolkit.
