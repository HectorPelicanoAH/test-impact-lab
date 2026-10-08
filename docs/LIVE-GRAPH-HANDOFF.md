# Continuidad del desarrollo del grafo progresivo

2026-10-08. Rama `feat/live-graph-v1`. Pausa solicitada por el usuario antes de agotar su cuota (última consulta: 11% restante). **Todavía no está listo para presentar como demo validada.** No hay PR nueva para esta variante.

## Implementado

- Pipeline real reanudable de diez fases; CLI y sesiones usan los mismos extractores. TypeScript indexa y resuelve imports/comportamiento en pasos distintos. Inventarios HTTP, mensajería, evidencia revisada y observaciones tienen sus propias fases explicadas.
- Captura de fuentes sin construir el grafo al abrir la web. Sesiones protegidas por token, idempotencia, revisión de fuentes, rollback por fase, consulta histórica y cancelación.
- Impacto con catorce fases: diff, reconstrucción, delta, propagación y selección local/distribuida. El resultado final se registra para el runner existente.
- Tres vistas: Código, Grafos y Tests. Canvas inicialmente vacío; novedades resaltadas, explicación/tecnología por fase, loader con tiempo real, minimapa/zoom, inspector de nodos/flechas y fuente de sus evidencias parciales.
- Detalle de tests locales y de suites distribuidas, con fuente, assertions y resultados. Mockups originales conservados en `docs/mockups/live-graph-v1`.
- Helper de layout diferido para Monaco. Tipado pasa, pero no ha resuelto todos los avisos ResizeObserver del navegador.

## Validación realizada

- `CI=true pnpm typecheck`: pasa, también tras los últimos cambios de layout/Monaco.
- `CI=true pnpm build`: pasó antes de los últimos ajustes visuales; hay que repetir al cerrarlos.
- 26 pruebas pasan: `apps/demo/graph-sessions.test.ts`, `apps/demo/server.test.ts`, `tests/dependency-graph/discovery.test.ts`, `tests/dependency-graph/analysis.test.ts`. Verifican pausa real, rollback, equivalencia con batch, locators parciales e idempotencia/impacto/cancelación por API.
- Verificador nuevo `scripts/verify-live-graph-browser.ts` recorre extracción, código/impacto de consumidor, novedades de mensajería y detalle de suite. Última ejecución llega al escenario HTTP pero falla esperando `.live-edge.retired` tras finalizar selección. **No pasa la aceptación completa.** También recoge errores `ResizeObserver loop completed with undelivered notifications`.
- Capturas reales ignoradas por Git: `.impact-runs/live-graph-browser/01-empty.png` a `05-suite-inspector.png`. La ejecución terminó y cerró sus servidores temporales. Las imágenes de mockups son propuestas, no prueba de aceptación.
- No se ha validado todavía una ejecución física de tests desde esta nueva UI.

## Siguiente trabajo, en orden

1. Corregir encuadre/capas del canvas. `LiveGraph.tsx` usa capas v1 de `layoutLayers` por ruta y roots para el código adicional, pero el encuadre global sigue mostrando demasiados elementos diminutos. Conservar posiciones y evidencia completa; hacer legible la navegación para demo. Revisar capturas desktop a 1680×1050.
2. Resolver ResizeObserver. `monaco-layout.ts` difiere layout y todos los editores lo usan, pero persiste el aviso: localizar su origen en ReactFlow/Monaco/contenedores, sin ocultar los errores globalmente.
3. Investigar la pérdida de estado retirado entre delta y selección en impacto HTTP. `LiveGraph.state()` usa IDs del paso actual; revisar acumulación del delta final en `GraphSessions.view()` y representación de aristas originales. Confirmar también que el escenario realmente retira el enlace esperado y ampliar la prueba correspondiente.
4. Completar aceptación de stale/cancelación/respuestas tardías y evidencia histórica; revisar detalle de suites antes de calcular impacto (hoy aparecen en la selección de impacto).
5. Ejecutar un runner real desde la nueva sesión y verificar fuente/assertions/salida en Tests. Después repetir build y verificador limpio sin editar mientras corre; ensayar recorrido de 15–20 minutos.
6. Actualizar el SDD con aceptación real. No marcar terminado ni prometer demo lista hasta cerrar los puntos anteriores.

## Comandos

```sh
CI=true pnpm typecheck
CI=true pnpm exec vitest run apps/demo/graph-sessions.test.ts apps/demo/server.test.ts tests/dependency-graph/discovery.test.ts tests/dependency-graph/analysis.test.ts --maxWorkers=1 --testTimeout=60000 --hookTimeout=60000
CI=true PLAYWRIGHT_BROWSERS_PATH=/private/tmp/test-impact-lab-browsers node --import tsx scripts/verify-live-graph-browser.ts
CI=true pnpm build
```

Las pruebas que abren localhost y Chromium necesitan permisos fuera del sandbox en este equipo. El verificador crea servidores efímeros, no reutiliza ni detiene los servicios del usuario. Para abrir manualmente: `pnpm dev:demo-api` y `pnpm dev:demo` en terminales separadas.
