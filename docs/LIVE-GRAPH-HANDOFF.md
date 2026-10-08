# Estado del grafo progresivo

2026-10-08. Rama `feat/live-graph-v1`. Guion: [DEMO-GRAFO-PROGRESIVO.md](DEMO-GRAFO-PROGRESIVO.md). Diseño y criterios: [SDD-GRAFO-PROGRESIVO.md](SDD-GRAFO-PROGRESIVO.md).

## Implementado

- Diez fases reales de descubrimiento y catorce de impacto. La web carga fuentes sin calcular su grafo visible; cada Siguiente ejecuta una fase. CLI y sesiones consumen los mismos extractores.
- Tres vistas: Código, Grafos y Tests. Canvas vacío al comenzar, explicación y tecnología por fase, loader/tiempo real, novedades, cambios y bajas con evidencia original.
- Lenguaje visual de v1: tarjetas y capas, minimapa y zoom. Encuadrar Login/HTTP/Eventos/Todo, Buscar nodo y Ver novedades permiten navegar sin recortar hechos. Posiciones y viewport se conservan entre pasos.
- Inspector de nodos y enlaces con código/configuración fijados a la sesión. Evidencia parcial e histórica disponible antes de publicar el snapshot final.
- Catálogo y fuentes de tests/suites consultables antes del análisis. Motivos de selección, assertions, runner, duración, salida y resultado. Los totales distinguen tests locales y suites distribuidas; unavailable no cuenta como passed.
- Sesiones con entradas congeladas, token, secuencia, idempotencia, rollback por fase, invalidación y cancelación. El runner usa una copia aislada de las fuentes y el overlay analizados.
- Layout diferido de Monaco y parche acotado de React Flow 12.12.0: las mediciones de nodos se agrupan en el siguiente frame. El parche está versionado y se incluye en las entradas del runner; no se suprimen errores de navegador.

## Validación técnica

- `CI=true pnpm typecheck`: pasa.
- `CI=true pnpm build`: pasa después del parche. Vite avisa del tamaño del bundle de Monaco; no bloquea la compilación.
- **59 pruebas** pasan en nueve archivos: sesiones, API, resumen de ejecución, descubrimiento, análisis, HTTP, mensajería, observaciones y journeys. Cubren equivalencia con batch, pasos e idempotencia, stale/cancelación, evidencia parcial/histórica, bajas HTTP y contadores de suites fallidas/no disponibles.
- Recorrido desktop con Chromium a 1680×1050: **pasa sin errores de navegador**. Ejecuta descubrimiento, consumidor nuevo, impacto HTTP, fuente de enlace retirado, suite y runner físico; comprueba también reinicio y ausencia de errores de navegador.

La ejecución física `cc385fb2-3022-48e1-bbfd-4d3b6ad09902` tardó **103,1 s**: **39 tests locales passed; 9 suites passed, 1 failed y 2 unavailable**. `inventory-contract` falla por la incompatibilidad v2/v1 introducida; `inventory-provider` pasa. El informe local está en `.impact-runs/cc385fb2-3022-48e1-bbfd-4d3b6ad09902/summary.json` (ignorado por Git).

Capturas reales del recorrido: [Código, Grafos y Tests](screenshots/live-graph-v1/README.md). Se comprobó también que el diff tiene altura útil y que las flechas persisten entre fases.

## Reproducir

```sh
pnpm dev
CI=true pnpm typecheck
CI=true pnpm build
CI=true pnpm exec vitest run apps/demo/graph-sessions.test.ts apps/demo/src/components/ExecutionPanel.test.tsx apps/demo/server.test.ts tests/dependency-graph/discovery.test.ts tests/dependency-graph/analysis.test.ts tests/dependency-graph/http-inventory.test.ts tests/dependency-graph/messaging.test.ts tests/dependency-graph/observations.test.ts tests/dependency-graph/journeys.test.ts --maxWorkers=1 --testTimeout=60000 --hookTimeout=60000
CI=true PLAYWRIGHT_BROWSERS_PATH=/private/tmp/test-impact-lab-browsers pnpm test:live-graph-browser
```

`pnpm dev` prepara una revisión independiente de Inventory y muestra las URLs. El verificador prepara su propia fixture, API y Vite efímeros; no reutiliza ni detiene servicios del usuario. Abrir localhost/Chromium necesita permisos fuera del sandbox de este equipo. La ruta de Chromium corresponde al entorno local; en otro equipo instalarlo con Playwright.

## Límites y ensayo

El recorrido básico valida Inventory y los escenarios consumidor/HTTP. La incompatibilidad HTTP debe producir un fallo contractual real. RabbitMQ, OpenTelemetry y mesh conservan sus perfiles existentes, pero no se han levantado para esta aceptación: sin broker las suites que lo requieren aparecen no disponibles y sin dataset se indica Sin trazas.

El guion está preparado para 15–20 minutos; esa duración requiere el ensayo humano. Las capturas propuestas permanecen en `docs/mockups/live-graph-v1`; las capturas del verificador documentan una ejecución anterior, no resultados en vivo del navegador que abra el presentador.

## Corrección de selección acotada (2026-10-08)

La política anterior ampliaba globalmente altas y contratos incompatibles. Ahora una incorporación con dependencia entrante resuelta puede propagarse a sus dependientes, y una incompatibilidad de evento con binding anterior comprobado conserva ese alcance. Los archivos aislados, eliminaciones y destinos dinámicos siguen requiriendo fallback completo. HTTP conserva su política anterior. No se seleccionan tests por nombre de escenario.

- New screen: **E1**, 0 suites distribuidas. Es el journey existente del Login; no se inventa coverage del componente nuevo.
- Incompatible event: **0 tests locales y 5 suites**: order-created-contract, notifications-consumer, preparation-consumer, messaging-runtime y messaging-browser. Los enlaces retirados conservan su evidencia previa.
- **66 pruebas** pasan en ocho archivos, con regresiones de aislamiento y fallback; se repitieron 23 del análisis/journeys/federación tras el ajuste final. Typecheck/build pasan.
- Chromium recorre ambos análisis de 14 fases y comprueba los contadores y el botón de ejecución, sin errores de navegador. Comando: `CI=true PLAYWRIGHT_BROWSERS_PATH=/private/tmp/test-impact-lab-browsers node --import tsx scripts/verify-live-graph-browser.ts --scoped-selection`.
- Ejecución física `d1a2dede-ad3b-4af3-bdda-59609212262f`: **8,8 s**, ninguna entrada local y únicamente las cinco suites seleccionadas. El contrato falla, los dos tests de consumidor pasan y las dos suites del broker quedan unavailable. Informe ignorado: `.impact-runs/d1a2dede-ad3b-4af3-bdda-59609212262f/summary.json`.

## Variantes separadas y quick changes

`feat/live-graph-v1` (PR #5) conserva el contenido de `4b2e7d8`, anterior a la corrección del selector, mediante un revert sin reescribir historial. `feat/scoped-impact-v1-quick-changes` conserva la selección acotada de `8fb0839` y recupera los cuatro botones de v1, visibles en Código con sus descripciones originales. Las transformaciones de `suggestions.ts` coinciden con el tag v1.

Validación de esta recuperación: typecheck/build y Chromium pasan; se comprueban cuatro botones visibles, descripciones, archivo/diff de cada transformación y reset, sin extracción al aplicar un quick change ni errores de navegador. Comando: `CI=true PLAYWRIGHT_BROWSERS_PATH=/private/tmp/test-impact-lab-browsers node --import tsx scripts/verify-live-graph-browser.ts --quick-changes`. [Captura de los cuatro botones](screenshots/live-graph-v1/04-quick-changes.png).

## Ejecución rápida y Tests reorganizado

Se añade Generar grafo completo / Analizar impacto completo en Grafos. Completa secuencialmente las fases reales, puede continuar un descubrimiento parcial, conserva loader/progreso/cancelación y abre Tests tras completar el impacto. Si falta el base, lo construye antes del impacto. El avance manual se conserva.

Tests muestra Selected tests (solo seleccionados, incluidas suites), Physical execution, visor de código, catálogo de suites distribuidas y All tests. Sin análisis vigente muestra Waiting for code change to calculate regression.; un resultado válido sin selección usa No tests selected for this change.

Validación: typecheck/build, prueba del resumen físico y Chromium con `--fast-flow` pasan. El navegador comprueba cancelación sin más avances, continuación de una fase parcial, las secuencias exactas 0–9/0–13, selección de pantalla/evento, orden de los cinco bloques, fuentes y eliminación de la selección al restaurar código. No hay errores de navegador. [Captura real de la selección primero](screenshots/live-graph-v1/05-selected-first.png). Esta pasada no repite el runner físico: su implementación no cambia.
