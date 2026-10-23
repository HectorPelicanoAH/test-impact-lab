export const sourcePreviews = (index, rows) => rows.flatMap((row) => row.entries.flatMap((entry) => entry.references.flatMap((reference) => {
    const source = index.sources.get(reference.id);
    if (reference.type !== 'source' || !source) {
        return [];
    }
    return [
        {
            sourceId: source.id,
            label: `${source.snapshot} · ${source.path}`,
            range: recordedRange(entry.data),
            ...(row.type === 'evidence' ? { evidenceId: row.id } : {}),
        },
    ];
})));
const position = (value) => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    if (!('line' in value) || !('column' in value)) {
        return null;
    }
    const { line, column } = value;
    return typeof line === 'number' &&
        Number.isInteger(line) &&
        line >= 1 &&
        typeof column === 'number' &&
        Number.isInteger(column) &&
        column >= 0
        ? { line, column }
        : null;
};
const recordedRange = (data) => {
    if (!data || typeof data !== 'object') {
        return undefined;
    }
    if ('range' in data) {
        return recordedRange(data.range);
    }
    if ('locator' in data) {
        return recordedRange(data.locator);
    }
    if (!('start' in data) || !('end' in data)) {
        return undefined;
    }
    const start = position(data.start);
    const end = position(data.end);
    return start && end && end.line >= start.line
        ? {
            start,
            end,
            lineBase: 1,
            columnBase: 0,
            columnUnit: 'utf16',
            endExclusive: true,
        }
        : undefined;
};
