# Validación de la demo guiada

2026-10-07 · rama `feat/demo-guided-discovery` · base `docs/dependency-graph-sdd` (`93089f1`).

Implementación terminada y recorrido funcional comprobado en la web local. El [guion](DEMO-BACKEND.md) reserva 18 minutos de exposición y 2 de preguntas. El presentador debe ensayar su narración con cronómetro durante los últimos 15 minutos de su preparación; la comprobación funcional no mide su velocidad al explicar.

## Lo comprobado en la web

- Borrar deja «Sin mapeo», cero elementos activos y cálculo deshabilitado. Recargar mantiene ese estado. Código y acciones del editor siguen disponibles.
- Reconstruir registra captura, inventario, compilador, declaraciones revisadas, proveedor, HTTP, eventos, observaciones y validación. Los dos archivos del overlay permanecen modificados al reconstruir.
- La consola diferencia motor terminado y fase en revisión. Cambiar de fase cambia los hechos mostrados y no repite la extracción.
- New consumer: el compilador muestra el símbolo `audit` antes del adaptador de eventos. Después aparecen consumidor, cola, canal y registro en un mapa de seis elementos. Se abren el registro literal del código y las líneas 25–31 de la topología que declara `audit`.
- El cálculo registra trece fases. Explica que el alta de archivo, el cambio de topología y el ámbito sin compatibilidad revisada obligan a seleccionar el catálogo local completo. Tests locales y suites distribuidas tienen recuentos separados.
- External HTTP contract: declara v2, genera `missing-contract` y retira cuatro relaciones. La vista muestra la ausencia de binding verificable y abre la llamada original de `InventoryClient.ts` desde el snapshot anterior.
- Se ejecuta la selección con fuentes fijadas, proveedor independiente disponible y navegadores de Playwright instalados.

## Resultado real del contrato HTTP

Ejecución `a9e77a3a-1905-4a13-b355-aef929a9b3eb`, terminada a las 22:48:36, hora de Madrid. Duración del runner: **120,17 segundos**, sin contar la preparación del overlay.

| Grupo | Resultado |
| --- | --- |
| Login local | **39 pasados, 0 fallidos**. Incluye el test de navegador E1. |
| `inventory-contract` | **Fallido esperado**: el contrato declara versión 2 y el test espera versión 1. |
| Otras suites disponibles | **9 pasadas**, incluido proveedor externo y navegador de pedidos. |
| Suites que requieren RabbitMQ | **2 unavailable**: `messaging-browser` y `messaging-runtime`. No cuentan como pases. |

El estado global es failed por el fallo contractual introducido. Resumen reproducible: [http-execution.json](demo-guided/http-execution.json). El informe completo del runner permanece en `.impact-runs/a9e77a3a-1905-4a13-b355-aef929a9b3eb/`.

## Comprobaciones automatizadas

- `CI=true pnpm typecheck`: pasa con los cambios finales.
- `CI=true pnpm build`: pasa con los cambios finales; compila web, API y aplicaciones.
- Pruebas específicas de API, mapeo, fases y journeys: **22 pasadas**. Cubren invalidación del análisis después de borrar, repetición de extracción con idéntico snapshot, fallo de captura, archivo anterior conservado y autorización local.
- `CI=true pnpm test`: 177 pasadas, 14 agotaron su tiempo y 10 omitidas. Los errores fueron límites de tiempo; no hubo discrepancias de las assertions.
- Se repitieron los ocho archivos afectados con `--maxWorkers=1 --testTimeout=60000 --hookTimeout=60000`: **49 pasadas**. Incluye las cinco pruebas de mesh cuyo hook había agotado su tiempo.
- Tras el ajuste de proyección del símbolo `audit`, `CI=true pnpm exec vitest run tests/dependency-graph/progress.test.ts`: **3 pasadas**. La instrumentación mantiene grafo y selección, muestra únicamente relaciones producidas por la fase y no anticipa el nodo consumidor antes del adaptador de eventos.
- `git diff --check`: pasa.

Los verificadores anteriores de navegador se han adaptado a la API de operaciones y a la entrada explícita al explorador técnico. No se han vuelto a ejecutar completos; el recorrido de esta entrega se comprobó directamente en la web. No se probaron perfiles con RabbitMQ, Collector ni Kubernetes, que no son necesarios para el guion principal.

## Capturas del ensayo

Son resultados de la comprobación del 7 de octubre, para usar como respaldo si la demo en directo se interrumpe.

- [Código descubierto y registro literal de audit](demo-guided/consumer-code.jpg).
- [Mapa del consumidor y consola de eventos](demo-guided/consumer-map.jpg).
- [Configuración de la suscripción audit](demo-guided/consumer-configuration.jpg).
- [Diagnóstico HTTP sin binding compatible](demo-guided/http-diagnostic.jpg).
- [Binding HTTP retirado](demo-guided/http-removed-binding.jpg).
- [Fuente anterior del cliente HTTP](demo-guided/http-previous-source.jpg).
- [Resultado real del runner](demo-guided/http-execution.jpg).

## Estado para presentar

Web local `http://127.0.0.1:5175`, mapeo listo, New consumer elegido, sin cambios aplicados y primera fase visible. Los servicios se arrancan con el comando del guion. Los snapshots históricos y los informes de ejecución se conservan.
