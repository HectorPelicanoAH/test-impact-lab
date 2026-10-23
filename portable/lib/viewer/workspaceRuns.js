export const workspaceRuns = (model, cases) => {
    const catalogue = new Map(cases.map((item) => [item.id, item]));
    const sources = new Map();
    for (const source of model.sources) {
        const entries = sources.get(source.path) ?? [];
        entries.push({
            type: 'source',
            id: source.id,
            label: `Open ${source.snapshot} test file`,
        });
        sources.set(source.path, entries);
    }
    return model.runs.map((row) => ({
        ...row,
        entries: [
            ...row.entries,
            ...catalogueLinks(row, catalogue),
            {
                label: 'Recorded test file versions',
                description: 'Source versions with this path; file capture is not individual case coverage.',
                references: sources.get(row.path) ?? [],
            },
        ],
    }));
};
const catalogueLinks = (row, catalogue) => {
    const data = row.entries[0]?.data;
    if (!data ||
        typeof data !== 'object' ||
        !('portableId' in data) ||
        typeof data.portableId !== 'string') {
        return [];
    }
    const item = catalogue.get(data.portableId);
    return item
        ? [
            {
                label: 'Bound catalogue identity',
                description: item.label,
                references: [
                    { type: 'case', id: item.id, label: 'Open catalogue case' },
                ],
            },
        ]
        : [];
};
