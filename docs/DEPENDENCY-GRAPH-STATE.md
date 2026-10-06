# Estado — Descubrimiento de dependencias

## Control de ejecución

- SDD: [SDD-DEPENDENCY-GRAPH.md](SDD-DEPENDENCY-GRAPH.md).
- Autorización humana del 2026-10-05: «sigue», exclusivamente G1, GPT-6 Astra / xhigh confirmado por el usuario.
- Sin agentes adicionales, cambios automáticos de modelo, publicación remota ni despliegues externos.
- G1 no sustituyó el generador v1. G2, autorizada posteriormente, incorpora generación v2 y conserva v1 como semilla revisada explícita.
- Autorización humana adicional del 2026-10-05: «sigue», exclusivamente G2. Se conserva el trabajo local de G1 sin commit; no se crean agentes ni se cambia el modelo automáticamente.
- Autorización humana adicional del 2026-10-05: «sigue», exclusivamente G3. No se inicia G4 ni se cambia automáticamente de modelo.
- Autorización humana adicional del 2026-10-05: «sigue», exclusivamente G4. G5 no está autorizada; sin cambio automático de modelo ni agentes adicionales.
- Autorización humana del 2026-10-05: «siguiente», interpretada como siguiente fase pendiente, exclusivamente G5. No se crean agentes ni se cambia automáticamente el modelo. G6 no autorizada.
- Autorización humana del 2026-10-05: «sigue», exclusivamente G6. El usuario acordó GPT-6 Sol / high para conservar tokens; G7 no está autorizada. Sin agentes, commit/push ni despliegue.

- Autorización humana del 2026-10-06: «revisa que ya tengas todos los cambios hasta G6, y de ser así, sigue con G7». Checkout inicial limpio, HEAD `5a16090`, artefactos G1–G6 presentes. Solo G7; G8/G9 requieren otro «sigue».
- Autorización humana adicional del 2026-10-06: «sigue», exclusivamente G8. Se conservan los cambios locales de G7; sin agentes, cambio automático de modelo, commit/push ni despliegue externo. G9 requiere otro «sigue».
- Autorización humana adicional del 2026-10-06: «sigue», exclusivamente G9. Cambios G7/G8 conservados; auditoría final, sin agentes ni envío remoto. La ampliación termina en G9.

| Fase | Estado |
| --- | --- |
| G1 — Contrato, corpus y decisión de indexador | Completada |
| G2 — Descubrimiento estático y actualización | Completada |
| G3 — Inspector de evidencias | Completada |
| G4 — Pedidos y producto externo HTTP | Completada |
| G5 — Eventos, broker y consumidores | Completada |
| G6 — Impacto distribuido y runners | Completada |
| G7 — Trazas y correlación | Completada |
| G8 — Service mesh | Completada |
| G9 — Recorridos y auditoría final | Completada; parada final |

## G1 — Cierre

Árbol de trabajo limpio al comenzar. El estado histórico termina en fase 7 del SDD original; no equivale a G7 de esta ampliación.

### Auditoría inicial

- El generador recorre nodos registrados en metadatos, no todo el producto. Los imports usan resolución de TypeScript; las llamadas, inyección, rutas y sujetos locales de tests son declaraciones revisadas.
- Las evidencias v1 llamadas `test-coverage` son metadatos, no cobertura medida. La migración deberá corregir esa clasificación sin perder políticas ni sujetos.
- El analizador rechaza imports dinámicos no literales; no produce diagnósticos estructurados. El grafo v1 no registra rangos por arista ni revisión/extractor.
- Las identidades actuales no tienen namespace. Los nodos de tests carecen de fuente en el grafo; el catálogo sí contiene archivo y título.

### Comandos y resultados

- `git status --short`: limpio antes de G1.
- Base Git: `5389b12b5450b0c33a1bc6f97cd27029796c1e14`.
- Entorno observado: macOS 26.7 / arm64, Node 24.18.0, pnpm 11.19.0, TypeScript 5.9.3.
- `pnpm validate`: correcto; build, grafo 69 nodos / 84 aristas / 39 tests de producto, 64 tests Vitest en 17 archivos y 1 E2E Chromium. Advertencia conocida de tamaño de bundle Monaco.
- `pnpm test:execution`: correcto; selected 10 pasados / 3 fallidos intencionales, 11 306 ms; full 36 pasados / los mismos 3 fallidos, 22 039 ms. Overlays eliminados y checkout sin cambios del runner.
- CodeGraphContext 0.6.13 instalado en venv temporal con Python 3.14.6; ninguna dependencia Python añadida al proyecto. Backend LadybugDB embebido, sin Docker/servicios remotos ni LLM.
- `pnpm exec vitest run tests/dependency-graph/corpus.test.ts`: fase roja inicial por falta del prototipo; después se corrigieron texto exacto, recuentos manuales y tipado del mapa. Resultado final: 34 pruebas del corpus correctas.
- `"$G1_CGC_ENV/bin/python" scripts/g1/evaluate-cgc.py --cgc "$G1_CGC_ENV/bin/cgc"`: ejecutado sobre copias temporales; indexación 10 994,291 ms, update 4 171,924 ms, rebuild 3 712,213 ms. Update/rebuild iguales en campos exportados; fuentes originales intactas. Versiones, consultas y stdout/stderr en [evidencia CGC](../impact/corpus/g1/results/cgc.json).
- `node --import tsx scripts/g1/evaluate.ts`: correcto; TS 32,53 ms base / 5,16 ms rebuild modificado. Entradas idénticas a CGC comprobadas por hash. [Comparación completa](../impact/corpus/g1/results/comparison.json).
- `pnpm exec vitest run tests/dependency-graph`: 39 pruebas correctas (corpus y auditoría de resultados).
- `pnpm typecheck`: correcto. Diagnósticos del editor: sin errores en scripts/tests de G1. El error sintáctico del fixture es deliberado.
- **`pnpm validate` final:** correcto; build, grafo v1 idéntico (69/84/39), **103 tests Vitest en 19 archivos y 1 E2E Chromium**. Solo advertencia conocida de tamaño Monaco.
- `git diff --check`: correcto. Comparación de producción con Git: sin cambios en apps, packages, generador, análisis v1, grafo, catálogo, evidencia histórica, configuración o lockfile. No se cambió ningún servicio que ya estuviera ejecutándose.

### Entregables y decisiones

- [Contrato v2 y migración](GRAPH-V2-CONTRACT.md): namespaces/identidad, fuentes y anclajes semánticos separados, evidencias múltiples, diagnósticos, observaciones, políticas/direcciones, hashes, delta y migración que preserva el login.
- [Corpus y guía reproducible](../impact/corpus/g1/README.md): 14 archivos / 1 601 bytes / 40 líneas, 19 relaciones esperadas y 7 casos negativos; altas, bajas, modificación y renombrado comprobados.
- [ADR](ADR-G1-INDEXER.md): TypeScript 5.9.3 mediante adaptador + declaraciones revisadas. CGC 0.6.13 no obligatorio ni autoritativo por falso enlace de homónimos, resolución incompleta y evidencia insuficiente.
- TypeScript: 16 ocurrencias correctas, cero falsas, 10 diagnósticos; **26/26 casos clasificados**. Llamadas: precisión 100 %, exhaustividad 62,5 %; las tres omisiones diagnosticadas no cuentan como aciertos. Imports, JSX e implementación: 100 % en este corpus pequeño.
- CGC: llamadas 80 % precisión / 50 % exhaustividad; `second()` enlaza erróneamente al primer homónimo. Referencias `Module` sin fuente y `HEURISTIC_CALLS` no se promueven. Cero aristas CGC admitidas en producción. Sus omisiones tienen diagnóstico del evaluador, sin atribuirle diagnósticos nativos inventados.

### Evidencias de aceptación

| Criterio G1 | Resultado |
| --- | --- |
| Auditar y validar referencia real | Completo: validación y selected/full registradas arriba |
| Contrato v2 y migración definida | Completo: contrato documentado; implementación reservada a G2 |
| Corpus revisado con casos requeridos | Completo: oráculo independiente, negativos y evolución |
| Ejecutar y comparar TS/CGC en mismas fuentes | Completo: CLI CGC real y hashes de fuentes comparados |
| Cada caso resuelto o diagnosticado | Completo: adaptador elegido 26/26; CGC evaluado con fallos explícitos |
| Ningún enlace falso autoritativo | Completo: pruebas rechazan enlaces inesperados; falso CGC conservado como hallazgo |
| Decisión sustentada, producción intacta | Completo: ADR + comprobación Git + regresión login |

### Limitaciones y recursos

- No se ha implementado el esquema v2 en producción, migración ejecutable, watcher, API de altas/bajas ni inspector. No se inició G2.
- El prototipo no cubre todo TypeScript: alias de variables, constructores, callbacks e inyección requieren ampliación o diagnósticos; no se afirma cobertura universal.
- Timings con una muestra y diferentes límites de medición; no sirven para prometer escalabilidad. Equivalencia CGC solo de campos exportados, no de todos sus atributos internos.
- La primera indexación exploratoria de CGC creó un archivo de exclusiones en el corpus: se retiró. El ensayo definitivo usa copias temporales y verifica integridad. La primera consulta pidió una propiedad no soportada; se corrigió y se repitió el ensayo completo. No se ocultan esos intentos ni se confunden con aceptación.
- Los temporales del benchmark final se eliminaron automáticamente. Venv y HOME de la exploración retirados al cerrar G1; no se instalaron paquetes globales ni se abrieron puertos adicionales para CGC. Enlaces Markdown locales comprobados: correctos.
- Cambios locales sin commit/push. La UI no se modificó; se ejecutó el E2E real del login, no una supuesta validación visual de funcionalidades futuras.

### Siguiente acción al cerrar G1 (histórico)

**Detenerse.** Para G2, seleccionar **GPT-6 Astra / high** y esperar otro «sigue». En el siguiente hilo leer primero este registro y el SDD; después el contrato, ADR y corpus. G2 implementará inventario/extracción, snapshots/delta, actualización y overlays, preservando la regresión del login.

Fase G1 completada. Autorización posterior recibida para G2.

## G2 — Cierre

Autorización: «sigue» posterior al cierre de G1; solo G2. No se crearon agentes, se cambió automáticamente el modelo, se instalaron dependencias nuevas ni se iniciaron servicios de fases posteriores.

### Implementación y decisiones

- [Configuración explícita](../impact/discovery.json) y [tipos v2](../packages/impact-engine/src/schema-v2.ts): inventario de archivos desconectados, namespaces, revisión por contenido, rangos UTF-16 exactos y evidencia múltiple.
- [Adaptador TypeScript](../scripts/graph/extract.ts): programa virtual sin lectura de librerías externas; imports/alias/reexports, llamadas/construcción resolubles, JSX, `implements` y patrón acotado de React Router. Un homónimo no basta para crear una relación; incertidumbre y parseo fallido producen diagnóstico.
- [Migración/archivo](../scripts/graph/snapshot.ts): semilla v1 intacta, 69 nodos y 84 relaciones revalidadas en la base actual, flags y sujetos preservados. Cobertura manual se reclasifica como declaración revisada. Fuentes ausentes no conservan aristas vigentes inventadas.
- [Generador](../scripts/generate-graph.ts): `graph:generate`/`graph:check` publican/verifican v2; el generador v1 solo se invoca explícitamente con `--legacy-review`. Así, añadir/conectar un archivo no exige registrarlo antes en metadatos v1. `graph:legacy:check` audita la semilla histórica.
- [Persistencia](../scripts/graph/store.ts): archivo inmutable y puntero publicados mediante temporales/rename; error fatal o fallo de publicación conserva el puntero anterior. Hashes incluyen fuentes/tests, catálogo/configuración, extractores, políticas y todos los bytes de ejecución. Se verifican también entradas duplicadas de la proyección y manifiestos al cargar.
- Vigilancia real del filesystem con debounce y **reconstrucción completa**; no índice AST incremental. CLI `graph:watch`. API refresca en peticiones actuales, invalida análisis anteriores y deja accesible `GET /api/snapshots/:id` sin exigir que la extracción actual funcione.
- [Análisis](../scripts/graph/analyze.ts): dependencias/rangos anteriores y posteriores; delta separado de ambos snapshots. Selección estrecha del login solo dentro de su ámbito revisado. Altas/bajas, topología nueva y ámbito no demostrado amplían al catálogo completo disponible. Tests sin sujeto vigente se admiten solo bajo incertidumbre explícita y selección completa.
- [API](../apps/demo/server.ts) y [runner](../apps/demo/execution.ts): CRUD estricto dentro de raíces; rechazan traversal, symlinks/ancestros, colisiones case/NFC/archivo-directorio y límites excedidos. Materialización desde bytes capturados, nunca copia tardía del checkout. Binarios/no UTF-8 se rechazan, no se alteran silenciosamente.
- [Explorador](../apps/demo/src/App.tsx): alta/baja, edición, recálculo, delta y diagnósticos; descarte de respuestas de una copia de trabajo ya sustituida; diff de eliminación vacío. [Wrapper de diff](../apps/demo/src/components/SnapshotDiffEditor.tsx) corrige el orden de liberación de modelos de Monaco observado en Chromium. Inspector de evidencias y navegación completa siguen reservados a G3.

### Pruebas y resultados finales

Entorno: mismo Node 24.18.0 / pnpm 11.19.0 / TypeScript 5.9.3, Apple M1 Pro arm64 que en G1. Sin cambios de lockfile.

| Comando / comprobación | Resultado real |
| --- | --- |
| `pnpm validate` | Correcto: typecheck, bundles, generación/reconstrucción v2, **124 tests Vitest / 22 archivos y 1 E2E Chromium** del login |
| `pnpm graph:legacy:check` | Correcto: semilla 69 nodos / 84 aristas / 39 tests reales |
| `pnpm test:discovery-browser` | Correcto: alta desconectada → delta → edición import/JSX → nuevas relaciones → baja → nodos retirados; sin errores de página ni cambios de checkout |
| `pnpm test:execution` | Correcto: selected **10 pasados / 3 fallidos intencionales**, 11 453 ms; full **36 pasados / los mismos 3 fallidos**, 22 695 ms; selección v2 igual a v1 para esa mutación |
| `pnpm test:discovery-execution` | Correcto: componente añadido/conectado + hoja de estilos eliminada en overlay; **39 tests reales pasados**, 22 247 ms; checkout intacto |
| Pruebas de snapshots/vigilancia dentro de Vitest | Alta/baja con fs.watch real converge al hash de rebuild; error de configuración y fallo de publicación conservan versión anterior; archivo alterado rechazado |
| Diagnósticos del editor en los 29 archivos G2 comprobados | Sin errores; fixtures sintácticos deliberados de G1 no se corrigen |
| `git diff --check` y comparación de fuentes del login/semilla/lockfile | Correctos; producto, catálogo y evidencia revisada originales intactos |

Snapshot final validado: `11bab59b0ad64a80517714d6f452e8cfae9e4386053f2f674c914b2d361720f9`.

- **23 archivos de producto / 16 373 bytes**, 37 fuentes incluidos tests, 124 archivos de ejecución capturados.
- V2: **173 nodos / 234 aristas / 101 diagnósticos**: 94 `unresolved-symbol`, 6 `source-inaccessible`, 1 `ambiguous-dispatch`. No son fallos de tests ni cobertura medida: muchos corresponden a globals/librerías fuera del programa virtual. Se muestran como límites del análisis.
- Una muestra de `buildArchive` con entradas ya cargadas: **124,46 ms**, incluyendo extracción, migración y validación pero sin lectura inicial/publicación. No representa benchmark general ni rendimiento incremental.
- Informes locales en `.impact-runs/`; recorrido Chromium en `.impact-runs/g2-browser/summary.json` y captura real del delta. Archivos versionados en `.impact-snapshots/`. No se versionan en Git estos artefactos generados.

### Matriz de aceptación G2

| Criterio | Evidencia |
| --- | --- |
| Inventario incluye fuente desconectada | Fixture de huérfano, prueba fs.watch y alta desde navegador |
| Alta/conexión/modificación/baja actualizan relaciones | Pruebas de extractor/delta y recorrido Chromium real |
| Destino dinámico diagnosticado, homónimos sin falso enlace | Pruebas de llamadas/alias y negativo de import no literal |
| Reconstrucción equivalente conserva hash | Inversión del orden de fuentes, restauración tras baja, graph:check y watcher vs rebuild |
| Publicación atómica y conservación ante fallo | Configuración inválida y fallo inyectado después de escribir archivo, antes de actualizar puntero |
| CRUD seguro y aplicado realmente en runner | Negativos de API/rutas/symlink/case/NFC más 39 tests sobre overlay CRUD |
| Análisis antiguos invalidados e historial recuperable | Cambio de entrada HTTP rechaza ejecución antigua y devuelve fuentes históricas |
| Compatibilidad del login | Migración de todas las políticas/sujetos, sugerencias sin pérdida de selección y mismos fallos selected/full |

### Incidencias corregidas y límites

- Las primeras pruebas Chromium usaron un nombre accesible sin el marcador «modified» y el textarea IME auxiliar de Monaco. Se corrigieron contra el árbol accesible real; la edición usa `Editor content`. El recorrido detectó después un error real de desmontaje del diff, corregido y revalidado sin errores de página.
- Retirar evidencia de un sujeto borrado reveló una validación v1 que impedía el fallback completo; se corrigió sin relajar la validación de selecciones estrechas y quedó probado el caso de baseline ya incompleto.
- El programa virtual no resuelve universalmente dispatch dinámico, reflexión, callbacks indirectos, librerías externas, herencia ni todos los routers. React Router soportado requiere import conocido, `path` literal y `element={<Componente />}` directo. No se atribuyen capacidades futuras de G4–G8.
- La UI conserva una proyección de compatibilidad para caminos de login; el grafo v2 completo y los IDs anteriores/posteriores van en la API. Inspector navegable, filtros/vistas semánticas y aceptación de accesibilidad completa son G3, no se declaran terminados aquí.
- La vigilancia reconstruye todo. Almacén local sin política de retención ni garantía fsync frente a corte de energía; archivos históricos pueden contener fuente. Análisis en memoria limitados a 32; no sobreviven al reinicio, a diferencia de los snapshots.
- Runner local de confianza, **no sandbox de sistema operativo**. Los fallbacks cubren solo los tests disponibles, no suites externas desconocidas. Aviso de bundle Monaco >500 KB conservado; no impide el build.
- Servidores efímeros de verificación se cierran en `finally`. La instancia temporal de revisión visual se retira al cerrar; no se reinician ni detienen los servicios preexistentes del usuario. Cambios locales sin commit/push.

### Siguiente acción

**Detenerse antes de G3.** Leer este estado, SDD y contrato al reanudar. No iniciar inspector, nuevos productos, broker, trazas ni mesh sin su autorización correspondiente.

**Fase G2 completada. Para iniciar G3, selecciona GPT-6 Sol / high y escribe «sigue».**

## G3 — Cierre

Autorización: «sigue» posterior al cierre de G2, solo G3. No se crearon agentes adicionales, se cambió automáticamente de modelo, se publicaron cambios remotos ni se desplegó nada. G4 continúa sin autorización.

### Entrega y decisiones

- [Localizador verificable](../scripts/graph/locator.ts) y [API de snapshots](../apps/demo/server.ts): selección exclusivamente por ID de evidencia/nodo e índice; lee los bytes de la revisión archivada, compara SHA-256 y resuelve rango de fuente o JSON Pointer exacto. No acepta ruta arbitraria, no deduce rango a partir de `relatedSource`, no reemplaza una fuente antigua por el checkout actual. Ausencias y hashes inválidos producen respuesta sin enlace. GET histórico no reconstruye entradas actuales, incluso si falló el último refresh.
- [Explorador de evidencias](../apps/demo/src/components/DiscoveryExplorer.tsx): nodos/aristas seleccionables; inspectores de tipo, extremos, dirección, política, procedencia, extractor, revisión, motivo y rango; dependencias y consumidores; filtros de área/tipo/clase de evidencia; diagnósticos, delta y estados añadidos/retirados/cambiados; código y configuración archivados con líneas y columnas UTF-16 resaltadas y regreso al inspector/camino. Los tests con declaración revisada no se presentan como cobertura medida; la falta de ubicación se muestra explícitamente.
- [Vistas](../apps/demo/src/discovery-view.ts): sistema = repositorios registrados; «servicio» = áreas por raíces configuradas, no servicios runtime inferidos; código = grafo v2. El lienzo muestra un vecindario limitado para legibilidad, y la lista de búsqueda/controles de vecindad permiten consultar los hechos completos con teclado. El minimapa se oculta en pantalla estrecha; el lienzo se reencuadra al cambiar el ancho. Hecho consumidor → dependencia, impacto dependiente de política y no equivalente a invertir cualquier arista.
- [Pantalla guiada](../apps/demo/src/App.tsx): crea `GuidedScreen` y añade import/JSX en `LoginPage` **solo en la copia de trabajo**, sin fingir ruta runtime. Analizar muestra sus nodos/aristas y abre evidencia de la revisión posterior; al borrar el archivo original, la ubicación anterior sigue navegable.
- [E2E reproducible](../scripts/verify-evidence-browser.ts) con servidores efímeros y Chromium. Revisó sistema → área → código, filtros, teclado, evidencia estática/revisada, retorno, creación → cálculo → delta → fuente posterior, eliminación → fuente anterior, vista de 390 px y ausencia de cambios en checkout/errores de página. Capturas e IDs en `.impact-runs/g3-browser/` (ignorado por Git).

### Pruebas y resultados

| Comando / comprobación | Resultado observado |
| --- | --- |
| `pnpm validate` | Correcto: typecheck, build, hash/rebuild v2, **132 tests Vitest / 24 archivos y 1 E2E Chromium** del login. Sigue el aviso no bloqueante de tamaño de bundle Monaco. |
| `pnpm test:evidence-browser` | Correcto: evidencia estática/revisada, BEFORE/AFTER, nueva pantalla, delta, teclado, capturas desktop/narrow, nodos dentro del lienzo estrecho y checkout intacto. |
| `pnpm test:discovery-browser` | Correcto: recorrido previo G2 CRUD y actualizaciones del grafo; la prueba selecciona la navegación CODE principal sin ambigüedad. |
| `pnpm test:execution` | Correcto: selected **10 pasados / 3 fallidos intencionales**, 12 119 ms; full **36 pasados / los mismos 3 fallidos**, 22 241 ms. Overlays aislados y checkout intacto. |
| `pnpm test:discovery-execution` | Correcto: 39 tests reales pasados con pantalla conectada/stylesheet eliminado en overlay, 20 825 ms. |
| `pnpm graph:legacy:check`, `git diff --check` | Correctos: semilla 69 nodos / 84 aristas / 39 tests; cambios sin errores de whitespace. |
| `get_errors` | Únicamente advertencia de obsolescencia `baseUrl` de un fixture conservado de G1, detectada por el editor con TS distinto del build; `pnpm typecheck` no informa errores. |

Pruebas HTTP/unidad añadidas: revisión y fragmento estático exactos, JSON Pointer revisado correcto, fuente y rango no presentes, hash/bytes alterados, selectores no autorizados, historial aún navegable tras cambio de checkout y fallo de refresh. La inspección visual revisó capturas reales de escritorio y estrecha; no se atribuye al zoom del lienzo estrecho legibilidad universal (la lista de teclado ofrece alternativa).

### Matriz de aceptación G3

| Criterio | Evidencia |
| --- | --- |
| Selección de nodos/aristas, origen/revisión/motivo | Inspector sobre v2 y E2E de imports/exercises más pruebas de filtros. |
| Abrir código/configuración correcto y volver | Rango estático archivado y valor JSON revisado exacto con botón de regreso; pruebas del localizador y HTTP. |
| Falta de código sin enlace inventado | Nodo sin ubicación muestra mensaje; locator no entrega bytes/rango cuando faltan o su hash no coincide; `relatedSource` no es destino navegable. |
| Dependencias/consumidores, filtros, diagnóstico y delta | Pruebas de vista y E2E de revisión anterior, nueva y retirada, filtros y navegación direccional. |
| Sistema/servicio/código y dirección del impacto | Navegación Chromium por tres niveles, aclaración de raíces declaradas y políticas en el inspector. |
| Teclado y visual desktop/narrow | Botones de lista activados con Enter; capturas de 1440 px y 390 px, reencuadre del lienzo y búsqueda operable en estrecho. |
| Pantalla nueva → grafo → evidencia | E2E guía de pantalla conectada, arista `renders` nueva, navegación a fuente de AFTER; eliminación con fuente BEFORE. |

### Límites y siguiente acción

El lienzo limita a 20 nodos del conjunto filtrado o del vecindario; la búsqueda y los filtros operan sobre todo el grafo pero la lista muestra primero 60 coincidencias (buscar por nombre/ruta/ID para acotar). En 390 px los nodos quedan pequeños por el zoom necesario; el índice de botones accesibles es el recorrido preferible. «Servicio» no afirma detección de servicios reales. No hay cobertura medida, trazas, federación, rutas nuevas de producto ni retención/limpieza automática de archivos archivados. La API local sigue siendo para uso de confianza y el runner sigue sin sandbox de sistema operativo. Los 101 diagnósticos de la base G2 continúan explícitos; no equivalen a pruebas fallidas. El primer E2E de G3 reveló una limpieza inválida del efecto del visor y una ambigüedad de CODE en la prueba G2; se corrigieron y ejecutaron de nuevo. Cambios locales sin commit/push.

**Detenerse antes de G4.** Solo una nueva autorización humana «sigue» permitirá implementar pedidos/producto externo HTTP. Seleccionar **GPT-6 Sol / high**. Leer este estado y el SDD al reanudar.

**Fase G3 completada. Para iniciar G4, selecciona GPT-6 Sol / high y escribe «sigue».**

## G4 — Cierre

Autorización: «sigue» posterior a G3, únicamente G4. No hay agentes adicionales, cambio automático de modelo, commit/push, despliegue remoto ni trabajo sobre G5.

### Entrega y decisiones

- [Pantalla de pedidos](../apps/frontend/src/OrdersPage.tsx), [API de pedidos](../apps/backend/src/orders/OrdersController.ts) y [cliente HTTP](../apps/backend/src/orders/InventoryClient.ts): creación real y lectura por ID en memoria del proceso, comprobación remota de stock antes de aceptar; 409 por falta de existencias, 502 por error externo, 504 por timeout. `/api/orders` evita que el proxy de Vite capture la ruta SPA `/orders`. El login continúa operando. No se reserva stock ni se garantiza persistencia/consistencia distribuida.
- [Inventario autónomo](../examples/external-inventory/package.json): proveedor HTTP y test con `node:test`, sin importaciones de implementación desde el producto. [Materializador](../scripts/inventory/materialize.mjs) crea un Git local independiente fuera del checkout y comprueba el contrato; [servidor](../scripts/inventory/serve.mjs) acepta raíz externa o crea una temporal. `pnpm dev` comparte una sola raíz con backend, demo y proveedor, cerrando procesos antes de limpiar la raíz temporal. El lanzador E2E levanta servicios propios y libera el proveedor materializado. Raíces proporcionadas por el usuario nunca se eliminan.
- [Contrato v1](../packages/api-contract/src/inventory-contract.json) y [binding](../impact/inventory-binding.json) fijan `local`/`inventory`/`GET`/`/v1/stock/:sku`/`1`. [Extractor](../scripts/graph/inventory-http.ts) comprueba fuente, llamada, configuración y proveedor; sin acuerdo emite diagnóstico, no arista entre repositorios por mera URL. Un proveedor inaccesible deja contrato y endpoint sin ubicación, con diagnóstico de fuente/tests no disponibles. En modo accesible, cliente→endpoint→proveedor tiene evidencias navegables del commit Git externo.
- [Archivo](../scripts/graph/snapshot.ts), [persistencia](../scripts/graph/store.ts) y [explorador](../apps/demo/src/components/DiscoveryExplorer.tsx) fijan revisiones separadas, incluyen el commit externo en la invalidación incluso sin cambios de bytes, muestran estado `local`/`contract-only`, código histórico y tests externos `not-integrated`. Catálogo login v1 sigue congelado en 39 tests; tests externos no se presentan como ejecutados ni se admiten como seleccionados por el runner G2. Se conservan legibles snapshots pre-G4 sin repositorio ni catálogo externos.
- [Entradas de ejecución](../scripts/graph/snapshot.ts) incluyen la plantilla externa en overlays: las verificaciones seleccionada/completa del login ejecutan E2E con inventario real sin copiar tardíamente del checkout. La semilla v1 conserva sus 69 nodos/84 aristas/39 tests; `graph:legacy:check` compara topología y políticas ignorando solo líneas desplazadas por código nuevo, mientras v2 verifica rangos de la fuente actual.

### Pruebas y aceptación

| Comprobación | Resultado observado |
| --- | --- |
| `pnpm validate` | Correcto: typecheck, build, snapshot v2 reconstruido, **147 tests Vitest en 28 archivos y 3 E2E Chromium**: login y pedidos con/sin existencias. Solo aviso conocido de bundle Monaco grande. |
| `node --experimental-strip-types --test examples/external-inventory/test/inventory.test.ts` | **1 test real aprobado**, ejecutable sin dependencia del proyecto de pedidos. |
| `pnpm test:evidence-browser`, `pnpm test:discovery-browser` | Correctos: evidencia archivada incluida navegación Chromium al proveedor externo, G3 BEFORE/AFTER/teclado/narrow y CRUD G2 con checkout inalterado. |
| `pnpm test:execution` | Correcto: selected **10 pasados / 3 fallidos intencionales**, full **36 pasados / mismos 3 fallidos**, overlays eliminados y checkout intacto. Se corrigió la falta de plantilla externa en el overlay que impedía Playwright. |
| `pnpm test:discovery-execution` | Correcto: overlay CRUD y **39 tests login reales aprobados**, checkout intacto. |
| `pnpm graph:check:v2`, `pnpm graph:legacy:check`, `git diff --check` | Correctos: rebuild v2; semilla histórica 69/84/39; whitespace limpio. |
| [Contrato consumidor](../tests/contract/inventory.test.ts), [HTTP integración](../tests/integration/orders.test.ts), [suite grafo](../tests/dependency-graph/http-inventory.test.ts) | Contrato/calificador/GET y respuesta v1, rechazo de versión/SKU/stock inválidos; proceso externo distinto; 409/502/504; commit Git real, delta de contrato de cliente y proveedor, URLs en otro entorno rechazadas, fuente inaccesible sin enlace, tests externos pendientes, historial del proveedor y commit vacío que cambia el snapshot. |
| Lectura de archivos históricos | `SnapshotStore.read` sobre G2 `11bab59b0ad64a80517714d6f452e8cfae9e4386053f2f674c914b2d361720f9` y otro pre-G4 `57852d95eb7088d51e1b48b2d90485d7046fa6800e8948454734dfdd39fedd2b`: ambos válidos, 1 repositorio/173 nodos cada uno. |

En modo contrato solamente: **209 nodos / 274 aristas / 170 diagnósticos**; con proveedor Git materializado: **223 nodos / 288 aristas / 192 diagnósticos**, un test de inventario mostrado como `not-integrated`. Los diagnósticos reflejan fuentes no resueltas y límites del extractor, no fallos de los tests. El grafo y los archivos temporales locales se ignoran por Git. Se comprobaron límites de timeout/caída HTTP y rechazo de cambios Git no confirmados; las revisiones históricas quedan navegables. Un cambio del contrato v1 elimina las aristas no justificadas del delta y selecciona de forma conservadora los **39 tests disponibles**, no afirma que se hayan ejecutado los tests del proveedor. No se considera compatibilidad de comportamiento por mantener la versión del contrato.

Revisión posterior de G4: se detectó que un cambio real de `GET` a `POST` en el proveedor mantenía indebidamente la arista `exposes`; el extractor ahora exige el guard del método y el matcher de ruta mediante AST. También valida la llamada del cliente mediante AST, sin promover texto en comentarios a aristas. Tests nuevos rechazan cambio de método/ruta del proveedor y llamada `POST` del cliente con comentario `GET`. El materializador rechaza destinos no vacíos y rutas simbólicas hacia el checkout antes de ejecutar `git add`, protegiendo archivos ajenos; estas correcciones no inician G5.

### Limitaciones y siguiente acción

Solo se extrae el binding HTTP explícito de inventario local v1; no se infieren endpoints genéricos, otros entornos ni compatibilidad por URL. Las relaciones distribuidas todavía no tienen políticas causales de selección ni ejecución federada (G6). Si el proveedor no está accesible solo hay visibilidad del contrato; no hay código navegable ni resultado de tests externos. El almacén de pedidos es volátil, sin reserva transaccional. Sin outbox, eventos, broker, consumidores, trazas ni mesh (G5–G8). El runner de código editado es local de confianza, no sandbox. El tamaño del bundle Monaco permanece como advertencia. No hay política automática de retención para archivos de fuente versionados.

**Detenerse antes de G5.** La siguiente autorización humana «sigue» permitiría broker, eventos y consumidores. Seleccionar **GPT-6 Astra / high**; leer primero este estado y el SDD, sin iniciar G5 implícitamente.

**Fase G4 completada. Para iniciar G5, selecciona GPT-6 Astra / high y escribe «sigue».**

## G5 — Cierre

Autorización: «siguiente» posterior a revisión de G4, únicamente G5. Sin agentes adicionales, cambios de modelo, commit/push del checkout ni despliegues remotos. G6 no se inicia. [Diseño, operación, pruebas y límites](G5-MESSAGING.md).

### Entrega

- RabbitMQ **4.2.0** real, imagen fijada por digest; `amqplib` **2.2.0**. [Lanzador](../scripts/messaging/broker.mjs) crea contenedor AMQP solo loopback, puerto efímero y recursos acotados; lo limpia sin tocar contenedores ajenos. `pnpm dev:events` inicia siete procesos/servicios propios y datos temporales; usuario puede conservar sus directorios explícitos. Docker Desktop instalado se inició; imagen en caché/daemon permanecen, contenedores y volúmenes propios de ensayos retirados.
- [Pedido+outbox SQLite](../apps/backend/src/orders/OrderStore.ts), [OrderCreated v1](../packages/api-contract/src/order-created.ts) con evento/correlación/versión y [publicador confirmado](../apps/backend/src/orders/OutboxPublisher.ts). Transacción local atómica, publicación persistente mandatory y marcado solo después de confirm. Caída conserva outbox y reconexión drena pendientes; crash entre confirm/marcado puede duplicar.
- [Notificaciones](../apps/notifications/src/main.ts) y [preparación](../apps/preparation/src/main.ts) independientes, bases/colas separadas. [Inbox/efecto](../packages/messaging/src/ConsumerStore.ts) atómicos, deduplicación persistida; reintento de procesamiento máximo tres, cola fallida propia, ACK manual tras efecto o republicación confirmada. Sin correo real ni promesa exactamente una vez. [Consulta](../apps/backend/src/orders/OrderProgress.ts) por HTTP, nunca memoria/DB compartidas; UI distingue pendiente/no habilitado/no disponible.
- [Extractor G5](../scripts/graph/messaging.ts), [topología versionada](../packages/messaging/src/topology.json) y raíces nuevas. Publica `publishes`, `subscribes`, `processes` y entidades broker/canal/schema/suscripción/consumidor con identidad broker lógico+entorno. Resolución de wrappers por compilador y formas AST acotadas; homónimos, sustitución de suscripción, routing/bindings dinámicos o handler ausente no generan relaciones autoritativas. Alta/baja conservan delta/fuente histórica. Ningún enlace consumidor→consumidor por broker compartido. Políticas conservadoras, sin reglas G6.
- [Inspector](../apps/demo/src/components/DiscoveryExplorer.tsx) distingue configuración de declaración revisada, ambas sin atribuir cobertura medida. [Chromium](../scripts/verify-evidence-browser.ts) comprueba publicación, binding y consumidor → código y JSON archivados; captura real revisada. Build incluye dependencias AMQP necesarias, verificado también como ejecutable compilado.

### Resultados finales

| Comprobación | Resultado |
| --- | --- |
| `pnpm validate` | Correcto: typecheck/build/grafo, **160 tests Vitest aprobados + 5 omitidos** (32 archivos aprobados + 1 omitido); **3 Chromium aprobados + 1 omitido** sin broker. Omisiones explícitas, no falsos éxitos. |
| `node scripts/verify-messaging.mjs --compiled` | **5/5** tests reales con fuentes, **5/5** con bundles y **4/4** Chromium con broker real. |
| `pnpm test:evidence-browser`, `pnpm test:discovery-browser` | Correctos: G2/G3/G4 preservados más evidencia G5 navegable; fuentes BEFORE/AFTER, teclado, narrow, sin errores de página ni cambios de checkout. |
| `pnpm test:execution` | Selected **10 pasados/3 fallos intencionales**, 12 354 ms; full **36 pasados/mismos 3 fallos**, 24 190 ms. |
| `pnpm test:discovery-execution` | **39 tests reales pasados**, 21 777 ms; overlay CRUD y checkout intacto. |
| Prueba de `dev:events` | Siete puertos libres, broker real versión 4.2.0, pedido y ambos efectos, SIGTERM y comprobación de puertos/directorio/contenedor retirados. |
| `pnpm graph:legacy:check`, `pnpm graph:check:v2`, `git diff --check` | Correctos; seed **69/84/39**, rebuild determinista y formato limpio. |
| Historial | `SnapshotStore.read` conserva válidos G2 `11bab59b0ad64a80517714d6f452e8cfae9e4386053f2f674c914b2d361720f9`, G3 `57852d95eb7088d51e1b48b2d90485d7046fa6800e8948454734dfdd39fedd2b` y G4 `ff6a4aa95886ca1b429b6e9a71788be5498c8b86c3d698164d75ac0dd6e980cf`. |
| Editor y scripts | Sin errores nuevos; permanece el aviso `baseUrl` del fixture G1. `node --check` en lanzadores correcto. |
| Seguridad | [Scan amqplib](../impact/evidence/g5-cve.json) sin CVE conocidas; auditoría general **no limpia**: 1 aviso bajo previo de DOMPurify, detallado abajo. |

Snapshot final sin raíz externa: `1ddb7b5db89934db48fdb97a0008898a8e5aaf9b013f9a392b2162937ae9b38e`: **334 nodos / 450 aristas / 354 diagnósticos**. Con inventario Git materializado, Chromium inspeccionó también el código externo y su revisión. Los diagnósticos corresponden a límites de resolución/fuentes, no tests fallidos ni cobertura medida. No cambia la semilla legacy para registrar suites nuevas.

### Aceptación G5

| Criterio | Evidencia real |
| --- | --- |
| Ambos consumidores reciben evento | Pedido HTTP real y consultas HTTP independientes, integración y Chromium. |
| Duplicado no duplica efectos | Publicación repetida confirmada + recuentos/IDs en ambos consumidores; reapertura SQLite en unidad. |
| Fallo de uno no bloquea al otro | Notificaciones falla tres veces y preparación persiste `ready` para el mismo evento. |
| Reintento limitado y cola fallida | Tres intentos exactos y lectura AMQP del mensaje fallido con ID/contador conservados. |
| Recuperación del publicador | `rabbitmqctl stop_app/start_app` solo en broker propio; pedido aceptado queda en SQLite y se entrega al recuperar. |
| Relaciones verificables | Ocho tests de grafo más navegación Chromium de publicación/binding/procesamiento a rango/JSON Pointer reales. |
| Alta/baja, dinámico, no falso sibling | Overlay con consumidor añadido/eliminado, fuente histórica; negativos de routing/binding/homónimo/suscripción sustituida; no arista entre consumidores. |
| Esperas por condiciones | HTTP/AMQP/confirmaciones con timeout, sin pausas arbitrarias como aceptación. |

### Incidencias, límites y siguiente acción

Se corrigieron errores iniciales del lanzador, espera de setup Vitest, normalización de AST, selector de navegador y resolución de AMQP desde bundles. El primer broker salió durante boot; sus logs no se conservaron, por lo que la causa original no se da por demostrada. Tras readiness ligero y schedulers limitados, arranques/test/recuperación/limpieza reales pasan. El watcher superó 5 s bajo el corpus mayor y workers concurrentes: aislado pasó; se amplió el timeout a 15 s manteniendo comparación con rebuild completo. Detalles en [G5](G5-MESSAGING.md).

Aviso pendiente fuera del grupo G5: `pnpm audit --prod` devuelve DOMPurify 3.4.15, bajo, [GHSA-p98j-92pf-mc4p](https://github.com/advisories/GHSA-p98j-92pf-mc4p), parche >=3.4.16. La misma versión ya está en HEAD anterior a G5. No se actualizó Monaco/DOMPurify de forma ajena al alcance ni se atribuye auditoría limpia. Imagen del broker no auditada como sistema operativo.

SQLite experimental en Node 24; sin HA, exactamente una vez, reserva distribuida, retención o correo externo. Perfil dev efímero elimina broker/datos propios; conservar solo SQLite no recupera mensajes de un volumen broker eliminado. Extractor acotado, sin trazas/cobertura medida. Runner local sin sandbox: solo **39 tests login disponibles**, no suites G5/inventario federadas; no confundir fallback completo con cobertura distribuida. Sin G6–G9, sin modificaciones a servicios previos del usuario y sin commit/push.

**Detenerse antes de G6.** La siguiente fase requiere autorización humana separada para políticas distribuidas y runners. Modelo recomendado: **GPT-6 Astra / xhigh**.

**Fase G5 completada. Para iniciar G6, selecciona GPT-6 Astra / xhigh y escribe «sigue».**

## G6 — Impacto distribuido y ejecución federada

Autorización: «sigue» del 2026-10-05, solo G6. Por preferencia expresa de ahorro de tokens, se acordó GPT-6 Sol / high para G6–G9. No se ha iniciado G7, cambiado automáticamente de modelo, creado agentes, hecho commit/push ni desplegado.

### Entrega y decisiones

- [Políticas y motor](../packages/impact-engine/src/federated.ts): usa la unión de grafos anterior/posterior, ciclo visitado y recorridos por relación. La inversión normal lleva de dependencia a consumidor; publicación, exposición HTTP y realización de handler tienen pasos adicionales explícitos. `contains` es solo estructural. Una suscripción retirada nace de evidencia previa; compartir broker no propaga de un consumidor al otro. Las políticas por tipo quedan referenciadas en aristas v2. Diagnósticos nuevos o fuente no resuelta amplían la selección conservadoramente.
- [Catálogo federado revisado](../impact/evidence/federated-tests.json): 12 suites de pedidos, inventario, contrato de evento, transporte, ambos consumidores y recorridos Chromium. Los sujetos declaran intención de prueba, no cobertura de assertions medida. El manifiesto y las fuentes externas fijadas forman parte del snapshot.
- [Runner](../apps/demo/execution.ts): el servidor deriva suites de snapshot/análisis; el navegador solo envía IDs y modo. Comandos Vitest, Playwright y Node test son fijos y se ejecutan sobre bytes capturados en overlays. Se distinguen afectación, disponibilidad, ejecución, fallo y omisión. Broker ausente y fuente externa inaccesible figuran como no ejecutables; informes vacíos o parciales nunca cuentan como éxito. `dev:events` proporciona el identificador de su broker propio al runner.
- [Web](../apps/demo/src/App.tsx): lista decisiones distribuidas, causa, recorrido de relaciones, evidencia navegable incluso de relaciones retiradas y resultado físico de cada suite. El catálogo antiguo de 39 tests sigue separado por compatibilidad; no se interpreta como cobertura de los proyectos nuevos.

### Aceptación y validación

Los [tests del motor](../tests/dependency-graph/federated.test.ts) comprueban pantalla de pedidos→journey, contrato de inventario→cliente/proveedor inaccesible, schema OrderCreated→productor/ambos consumidores, comportamiento de publicador sin cambio de schema, implementación de notificaciones sin arrastrar preparación, suscripción retirada con arista histórica, destino HTTP no verificable y archivo sin sujeto. Las suites reales de notificaciones y preparación verifican efectos locales. La verificación [selected/full](../scripts/verify-federated-execution.ts) muta el resultado de notificaciones con snapshots y datos iniciales iguales y compara fallos observados.

- `CI=true PLAYWRIGHT_BROWSERS_PATH=/private/tmp/test-impact-lab-browsers pnpm validate`: typecheck, compilación, grafo v2 (334 nodos / 450 aristas), comprobación de snapshot, 169 tests Vitest correctos / 5 omitidos y 3 Chromium correctos / 1 omitido.
- `CI=true pnpm exec vitest run tests/dependency-graph/federated.test.ts --maxWorkers=2`: 7 correctos, incluidos productor y ambos consumidores.
- `node --experimental-strip-types --test --test-reporter=tap examples/external-inventory/test/inventory.test.ts`: 1 test externo correcto y resumen TAP verificado.
- `CI=true PLAYWRIGHT_BROWSERS_PATH=/private/tmp/test-impact-lab-browsers pnpm test:federated-execution`: correcto. Mutación controlada: selected (39 login + 3 suites federadas) y full (39 login + 12 suites) detectan exactamente `notifications-consumer` como fallo relevante. El proveedor externo y los dos recorridos de pedidos pasan en full; 2 suites broker constan como no ejecutables en ambos modos. Informes auditables en `.impact-runs/g6-selected-e9dfeff3-0619-4dae-b00c-1227a35c05f1/` y `.impact-runs/g6-full-91965aed-59a6-4b43-b706-3a3f382f62bc/` (ignorados por Git).
- `git diff --check`: correcto.

El runner requiere paquetes disponibles para overlays; si falta un tarball offline, usa instalación con lockfile fijo. El perfil RabbitMQ no se pudo ejecutar en este PC porque no hay comando Docker; las suites broker se informan como no disponibles, no aprobadas. G5 ya documentó su ejecución física en un equipo con Docker. El inventario externo sí se materializa en un checkout independiente y se ejecuta desde bytes fijados. Los imports/sujetos de tests no equivalen a cobertura observada. La selección heredada puede ampliar a los 39 tests login para nuevos archivos: es segura, aunque menos precisa; el ahorro de G6 se observa en suites distribuidas. El runner sigue siendo local de confianza, sin sandbox del sistema operativo. Monaco mantiene el aviso de tamaño de bundle.

**Detenerse antes de G7.** Modelo recomendado por la preferencia acordada: **GPT-6 Sol / high**. G7 necesita otro «sigue» humano.


## G7 — Trazas y correlación

Autorización: petición del 2026-10-06 de revisar cambios hasta G6 y, si estaban presentes, seguir exclusivamente con G7. Checkout limpio al comenzar, HEAD `5a16090` (implementación G6), artefactos G1–G6 y traspaso presentes. Las siete pruebas del motor federado volvieron a pasar. No se crearon agentes, cambió automáticamente de modelo, hizo commit/push ni se inició G8.

### Entrega

[Instrumentación OpenTelemetry](../packages/telemetry/src/context.ts) en pantalla/HTTP/cliente inventario/outbox/publicación/consumo/reintento, contexto W3C/AsyncLocalStorage y contexto persistido en SQLite separado del contrato de evento. [Collector/backend file local](../scripts/observability/collector.mjs), versión/digest fijos, puertos loopback conservados al reiniciar. [Adaptador](../scripts/graph/observations.ts) de identidades exactas por revisión/versión/entorno y símbolo; registros incompatibles/ambiguos permanecen pendientes. Dataset archivado/hash y correlaciones verificadas en snapshots; ninguna eliminación de aristas por falta de tráfico ni duplicación por retries. [Vista web](../apps/demo/src/components/ObservedTraces.tsx) de recorrido, tiempos, errores, mensajes, intentos, parents/enlaces y navegación al código del snapshot.

### Validación y aceptación

| Comando / criterio | Resultado |
| --- | --- |
| `CI=true pnpm validate` | Typecheck/build/grafo correctos; **178 Vitest pasados / 5 omitidos**, **3 Chromium pasados / 1 omitido** sin perfil broker. Log `.impact-runs/g7-validate.log`. |
| `CI=true pnpm test:messaging` | **5 integraciones RabbitMQ y 4 Chromium pasados**: consumidores independientes, duplicados, reintentos, cola fallida y recuperación del publicador. Log `.impact-runs/g7-messaging.log`. Los omitidos del perfil básico se ejecutaron aquí. |
| `node --import tsx scripts/verify-observability.ts` (`pnpm test:observability`) | **Aceptación real completa**: una traza propagada desde Chromium, **9 spans/4 servicios**, HTTP/outbox/publicación/ambos consumidores; notificaciones falla una vez, segundo intento visible con enlace explícito a publicación original. |
| Archivo y reproducción | Dataset `b54aebefd08a91ad9c1466bca6ad30169252483e7ddb1ebfe2102203896169bc`; snapshot medido `4022660f857229fd68a1a2f48acef95a1f6ba413a81100ebaeb0e9786122f598`; todos los spans correlacionados en la revisión `content:21ba3f1676270cbb8975ee47d8563a93da2b48db37b58be63bfb3210861ba487`. Rebuild del mismo input/dataset idéntico. Versión incompatible queda pendiente. |
| Grafo sin tráfico/retry | Aristas/nodos estáticos idénticos antes/después de observaciones; dos intentos referencian una misma dependencia lógica. Selección federada idéntica con/sin dataset. Overlay conserva dataset y recorre correlación contra la revisión nueva. |
| Exportación opcional | Pedido y ambos efectos con Collector parado, tras reiniciarlo y tras reiniciar productor con SDK deshabilitado. Contexto W3C persistido/reabierto y migración SQLite previa comprobados en tests. |
| Web | Chromium abre observación → símbolo → código archivado real; capturas escritorio y 390 px, sin overflow horizontal. |
| `CI=true pnpm test:federated-execution` | **Correcto**: selected/full detectan el mismo fallo intencional `notifications-consumer`; full ejecuta proveedor externo y preparación. Dos suites broker figuran como no disponibles en este perfil de mutación, no pasadas (broker real validado por separado). Log `.impact-runs/g7-federated.log`. |
| `graph:discover`, `graph:check:v2`, `graph:legacy:check`, `git diff --check` | Correctos: snapshot final estático `d652f9190c4ce162abd4e2a6fefacbbc3cb828b0d6d4e34150192f2ecb6c4550`, **364 nodos/518 aristas/432 diagnósticos**; semilla legacy 69/84/39 conservada. |

Evidencia portable: [spans reales](../impact/evidence/g7-observations.json), [resumen](../impact/evidence/g7-trace-summary.json). Informe completo/capturas/logs/snapshot en `.impact-runs/g7-d3ac7ffd-75e0-4ee1-b472-fcdcf821c994/`, ignorado por Git. Contenedores propios G5/G7 retirados al terminar. Las ejecuciones iniciales fallidas están documentadas como incidencias, no aceptaciones.

### Límites y siguiente acción

Instrumentación manual y correlación acotadas al flujo local, servicio versión 1. Inventario tiene span en el cliente HTTP, sin atribuir spans internos al proveedor. Telemetría asíncrona/limitada, puede perder spans en caídas prolongadas; sin retención/rotación automática. Trazas no equivalen a assertions ni coverage, ni reducen la selección por ausencia de tráfico. Revisión nueva requiere reiniciar perfil; el explorador fija un conjunto al recargar. Backend de archivos local; sin mesh ni plataforma externa. Continúan SQLite experimental, aviso de bundle Monaco y runner local de confianza sin sandbox.

Operación completa, decisiones e incidencias en [G7](G7-OBSERVABILITY.md). Punto de reanudación en [traspaso G7](G7-HANDOFF.md).

**Fase G7 completada. Para iniciar G8, selecciona GPT-6 Sol / high y escribe «sigue».**

## G8 — Service mesh

Autorización del 2026-10-06: «sigue», interpretado como la siguiente fase pendiente G8. G7 se conserva sin commit; no se crean agentes, cambia de modelo ni se inicia G9. El despliegue es exclusivamente local, en un clúster propio con kubeconfig separado.

### Entrega

[Perfil Kubernetes](../scripts/mesh/lifecycle.mjs) opcional con kind 0.31.0/Kubernetes 1.35.0/Istio 1.31.0/Kiali 2.27.0/Prometheus 3.10.0, instalación local con checksums oficiales y versiones/images registradas. Se despliegan los seis workloads reales. [Adaptador](../scripts/graph/mesh.ts) de contadores HTTP/TCP y bindings de workload/namespace/versión/revisión; [comparación web](../apps/demo/src/components/MeshComparison.tsx) declarada/estática/observada, evidencia JSON archivada y navegación por locators existentes. Hash combinado compatible con archivos G7; overlays revisan correlación sin alterar la selección estática. [Inspector histórico](../scripts/mesh/inspect.ts) reproduce fuentes externas y dataset tras retirar el clúster.

### Validación y aceptación

| Comando / criterio | Resultado |
| --- | --- |
| `pnpm validate` | Build/typecheck/checks correctos; **185 Vitest pasados / 5 omitidos**, **3 Chromium pasados / 1 omitido** en perfil básico. `.impact-runs/g8-validate.log`. |
| `pnpm test:messaging` | **5 integraciones RabbitMQ y 4 Chromium pasados** fuera de Kubernetes. `.impact-runs/g8-messaging.log`. |
| `node --import tsx scripts/verify-mesh.ts` (entrypoint de `pnpm test:mesh`) | **Aceptación completa real, exit 0**: crea clúster, verifica versiones/despliegues, genera tráfico, consulta Prometheus/Kiali, valida dataset/snapshot/web y retira recursos automáticamente. `.impact-runs/g8-acceptance.log`. |
| Grafo Kiali | **6 workloads / 5 comunicaciones reales**, JSON archivado y captura de consola. HTTP frontend → Orders API → Inventory; TCP Orders API/Notifications/Preparation → RabbitMQ. |
| Discrepancia | Ventana `orders`: **6 requests** Orders API → Inventory; ventana `read-only`: **0 requests** a Inventory y **6** frontend → Orders API. La misma arista estática `invokes-endpoint` continúa declarada/resuelta en ambas. |
| Versiones y bytes | Los seis bindings resueltos con versión `v1`, image IDs y revisiones exactas. Ventana de pedidos: Orders API → RabbitMQ **1012 bytes**; Notifications/Preparation → RabbitMQ **3126 bytes cada uno**. No se transforman en aristas de evento/handler. |
| Integridad y selección | **14 tests focalizados** mesh/network/G7 correctos: negativos de namespace/versión/revisión, resets/duplicados, repositorio incompatible, hash/dato/correlación adulterados, overlays y selección invariante; compatibilidad de hash G7 preservada. Typecheck final correcto. |
| Web y archivo | Inspector muestra ventanas y evidencia bruta validada. Chromium reproduce el snapshot final después de eliminar clúster/fuente temporal y abre el código archivado del proveedor; también 390 px sin overflow horizontal. No requiere Kubernetes para abrirlo. |
| Limpieza | Perfil final `db40042e-4b38-4e96-a9f1-64d9a61ad4e5` eliminado en `finally`; perfiles fallidos también retirados. Sin clusters kind ni tags de imágenes propios G8 al cierre; caché de herramientas/imágenes base y evidencias conservadas. |
| Grafo estático / legacy | `graph:discover`, `graph:check:v2`, `graph:legacy:check` correctos: **368 nodos / 531 aristas / 430 diagnósticos**; snapshot estático `7837766fb0ada3e0c27bda35cc2c79881af411c9aa14182ff2aa1faef9dbd171`; semilla **69 / 84 / 39** conservada. `git diff --check` correcto. |

Snapshot medido `037fd6b5e06f73b0a2d0b922180b803ea391535c4ce88e44f3ef068fb2becd81`; dataset SHA-256 `9c5b7da9b32388f554df76217e0d509afb1f7a21c3b85296c90c9f5a64bb5f95`. Revisión producto `content:004e997af9571fa3b8daf1e104e8c60e8d4a444d49e81d78f829c4117dbad7cf`; inventario Git independiente `126d32f0b8adc8852a513e436741df0a8ab84f89`. Ventanas UTC: pedidos **07:07:49.549–07:08:04.219**, lecturas **07:08:04.219–07:08:20.444**, 2026-10-06.

[Dataset portable](../impact/evidence/g8-mesh.json) y [resumen](../impact/evidence/g8-mesh-summary.json). Informe amplio/capturas/plataforma/despliegues/snapshot en `.impact-runs/mesh/db40042e-4b38-4e96-a9f1-64d9a61ad4e5/`, ignorado por Git.

### Incidencias y límites

El primer arranque no alcanzó readiness; en el segundo se identificó `INVENTORY_PORT` sobrescrito por Service links. Se corrigió con `enableServiceLinks: false`, probado desde cero en la aceptación final. La primera regresión tuvo dos fallos por el texto de error de URL; corregidos sin relajar la validación. Otros dos intentos completos fallaron: uno quedó preparando el nodo Docker y otro perdió el daemon/API tras desplegar servicios. Se endureció la limpieza sin kubeconfig, reabrió Docker Desktop cuando quedó sin daemon y retiraron exclusivamente perfiles propios. Esos intentos no cuentan como aceptación; la ejecución final pasó con limpieza automática.

Las observaciones usan contadores muestreados y bindings explícitos; un anchor de código no demuestra qué función ejecutó el sidecar. TCP incluye acknowledgements/heartbeats: en la ventana de lectura se observaron **8 bytes** en cada conexión de los consumidores sin atribuirles un evento. Ausencia de requests conserva dependencias/tests. No hay retención automática ni cobertura universal. Los tags exactos de addons no se afirman inmutables; digest fijo para nodo/runtime/broker. Persisten SQLite experimental, aviso de bundle Monaco y runner local de confianza. Operación/límites en [G8](G8-SERVICE-MESH.md), siguiente acción en [traspaso G8](G8-HANDOFF.md).

**Fase G8 completada. Para iniciar G9, selecciona GPT-6 Sol / high y escribe «sigue».**

## G9 — Recorridos web y auditoría final

Autorización del 2026-10-06: «sigue», después del cierre G8. **G9 completada.** Se conservan los cambios G7/G8 sin commit/push en este repositorio, sin agentes ni despliegue externo. Es la fase final del SDD.

Implementados [seis recorridos de overlays](../apps/demo/src/journeys.ts) con diff, delta, evidencia archivada, impacto y ejecución real; explicación de fuentes/actualización/visibilidad; [auditoría](../scripts/audit-graph.ts) de todos los locators, corpus, identidad determinista y políticas del login; [guía de ampliación](EXTENDING-DISCOVERY.md). Las peticiones llevan bytes/IDs de snapshots, sin nombres de escenario ni comandos del cliente. Se corrige el entorno Playwright para conservar proveedor archivado y opt-ins broker; los fixtures solo eliminan raíces propias. El panel respeta las filas/anchura y limpia el foco al invalidar el análisis.

### Aceptación final

| Comando / ámbito | Resultado |
| --- | --- |
| `pnpm validate` | Build/typecheck/grafo correctos; **192 tests pasan / 5 omitidos sin broker**, **3 Chromium / 1 omitido**. Log `.impact-runs/g9-validate.log`. |
| `node scripts/verify-messaging.mjs --compiled` | **5 integraciones fuentes + 5 compiladas + 4 Chromium**, correctos. Log `.impact-runs/g9-messaging-compiled.log`. |
| `pnpm test:execution` | Selected **13** / full **39**, mismos **3 fallos deliberados**. |
| `pnpm test:federated-execution` | Ambos detectan `notifications-consumer`; selected excluye preparación, broker ausente queda unavailable. |
| `pnpm test:discovery-execution` | **39** tests reales, CRUD aislado, checkout intacto. |
| `pnpm test:discovery-browser`, `pnpm test:evidence-browser` | CRUD, evidencia estática/revisada/HTTP/AMQP, proveedor Git, BEFORE/AFTER y anchura estrecha correctos. |
| `pnpm test:journeys --broker` | **6 recorridos + full del fallo**, 39 tests login correctos cada vez, cero errores de página/relecturas de red; contratos y notificaciones fallan deliberadamente, con el resultado exacto esperado por suite. |
| `pnpm test:observability` | **9 spans / 4 servicios**, reintento, outages/reinicio/SDK desactivado y navegación archivada correctos. |
| `pnpm test:mesh` | Perfil **0c027834-61fd-4648-aa8d-f87dd7d5e4e0**, seis workloads, tráfico real y comparación Kiali/archivo; cleanup automático correcto. |
| `pnpm graph:audit`, `pnpm graph:legacy:check` | **545** conexiones inspeccionables y **570** usos de evidencia; orden determinista, **69/84/39** del login conservados; corpus **26 casos / cero enlaces falsos**. |

Informe completo, matriz de trazabilidad, correcciones y límites en [auditoría G9](G9-FINAL-AUDIT.md). [Resumen portable](../impact/evidence/g9-summary.json), [mesh](../impact/evidence/g9-mesh.json) y [observaciones](../impact/evidence/g9-observations.json). G7/G8 históricos conservados. Recorridos: `.impact-runs/g9-journeys-0a0f3b84-e4dc-490b-a55b-d1c1f84336ba/`; auditoría `.impact-runs/g9-audit-701cb1e3-b9fb-403d-bf90-c61eac1e52e1/`; traza `.impact-runs/g7-915f5041-55fa-4d63-93f4-32ba17c19a0c/`; mesh `.impact-runs/mesh/0c027834-61fd-4648-aa8d-f87dd7d5e4e0/`.

Equipo: M1 Pro, **10 CPU / 32 GiB**, darwin arm64 25.6.0, Node 24.18.0. Dataset: **63 archivos / 77 367 bytes / 1 401 líneas**, 382 nodos / 545 aristas / 452 diagnósticos. Cinco muestras; medianas: full load/build **206,35 ms**, overlay full rebuild **127,09 ms**, refresh sin cambio/input capturado **1,37 ms**, cambio/rebuild/publish **159,53 ms**. No se implementa indexación parcial ni se comparan tiempos de distinto alcance como aceleración universal. Calls del corpus tienen exhaustividad **5/8**, sin contar diagnósticos como aciertos.

Incidencias resueltas: bind sandbox `EPERM`, selectores del verificador, pérdida del proveedor/flags al filtrar el entorno y fixtures que recreaban proveedores al mutar el contrato. Un `ECONNRESET` en GET de estado motivó lectura acotada con conexión independiente y drenaje de runners antes de limpiar; cero retries en la pasada final. Los intentos anteriores permanecen como incidencias, no aceptaciones.

Persisten límites de extracción, diagnósticos explícitos, cobertura desconocida/no universal, reconstrucción completa, snapshots sin retención automática y runner de confianza local sin aislamiento de SO. Todas las pruebas usan recursos locales propios; evidencias/cachés permanecen tras retirar contenedores y clúster.

Typecheck, formato, hashes de datasets y `pnpm graph:check:v2` finales correctos. Índice por defecto solo contrato externo: `24e85962c0a04346366d50d2d2ac8248d83c1a022b792631e23c4e99ee5a9c33`, **368 / 531 / 430** nodos/aristas/diagnósticos. Sin contenedores del laboratorio, clusters kind ni tags temporales G8 al cierre; cachés y evidencias retenidas.

**G1–G9 completadas. Parada final: entregar y detenerse. Cualquier ampliación requiere una nueva instrucción humana.**
