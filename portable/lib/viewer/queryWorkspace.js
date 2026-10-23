import { neighborhood } from "./neighborhood.js";
import { rowKey } from "./rowHelpers.js";
export const FACET_KEYS = [
    'repository',
    'workspace',
    'language',
    'kind',
    'relation',
    'category',
    'runner',
    'variant',
    'evidence',
    'validity',
    'changed',
    'uncertainty',
    'status',
    'snapshot',
];
export const pageBounds = (options) => ({
    offset: Math.max(0, Math.min(10000000, Math.trunc(Number(options.offset)) || 0)),
    limit: Math.max(1, Math.min(80, Math.trunc(Number(options.limit)) || 40)),
});
const matchSets = (index, options) => FACET_KEYS.filter((key) => options[key]).map((key) => index.facets.get(key)?.get(options[key]) ?? new Set());
const matchingEdges = (index, edge, options) => {
    if (options.relation && edge.relationship !== options.relation) {
        return false;
    }
    if (options.snapshot && !edge.snapshots.includes(options.snapshot)) {
        return false;
    }
    if (options.cause &&
        !index.model.causes[options.cause]?.edgeIds.includes(edge.id)) {
        return false;
    }
    return ['evidence', 'validity'].every((key) => !options[key] ||
        edge.evidenceIds.some((id) => index.evidence.get(id)?.facets[key]?.includes(options[key])));
};
export const queryWorkspace = (index, section, options = {}) => {
    const rows = section === 'groups' ? index.model.nodes : index.sections[section];
    if (!rows) {
        throw new Error('Unknown view section');
    }
    const { offset, limit } = pageBounds(options);
    const sets = matchSets(index, options);
    const search = (options.q ?? '').toLowerCase();
    const path = (options.path ?? '').toLowerCase();
    const scope = section === 'graph' || section === 'groups'
        ? neighborhood(index, options)
        : { ids: null, limited: false };
    const matches = rows.filter((row) => (!scope.ids || scope.ids.has(row.id)) &&
        sets.every((set) => set.has(rowKey(row))) &&
        (!search || index.search.get(rowKey(row))?.includes(search)) &&
        (!path || row.path.toLowerCase().includes(path)));
    const visible = matches.slice(offset, offset + limit);
    const ids = new Set(visible.map((row) => row.id));
    const groups = section === 'groups' ? groupRows(index, matches, options) : [];
    const edges = section !== 'graph'
        ? []
        : index.model.edges.filter((edge) => ids.has(edge.from) &&
            ids.has(edge.to) &&
            matchingEdges(index, edge, options));
    return {
        items: section === 'groups'
            ? []
            : visible.map((row) => ({ ...row, entries: [] })),
        edges: edges.slice(0, 240),
        totalPageEdges: edges.length,
        groupCount: groups.length,
        total: rows.length,
        matched: matches.length,
        offset,
        limit,
        hidden: rows.length - visible.length,
        neighborhoodLimited: scope.limited,
        ...(section === 'groups'
            ? { groups: groups.slice(offset, offset + limit) }
            : {}),
    };
};
const groupRows = (index, rows, options) => {
    const groups = new Map();
    const groupBy = ['workspace', 'kind', 'language'].includes(options.groupBy)
        ? options.groupBy
        : 'workspace';
    const ids = new Set(rows.map((row) => row.id));
    const nodeGroup = new Map();
    for (const row of rows) {
        const id = row.facets[groupBy]?.[0] ?? 'unknown';
        nodeGroup.set(row.id, id);
        const group = groups.get(id) ?? { id, nodes: 0, edges: 0 };
        group.nodes++;
        groups.set(id, group);
    }
    countGroupEdges(index, options, ids, nodeGroup, groups);
    return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
};
const countGroupEdges = (index, options, ids, nodeGroup, groups) => {
    for (const edge of index.model.edges) {
        if (!ids.has(edge.from) ||
            !ids.has(edge.to) ||
            !matchingEdges(index, edge, options)) {
            continue;
        }
        incrementGroups(edge, nodeGroup, groups);
    }
};
const incrementGroups = (edge, nodeGroup, groups) => {
    for (const id of new Set([
        nodeGroup.get(edge.from),
        nodeGroup.get(edge.to),
    ])) {
        const group = id ? groups.get(id) : undefined;
        if (group) {
            group.edges++;
        }
    }
};
