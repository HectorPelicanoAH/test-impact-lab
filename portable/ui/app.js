const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
let offset = 0, requestNumber = 0, detailNumber = 0, selectedId;
let diagnosticOffset = 0, diagnosticRequest = 0;
const limit = 40;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function api(path, options = {}) {
  const response = await fetch(path + '?' + new URLSearchParams(options));
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'No se pudo leer el artefacto.');
  return data;
}
function fail(error) { $('status').textContent = error.message; }
function button(text, action, className) {
  const node = element('button', text, className);
  node.type = 'button';
  node.addEventListener('click', () => Promise.resolve().then(action).catch(fail));
  return node;
}
function svg(tag, attributes = {}, text) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
async function showEvidence(id, container, token) {
  const data = await api('/api/evidence', { id });
  if (token !== detailNumber) return;
  const details = element('details');
  details.open = true;
  details.append(element('summary', data.evidence.kind + ' · ' + id));
  details.append(element('pre', JSON.stringify(data.evidence, null, 2), 'evidence'));
  if (data.source) {
    details.append(element('p', data.source.path));
    details.append(element('pre', data.source.content));
  } else details.append(element('p', 'Fuente no incluida. El localizador conserva la referencia original.'));
  container.replaceChildren(details);
}
async function showNode(id, linkOffset = 0) {
  const token = ++detailNumber;
  const data = await api('/api/node', { id, offset: linkOffset });
  if (token !== detailNumber) return;
  selectedId = id;
  $('selection-title').textContent = data.node.label;
  const box = $('selection');
  box.replaceChildren(element('p', data.node.kind + ' · ' + (data.node.group ?? data.node.repositoryId ?? 'Sin grupo')));
  box.append(element('pre', JSON.stringify(data.node, null, 2)));
  box.append(element('h3', 'Enlaces ' + (data.links.length ? linkOffset + 1 : 0) + '–' + (linkOffset + data.links.length) + ' de ' + data.totalLinks));
  for (const edge of data.links) {
    const card = element('div', undefined, 'link-card');
    const other = edge.from === id ? edge.to : edge.from;
    card.append(button(edge.fromLabel + ' → ' + edge.toLabel, () => showNode(other)));
    card.append(element('p', edge.type));
    const evidenceBox = element('div');
    for (const evidenceId of edge.evidenceIds) {
      card.append(button('Ver evidencia', () => showEvidence(evidenceId, evidenceBox, token), 'evidence-button'));
    }
    card.append(evidenceBox);
    box.append(card);
  }
  const paging = element('div', undefined, 'pager');
  if (linkOffset) paging.append(button('Enlaces anteriores', () => showNode(id, Math.max(0, linkOffset - 50))));
  if (linkOffset + data.links.length < data.totalLinks) paging.append(button('Más enlaces', () => showNode(id, linkOffset + 50)));
  box.append(paging);
  for (const group of $('graph').querySelectorAll('.node')) group.classList.toggle('selected', group.dataset.id === id);
}
function renderGraph(data) {
  const canvas = $('graph');
  canvas.replaceChildren();
  const columns = 4, width = 1000, rowHeight = 100;
  const positions = new Map(data.nodes.map((node, i) => [node.id, { x: 20 + (i % columns) * 248, y: 20 + Math.floor(i / columns) * rowHeight }]));
  canvas.setAttribute('viewBox', '0 0 ' + width + ' ' + Math.max(150, Math.ceil(data.nodes.length / columns) * rowHeight + 20));
  for (const edge of data.edges) {
    const from = positions.get(edge.from), to = positions.get(edge.to);
    const path = svg('path', { class: 'edge', d: 'M ' + (from.x + 108) + ' ' + (from.y + 60) + ' L ' + (to.x + 108) + ' ' + (to.y + 30) });
    path.append(svg('title', {}, edge.type));
    canvas.append(path);
  }
  for (const node of data.nodes) {
    const pos = positions.get(node.id);
    const group = svg('g', { class: 'node', transform: 'translate(' + pos.x + ',' + pos.y + ')', tabindex: '0', role: 'button', 'aria-label': node.label + ', ' + node.kind });
    group.dataset.id = node.id;
    group.classList.toggle('selected', selectedId === node.id);
    group.append(svg('rect', { width: 226, height: 64, rx: 7 }));
    group.append(svg('text', { x: 12, y: 25 }, node.label.length > 27 ? node.label.slice(0, 25) + '…' : node.label));
    group.append(svg('text', { x: 12, y: 46, class: 'kind' }, node.kind));
    group.append(svg('title', {}, node.label + '\n' + node.id));
    group.addEventListener('click', () => showNode(node.id).catch(fail));
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showNode(node.id).catch(fail); }
    });
    canvas.append(group);
  }
}
async function refresh() {
  const token = ++requestNumber;
  const filters = { offset, limit, q: $('search').value };
  for (const name of ['group', 'kind', 'relation', 'evidence']) filters[name] = $(name).value;
  const data = await api('/api/graph', filters);
  if (token !== requestNumber) return;
  $('visibility').textContent = data.nodes.length + ' visibles · ' + data.matchedNodes + ' coinciden · ' + data.totalNodes + ' totales. Enlaces entre nodos de esta página.';
  $('previous').disabled = offset === 0;
  $('next').disabled = offset + data.nodes.length >= data.matchedNodes;
  renderGraph(data);
  $('nodes').replaceChildren(...data.nodes.map(node => {
    const item = button(node.label, () => showNode(node.id));
    item.append(element('small', node.kind + ' · ' + (node.group ?? node.repositoryId ?? 'Sin grupo')));
    return item;
  }));
  if (!data.nodes.length) $('nodes').append(element('p', 'No hay nodos que coincidan con los filtros.'));
}
async function start() {
  const data = await api('/api/summary');
  $('title').textContent = data.metadata.title;
  $('revision').textContent = data.id.slice(0, 16) + ' · ' + data.format;
  $('status').replaceChildren(element('strong', data.metadata.sample ? 'Ejemplo ilustrativo. ' : 'Artefacto de consulta. '),
    document.createTextNode((data.metadata.note ?? '') + ' No se calcula un porcentaje global de cobertura ni se certifica selección de tests.'));
  $('metrics').replaceChildren(...Object.entries(data.counts).map(([key, value]) => {
    const labels = { nodes: 'Nodos', edges: 'Relaciones', evidence: 'Evidencias', diagnostics: 'Diagnósticos' };
    const item = element('div', undefined, 'metric');
    item.append(element('strong', value), element('span', labels[key]));
    return item;
  }));
  for (const [name, key] of [['group', 'groups'], ['kind', 'kinds'], ['relation', 'relations'], ['evidence', 'evidence']]) {
    for (const value of data.filters[key]) {
      const option = element('option', value);
      option.value = value;
      $(name).append(option);
    }
    $(name).addEventListener('change', () => { offset = 0; refresh().catch(fail); });
  }
  let timer;
  $('search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { offset = 0; refresh().catch(fail); }, 150); });
  $('reset').addEventListener('click', () => {
    for (const name of ['search', 'group', 'kind', 'relation', 'evidence']) $(name).value = '';
    offset = 0;
    refresh().catch(fail);
  });
  $('previous').addEventListener('click', () => { offset = Math.max(0, offset - limit); refresh().catch(fail); });
  $('next').addEventListener('click', () => { offset += limit; refresh().catch(fail); });
  $('diagnostics-previous').addEventListener('click', () => { diagnosticOffset = Math.max(0, diagnosticOffset - 10); loadDiagnostics().catch(fail); });
  $('diagnostics-next').addEventListener('click', () => { diagnosticOffset += 10; loadDiagnostics().catch(fail); });
  await Promise.all([refresh(), loadDiagnostics()]);
}
async function loadDiagnostics() {
  const token = ++diagnosticRequest;
  const diagnostics = await api('/api/diagnostics', { offset: diagnosticOffset, limit: 10 });
  if (token !== diagnosticRequest) return;
  $('diagnostics-count').textContent = (diagnostics.items.length ? diagnosticOffset + 1 : 0) + '–' + (diagnosticOffset + diagnostics.items.length) + ' de ' + diagnostics.total;
  $('diagnostics-previous').disabled = diagnosticOffset === 0;
  $('diagnostics-next').disabled = diagnosticOffset + diagnostics.items.length >= diagnostics.total;
  $('diagnostics').replaceChildren(...diagnostics.items.map(item => {
    const block = element('details', undefined, 'diagnostic');
    block.append(element('summary', (item.code ?? item.id) + (item.message ? ' · ' + item.message : '')));
    block.append(element('pre', JSON.stringify(item, null, 2)));
    return block;
  }));
  if (!diagnostics.total) $('diagnostics').append(element('p', 'El artefacto no contiene diagnósticos. Esto no certifica su exhaustividad.'));
}
start().catch(fail);
