# Onboarding reference

Collect these facts from code and configuration, preserving their origin:

- Included/excluded roots, languages and effective module resolution.
- Packages, assets, generated code, configuration and external inputs.
- Runners, authoritative test identity, parameterization and execution granularity.
- Fixtures, mocks, hooks, processes and relevant variants.
- Available coverage mechanisms, source maps and isolation constraints.
- Contracts, bindings and which external implementations are accessible.
- CI comparison base, artifact transport, baseline trust and refresh policy.

Do not require source code on both sides of a contract. Represent contract-only visibility and unavailable external tests explicitly.

Design the first integration for the actual supported subset. For unsupported or dynamic constructions, emit diagnostics with a conservative scope. A full rebuild is acceptable before incremental extraction is proven equivalent.

A baseline records source/build/test/configuration/tool versions and the units actually captured. Validate expected results, retries, flush, missing shards and source mapping. A complete capture is complete for its declared plan, not exhaustive over possible product behavior.

The quick check consumes compatible baseline evidence and before/after dependencies. It must not run tests to decide which tests to select. Reuse historical evidence only under explicit compatibility rules; recapture changed units after execution.

CI should begin in observation/shadow mode. Publish artifacts keyed by content and provenance. A candidate PR artifact must not replace a trusted reference without the project's promotion checks.

Validate with resolution/identity negatives and meaningful controlled changes. Compare selected and full results on the same code and equivalent independent environments. A regression full detects but selection omits is a blocking omission within the claimed scope.
