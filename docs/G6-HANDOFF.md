# Traspaso — G6 y siguiente fase

Fecha: 2026-10-05. Rama: `docs/dependency-graph-sdd`. Este archivo resume el punto de reanudación en otro PC o con otra licencia. El [SDD por fases](SDD-DEPENDENCY-GRAPH.md) es la autoridad para el alcance y [el registro de estado](DEPENDENCY-GRAPH-STATE.md) conserva las evidencias detalladas.

## Estado

G1–G6 están completadas. G6 incorpora políticas causales para relaciones distribuidas, selección con grafos anterior/posterior y 12 suites federadas de pedidos, inventario, contratos, mensajería y consumidores. El runner ejecuta comandos fijos sobre fuentes capturadas; la web muestra por qué se selecciona o excluye una suite, sus relaciones navegables y su resultado físico. Una fuente externa o un broker ausente se declaran **no disponibles**, nunca aprobados.

La siguiente fase es **G7 — trazas y correlación**, todavía sin autorización. Requiere otro «sigue» humano. Modelo recomendado y acordado: **GPT-6 Sol / high**. G8 y G9 también permanecen pendientes; no se deben iniciar como consecuencia de G7.

## Validación de G6

- `CI=true PLAYWRIGHT_BROWSERS_PATH=/private/tmp/test-impact-lab-browsers pnpm validate`: build, grafo y comprobación de snapshot correctos; 169 tests Vitest y 3 Chromium pasaron. Cinco Vitest y un recorrido Chromium quedaron omitidos por el perfil broker ausente.
- `CI=true pnpm exec vitest run tests/dependency-graph/federated.test.ts --maxWorkers=2`: siete pruebas correctas sobre pantalla, HTTP externo, publicación, ambos consumidores, suscripción retirada y destinos desconocidos.
- `CI=true PLAYWRIGHT_BROWSERS_PATH=/private/tmp/test-impact-lab-browsers pnpm test:federated-execution`: mutación real de notificaciones. Selected y full detectaron el mismo fallo `notifications-consumer`; full también ejecutó correctamente el test del proveedor externo y los recorridos de pedidos. Dos suites broker constaron como no disponibles en ambos modos. Los informes están en `.impact-runs/`, ignorados por Git.
- `CI=true pnpm typecheck`, `node --check scripts/dev-events.mjs` y `git diff --check`: correctos al cerrar G6.

## Antes de G7

En el PC que cerró G6 no había Docker. Las suites que necesitan RabbitMQ no se ejecutaron allí; sus resultados no se trataron como pases. Para satisfacer la aceptación de G7 hacen falta una traza **real** desde pantalla/HTTP hasta publicación y ambos consumidores, un reintento visible, correlación por versión y una comprobación de que el análisis estático sigue funcionando sin telemetría. El SDD pide además Collector/backend local con versiones fijadas, observaciones archivadas y navegación en la web. Si el nuevo PC tampoco puede ejecutar broker y observabilidad, se pueden preparar artefactos, pero G7 deberá permanecer incompleta hasta validar la traza real.

En una instalación nueva, ejecutar `pnpm install --frozen-lockfile` y `pnpm exec playwright install chromium` antes de validar. El proyecto usa Node 24.15+ (24.x) o 26+ y pnpm 11.19.0. El perfil básico se inicia con `pnpm dev`; el perfil de eventos, con Docker disponible, con `pnpm dev:events`. Consultar [operación G5](G5-MESSAGING.md) antes de iniciar el broker.

Este traspaso no autoriza cambios de modelo automáticos, agentes adicionales, publicación remota de fases posteriores ni el comienzo de G7. Cuando el usuario escriba «sigue», leer primero este archivo, el SDD y el registro de estado, y trabajar solo en G7.
