# Handoff del proyecto — estado hasta G5

Fecha: 2026-10-05  
Workspace de esta sesión: `/Users/hectorpelicanogomez/Documents/GitHub/test-impact-lab`

## Estado de fases y autorización

- **G1–G5 completadas.** La última autorización humana fue «siguiente» para **G5 exclusivamente**.
- **G6 no está autorizada ni iniciada.** No comenzar su implementación hasta recibir una nueva instrucción humana.
- El protocolo del proyecto autoriza una sola fase por cada continuación. No cambiar de modelo automáticamente, no crear agentes adicionales, no hacer commit/push ni desplegar remotamente como consecuencia implícita de una autorización de fase.
- Modelo recomendado para la siguiente fase: **GPT-6 Astra / xhigh**. La selección la hace el usuario.
- Cambios de G1–G5 permanecen en el árbol local, **sin commit ni push**. Revisar el estado de Git en la máquina de continuación antes de editar.

## Lectura inicial obligatoria

Antes de continuar, leer:

1. [Estado, resultados y autorizaciones por fase](DEPENDENCY-GRAPH-STATE.md)
2. [SDD y reglas de autorización](SDD-DEPENDENCY-GRAPH.md)
3. [Operación, pruebas y límites de G5](G5-MESSAGING.md)
4. [Contrato del grafo v2](GRAPH-V2-CONTRACT.md)
5. [Arquitectura actual](ARCHITECTURE.md)

Cada «sigue» autoriza solo la fase siguiente pendiente. Para iniciar G6, seleccionar GPT-6 Astra / xhigh y escribir «sigue».

## Entregas realizadas

- **G1 — Contrato, corpus e indexador:** se definió el esquema del grafo v2, la evidencia y los diagnósticos; se evaluaron TypeScript y CodeGraphContext sobre un corpus reproducible. Se eligió un adaptador TypeScript con relaciones revisadas donde el análisis estático no basta.
- **G2 — Descubrimiento y snapshots:** inventario de fuentes según raíces explícitas, extractor TypeScript, archivos versionados e inmutables, diferencias entre snapshots, watcher con rebuild completo y mutaciones seguras sobre overlays. La semilla de login v1 sigue congelada para compatibilidad.
- **G3 — Inspector de evidencia:** navegación desde nodos/aristas a código y configuración de la revisión correcta; cambios BEFORE/AFTER, diagnósticos, filtros, navegación por teclado y recorrido Chromium.
- **G4 — Pedidos e inventario HTTP externo:** pantalla y API de pedidos, proveedor de inventario en proceso/repositorio Git independiente y contrato HTTP v1. Las relaciones se emiten solo con configuración y código verificables; las URLs coincidentes no bastan.
- **G5 — Eventos y consumidores:** broker RabbitMQ real, evento `OrderCreated v1`, outbox y efectos persistidos en SQLite, consumidores independientes de notificaciones y preparación, deduplicación, tres intentos de procesamiento y una cola fallida por consumidor. El estado de los consumidores se consulta por HTTP. El extractor G5 agrega hechos de publicación, suscripción y procesamiento con evidencia de código/configuración.

## Resultados de validación G5

### Regresión normal, sin broker explícito

`pnpm validate` finalizó correctamente:

- **160 tests aprobados y 5 omitidos**, en 32 archivos aprobados y 1 omitido.
- **3 pruebas Chromium aprobadas y 1 omitida**.
- Las omisiones corresponden explícitamente a la integración RabbitMQ y al recorrido que exige ese perfil; no se contabilizan como aprobadas sin broker.
- La semilla v1 sigue siendo **69 nodos / 84 aristas / 39 tests**.
- El snapshot v2 final en modo contract-only fue `1ddb7b5db89934db48fdb97a0008898a8e5aaf9b013f9a392b2162937ae9b38e` (**334 nodos / 450 aristas / 354 diagnósticos**). Los diagnósticos expresan límites de extracción/fuentes; no son fallos de tests ni cobertura medida.

### Broker real y builds compilados

Después de compilar, `node scripts/verify-messaging.mjs --compiled` pasó:

- **5/5** tests de integración con las fuentes TypeScript.
- **5/5** tests de integración repetidos contra los bundles compilados.
- **4/4** recorridos Chromium con el perfil real.

Los ensayos comprobaron ambos consumidores, redelivery sin duplicar efectos, fallo temporal, fallo permanente de notificaciones que alcanza su cola fallida al tercer intento mientras preparación termina, evento incompatible sin efectos y recuperación del outbox tras detener/reiniciar la aplicación RabbitMQ del contenedor propio.

También pasaron `pnpm test:evidence-browser`, `pnpm test:discovery-browser`, `pnpm test:execution` y `pnpm test:discovery-execution`. Selected obtuvo **10 aprobados / 3 fallos intencionales**; full, **36 aprobados / los mismos 3 fallos**. El overlay CRUD aprobó 39 tests reales. Se verificaron `pnpm graph:legacy:check`, `pnpm graph:check:v2`, `git diff --check`, links locales de documentación y lectura de snapshots históricos G2/G3/G4.

La prueba de `pnpm dev:events` usó siete puertos libres, procesó un pedido y verificó ambos efectos; SIGTERM retiró únicamente el broker, directorio temporal y puertos propios de ese ensayo.

## Versiones y perfil local

- Entorno original: macOS arm64, Node **24.18.0**, pnpm **11.19.0**, TypeScript **5.9.3**, Vitest **5.0.3**.
- RabbitMQ real: **4.2.0**, imagen fijada por digest en [G5-MESSAGING.md](G5-MESSAGING.md). Cliente `amqplib` **2.2.0**.
- `pnpm dev:events` inicia un perfil de desarrollo independiente con broker RabbitMQ, inventario, backend, frontend, demo, notificaciones y preparación. Puertos por defecto: backend 3001, demo API 3002, inventario 3003, notificaciones 3004, preparación 3005, frontend 5173, demo 5175. Se pueden configurar con las variables documentadas en el README y la guía G5.
- El perfil es **desechable por defecto**: elimina contenedor/volumen propios y datos temporales al cerrar. Mantener solo SQLite no recupera los mensajes ya publicados si se borra el volumen RabbitMQ. Las raíces `DATA_DIR` o `INVENTORY_ROOT` que aporte el usuario se conservan.
- Se inició Docker Desktop en la máquina original; quedó en marcha y la imagen en caché. Los contenedores y volúmenes propios de los ensayos se retiraron. No se hizo `prune` ni se detuvieron servicios ajenos.
- Las pruebas usan puertos efímeros y no deben detener/reutilizar servicios que ya estén corriendo en la nueva máquina.

## Seguridad y límites pendientes

- El análisis de `amqplib@2.2.0` no encontró CVE conocidas; resultado guardado en [g5-cve.json](../impact/evidence/g5-cve.json). Esto no equivale a auditar todo el proyecto ni la imagen del broker.
- `pnpm audit --prod` sí encontró **un aviso bajo preexistente**: DOMPurify 3.4.15, GHSA-p98j-92pf-mc4p, con corrección indicada desde 3.4.16. La misma versión estaba en HEAD antes de G5. No se remedió en G5; no declarar limpia la auditoría general.
- El primer arranque de RabbitMQ falló y sus logs no se conservaron; la causa no se pudo demostrar. Luego se cambió readiness a handshake AMQP ligero y se limitaron schedulers Erlang, y las validaciones reales pasaron. No atribuir retrospectivamente el primer fallo a OOM.
- `pnpm validate` mostró el aviso conocido de tamaño de bundle Monaco. El editor también reporta un aviso `baseUrl` deprecado en un fixture de G1; el typecheck del proyecto pasa.
- SQLite usa `node:sqlite`, API experimental en Node 24. El sistema ofrece entrega al menos una vez, no exactamente una vez; no hay HA, backoff/TTL de reintentos, reserva distribuida de inventario, correo real ni retención garantizada.
- El extractor de mensajería es deliberadamente acotado a las formas de código/configuración del ejemplo. No es telemetría ni análisis universal de tráfico. No infiere aristas entre consumidores solo porque compartan broker.
- La política del grafo sigue siendo conservadora. El runner de selected/full cubre solo los **39 tests del catálogo login**: las suites de G5 y los tests del repositorio externo no están federados ni se seleccionan mediante esas reglas. La federación y políticas distribuidas corresponden a G6.
- El runner local ejecuta código de confianza y no es un sandbox del sistema operativo.

## Primeros pasos en otra máquina

1. Clonar/trasladar el repositorio y revisar `git status --short`; el handoff no incluye commits.
2. Confirmar que Node 24.15+ (24.x) o 26+ y pnpm 11.19.0 estén disponibles. El contexto terminal original registra que `pnpm install --frozen-lockfile` terminó con código 127; verificar primero que `pnpm` esté en PATH en el nuevo equipo.
3. Instalar dependencias según el lockfile y ejecutar `pnpm validate` para validar el entorno base.
4. Si se necesita repetir G5, iniciar Docker y ejecutar `node scripts/verify-messaging.mjs --compiled` después del build. Este ensayo administra sus propios recursos y los limpia.
5. Leer los documentos iniciales indicados arriba. No iniciar G6 hasta una nueva autorización humana.
