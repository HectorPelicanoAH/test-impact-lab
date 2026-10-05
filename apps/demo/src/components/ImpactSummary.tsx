import type { ImpactGraph, ImpactResult, TestKind, TestMetadata } from '@test-impact/impact-engine';

const labels: Record<TestKind, string> = {
  e2e: 'E2E', component: 'Component', 'frontend-unit': 'Frontend unit', contract: 'Contract', integration: 'Integration', 'backend-unit': 'Backend unit',
};
const order: TestKind[] = ['e2e', 'component', 'frontend-unit', 'contract', 'integration', 'backend-unit'];

export function pathLabels(testId: string, result: ImpactResult, graph: ImpactGraph) {
  const reason = result.explanations.find(item => item.testId === testId);
  if (!reason) return [];
  const edgeMap = new Map(graph.edges.map(edge => [edge.id, edge]));
  const labels = [reason.changedNode];
  for (const step of reason.path) {
    const edge = edgeMap.get(step.edgeId);
    if (edge) labels.push(step.direction === 'forward' ? edge.to : edge.from);
  }
  return labels;
}

export function ImpactSummary({ result, catalogue, graph, onWhy }: {
  result?: ImpactResult; catalogue: TestMetadata[]; graph: ImpactGraph; onWhy: (id: string) => void;
}) {
  if (!result) return <section className="impact-empty"><span>01</span><h2>Make a code change</h2><p>Edit a file or choose a suggested change, then calculate regression.</p></section>;
  return <section className="impact-summary">
    <div className="result-heading"><div><span className="status-dot" />Regression calculated</div><strong>{result.selectedTests.length} / {catalogue.length}</strong></div>
    <div className="taxonomy">{order.map(kind => {
      const tests = catalogue.filter(test => test.kind === kind);
      const selected = tests.filter(test => result.selectedTests.includes(test.id)).length;
      return <div key={kind}><span>{labels[kind]}</span><strong>{selected} / {tests.length}</strong><i style={{ width: `${tests.length ? selected / tests.length * 100 : 0}%` }} /></div>;
    })}</div>
    <div className="avoidance"><strong>{catalogue.length - result.selectedTests.length}</strong><span>tests avoided</span></div>
    {result.boundaries.length > 0 && <div className="boundary-stack"><div className="panel-title">CONTRACT BOUNDARIES</div>{result.boundaries.map(boundary => <div key={`${boundary.contractId}:${boundary.origin}`} className={`boundary-note ${boundary.crossed ? 'crossed' : ''}`}><b>{boundary.crossed ? 'BOUNDARY CHANGED' : 'BOUNDARY HELD'}</b>{boundary.reason}</div>)}</div>}
    <div className="selected-list"><div className="panel-title">SELECTED TESTS</div>{result.selectedTests.map(id => {
      const test = catalogue.find(item => item.id === id)!;
      const path = pathLabels(id, result, graph);
      return <div className="selected-row" key={id}><div><b>{id}</b><span>{test.name.replace(/^\[[^\]]+\]\s*/, '')}</span><small>{path.join(' → ')}</small></div><button onClick={() => onWhy(id)}>WHY?</button></div>;
    })}</div>
  </section>;
}
