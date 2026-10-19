# Provenance and separation

This distribution is prepared on the `feat/instalable` branch of test-impact-lab. The source revision before extraction is `29050d51e4f11e5808994e62531100c1b8dae807`.

## Reused components

The canonical serializer and hash in `src/core.mjs` are extracted from `scripts/graph/core.ts`, removing lab-specific imports and types. Normalization and validation are added for an explicitly experimental inspection format.

The visual design retains the graph, test table, and evidence inspector concept. The viewer implementation is new, without React/Monaco/React Flow or dependencies on login, orders, Inventory, broker, scenes, or the product editor.

The `src/import-v2.mjs` bridge reads an exported v2 graph/archive. It does not import the legacy selector or its rules, and preserves reviewed subjects as declarations. It validates the view format's structure, not dataset authenticity or completeness as a baseline.

## Outside this root

The demo, services, product tests, and scenario files remain in the source lab. They are not copied when this distribution is exported.

The lab's full discoverer and impact engine use specific configuration and metadata. Adapting them to the general contract requires P1–P5; they have not been moved as though they were a universal engine.

The historical dependency SDDs, v2 contract, and G9 audit provide background. Their original paths are mentioned in the SDD as historical documentation and are not imports or links required to run the package.

## Formats

`test-impact-view/1` is the E0 extraction's reading/visualization format. It is not yet P2's complete bundle and does not certify coverage or test exclusion.

The general SDD and skill are designed to evolve through explicit versions. Public distribution and licensing will be decided later; this package is marked private and UNLICENSED.
