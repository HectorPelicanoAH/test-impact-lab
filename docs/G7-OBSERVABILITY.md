# G7 — Trazas y correlación

Autorización: 2026-10-06, revisar G1–G6 y continuar exclusivamente con G7. Checkout inicial limpio, HEAD `5a16090` (G6). Sin agentes adicionales, cambios automáticos de modelo, commit/push ni servicios externos.

## Operación local

Node 24.15+ y pnpm 11.19.0, Docker en ejecución y Chromium instalado. El perfil básico sigue siendo `pnpm dev`; el perfil con eventos, `pnpm dev:events`. Observabilidad es opcional:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev:observability
```

El lanzador crea su propio RabbitMQ y Collector, fija una revisión de contenido y arranca los servicios habituales. Collector publica OTLP/HTTP y health exclusivamente en loopback, con puertos libres fijados durante toda la sesión. Su backend local es el exporter `file` (JSONL), conservado en `.impact-data/observability/<uuid>/traces.jsonl`; no necesita Grafana/Jaeger ni cuenta remota. SIGINT/SIGTERM detiene servicios y elimina solo los contenedores propios. El perfil de eventos limpia sus datos temporales; las trazas y logs de Collector permanecen para revisión.

Abrir la pantalla `/orders` del frontend, crear un pedido y esperar ambos efectos. Recargar el explorador y abrir **IMPACT GRAPH → Observed traces**. Elegir una traza, desplegar sus spans y usar **INSPECT ARCHIVED CODE** para abrir el símbolo/rango del snapshot. La vista muestra servicio, versión, entorno, revisión, tiempos medidos, estado de error, ID de mensaje, intento, parent y enlaces explícitos. Cada recarga fija el conjunto observado en un nuevo snapshot; una captura abierta no cambia bajo el usuario. Si llegan spans mientras se edita, la API puede rechazar el análisis por snapshot antiguo: recargar antes de editar.

Para conservar/importar un conjunto fijo, detener primero la escritura del Collector o copiar sus líneas completas:

```sh
pnpm observations:import /ruta/traces.jsonl /ruta/nuevo-dataset.json
OTEL_DATASET_PATH=/ruta/nuevo-dataset.json pnpm graph:discover
OTEL_DATASET_PATH=/ruta/nuevo-dataset.json pnpm dev
```

El importador no sobrescribe destinos. El dataset normalizado contiene spans únicos y tiene un SHA-256 independiente. `OTEL_COLLECTOR_PATH` lee líneas completas del backend local; tiene prioridad sobre `OTEL_DATASET_PATH`. Sin ambas variables no se cargan observaciones. Para inspeccionar el ejemplo real archivado:

```sh
OTEL_DATASET_PATH=impact/evidence/g7-observations.json pnpm dev
```

No editar fuentes del producto antes de inspeccionarlo: si cambia la revisión, sus spans quedan pendientes de correlación. Que estén pendientes conserva la evidencia original y permite ver por qué ya no coincide.

## Instrumentación y límites

- OpenTelemetry API **1.9.0**, SDK/context/resources/core **2.2.0**, exporter OTLP/HTTP **0.208.0**, todos fijados por paquete y lockfile. Collector Contrib **0.140.0**, imagen fijada por digest en [el lanzador](../scripts/observability/collector.mjs). El script opcional de `protobufjs` queda explícitamente deshabilitado; la exportación real pasa.
- Spans manuales en la pantalla, servidor HTTP de pedidos, cliente HTTP de inventario, guardado en outbox, publicación confirmada, consumo, reintento y cola fallida. Inventario sigue siendo autónomo: el span `http.inventory` mide el cliente; no se atribuye un span de servidor ni una traza interna al proveedor externo.
- El navegador transporta contexto explícito entre `await`; Node usa AsyncLocalStorage. W3C `traceparent`/`tracestate` se propaga por HTTP y cabeceras AMQP. El outbox guarda el carrier separado del contrato de negocio, dentro de la misma transacción que pedido/evento; una migración compatible añade esa columna a SQLite previa. El test comprueba persistencia y continuidad de contexto tras reabrir la base.
- La publicación conserva el parent del guardado y un enlace explícito a este; ambos consumidores parten del span de publicación. El reintento tiene span de productor propio y el siguiente intento enlaza además la publicación original. No se construyen relaciones por cercanía temporal. Se registra un span por mensaje; no se infieren lotes por timestamps.
- El adaptador exige producto/repositorio, revisión de contenido exacta, entorno `impact.local`, versión de servicio `1`, path y símbolo únicos. Para enlazar una dependencia de publicación exige identidad lógica completa de broker, entorno, exchange, routing key, schema y versión; para consumo exige registro estático verificable de handler/consumidor. Fuentes ausentes/ambiguas o versiones incompatibles quedan pendientes sin enlaces inventados.
- Las observaciones se guardan aparte de aristas estáticas. Un intento adicional no crea otra arista. El motor conserva sus políticas estáticas y no interpreta observaciones como coverage/assertions ni restringe selección por ausencia de tráfico. El dataset y sus correlaciones se vuelven a verificar al leer el archivo histórico; modificar spans cambia el hash del snapshot.
- Exportación asíncrona, cola limitada y timeout corto: pueden perderse spans durante una caída prolongada. No se promete entrega durable de telemetría. El pedido, outbox y consumidores siguen funcionando con Collector parado o SDK deshabilitado. Configuración de endpoint debe ser HTTP local; una configuración inválida falla explícitamente al iniciar.
- Backend local sin UI externa, rotación ni retención automática. Límite del adaptador: 20 000 spans por dataset. Lectura JSONL solo de líneas completas; exportaciones malformadas o identidades conflictivas se rechazan. El perfil requiere reinicio tras cambiar código del producto para registrar la revisión nueva.

## Evidencia y reproducción

```sh
pnpm test:observability
pnpm validate
pnpm test:messaging
```

[El verificador](../scripts/verify-observability.ts) abre Chromium, crea un pedido contra procesos reales, verifica ambos efectos y captura una traza propagada de **9 spans / 4 servicios**. Notificaciones falla una vez y termina en el segundo intento; preparación termina en el primero. Verifica parents/enlace de retry, errores, navegación a código archivado, escritorio/390 px sin overflow, snapshot reproducible, versión incompatible pendiente, selección equivalente con/sin datos, Collector parado/reiniciado y productor reiniciado con SDK deshabilitado. Las esperas comprueban condiciones con timeout; los recursos propios se cierran en `finally`.

Ejecución aceptada: `.impact-runs/g7-d3ac7ffd-75e0-4ee1-b472-fcdcf821c994/` (logs, SQLite, JSONL, dataset, snapshot y capturas; ignorado por Git). Se conserva un resumen portable en [g7-trace-summary.json](../impact/evidence/g7-trace-summary.json) y los spans reales en [g7-observations.json](../impact/evidence/g7-observations.json). El resumen identifica el snapshot medido de esa ejecución; añadir artefactos/evidencias al checkout puede cambiar snapshots posteriores sin cambiar la revisión de código observada.

Incidencias corregidas: el verificador necesitaba abrir la pestaña del grafo; Docker reasignaba puertos dinámicos al hacer stop/start del Collector (comprobado con puertos antes/después), por lo que ahora se fijan al crearlo; el fixture externo heredaba firma GPG del usuario, deshabilitada solo en su propio repositorio generado. Las primeras ejecuciones fallidas no se presentan como aceptación.

Fuentes oficiales consultadas para la implementación: [propagación de OpenTelemetry](https://opentelemetry.io/docs/languages/js/propagation/), [exportación JS](https://opentelemetry.io/docs/languages/js/exporters/), [SDK 2.2.0](https://github.com/open-telemetry/opentelemetry-js/releases/tag/v2.2.0) y [file exporter del Collector](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/v0.140.0/exporter/fileexporter).

Detenerse antes de G8. Modelo recomendado según preferencia acordada: **GPT-6 Sol / high**.
