# Traspaso — G7 y siguiente fase

Fecha: 2026-10-06. G1–G7 completadas. La autorización de esta sesión fue comprobar G1–G6 y continuar exclusivamente con G7. No se inició G8/G9, ni se cambió automáticamente de modelo, crearon agentes o enviaron cambios remotos.

Leer [el SDD](SDD-DEPENDENCY-GRAPH.md), [el estado/evidencias](DEPENDENCY-GRAPH-STATE.md) y [G7 operación y límites](G7-OBSERVABILITY.md). La fase siguiente es **G8 — Service mesh**, pendiente de otro «sigue» humano. Modelo recomendado por la preferencia acordada: **GPT-6 Sol / high**.

G7 instrumenta pantalla, HTTP, outbox, publicación, consumo y reintentos con OpenTelemetry; persiste contexto W3C fuera del contrato del evento y lo propaga con parents/enlaces explícitos. Collector Contrib 0.140.0 usa un backend de archivo local, imagen fijada por digest y puertos loopback estables al reiniciar. Los snapshots guardan un dataset con hash y exigen revisión/versión/entorno/code identity compatibles. La web muestra spans y abre código archivado. Sin tráfico/Collector/SDK, las dependencias y selección estática se conservan.

`pnpm dev:observability` inicia el perfil completo (Docker). `pnpm test:observability` ejecuta aceptación real y limpieza. [Spans reales](../impact/evidence/g7-observations.json) y [resumen](../impact/evidence/g7-trace-summary.json) están versionados; informes amplios y capturas están en `.impact-runs/` ignorado por Git. `OTEL_DATASET_PATH=impact/evidence/g7-observations.json pnpm dev` reproduce la inspección de esos spans; si cambió código, se muestran pendientes por revisión incompatible.

Validación: `pnpm validate` (178 Vitest y 3 Chromium correctos; 5 Vitest/1 Chromium omitidos en perfil básico); `pnpm test:messaging` (5 integraciones RabbitMQ y 4 Chromium correctos); `pnpm test:observability` (traza real 9 spans/4 servicios, retry, Collector parado/reiniciado, telemetría deshabilitada, navegación y 390 px). El registro de estado conserva la verificación final del runner federado.

Límites: spans manuales para este flujo, inventario medido desde el cliente HTTP (sin span interno del proveedor); versión de servicio 1/entorno local; telemetría no durable durante caídas, sin retención/rotación automática; no coverage/assertions medidas, ni reducción de selección por ausencia de tráfico; runner local de confianza sin sandbox. Se conserva el aviso previo de bundle Monaco. Sin G8/G9.
