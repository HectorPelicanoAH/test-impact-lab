import { languageOf, workspaceOf } from "./rowHelpers.js";
export const legacyWorkspace = (snapshot) => ({
    format: 'test-impact-workspace/1',
    title: snapshot.metadata.title,
    identities: { view: snapshot.id },
    verification: [
        'Inspection snapshot integrity verified; no measured baseline or selection is certified.',
    ],
    notices: [
        snapshot.metadata.sample ? 'Illustrative sample.' : 'Inspection artifact.',
        snapshot.metadata.note ??
            'Imported inspection facts preserve their evidence class.',
        'Coverage denominator unknown: no overall percentage is calculated.',
    ],
    metrics: {
        Nodes: snapshot.nodes.length,
        Relationships: snapshot.edges.length,
        'Evidence records': snapshot.evidence.length,
        Diagnostics: snapshot.diagnostics.length,
    },
    nodes: snapshot.nodes.map((node) => ({
        id: node.id,
        type: 'node',
        label: node.label,
        path: node.locations?.[0]?.path ?? '',
        facets: {
            workspace: [node.group ?? workspaceOf(node.locations?.[0]?.path ?? '')],
            repository: [node.repositoryId ?? 'inspection'],
            kind: [node.kind],
            language: [languageOf(node.locations?.[0]?.path ?? '')],
            uncertainty: ['inspection-only'],
            snapshot: ['inspection'],
        },
        columns: { Kind: node.kind },
        entries: [
            {
                label: 'Inspection record',
                description: 'No coverage or exclusion guarantee',
                references: [],
                data: node,
            },
            ...(node.locations ?? []).map((location) => ({
                label: 'Archived source locator',
                description: location.path,
                references: [
                    {
                        type: 'source',
                        id: location.path,
                        label: 'Open archived source',
                    },
                ],
            })),
        ],
    })),
    edges: snapshot.edges.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        relationship: edge.type,
        evidenceIds: edge.evidenceIds,
        snapshots: ['inspection'],
    })),
    evidence: snapshot.evidence.map((evidence) => ({
        id: evidence.id,
        type: 'evidence',
        label: evidence.kind,
        path: evidence.locator?.path ?? '',
        facets: {
            evidence: [evidence.kind],
            validity: ['unverified'],
            uncertainty: ['inspection-only'],
            snapshot: ['inspection'],
        },
        columns: { Class: evidence.kind, Validity: 'unverified' },
        entries: [
            {
                label: evidence.kind,
                description: 'Imported inspection evidence',
                references: evidence.locator?.path
                    ? [
                        {
                            type: 'source',
                            id: evidence.locator.path,
                            label: 'Inspect archived source or locator',
                        },
                    ]
                    : [],
                data: evidence,
            },
        ],
    })),
    diagnostics: snapshot.diagnostics.map((diagnostic) => ({
        id: diagnostic.id,
        type: 'diagnostic',
        label: diagnostic.code ?? diagnostic.id,
        path: '',
        facets: {},
        columns: { Message: diagnostic.message ?? '' },
        entries: [
            {
                label: diagnostic.code ?? diagnostic.id,
                description: diagnostic.message ?? '',
                references: [],
                data: diagnostic,
            },
        ],
    })),
    units: [],
    impact: [],
    runs: [],
    causes: {},
    context: [],
    sources: [
        ...new Set([
            ...Object.keys(snapshot.sources),
            ...snapshot.nodes.flatMap((node) => (node.locations ?? []).map((location) => location.path)),
            ...snapshot.evidence.flatMap((row) => row.locator?.path ? [row.locator.path] : []),
        ]),
    ].map((path) => ({
        id: path,
        path,
        hash: null,
        revision: null,
        snapshot: 'inspection',
        status: Object.hasOwn(snapshot.sources, path)
            ? 'archived-unverified'
            : 'locator-only',
        ...(Object.hasOwn(snapshot.sources, path)
            ? { content: snapshot.sources[path] }
            : {}),
    })),
});
