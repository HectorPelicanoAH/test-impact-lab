# SDD — Grafo progresivo con el diseño de v1

Fecha: 2026-10-07. Estado: propuesta para implementar. Rama: `feat/live-graph-v1`.

Esta variante parte de `docs/dependency-graph-sdd` (`93089f1`, escenarios G1–G9) y recupera el lenguaje visual del tag `v1`. La variante `feat/guided-discovery-demo` y su PR #4 se conservan separados. Este documento define el cambio; la experiencia descrita todavía no está implementada.

## 1. Resultado buscado

La demo abre un **grafo vacío**. El presentador ejecuta un paso, aparecen sus nodos y conexiones, y se resaltan los hechos que acaba de descubrir el motor. El siguiente paso acumula nuevos hechos sobre el mismo canvas. Pulsar un nodo permite entender todos sus enlaces y abrir el código o la configuración que los justifica.

El recorrido es **construir → cambiar código → analizar impacto → ejecutar tests**. Se conserva la vista de grafo de v1, extendida para HTTP entre repositorios, eventos, consumidores, incertidumbre y observaciones opcionales. El cambio principal afecta a la presentación y a la ejecución del motor por fases; los extractores y políticas existentes conservan su significado.

## 2. Tres vistas, poco contenido

| Vista | Contenido y acción |
| --- | --- |
| **Código** | Árbol, editor Monaco y diff original/modificado como en v1. Selector compacto de escenario y botón Aplicar cambio. El overlay conserva el checkout. |
| **Grafos** | Canvas principal de v1, minimapa, zoom/pan e inspector lateral contextual. Construcción e impacto se explican aquí. Es la vista inicial, vacía. |
| **Tests** | Selección local y suites distribuidas, ejecución seleccionada/completa y detalle de cada test: qué valida, fuente/assertions, motivo, resultado, duración y salida. |

En Grafos hay una sola franja: **paso actual · tecnología · explicación breve · estado/resultado · Ejecutar siguiente paso**. Todos los pasos llevan una explicación visible, sin tener que abrir el inspector: qué se está buscando, cómo lo hace la tecnología indicada y qué significa el resultado. El inspector se abre al seleccionar; la explicación extensa y el registro quedan plegados.

La explicación acompaña al resaltado del grafo. Ejemplo: «Resolver imports · TypeScript Compiler API · El compilador resuelve cada import a su archivo de destino. Las flechas resaltadas muestran los módulos que dependen de otros · +12 conexiones». Los números proceden de esa ejecución. Si todavía no hay elementos o un paso no descubre conexiones, se explica el motivo en la misma franja.

Se elimina de esta variante la pantalla Application, la consola extensa siempre abierta y los paneles de filtros/IDs/diagnósticos desplegados por defecto. Un diagnóstico relevante al paso se resume junto a su resultado; su detalle se abre a petición.

## 3. Diseño de grafo e inspector

La referencia es `v1:apps/demo/src/components/ImpactGraph.tsx` y sus estilos: fondo oscuro, capas horizontales, tarjetas, flechas, contratos con doble borde, minimapa y controles de React Flow. Se recuperan también el panel lateral y el inspector de tests de v1. El clic genérico para justificar enlaces es una ampliación: v1 solo enfocaba caminos al pulsar un test.

- El canvas representa hechos **v2**. Recuperar la estética de v1 no sustituye el descubrimiento por su grafo revisado del login.
- Se acumulan todos los hechos descubiertos; no se limita el canvas a 20 nodos ni a unos pocos enlaces del journey. Archivos y relaciones estructurales pueden ocultarse con un filtro explícito que indica su cantidad.
- Las capas conocidas del login mantienen su orden. HTTP, proveedor externo, contratos de eventos, canales, colas, consumidores y tests tienen categorías explícitas. La ubicación es presentación; no crea dependencias ni servicios por nombres de carpetas.
- Cada nodo conserva ID y posición entre pasos. Las incorporaciones ocupan espacios libres de su capa. Seleccionar o avanzar conserva zoom/pan y la instancia de React Flow; **Encajar** ajusta la vista cuando el usuario lo solicita.
- Un contorno y la etiqueta **Nuevo en este paso** resaltan nodos/conexiones recién descubiertos. También se destaca una conexión nueva entre dos nodos que ya existían. Los hechos que cambian o reciben nueva evidencia se resaltan como **Actualizado en este paso**, conservando su identidad y posición. El siguiente paso retira ese foco y conserva los hechos anteriores.
- En impacto se recuperan los estados de v1: fuente cambiada, código afectado, recorrido contractual y test seleccionado. Las bajas se muestran discontinuas como **Retirado**, con su evidencia anterior. El foco del paso se distingue del estado de impacto.

**Pulsar un nodo** abre el inspector lateral: nombre, declaración y enlaces entrantes/salientes ya descubiertos. Cada enlace muestra origen → destino, relación, tecnología/extractor y razón. Elegir un enlace resalta su flecha y abre las líneas exactas que lo justifican; si tiene varias evidencias, permite inspeccionarlas todas. Pulsar una flecha abre directamente esa evidencia. No se escoge silenciosamente el primer enlace del nodo.

El inspector reutiliza el estilo de fuente de v1: editor de lectura, archivo y bloque resaltado. Para topología/contratos/declaraciones se muestra el JSON y su propiedad; para tráfico, el span o medición y su ventana. Un nodo de recurso puede tener procedencia de configuración aunque no tenga declaración TypeScript. Las fuentes pertenecen a la revisión inspeccionada; no se inventan líneas ni código para recursos sin fuente.

## 4. Ejecutar pasos reales

**Ejecutar siguiente paso hace trabajo nuevo en el backend.** No revela porciones de un grafo ya calculado. La sesión mantiene las entradas fijadas y el contexto del extractor entre acciones. La interfaz marca En curso y añade los resultados al finalizar cada paso; entre pasos el motor queda esperando al presentador.

**Explicación y espera de cada paso:**

- Al iniciar, se muestra inmediatamente un loader junto al nombre del paso y su explicación: «Resolviendo imports… · TypeScript Compiler API · Buscando el archivo de destino de cada import». El estado de espera incluye tanto la respuesta del servidor como la ejecución de la fase.
- Durante el proceso, el grafo ya descubierto y sus evidencias siguen visibles y consultables. El loader no tapa el canvas ni altera el zoom. El botón muestra **Ejecutando…** y no permite lanzar otra fase; las acciones que invalidan la operación quedan bloqueadas, salvo la cancelación explícita.
- La espera muestra tiempo transcurrido. Solo se indican unidades procesadas si el backend las informa; en caso contrario, el loader es indeterminado, sin porcentajes ni tiempo restante inventados. No se añaden pausas para hacer visible el loader cuando el paso termina rápidamente.
- Al terminar, el loader desaparece, se incorporan/resaltan los hechos y la explicación cambia al resultado real: «Se han resuelto 12 imports; las flechas nuevas muestran sus destinos». Queda visible hasta ejecutar o revisar otro paso. Entre fases se indica **Listo para el siguiente paso**, sin loader.
- Si falla, se detiene el loader y se explica qué fase falló, qué pudo comprobarse y cómo reintentar o cancelar. Un fallo de comunicación no se presenta como fallo del extractor: se consulta el estado de la operación antes de repetir trabajo. Un paso cancelado nunca continúa aparentando ejecución.

El estado tiene texto además de animación y se anuncia de forma accesible; se respeta la preferencia de movimiento reducido. Este mismo comportamiento se aplica a los pasos del análisis de impacto.

Hoy `WorkspaceSnapshots` construye el grafo al arrancar, `buildArchive` ejecuta todos los extractores seguidos y los botones de la variante anterior revisan eventos terminados. Hay que separar la carga de fuentes para el editor de la construcción del grafo y convertir el pipeline en una ejecución reanudable. Ocultar el snapshot final con animaciones no cumple este SDD.

El inicio carga fuentes/configuración y catálogo para editar, sin ejecutar el descubrimiento de esta sesión. Los snapshots históricos o cachés existentes no rellenan el canvas ni saltan sus fases. La construcción visible se solicita expresamente. **Revisar paso anterior** consulta un resultado guardado y lleva esa etiqueta; **Reiniciar grafo** crea otra ejecución real, vacía, conserva los cambios de código e invalida el impacto anterior.

| Paso de construcción | Tecnología real | Qué aparece o se comprueba |
| --- | --- | --- |
| 1. Fijar las fuentes | Node.js `fs`, Git y SHA-256 | Raíces, archivos y revisiones de entrada. El canvas puede seguir vacío; leer archivos aún no descubre una relación. |
| 2. Descubrir archivos y símbolos | TypeScript Compiler API: `createProgram`, AST y `TypeChecker` | Archivos, funciones, clases/interfaces y sus declaraciones. Es el primer conjunto de nodos de código. |
| 3. Resolver imports | TypeScript `resolveModuleName` y aliases configurados | Conexiones entre módulos existentes y evidencia del import. |
| 4. Resolver comportamiento | TypeScript AST y resolución de símbolos | Llamadas concretas, JSX, interfaces y rutas del patrón soportado. Las referencias no demostrables generan diagnósticos. |
| 5. Vincular arquitectura y tests | Adaptador propio, AST y JSON revisado | Anclajes del login y sujetos de tests revalidados. Expresan intención de test; no cobertura medida. |
| 6. Incorporar proveedor externo | Git fijado y adaptador TypeScript propio | Código y tests del proveedor disponible. Sin fuente se informa contract-only; HTTP incorpora después los recursos contractuales verificables. |
| 7. Conectar HTTP | Adaptador propio de AST y contratos JSON | Cliente → endpoint/contrato, verificando método, binding y versión. Destinos incompatibles quedan diagnosticados. |
| 8. Conectar eventos y consumidores | Adaptador propio RabbitMQ/AMQP, AST y topología JSON | Publicador, canal, colas, suscripciones y handlers. Se inspecciona código/configuración; este paso no consulta el broker. |
| 9. Incorporar observaciones, si existen | OpenTelemetry/OTLP y correlación propia; mesh opcional | Resalta hechos correlacionados con spans o comunicación medida. Conserva su revisión y ventana. |
| 10. Validar y publicar | Validadores propios y snapshot con SHA-256 | Comprueba fuentes/evidencias y publica el grafo completo. Habilita el análisis de impacto. |

Los pasos 2–4 requieren descomponer `extractTypescript`, conservando el mismo programa/checker. Las relaciones estructurales necesarias se incorporan con sus nodos. Los adaptadores posteriores mantienen sus requisitos y orden actuales. Un paso sin incorporaciones explica su resultado: no fabrica nodos para animar el canvas.

**Tecnologías nombradas con precisión.** El extractor de producción es **TypeScript Compiler API**; CodeGraphContext se evaluó y descartó como fuente autoritativa en [ADR-G1-INDEXER.md](ADR-G1-INDEXER.md). **React Flow** dibuja y **Monaco** muestra fuentes/diffs. Son funciones distintas de la extracción.

OpenTelemetry tiene instrumentación real, propagación HTTP/AMQP y exportación OTLP al Collector en `pnpm dev:observability`. `pnpm dev` no incorpora trazas salvo que se configure su entrada. La UI distingue **Sin trazas**, **Captura archivada** y **Captura de este perfil**, indicando revisión/ventana. El paso 9 importa/correlaciona esa captura; no inicia instrumentación ni tráfico por pulsar Siguiente. Las trazas históricas no se atribuyen al overlay modificado. El perfil mesh usa Kubernetes/kind, Istio, Prometheus y Kiali; el tráfico TCP al broker no demuestra qué handler procesó un evento. Ambas fuentes enriquecen observaciones sin sustituir dependencias estáticas ni medir coverage.

## 5. Análisis de impacto sobre el mismo grafo

Tras construir el base, aplicar un journey abre el diff en Código. **Analizar impacto** abre Grafos con el base visible y crea una operación fijada a ese base y overlay. Se ejecutan sus pasos con la misma franja compacta.

| Paso | Tecnología y resultado visible |
| --- | --- |
| Comparar fuentes | Comparación propia de bytes/rangos. Marca el código cambiado; aún no hay selección de tests. |
| Descubrir el código posterior | Repite los pasos de extracción sobre el overlay. Compara cada resultado parcial solo con la misma fase del base: nuevos nodos/enlaces aparecen; cambios y bajas se identifican cuando su extractor ya ha terminado. |
| Comparar grafos completos | Delta propio entre snapshots validados. Confirma altas/bajas/cambios; las relaciones retiradas mantienen evidencia del base. |
| Recorrer el impacto | Motor TypeScript propio y políticas de propagación/límites de contratos. Resalta entidades afectadas y caminos que el motor puede justificar. Si el motor determina selección conservadora antes del recorrido, muestra alcance y motivo sin dibujar caminos; el siguiente paso presenta esa decisión. |
| Resolver incertidumbre y seleccionar | Políticas conservadoras y federadas, catálogo revisado y disponibilidad. Marca tests locales/suites seleccionados y explica la ampliación cuando corresponde. |

Hasta acabar la extracción posterior, los hechos antiguos no comprobados llevan **Pendiente de revalidar**: la ausencia temporal de un nodo/arista no prueba una baja. Una conexión entre nodos existentes puede cambiar sin añadir nodos. Las observaciones añaden una marca de tráfico observado; no inventan relaciones de código.

La actualización existente reconstruye el índice completo: el avance por fases no promete indexación incremental. Si una alta/baja, topología o referencia incierta obliga a seleccionar el catálogo local completo, se muestra el motivo real y no se fabrica un camino causal por test. **Seleccionado** y **Ejecutado** son estados diferentes.

## 6. Escenarios y detalle de ejecución

Se conservan los seis journeys actuales; cada uno transforma código/configuración. El backend recibe fuentes y referencias, nunca una lista de tests o resultados elegidos por escenario.

| Escenario | Qué debe poder enseñarse |
| --- | --- |
| New screen | Componente nuevo, import y JSX que crean sus nodos/enlaces. No se atribuye una ruta runtime inexistente. |
| External HTTP contract | Contrato v2 frente a proveedor/parser v1; binding retirado, diagnóstico y fallo contractual al ejecutar. |
| Incompatible event | Cambio de schema/routing y relaciones incompatibles retiradas. |
| New consumer | Handler nuevo, registro y cola independiente; evidencia de código y de topología. No despliega el consumidor ni crea tests automáticamente. |
| Retry / failure | Cambio del handler y reintentos, impacto y fallo real. El runner broker requiere el perfil RabbitMQ. |
| Unresolved dependency | Expresión dinámica, enlace no demostrable y selección conservadora explicada. |

Tests recupera el catálogo/inspector de v1 y extiende el mismo patrón a suites distribuidas. Pulsar un test muestra su propósito registrado, código/assertions, por qué se seleccionó/excluyó, fuente y revisión, runner, resultado, tiempo y salida. Para suites: archivo y casos/resultados disponibles; no se inventa el desglose de un runner que no lo informa. Desde el grafo se puede abrir ese detalle, y desde Tests volver al camino de impacto.

Se reutilizan **Vitest**, **Playwright** y **Node `--test`** para Inventory, sobre la copia aislada de las fuentes analizadas y su overlay. La UI identifica el runner de cada test/suite. Distingue tests locales de suites, y `passed`, `failed`, `skipped` y `unavailable`. El catálogo y las fuentes siguen consultables antes del análisis; ejecutar exige un impacto completo y vigente.

## 7. Implementación y contrato mínimo

Reutilizar `scripts/graph/{snapshot,extract,inventory-http,messaging,analyze,locator}.ts`, el motor de `packages/impact-engine`, `apps/demo/execution.ts` y los componentes de v1. Convertir las funciones monolíticas en fases reanudables; los entrypoints CLI conservan su ejecución completa consumiendo todas las fases del mismo pipeline.

Contrato propuesto, protegido por la sesión local existente:

| Acción | API propuesta |
| --- | --- |
| Abrir editor | `GET /api/editor-input`: fuentes, catálogo e identidad de entradas; no grafo calculado. |
| Iniciar construcción/impacto | `POST /api/graph-sessions`: tipo, identidad de entradas y, para impacto, snapshot base + overlay. |
| Ejecutar fase | `POST /api/graph-sessions/:id/next`: secuencia esperada y clave de idempotencia. Ejecuta una sola fase real. |
| Consultar/revisar | `GET /api/graph-sessions/:id`: estado y resultados de fases terminadas. Consultar no ejecuta. |
| Abrir evidencia parcial | `GET /api/graph-sessions/:id/locators`: ID de evidencia/nodo ya descubierto, sobre bytes fijados de la sesión. |
| Cancelar | `DELETE /api/graph-sessions/:id`: invalida la operación. Reiniciar crea otra sesión; no borra archivos ni snapshots históricos. |

Cada fase expone antes de ejecutarse su nombre, tecnología y explicación de la acción, para mostrarlos durante la espera. Cada resultado incluye secuencia, fase, estado, tecnología/versión efectiva, duración, explicación del resultado, objetos de nodos/aristas/evidencias/diagnósticos y los IDs nuevos/actualizados/retirados de ese paso. Las unidades procesadas son opcionales y solo se publican si el motor puede medirlas. Observaciones llevan sus propias referencias. Los parciales se identifican por **sesión + fase**; solo el final validado recibe identidad de snapshot y puede alimentar ejecución.

Los locators parciales verifican hash/rango contra entradas congeladas, con el mismo criterio que `locator.ts`; no fuerzan publicar un snapshot incompleto. No basta devolver IDs del grafo final para dibujar el parcial. Las respuestas de fases, explicación e inspector proceden del mismo resultado backend.

Estados: **Vacío → Esperando paso ↔ Ejecutando fase → Completado**, con **Error/Cancelado/Desactualizado**. Cada fase confirma sus cambios al terminar; un fallo no contamina el último resultado confirmado. Antes de reintentar, se descartan/restauran también sus mutaciones en el contexto interno del extractor. Un doble clic/reintento de red no repite trabajo ni salta fases. Cambiar el overlay invalida su análisis; cambiar fuentes base requiere otra construcción. Reiniciar/cancelar ignora respuestas tardías. Durante un runner se bloquean las acciones que invalidarían su análisis. La extracción a pasos no cambia la selección para las mismas entradas y versión de extractores.

## 8. Demo de 15–20 minutos y aceptación

| Minutos | Recorrido |
| --- | --- |
| 0–2 | Tres vistas; grafo vacío y primer paso. Distinguir extracción, representación y ejecución. |
| 2–7 | Construir: símbolos, imports, comportamiento y bindings. Cada paso muestra tecnología y altas. Pulsar nodo y abrir evidencia. |
| 7–12 | New consumer: diff, descubrimiento posterior, enlaces resaltados y razón de selección. |
| 12–18 | External HTTP contract: binding retirado, evidencia anterior, selección y runner; revisar assertions mientras ejecuta. |
| 18–20 | Resultados y preguntas. Los otros escenarios quedan disponibles. |

La preparación objetivo es una hora: 15 minutos de lectura, 30 de recorrido y 15 de ensayo. El perfil básico con Inventory permite enseñar los dos casos principales; OTel/mesh quedan opcionales, identificados por su disponibilidad. Capturas de respaldo se etiquetan como ejecuciones anteriores. La duración del runner se mide en el ensayo de esta variante; no se promete a partir del diseño.

Criterios verificables:

1. Una sesión nueva muestra 0 nodos/0 enlaces; no se ejecutan extractores de esa sesión al abrir el editor.
2. Cada Siguiente ejecuta exclusivamente la fase pendiente. Sus parciales, fuentes y tecnología son inspeccionables antes del snapshot final. Revisar no ejecuta.
3. El grafo acumula los hechos sin recortes arbitrarios, conserva posiciones/viewport y resalta también una nueva conexión entre nodos existentes.
4. Pulsar cualquier nodo presenta sus enlaces descubiertos y su procedencia. Se verifican al menos un import, JSX/llamada, binding HTTP y registro/topología AMQP.
5. El grafo final normalizado, su evidencia y la selección son equivalentes al pipeline completo para las mismas entradas y versión de extractores. Los escenarios soportados siguen pasando sus verificaciones existentes.
6. El impacto nunca interpreta como baja una fase todavía pendiente; sus bajas finales abren la fuente anterior. Se distingue incertidumbre de camino causal.
7. Cada test/suite abre el detalle disponible y la ejecución usa el overlay analizado; unavailable/skipped no se muestran como passed.
8. Cancelación, errores, doble clic, cambio de fuentes/overlay y respuesta tardía conservan el último estado válido.
9. En una pasada básica se indica Sin trazas; una captura importada conserva revisión/ventana y no se presenta como tráfico del overlay.
10. Un ensayo de 15–20 minutos comprueba el aspecto v1, ambos journeys, evidencia y fallo contractual. Las pruebas previas de otra rama no aceptan esta variante.
11. Cada paso de descubrimiento e impacto muestra una explicación visible de su acción, tecnología y resultado, coherente con los elementos resaltados; también cuando no incorpora hechos.
12. Una fase con demora real muestra loader y texto En curso, mantiene el canvas consultable y bloquea avances duplicados. Se comprueban finalización, fallo y cancelación: el loader se detiene y se muestra el estado correcto. Las fases rápidas no reciben esperas artificiales ni las indeterminadas porcentajes ficticios.

Orden de entrega: **A. pipeline real por fases y locators parciales → B. canvas v1 progresivo e inspector → C. impacto, detalle de suites y ensayo**. Esta rama contiene inicialmente el SDD; implementación, capturas y resultados de aceptación se añadirán con su propia validación.
