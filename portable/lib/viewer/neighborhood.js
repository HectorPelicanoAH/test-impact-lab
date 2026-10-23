export const neighborhood = (index, options) => {
    if (options.cause) {
        const cause = index.model.causes[options.cause];
        if (!cause) {
            throw new Error('Unknown cause scope');
        }
        return { ids: new Set(cause.nodeIds), limited: false };
    }
    if (!options.focus) {
        return { ids: null, limited: false };
    }
    const state = {
        ids: new Set([options.focus]),
        visitedEdges: 0,
        limited: false,
    };
    let frontier = [options.focus];
    const depth = Math.max(1, Math.min(2, Number(options.depth) || 1));
    for (let level = 0; level < depth && !state.limited; level++) {
        frontier = expandLevel(index, frontier, options.direction, state);
    }
    return { ids: state.ids, limited: state.limited };
};
const expandLevel = (index, frontier, direction, state) => {
    const next = [];
    for (const id of frontier) {
        expandNode(index, id, direction, state, next);
        if (state.limited) {
            break;
        }
    }
    return next;
};
const expandNode = (index, id, direction, state, next) => {
    for (const edge of index.neighbors.get(id) ?? []) {
        if (++state.visitedEdges > 20000 || state.ids.size >= 5000) {
            state.limited = true;
            return;
        }
        const candidate = neighborOf(edge, id, direction);
        if (candidate && !state.ids.has(candidate)) {
            state.ids.add(candidate);
            next.push(candidate);
        }
    }
};
const neighborOf = (edge, id, direction = 'both') => {
    if (direction === 'dependencies') {
        return edge.from === id ? edge.to : null;
    }
    if (direction === 'consumers') {
        return edge.to === id ? edge.from : null;
    }
    return edge.from === id ? edge.to : edge.from;
};
