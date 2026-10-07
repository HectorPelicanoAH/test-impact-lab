# G9 — Recorridos y auditoría final

Autorización: «sigue» del 2026-10-06 después de G8. **G9 completada**, última fase del SDD. Los intentos fallidos se conservan como incidencias, no aceptaciones. Los cambios G7/G8 existentes se conservan, sin commit/push en este repositorio ni despliegue externo.

## Recorridos web

En `pnpm dev`, elegir **LEARNING JOURNEY**, **APPLY JOURNEY**, revisar los botones **SOURCE DIFF**, calcular y seguir **DELTA → INSPECT JOURNEY EVIDENCE → IMPACT → EXECUTION**. Aplicar un recorrido sustituye el overlay actual desde el snapshot fijado. Las peticiones solo contienen `snapshotId/edits` o `snapshotId/analysisId/mode`; el servidor analiza código/configuración y deriva los runners.

| Recorrido | Cambio real | Hecho o límite verificable |
| --- | --- | --- |
| Pantalla | Añade GuidedScreen e import/JSX en LoginPage | Nuevos nodos y renders, sin inventar una ruta; login se ejecuta en overlay |
| HTTP externo | JSON del cliente declara respuesta v2; proveedor/parser siguen v1 | missing-contract, retirada del binding, fallo contractual real; código externo fijado en Git |
| Evento incompatible | JSON declara OrderCreated v2/routing key v2; topología/parser siguen v1 | missing-contract y retirada de publicaciones/suscripciones; fallo contractual real |
| Consumidor | Nuevo handler audit, registro literal y cola independiente | subscribes/realizes/processes con evidencia; no despliega ni registra cobertura ficticia |
| Reintento/fallo | notify lanza Error y maxAttempts pasa a uno | Configuración/impacto reales y fallo de notifications-consumer; selected/full lo detectan |
| No resuelta | Método HTTP depende de una expresión, devuelve GET en este origen | Adaptador acotado no prueba la llamada, conserva diagnóstico y selección conservadora; runtime puede pasar |

Los estados fallido, omitido e inaccesible permanecen visibles. `pnpm test:journeys` abre Chromium y ejecuta los seis overlays con los runners reales, guarda capturas, requests analizados y resultados; repite selected/full del fallo. Sin RabbitMQ marca sus suites `unavailable`, nunca passed. `pnpm test:journeys --broker` crea un broker propio y ejecuta también las suites distribuidas; `pnpm test:messaging` comprueba el producto sin mutaciones.

## Reproducir desde un entorno limpio

Con Node 24.15+ en 24.x o 26+, pnpm 11.19.0, Git y Docker Desktop activo para perfiles opcionales:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm validate
pnpm graph:legacy:check
pnpm graph:discover
pnpm graph:check:v2
pnpm graph:audit
pnpm test:execution
pnpm test:discovery-execution
pnpm test:federated-execution
pnpm test:discovery-browser
pnpm test:evidence-browser
pnpm test:journeys
pnpm test:journeys --broker
pnpm test:messaging
node scripts/verify-messaging.mjs --compiled
pnpm test:observability
pnpm mesh:setup
pnpm test:mesh
```

Los verificadores usan puertos libres, repositorio externo temporal y recursos propios. `validate` sin broker omite explícitamente cinco integraciones y un E2E de mensajería; el perfil real los ejecuta. La primera instalación necesita red para dependencias/Chromium/imágenes/herramientas; los comandos posteriores aprovechan cachés locales. Mesh requiere kubectl/Docker y los binarios descritos en [G8](G8-SERVICE-MESH.md).

`pnpm dev`, `dev:events` y `dev:observability` se detienen con Ctrl+C. Los verificadores limpian en `finally` únicamente lo que crearon. Mesh retira el clúster propio; las evidencias y herramientas quedan. Si se interrumpe de forma forzosa, consultar `pnpm mesh:status <id>` y usar `pnpm mesh:down <id>` para ese perfil; el ID figura en el informe y `.impact-runs/mesh/<id>/state.json`. No resetear Docker ni borrar recursos ajenos. No eliminar `INVENTORY_ROOT`/`DATA_DIR` aportados por el usuario. Ver [operación G5](G5-MESSAGING.md), [G7](G7-OBSERVABILITY.md) y [G8](G8-SERVICE-MESH.md).

## Fuentes y limitaciones

El checker resuelve el subconjunto TypeScript soportado. Los adaptadores HTTP/AMQP verifican bindings explícitos. Los sujetos revisados declaran intención de pruebas. OpenTelemetry y mesh observan tráfico de una revisión/ventana: no demuestran cobertura ni exhaustividad de dependencias. Las observaciones históricas G7/G8 se mantienen históricas al editar código; una nueva medición no sustituye sus bytes.

El índice se reconstruye completo tras cada cambio; solo se omite extracción cuando el fingerprint no cambia. Los tiempos de `graph:audit` incluyen cinco repeticiones, equipo, tamaño y alcance por operación. La actualización con input capturado mide fingerprint/build/store, no la latencia total del watcher o de disco. No hay indexación parcial ni promesa universal de rendimiento.

Persisten destinos dinámicos y patrones no soportados, snapshots sin retención automática, SQLite experimental y coste de Monaco. El runner ejecuta código local de confianza en copia temporal con comandos fijos y entorno limitado; no es aislamiento de sistema operativo. Una selección completa cubre el catálogo registrado y disponible, no todos los tests posibles de un producto externo. Guía de ampliación en [EXTENDING-DISCOVERY](EXTENDING-DISCOVERY.md).

## Evidencias de aceptación

[Resumen portable](../impact/evidence/g9-summary.json), [dataset mesh final](../impact/evidence/g9-mesh.json) y [spans finales](../impact/evidence/g9-observations.json). Cada informe conserva su snapshot/revisión; sus IDs no se sustituyen por el índice actual al publicar este resumen. Los datasets históricos G7/G8 permanecen intactos. Artefactos extensos, capturas y resultados de cada runner en `.impact-runs/`.

| Validación | Resultado real |
| --- | --- |
| `pnpm validate` | Build/typecheck/grafo correctos; **192 Vitest pasan**, cinco omisiones sin broker; **3 Chromium pasan**, una omisión de mensajería |
| `node scripts/verify-messaging.mjs --compiled` | **5 integraciones sobre fuentes + 5 sobre binarios + 4 Chromium**, todas correctas; entrega, duplicados, fallo definitivo, evento incompatible y recuperación |
| `pnpm test:execution` | Selected **13** / full **39**; ambos detectan los mismos **3 fallos deliberados** del login; fuentes sin cambios |
| `pnpm test:federated-execution` | Ambos detectan exclusivamente `notifications-consumer`; preparación queda excluida en selected; suites sin broker se declaran inaccesibles |
| `pnpm test:discovery-execution` | Alta/conexión y baja de stylesheet en overlay; **39 tests reales pasan**, checkout intacto |
| `pnpm test:discovery-browser`, `pnpm test:evidence-browser` | CRUD, delta, teclado, código/configuración estática/HTTP/AMQP/revisada, proveedor Git, BEFORE/AFTER y viewport estrecho; sin errores de página |
| `pnpm test:journeys --broker` | **6 recorridos + full del fallo**, API real y broker propio; los 39 tests login pasan en cada ejecución; cero errores de página y cero relecturas de red en la pasada final |
| `pnpm test:observability` | **9 spans / 4 servicios**, ambos consumidores y reintento; Collector ausente/reiniciado, SDK desactivado, revisión incompatible pendiente y navegación archivada |
| `pnpm test:mesh` | **6 workloads**, ventanas reales de pedidos/lecturas, Kiali/Prometheus y navegación archivada; perfil `0c027834-61fd-4648-aa8d-f87dd7d5e4e0` retirado |
| `pnpm graph:audit`, `pnpm graph:legacy:check` | Todas las conexiones/locators legibles; identidad por orden reproducible; **69 nodos / 84 políticas / 39 tests** del login conservados |

En HTTP falla únicamente `inventory-contract`; en evento, únicamente `order-created-contract`. Pantalla, consumidor nuevo y dependencia no resuelta pasan sus suites disponibles. El fallo de notificaciones produce el mismo conjunto en selected/full: `notifications-consumer`, `messaging-runtime`, `messaging-browser`; preparación y proveedor pasan en full. No se considera passed una suite sin reporte, omitida o inaccesible.

La medición mesh conserva la relación estática de inventario con **6 requests** al crear pedidos y **0** al leerlos; frontend→API registra seis requests en cada ventana. TCP solo mide transporte y puede incluir trabajo/heartbeats posteriores: no se atribuye a un evento o handler por compartir broker. El snapshot medido es `6ae92a2dcb6ef07462d953af42bb20236971bb0578b34899a390db647a6e473b`, dataset `922dd3136b4e14fb1ca28a9042f923085cc7b5c460fad02e7ed5d9bdf017fa35`.

## Corpus y rendimiento medido

Auditoría final `.impact-runs/g9-audit-701cb1e3-b9fb-403d-bf90-c61eac1e52e1/`: Apple M1 Pro, **10 CPU lógicas / 32 GiB**, darwin arm64 25.6.0, Node 24.18.0. Dataset con proveedor Git propio: **63 archivos / 77 367 bytes / 1 401 líneas**, 231 archivos capturados para ejecución, **382 nodos / 545 aristas / 452 diagnósticos**, 570 usos de evidencia comprobados. Los diagnósticos son límites explícitos, no conexiones inferidas.

Cinco muestras calientes en el mismo proceso; medianas: lectura+construcción completa **206,35 ms**, análisis de overlay con reconstrucción completa **127,09 ms**, refresh sin cambios con input capturado **1,37 ms**, cambio con reconstrucción/publicación **159,53 ms**. Los dos refresh excluyen lectura de disco; no son comparaciones de latencia completa ni actualización parcial. No hay promesa universal ni indexación parcial implementada.

El corpus G1 mantiene **26 casos** y **cero enlaces falsos** del extractor elegido. Llamadas: precisión **1**, exhaustividad **5/8**; los tres casos diagnosticados siguen contando como omisiones. Imports, renders e implements del corpus se resuelven completamente. Es una medición del corpus, no de cualquier proyecto. La [decisión TypeScript/CodeGraphContext](ADR-G1-INDEXER.md) y sus resultados históricos siguen vigentes; CodeGraphContext no participa en el grafo autoritativo.

## Correcciones e incidencias

La auditoría detectó pérdida de `INVENTORY_ROOT` y parámetros broker al filtrar de nuevo el entorno de Playwright. El runner ahora pasa explícitamente el proveedor archivado al login y conserva los opt-ins de las suites broker. Los fixtures HTTP/AMQP usan esa fuente y solo eliminan las raíces propias. Los secretos y raíces arbitrarias del entorno siguen filtrados; el test del entorno lo comprueba.

Se corrigieron filas/anchura del panel web e invalidación del foco de evidencias al cambiar/resetear código. El primer bind fue rechazado por el sandbox (`EPERM`); se ejecutaron pruebas loopback autorizadas fuera de él y retiró solo ese fixture temporal. Dos selectores iniciales del verificador se ajustaron al protocolo/label reales. Un cierre transitorio de socket motivó lecturas GET acotadas con conexiones independientes; los POST no se repiten. El verificador drena los runners aceptados antes de retirar recursos, incluso si falla una aserción. Los intentos anteriores no sustituyen la pasada final.

## Matriz del SDD y cierre

| Necesidad | Evidencia de cierre |
| --- | --- |
| Pantalla y actualización | CRUD Chromium + 39 tests overlay + recorrido pantalla/delta/renders |
| Código, identidades y corpus | Audit de todos los locators, orden/hash, falsos enlaces cero y navegación exacta |
| CodeGraphContext | ADR y comparación del corpus verificadas en Vitest |
| Proyecto externo / solo contrato | Proveedor Git fijado, suites node-test/HTTP; negativos de fuente inaccesible y estado unavailable |
| Broker / consumidores independientes | 5 integraciones fuentes/binarios, suite federada y recorrido consumidor con cola propia |
| Reintentos / duplicados / fallos | Integraciones AMQP, traza real y comparación selected/full del fallo |
| Mesh | Dos ventanas reales, ausencia de inventory traffic conserva relación, archivo y cleanup |
| Dinámicos / omisiones | Diagnóstico, selección conservadora y ejecución real que puede pasar |
| Explicación web | 6 recorridos, evidencia/impacto/resultados, límites de cada fuente |
| Control humano | Autorizaciones por fase conservadas; sin agentes ni envío remoto; parada final |

Índice final por defecto (solo contrato externo) después de publicar las evidencias: `24e85962c0a04346366d50d2d2ac8248d83c1a022b792631e23c4e99ee5a9c33`, **368 nodos / 531 aristas / 430 diagnósticos**, comprobado con `pnpm graph:check:v2`. Typecheck y `git diff --check` finales correctos; hashes de los datasets portables coinciden con sus informes. Sin contenedores del laboratorio, clusters kind ni tags de imágenes temporales G8 al cierre; herramientas/cachés/evidencias conservadas. Para revisar el mesh archivado en esta máquina: `pnpm mesh:inspect 0c027834-61fd-4648-aa8d-f87dd7d5e4e0`.

**G1–G9 completadas. Detenerse. Cualquier ampliación requiere una nueva instrucción humana.**
