# Preparar y presentar el grafo progresivo

Rama: `feat/scoped-impact-v1-quick-changes`. Recorrido principal de 15–20 minutos. La validación y sus límites están en [LIVE-GRAPH-HANDOFF.md](LIVE-GRAPH-HANDOFF.md).

## Preparación en una hora

1. **15 minutos:** leer este guion y las tablas de tecnologías/escenarios de [SDD-GRAFO-PROGRESIVO.md](SDD-GRAFO-PROGRESIVO.md).
2. **30 minutos:** lanzar `pnpm dev`, abrir `http://127.0.0.1:5175` y recorrer consumidor nuevo y contrato HTTP. `pnpm dev` prepara una revisión independiente de Inventory automáticamente. Mantener esa terminal abierta.
3. **15 minutos:** ensayar los clics y las explicaciones siguientes. Para una repetición limpia, usar Reiniciar grafo; conserva el overlay del editor. Restaurar código elimina ese overlay. Ninguna de esas acciones modifica el checkout.

Si los puertos están ocupados, usar `DEMO_PORT`/`DEMO_API_PORT` según el README. Una API lanzada por separado sin `INVENTORY_ROOT` muestra Inventory como contract-only: es válida para extracción, pero no permite enseñar sus fuentes ni ejecutar el test del proveedor. Para esta demo usar `pnpm dev`.

## Guion de 15–20 minutos

| Minutos | Mostrar | Explicación breve |
| --- | --- | --- |
| 0–2 | Grafos vacío. Ejecutar siguiente paso. | «El editor carga fuentes, pero no calcula este grafo al abrir. Cada clic ejecuta una fase nueva; consultar el paso anterior solo revisa su resultado guardado». |
| 2–6 | Símbolos → imports → comportamiento. Pulsar LoginPage, un enlace y Abrir evidencia. | «TypeScript Compiler API lee el AST y resuelve declaraciones, imports, llamadas y JSX. Cada flecha conserva el código que la demuestra. React Flow solo la dibuja y Monaco muestra la fuente». |
| 6–8 | Arquitectura/tests → proveedor → HTTP → eventos → observaciones → validar. Encuadrar HTTP/Eventos. | «Adaptadores propios comprueban contratos y registros explícitos. Los anclajes revisados indican intención de test, no coverage. OpenTelemetry añade capturas cuando están disponibles; este paso no genera tráfico». |
| 8–12 | Código → New consumer → Aplicar cambio → Analizar impacto. Avanzar hasta Conectar eventos y consumidores, Ver novedades. | «El diff añade AuditConsumer y una cola independiente. Reconstruimos sobre una copia aislada; el handler y los enlaces aparecen cuando su extractor los comprueba. Añadir un consumidor no crea automáticamente cobertura de tests». |
| 12–14 | Terminar el impacto → Tests → detalle de suite. | «El motor compara base y posterior, propaga impacto y selecciona. Cuando no puede justificar un alcance pequeño, amplía la selección y explica el motivo. Seleccionar aún no ejecuta nada». |
| 14–18 | Código → External HTTP contract → aplicar → impacto → Conectar HTTP / delta. Encuadrar HTTP. Ejecutar seleccionados en Tests. | «El cliente pide contrato v2 y el proveedor/parser conserva v1. La conexión deja de ser demostrable: se muestra retirada con su evidencia original. El runner ejecuta los bytes del overlay y las assertions detectan la incompatibilidad». |
| 18–20 | Resultado del test inventory-contract y su fuente; preguntas. | «Aquí están el resultado, la duración y la salida del runner. Los tests que requieren RabbitMQ aparecen no disponibles cuando ese perfil no está arrancado; no se cuentan como aprobados». |

En la validación local, el runner del caso HTTP tardó 103 segundos. Aprovecha la espera para abrir la suite y explicar sus assertions; reserva unos dos minutos para la ejecución. [Capturas reales de las tres vistas](screenshots/live-graph-v1/README.md).

Durante los pasos, el loader y el tiempo transcurrido representan trabajo real. No hay esperas artificiales ni porcentajes inventados. Entre fases puedes inspeccionar el grafo y elegir el siguiente momento para avanzar. El minimapa, el zoom y Encuadrar cambian la vista, no los hechos del motor.

## Respuestas rápidas para backend

- **¿Usamos CodeGraphContext?** Se evaluó; la fuente autoritativa actual es TypeScript Compiler API. La decisión está en [ADR-G1-INDEXER.md](ADR-G1-INDEXER.md).
- **¿Es incremental?** El análisis reconstruye el índice sobre el overlay. Se ejecuta por fases; no promete actualizar solo un subconjunto de archivos.
- **¿HTTP y AMQP se deducen por nombres de carpetas?** No: los adaptadores comprueban código y contratos/bindings/topología JSON. La organización visual no crea dependencias.
- **¿Las trazas prueban cobertura?** No. Correlacionan tráfico observado con revisión y ventana. Sin dataset se informa Sin trazas; un snapshot previo no se atribuye al overlay.
- **¿RabbitMQ se consulta durante el descubrimiento?** No. Su topología se extrae de configuración. La ejecución con broker requiere `pnpm dev:events`; el recorrido básico usa Inventory y suites disponibles sin broker.
- **¿Qué seleccionan New screen e Incompatible event?** La pantalla conectada selecciona el E2E E1 del Login; no hay tests propios registrados para el componente nuevo. El evento incompatible selecciona cinco suites de contrato/consumidores y ninguna del Login. Se recorren las relaciones anteriores cuando el binding se retira. Archivos aislados, eliminaciones, parseos fallidos o destinos dinámicos sin resolver conservan la selección completa. La UI muestra el motivo real.

## Quick changes de v1

En Código se muestran los cuatro botones originales, con sus descripciones: Change LoginButton, Change login normalization, Change User.authenticate() y Change POST /login contract. Cada uno abre su diff sobre el overlay y permite analizarlo por fases. La variante anterior se conserva en `feat/live-graph-v1` y PR #5; esta rama incorpora selección acotada.

## Ejecución rápida y orden de Tests

En Grafos, Generar grafo completo termina las fases pendientes del descubrimiento. Con un overlay, Analizar impacto completo termina el análisis; si todavía falta el grafo base, lo construye primero. Se usan las mismas fases reales y se conserva progreso, loader y Cancelar. Ejecutar siguiente paso sigue disponible para el recorrido explicativo.

Al finalizar el impacto rápido se abre Tests: Selected tests (solo entradas seleccionadas, incluidas suites seleccionadas), Physical execution, visor de código, catálogo de suites distribuidas y All tests. Sin análisis vigente aparece “Waiting for code change to calculate regression.”; una selección calculada vacía se identifica como tal. La ejecución rápida calcula la selección; el runner físico se lanza desde Physical execution.
