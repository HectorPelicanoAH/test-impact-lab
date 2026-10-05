# Corpus G1 — Evaluación de descubrimiento

Este es código de prueba **no ejecutable como producto**, fuera de las raíces del typecheck y del catálogo del login. Contiene deliberadamente un error de parseo, un import ausente y un archivo Vue. No arreglarlos: son entradas negativas. El prototipo no se exporta desde el motor ni se conecta al generador, API, overlays o UI.

- [Fuentes del corpus](project/tsconfig.json): 14 archivos, 1 601 bytes, 40 líneas según `split('\n')` (incluye configuración y entradas negativas).
- [Oráculo revisado](oracle.json): 19 ocurrencias verdaderas y 7 casos que requieren diagnóstico; además prohibiciones y una mutación alta/modificación/baja/renombrado. Escrito contra las fuentes, no extraído por ninguno de los motores.
- [Contrato objetivo](../../../docs/GRAPH-V2-CONTRACT.md): no confundir el pequeño formato del experimento con un snapshot v2 de producción.
- [ADR y resultados](../../../docs/ADR-G1-INDEXER.md).

## Reproducir

Desde la raíz del repositorio, con las dependencias pnpm instaladas:

```sh
pnpm exec vitest run tests/dependency-graph
node --import tsx scripts/g1/evaluate.ts
```

El segundo comando vuelve a medir TypeScript y compara con la evidencia CGC fijada; **no vuelve a ejecutar CGC**. Rechaza un corpus diferente del usado por CGC. Los tests rechazan evidencia obsoleta, cambios de oráculo o divergencias de los hechos normalizados; las duraciones no son assertions.

Para repetir CGC (opcional para el producto, necesario para renovar su evidencia), Python 3.14.6 funcionó en macOS arm64 con LadybugDB embebido:

```sh
G1_ENV=$(mktemp -d /tmp/test-impact-g1-cgc.XXXXXX)
python3 -m venv "$G1_ENV"
"$G1_ENV/bin/python" -m pip install 'codegraphcontext==0.6.13'
"$G1_ENV/bin/python" scripts/g1/evaluate-cgc.py --cgc "$G1_ENV/bin/cgc"
node --import tsx scripts/g1/evaluate.ts
pnpm exec vitest run tests/dependency-graph
rm -rf "$G1_ENV"
```

Las versiones transitivas **observadas** están fijadas en `packages` del [resultado CGC](results/cgc.json). Una instalación futura solo con el pin principal puede resolver otras transitivas; para replicación exacta, instalar ese conjunto en un venv compatible. No se promete reproducibilidad binaria entre plataformas. El script falla explícitamente ante error/timeout; no atribuye resultados a un motor que no se ejecutó.

CGC se ejecuta con HOME/base/corpus temporales, entorno sin credenciales heredadas y SCIP/vector/inherit-resolve/auto-watch desactivados. No usa MCP, consultas en lenguaje natural ni un LLM. Cada proceso tiene 180 s de timeout. Las fuentes originales se verifican por hash y las copias/base se eliminan al salir. **No ejecutar `cgc index` directamente contra las fuentes**: CGC crea un archivo de exclusiones automáticamente en la raíz indexada.

## Cómo se puntúa

Precisión = TP / (TP + FP); exhaustividad = TP / número de ocurrencias verdaderas. Denominador vacío de precisión = `null`, no 100 %. Una omisión diagnosticada satisface la aceptación conservadora del prototipo, pero cuenta como FN y **no mejora el recall**. El evaluador también rechaza relaciones inesperadas y comprueba el texto exacto de cada rango TypeScript.

TypeScript experimental usa `Program` + `TypeChecker` y resolución del `tsconfig` del corpus, no búsqueda de nombres. Soporta declaraciones directas, alias de import, reexportaciones, namespace, JSX e `implements`. Constructor, alias local y despacho por interfaz/callback quedan diagnosticados; no se afirma análisis general de flujo de datos, rutas, overloads, lambdas o dependencias de paquetes. Ausencia de lib estándar es deliberada: no hay llamadas de biblioteca en este corpus. G2 necesita un adaptador robusto para producto real.

CGC se evalúa sobre consultas Cypher reales. Se exportan sus tipos/paths/nombres/líneas/texto/confianza, sin fabricar columnas ni revisión. La normalización recupera método cualificado solo de `CONTAINS` y reclasifica el import literal `CALLS → File` como import. **No resuelve sus módulos con TypeScript**, no acepta `HEURISTIC_CALLS` y no deduce destinos desde el oráculo. Un `Module` sin path es referencia de specifier, no archivo resuelto. Por eso se distingue detección sintáctica de exhaustividad de relaciones resueltas.

`diagnostic-by-evaluator` es un hallazgo de esta evaluación; no implica que CGC emita un diagnóstico estructurado. Las coincidencias semánticas CGC no cumplen todavía la evidencia v2: cero aristas CGC se admiten en un grafo autoritativo. El falso enlace se conserva en el informe como fallo del candidato, no se corrige silenciosamente.

## Artefactos

- [comparison.json](results/comparison.json): hechos TypeScript con rangos y hashes, métricas de ambos, clasificación por caso, delta y equipo/tamaño/tiempos.
- [cgc.json](results/cgc.json): paquetes, hashes de entradas, comandos/stdout/stderr, tiempos y consultas de base/actualización/rebuild. Rutas temporales normalizadas.
- [Pruebas de corpus](../../../tests/dependency-graph/corpus.test.ts) y [comparación](../../../tests/dependency-graph/comparison.test.ts): 39 comprobaciones de G1, fuera del catálogo de producto.

Los tiempos TypeScript miden la extracción en un proceso Node ya iniciado; CGC incluye inicio Python/CLI, backend y persistencia. Las cachés del host no se vacían. Una muestra pequeña no es un benchmark universal ni una comparación de rendimiento equivalente. La igualdad CGC tras update/rebuild cubre **los campos exportados**, no todos los atributos internos. No se ha implementado ni probado vigilancia de producción: pertenece a G2.