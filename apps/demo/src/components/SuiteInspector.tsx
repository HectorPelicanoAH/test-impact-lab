import { deferMonacoLayout } from '../monaco-layout';
import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { FederatedSuite, SuiteDecision } from '../../../../packages/impact-engine/src/federated';
import type { DemoExecution, DemoSuite } from '../types';

export function SuiteInspector({ suite, sessionId, token, execution, onGraph }: {
  suite: SuiteDecision | DemoSuite; sessionId?: string; token: string; execution?: DemoExecution; onGraph: () => void;
}) {
  const [data, setData] = useState<FederatedSuite & { source: string | null }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController(); setData(undefined); setError(undefined);
    if ('runner' in suite) { setData(suite); return () => controller.abort(); }
    if (!sessionId) { setError('Sesión no disponible.'); return () => controller.abort(); }
    void fetch('/api/graph-sessions/' + sessionId + '/suites/' + suite.id, { headers: { 'X-Test-Impact-Session': token }, signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); if (!controller.signal.aborted) setData(body); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Fuente no disponible.'); });
    return () => controller.abort();
  }, [suite, sessionId, token]);
  const result = execution?.suiteResults?.find(item => item.id === suite.id);
  const runner = data?.runner.includes('playwright') ? 'Playwright' : data?.runner === 'node-test' ? 'Node --test' : 'Vitest';
  return <section className="test-inspector"><div className="test-inspector-heading"><div><span>SUITE DISTRIBUIDA · {data ? runner : 'Cargando…'}</span><h2>{suite.id}</h2><p>{suite.file} · {suite.availability}</p></div>{'path' in suite && suite.path.length > 0 && <button onClick={onGraph}>Ver camino en el grafo</button>}</div>
    <div className="test-inspector-evidence"><div><b>QUÉ VALIDA</b><span>{data?.subjects.join(', ') ?? 'Sujetos revisados de la suite'}</span></div><div><b>MOTIVO</b><span>{'reason' in suite ? suite.reason : 'Suite registrada; calcula impacto para obtener su decisión.'}</span></div><div><b>RESULTADO</b><span className={result?.status === 'failed' ? 'failure-text' : ''}>{result?.status ?? 'Sin ejecutar'}{result?.durationMs !== undefined ? ' · ' + Math.round(result.durationMs) + ' ms' : ''}</span></div></div>
    {error && <p role="alert">{error}</p>}{data?.source === null && <p>Fuente externa inaccesible. No se inventa código ni resultado de ejecución.</p>}
    {data?.source && <div className="test-source-editor"><Editor key={suite.id} value={data.source} language={suite.file.endsWith('.mjs') ? 'javascript' : 'typescript'} theme="vs-dark" onMount={(editor, monaco) => { deferMonacoLayout(editor);
      const lines = data.source!.split('\n'), assertions = lines.flatMap((line, index) => /\b(assert|expect)\b/.test(line) ? [index + 1] : []);
      if (assertions[0]) editor.revealLineInCenter(assertions[0]);
      editor.createDecorationsCollection(assertions.map(line => ({ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, className: 'test-source-highlight' } })));
    }} options={{ readOnly: true, minimap: { enabled: false }, automaticLayout: false, fontSize: 12, scrollBeyondLastLine: false }} /></div>}
    {result?.output && <details className="test-failure" open={result.status === 'failed'}><summary>Salida de {runner}</summary><pre>{result.output}</pre></details>}
  </section>;
}
