# ADR G1 — Indexador de dependencias

Fecha: 2026-10-05. Estado: aceptado para la siguiente fase, sin cambiar el generador de producción.

## Decisión

Usar **TypeScript Compiler API 5.9.3 mediante adaptador**, con declaraciones revisadas donde no se pueda resolver el destino. No usar CodeGraphContext como fuente autoritativa ni dependencia obligatoria. La integración real, inventario de producto, watcher, publicación atómica y overlays nuevos siguen pendientes de autorización G2.

CGC podría reevaluarse como adaptador no autoritativo o con otro backend/indexador en una fase futura expresamente autorizada. Esta decisión solo evalúa CGC 0.6.13 / Tree-sitter / LadybugDB con la configuración registrada; no atribuye resultados a SCIP, Neo4j ni versiones diferentes.

## Contexto y método

La base real usa 69 nodos, 84 aristas y 39 tests del login. Solo inventaría nodos registrados. El nombre `test-coverage` etiqueta sujetos revisados, no medición. No existen rangos/revisiones por arista ni namespaces. La web carga un snapshot de proceso y editar código no reconstruye topología.

G1 creó un [contrato v2 y migración](GRAPH-V2-CONTRACT.md), y un [corpus independiente](../impact/corpus/g1/README.md). Ambos motores recibieron los mismos 14 archivos (1 601 bytes / 40 líneas); sus manifiestos de hashes se comparan automáticamente. Las expectativas se revisaron contra el código, incluyendo que construcción e inyección local sí tienen destino real aunque el prototipo TypeScript prefiera diagnosticarlas. No se transformó una limitación del prototipo en ausencia de verdad esperada.

Evaluación de 19 ocurrencias: 9 imports, 8 llamadas (incluye constructor), 1 JSX y 1 implementación. Otros 7 casos requieren diagnóstico. Los cambios agregan un archivo, modifican componente/import, eliminan un archivo desconectado y renombran un módulo con actualización de su import. El renombrado se comprueba como baja+alta, sin inventar identidad.

## Resultados medidos

| Motor / relación | TP | FP | FN | Precisión | Exhaustividad |
| --- | ---: | ---: | ---: | ---: | ---: |
| TypeScript / imports | 9 | 0 | 0 | 100 % | 100 % |
| TypeScript / calls | 5 | 0 | 3 | 100 % | 62,5 % |
| TypeScript / renders | 1 | 0 | 0 | 100 % | 100 % |
| TypeScript / implements | 1 | 0 | 0 | 100 % | 100 % |
| CGC / imports resueltos | 1 | 0 | 8 | 100 % | 11,1 % |
| CGC / calls | 4 | 1 | 4 | 80 % | 50 % |
| CGC / renders | 0 | 0 | 1 | N/A | 0 % |
| CGC / implements | 0 | 0 | 1 | N/A | 0 % |

- TypeScript: **16 relaciones correctas, 0 falsas, 10 diagnósticos**; los 26 casos quedan clasificados. Tres omisiones verdaderas (constructor, inyección local y alias de variable) cuentan como FN aunque tengan diagnóstico aceptado.
- CGC: `second()` en el [caso de homónimos](../impact/corpus/g1/project/main.ts) se enlaza a `lib/one.ts#same`, pero importa desde [el segundo módulo](../impact/corpus/g1/project/lib/two.ts). Se observa `confidence: 0.85`, tier 6; la confianza no convierte el destino en correcto. Este enlace se rechaza.
- CGC guarda 8 `IMPORTS` hacia `Module` sin path (incluido uno inexistente). Detecta specifiers, pero no proporciona identidades de archivo resueltas en esas relaciones. Se reconoce separadamente el import literal representado por CGC como `CALLS → File`, sin disfrazar los módulos sin resolver como aciertos.
- CGC deja `Port` como `ExternalClass` con `INHERITS`, aunque su interfaz está en el corpus. No se promueve a implementación resuelta. No exporta la relación JSX esperada.
- `HEURISTIC_CALLS` de CGC ofrece `viaPort → Adapter.send` sin demostrar binding y la llamada namespace con baja confianza. Ninguna heurística se acepta como autoritativa, ni siquiera si casualmente acierta.
- Cada omisión/fallo de CGC tiene clasificación del **evaluador**, no un diagnóstico nativo inventado. Todos sus enlaces quedan fuera de producción.

Los resultados completos por caso y el falso enlace están en [comparison.json](../impact/corpus/g1/results/comparison.json). No son listas de tests usadas por el motor.

## Evidencia, actualización y requisitos

| Aspecto | TypeScript experimental | CGC 0.6.13 evaluado |
| --- | --- | --- |
| Procedencia | Archivo, offsets, rango línea/columna UTF-16, texto, hash y versión de extractor | Paths, línea, texto de llamada y confianza/tier; `source`/`method` nulos en las llamadas exportadas, sin rango exacto ni revisión por arista |
| Identidad de homónimos | Declaración real del checker | Falso enlace observado en import alias/homónimo |
| Actualización | Rebuild del corpus modificado; determinismo ante orden inverso de entradas | `update` y `index --force` ejecutados; igualdad de nodos/aristas exportados, altas/bajas/renombrado comprobados |
| Requisitos | Node 24.18.0, TS 5.9.3 ya instalado; sin servicio adicional | Python 3.14.6, paquete CGC 0.6.13, Tree-sitter y LadybugDB; venv aislado, sin Docker ni servicio remoto |
| Tiempo base | 32,53 ms | 10 994,29 ms (CLI/base incluidos) |
| Cambio / reconstrucción | 5,16 ms, rebuild completo en proceso caliente | update 4 171,92 ms; rebuild forzado 3 712,21 ms |

Equipo: Apple M1 Pro, 10 CPU lógicas, arm64, macOS 26.7 (Node informa kernel Darwin 25.6.0). Una muestra, sin controlar cachés ni carga. **No son tiempos comparables de extremo a extremo ni promesa de escalabilidad**. La elección se sustenta en corrección y evidencia, no en la diferencia de velocidad.

[cgc.json](../impact/corpus/g1/results/cgc.json) registra versiones transitivas, hashes, consultas, salidas y tiempos. Se desactivaron SCIP, vector/inherit-resolve y auto-watch; no se invocó ningún LLM. El primer ensayo directo creó un archivo de exclusiones en el corpus; se retiró y el ensayo final usa exclusivamente copias temporales con verificación de hashes. Una consulta inicial usó una propiedad de final de rango no soportada por este backend; se corrigió al esquema verificado y se repitió el ensayo completo. Ninguno de esos fallos preliminares se presenta como resultado satisfactorio.

## Consecuencias y aceptación G1

- El contrato v2 conserva tipos semánticos distintos, revisión por snapshot, evidencia múltiple, diagnósticos, hashes completos y políticas explícitas. La migración preserva anclajes, sujetos y flags del login; reclasifica la falsa etiqueta de cobertura y revalida imports sin inventar rangos.
- El prototipo TypeScript es **un experimento**, no un extractor general listo para producción: no analiza todo el flujo de datos ni paquetes/lambdas/overloads/rutas. G2 deberá ampliar pruebas y emitir diagnósticos donde no resuelva. No se promete cobertura universal a partir de este corpus.
- Las pruebas comprueban fuente exacta, no enlaces por nombre, hash/determinismo, evolución, falsos enlaces del comparador y evidencia obsoleta. Todos los casos del adaptador elegido quedan resueltos o diagnosticados, sin falsos enlaces autoritativos.
- El generador, grafo/catalogue v1, motor, login, UI, configuración pnpm y lockfile permanecen sin modificaciones. G1 no despliega, publica ni añade servicios al flujo básico.
- No se ha implementado la migración, inventario de producto ni actualización de la web; son alcance de G2, no defectos ocultos de G1.

## Fuentes

- [Repositorio oficial CodeGraphContext](https://github.com/CodeGraphContext/CodeGraphContext).
- [Distribución PyPI 0.6.13](https://pypi.org/project/codegraphcontext/0.6.13/): versión y requisitos contrastados con el paquete instalado.
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API); versión efectiva registrada en la salida del experimento.
- Evidencia primaria: corpus y exports locales enlazados, no capacidades supuestas por documentación o marketing.