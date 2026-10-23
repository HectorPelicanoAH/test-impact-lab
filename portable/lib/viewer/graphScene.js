export const graphScene = (index) => ({
    nodes: index.model.nodes.map((row) => ({
        id: row.id,
        label: row.label,
        path: row.path,
        kind: row.columns.Kind ?? 'unknown',
        workspace: row.facets.workspace?.[0] ?? '(unassigned)',
        changed: row.facets.changed?.includes('changed') ?? false,
        role: row.columns.Role ?? 'unknown',
        snapshots: row.facets.snapshot ?? [],
        language: row.facets.language?.[0] ?? 'unknown',
    })),
    edges: index.model.edges.map(({ id, from, to, relationship, snapshots }) => ({
        id,
        from,
        to,
        relationship,
        snapshots,
    })),
    causes: index.model.causes,
    preferredWorkspace: index.model.units[0]?.facets.workspace?.[0] ?? null,
});
