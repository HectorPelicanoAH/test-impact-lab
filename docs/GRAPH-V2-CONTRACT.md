# Contrato de grafo v2 — G1 / implementación G2–G4

Estado: contrato diseñado en G1; generación implementada en G2, inspector en G3 y caso HTTP multirrepositorio acotado en G4. La generación normal publica archivos v2; v1 permanece como semilla revisada y proyección de compatibilidad de selección. Tipos implementados en [schema-v2.ts](../packages/impact-engine/src/schema-v2.ts). Eventos/broker, políticas distribuidas y observaciones siguen siendo reserva del contrato, **no capacidades implementadas en G4**. Este documento no autoriza G5.

## 1. Fronteras y representación

El adaptador produce hechos y diagnósticos, no listas de tests. El normalizador valida identidades, referencias y evidencia; el motor aplica políticas versionadas. La persistencia (JSON, base de grafos u otra) no define el contrato.

Un **archivo** es una unidad inventariada, aunque no tenga imports ni consumidores. Un **símbolo** es una declaración léxica concreta, no un texto coincidente. Una **entidad semántica** (pantalla, ruta, servicio, contrato o comportamiento revisado) necesita evidencia propia: un componente React no demuestra por sí solo que sea una pantalla. El archivo contiene al símbolo; la pantalla puede enlazarlo mediante `realizes`. Estas relaciones estructurales no heredan propagación automática.

Los anclajes actuales `AuthenticateUser.success` o `LoginForm.view` son `reviewed-anchor`, **no símbolos TypeScript ficticios**. La pertenencia al archivo no debe hacer que todos los tests de sus símbolos se seleccionen para cualquier cambio estrecho. Los cambios sin rango suficientemente demostrado amplían el ámbito.

## 2. Identidad

`NodeId = urn:impact:<product>:<repository>:<kind>:<key>`; cada segmento se codifica con percent-encoding RFC 3986 de UTF-8 (incluidos `%`, `:`, `/` y `#` dentro de segmentos). Los namespaces son identificadores configurados estables, nunca basename, ruta absoluta, URL inferida ni revisión. El validador rechaza registros duplicados, no los fusiona por etiqueta.

- Archivo: clave = ruta relativa POSIX desde la raíz autorizada. Case-sensitive; colisiones por mayúsculas en un filesystem insensible se rechazan. Sin rutas absolutas, `..`, NUL, enlaces que escapen de raíz ni segmentos vacíos.
- Símbolo: clave = ruta + `#` + nombre cualificado léxico y clase de declaración. Sobrecargas de la misma declaración comparten identidad y varias ubicaciones; nombres locales iguales en ámbitos distintos no. Lambdas/elementos anónimos sin clave estable permanecen como ubicaciones del contenedor o diagnósticos, sin inventar continuidad.
- Recurso: clave lógica explícita. Endpoints incluyen servicio, método y plantilla de ruta; eventos incluyen nombre y versión mayor de schema; canales/suscripciones incluyen broker lógico, entorno y nombre. Una URL o un nombre de cola aislados no identifican un recurso.
- Test: clave = identificador revisado del catálogo, separado por repositorio. Comando y disponibilidad viven en el catálogo fijado, no en una petición del navegador.
- La revisión vive en el snapshot. Una baja+alta es la representación de un renombrado sin identidad demostrable, aunque ambos contenidos tengan el mismo hash.

`EdgeId = sha256(canonical([type, from, to, qualifiers]))`. `qualifiers` incluye los atributos semánticos que distinguen relaciones (p. ej., `typeOnly`, entorno o schema). Varias ocurrencias/evidencias de la misma relación se acumulan sin duplicar el hecho lógico. Etiquetas, números de línea y orden de descubrimiento no determinan identidad.

## 3. Estructura serializable

Todos los campos siguientes son obligatorios salvo `?`. Un snapshot desconocido o incompleto no se consume como v2 válido.

| Registro | Campos |
| --- | --- |
| `GraphSnapshotV2` | `schemaVersion: 2`, `id`, `repositories[]`, `inputs`, `policies[]`, `nodes[]`, `edges[]`, `evidence[]`, `diagnostics[]`, `observations[]` |
| `RepositoryRevision` | `productId`, `repositoryId`, `revision` (Git commit o `content:<sha256>`), `sourceSetHash`, `availability: local / contract-only / inaccessible`, `roots[]`, `exclusions[]` |
| `NodeV2` | `id`, `kind`, `label`, `repositoryId`, `productId`, `locations[]`, `attributes`, `legacyId?` |
| `EdgeV2` | `id`, `from`, `to`, `type`, `qualifiers`, `evidenceIds[]`, `policyRef` |
| `EvidenceV2` | `id`, `kind`, `extractor: {id, version, configurationHash}`, `repository: {productId, repositoryId}`, `revision`, `locator`, `reason`, `resolution: resolved / unresolved / ambiguous / stale`, `supports: {type, from, to}?` |
| `DiagnosticV2` | `id`, `code`, `message`, `repository: {productId, repositoryId}`, `locator?`, `candidateIds[]`, `scope: {kind: node / repository / catalogue, ids[]}`, `selectionAction: expand-scope / full-available-catalogue`, `evidenceIds[]` |
| `ObservationV2` | `id`, `serviceId`, `serviceVersion`, `environment`, `window: {start, end}`, `traceRefs[]`, `datasetHash`, `correlation: {status, nodeIds[], edgeIds[], reason}` |
| `SnapshotDeltaV2` | `beforeSnapshotId`, `afterSnapshotId`, `nodes: {added[], removed[], changed[]}`, `edges: {added[], removed[], changed[]}`, `evidence: {added[], removed[], changed[]}`, `diagnostics: {added[], removed[], changed[]}` |

`NodeV2.kind`: `file`, `symbol`, `screen`, `route`, `service`, `endpoint`, `http-contract`, `event-schema`, `channel`, `subscription`, `consumer`, `broker-resource`, `test`, `reviewed-anchor`. Las ubicaciones de un recurso sin código pueden estar vacías; esto debe mostrarse, no rellenarse con enlaces inventados.

`EvidenceV2.kind`: `static`, `configuration`, `reviewed-declaration`, `measured-coverage`, `observation`. `locator` es una unión discriminada:

- `source`: ruta, hash del contenido, `start: {line, column}`, `end: {line, column}`, `symbolId?`. Líneas y columnas UTF-16 desde 1; rango semiabierto `[start, end)`, como posiciones del compilador. Sin deducir columnas a partir de v1.
- `declaration`: ruta del documento revisado, hash, JSON Pointer o identificador de entrada, más `relatedSource?` (solo ruta si no hay rango demostrado).
- `configuration`: ruta, hash, JSON Pointer o rango exacto.
- `trace`: dataset y referencias de trace/span; nunca convertir proximidad temporal en relación.
- `coverage`: artefacto, hash, test ID, revisión instrumentada y rango ejecutado. Afirma ejecución, **no assertions**. Una aserción requeriría una evidencia distinta que demuestre qué comprueba.

`DiagnosticV2.code` incluye `dynamic-reference`, `source-inaccessible`, `missing-contract`, `unsupported-extractor`, `parse-failed`, `stale-evidence`, `unresolved-symbol`, `ambiguous-dispatch`, `identity-collision` y `legacy-unverified`. Una sugerencia de destino es un candidato diagnóstico, nunca una arista autoritativa.

## 4. Direcciones y políticas

La dirección del hecho no equivale a dirección del impacto. Cada arista lleva `policyRef` a una política incluida en `inputs.policiesHash`. Tipos nuevos no reconocidos hacen ampliar selección, no se ignoran. Hasta G6, las relaciones distribuidas nuevas usan una política conservadora.

| Tipo | Dirección del hecho | Restricción de interpretación |
| --- | --- | --- |
| `imports` | archivo importador → archivo importado | Distinguir import de tipos, valor, reexport e import dinámico literal. No afirma llamada. |
| `calls` | símbolo llamador → declaración llamada | Alias resuelto por compilador; un método de interfaz no demuestra implementación concreta. |
| `renders` | contenedor JSX → componente | No equivale a pantalla/ruta ni a ejecución observada. |
| `routes` | ruta → handler/pantalla | Solo patrón soportado o declaración revisada. |
| `implements` | implementación → interfaz/contrato | No conecta automáticamente todos los implementadores. |
| `invokes-endpoint` | cliente → endpoint | Servicio/entorno/contrato identificados; no coincidencia de URLs. |
| `publishes` | productor → canal | Schema y broker calificados; no dependencia productor → todos los consumidores por regla genérica. |
| `subscribes` | suscripción → canal | Quitar suscripción exige consultar snapshot anterior. |
| `processes` | consumidor → suscripción | Procesamiento independiente de otros consumidores. |
| `exercises` | test → sujeto local | Declaración revisada o medición identificada; imports no bastan. |
| `contains` | archivo/ámbito → símbolo | Estructura; no regla general de propagación. |
| `realizes` | símbolo → entidad semántica | Correspondencia explícita, no equivalencia de identidades. |
| `injects` (compatibilidad) | consumidor → implementación elegida | Mantener evidencia de composición; no inferir binding por nombre/tipo. |
| `exposes` (compatibilidad) | contrato → proveedor | Preservar la política v1 del login, no invertir sin más. |

Una `calls` migrada entre anclajes revisados conserva su sentido histórico y se clasifica como revisada, nunca como prueba de llamada AST. La UI debe distinguir ambos orígenes.

## 5. Hashes, normalización y evolución

`inputs` incluye `sourcesHash`, `contractsHash`, `configurationHash`, `catalogueHash`, `extractorsHash`, `policiesHash` y `observationsHash` (`null` si no se usan). Cada hash es SHA-256 hexadecimal completo sobre un manifiesto canónico que incluye nombres de repositorios, rutas y hashes de bytes. Conjunto vacío = hash de manifiesto vacío, no campo omitido. `configurationHash` incluye raíces, exclusiones, opciones de compilación/resolución y bindings revisados; `extractorsHash` incluye versiones exactas y configuración. En archivos G4, `catalogueHash` cubre catálogo login y catálogo externo no ejecutable; los archivos G2/G3 usan su hash histórico del catálogo login y conservan su esquema sin reescritura.

`policies[]` contiene `{id, version, kind, configuration}`. `kind` es `legacy-login-v1` (configuración con los tres flags v1) o `conservative-full` (configuración con motivo obligatorio). Otros tipos requieren una versión soportada del motor antes de admitirse. `policyRef` resuelve al ID exacto; no se descarga código ni se ejecutan expresiones de configuración. Las futuras políticas distribuidas se especificarán en G6. `inputs.policiesHash` se calcula sobre este registro. Los demás manifiestos de entradas se archivan por hash junto al snapshot y se verifican al cargar; si no están accesibles, se diagnostica la carencia.

JSON canónico: claves de objetos ordenadas lexicográficamente por unidades UTF-16 (orden ECMAScript, sin locale), arrays que representan conjuntos ordenados por ID (sin duplicados), listas ordenadas semánticas preservadas; sin `undefined`, NaN, timestamps de ejecución, rutas del host ni duraciones. UTF-8 sin normalizar saltos de línea del código. `id` es SHA-256 del snapshot normalizado **sin el propio `id`**. La revisión del producto y los conjuntos de observaciones sí participan. Las métricas de evaluación van fuera.

`changed[]` contiene `{id, before, after}` para una identidad mantenida con atributos/evidencia cambiados. Cambiar solo una ubicación mantiene identidad de nodo/arista y cambia su contenido/evidencia. Eliminaciones retienen acceso al snapshot anterior. El análisis recibe ambos IDs, emplea dependencias antiguas y nuevas, y explica qué revisión sustenta cada salto. No mezclar objetos de revisiones distintas en un snapshot fingidamente único.

Publicación implementada en G2: extraer → validar referencias/evidencias/manifiestos → serializar temporal → renombrar atómicamente el archivo y después el puntero. Error de extracción/publicación deja intacto el último puntero válido y expone el fallo; nunca lo presenta como actualizado. La vigilancia realiza reconstrucción completa tras debounce y se compara con otra reconstrucción independiente; no es un índice incremental ni una transacción distribuida con garantía de durabilidad ante corte de energía.

## 6. Reglas de validación / incertidumbre

1. IDs únicos y referencias existentes; namespaces y revisiones consistentes.
2. Cada arista tiene al menos una evidencia `resolved` que sustenta exactamente sus endpoints/tipo. Evidencia ambigua, stale o sin procedencia no basta. Una relación revisada cuenta solo con declaración verificable.
3. Rango dentro del contenido y hash correcto. Si falta fuente, mostrar ausencia; no generar enlaces navegables falsos ni reutilizar líneas de otra revisión.
4. Parseo fallido no publica relaciones derivadas de recuperación del parser como resueltas.
5. Homónimos, callback indirecto e inyección sin binding producen diagnóstico en vez de un enlace por nombre.
6. Cada diagnóstico determina ampliación explícita: ámbito solo si hay prueba de que es seguro; en otro caso todo el catálogo **disponible**, avisando de tests externos desconocidos/no ejecutables. No demostrar compatibilidad solo porque no cambie un schema.
7. Una observación con servicio, revisión, entorno o ventana incompatibles queda sin correlacionar. Ausencia de tráfico nunca borra aristas estáticas.
8. Tests afectados y ejecución son ejes separados. `availability` no altera la afectación; inaccesible/no ejecutado nunca se convierte en `passed`.

## 7. Migración v1 → v2 (implementada en G2)

Migración determinista, preservando v1 en disco hasta superar pruebas de paridad. No reinterpretar las 69 etiquetas como 69 símbolos.

| v1 | Traducción v2 |
| --- | --- |
| `entity` registrado por archivo | Inventariar `file`; conservar entidad con `legacyId` como `reviewed-anchor`; enlazar a símbolo real solo si se demuestra. |
| Entidad con `symbol` explícito | Resolver declaración exacta; conservar mapa `legacyId → NodeId`. Si falla, anclaje revisado + diagnóstico, no elegir primer homónimo. |
| `changeable: false` / ramas semánticas | Anclaje revisado no elegible como origen directo; conservar selección estrecha y política. |
| `contract` / `POST /login` | `http-contract`, namespace del producto/repositorio y clave explícita `POST /login`; no inventar endpoint aún. |
| `test` | `test` con ID del catálogo; localizar título literal y rango en la revisión fijada, o diagnóstico. |
| `imports` estático | Reextraer ocurrencias y rangos exactos. Si no puede revalidarse, `legacy-unverified`, sin declararlo estático resuelto. |
| `architecture` | `reviewed-declaration` apuntando al JSON Pointer de la relación; conservar `reason` y fuente asociada. |
| `test-coverage` / `contract` de `exercises` | `reviewed-declaration` apuntando a `/tests/<índice>/exercises/<índice>`; **no `measured-coverage`**. |
| `runtime` sin traza identificable | `legacy-unverified`; no crear una observación medida. No hay casos de este tipo en la base auditada. |
| Tres flags de `policy` | Registro versionado `legacy-login-v1` con `reverseImpact`, `forwardBoundaryEvidence`, `contractExposure` por relación; no sustituir por regla universal de inversión. |

G2 prueba correspondencia de los 69 nodos/84 aristas de la semilla, preservación de sujetos/políticas y compatibilidad selected/full del login. [Pruebas de descubrimiento](../tests/dependency-graph/discovery.test.ts), [análisis](../tests/dependency-graph/analysis.test.ts) y [persistencia](../tests/dependency-graph/store.test.ts) comprueban evidencia obsoleta, colisiones, relaciones eliminadas y fuentes ausentes. Un sujeto desaparecido no conserva una relación revisada vigente; la proyección puede tener tests sin sujeto solo cuando una incertidumbre explícita obliga a selección completa.

## 8. Ámbito concreto de G2

- [Configuración](../impact/discovery.json): un repositorio, raíces explícitas backend/frontend/api-contract, exclusiones de tests, límites de archivos/bytes y alias de módulos. Se inventarían archivos UTF-8 desconectados; extensiones de texto sin extractor generan diagnóstico. Los archivos binarios y symlinks (incluidos ancestros) se rechazan, no se recodifican silenciosamente.
- [Adaptador](../scripts/graph/extract.ts): programa virtual sobre bytes fijados, sin leer node_modules ni bibliotecas estándar del host. Soporta imports/reexports/import-type/import-equals/imports dinámicos literales, alias de import, llamadas a declaraciones concretas, construcción, JSX y `implements` explícito. Declarar una clase no prueba dispatch runtime; interfaces, callbacks indirectos, globals/librerías externas y destinos dinámicos no resueltos producen diagnósticos. No se persigue análisis completo de flujos, reflexión, mutación de funciones, `extends` ni frameworks arbitrarios.
- Ruta soportada: `Route` (también alias de import) de los módulos configurados, `path` literal y `element={<Componente />}` directo resoluble. Un componente local llamado `Route` no se toma como router. No se detecta por nombre una pantalla; archivos/componentes sin ruta siguen siendo archivos/símbolos. Otros formatos no implican rutas autoritativas.
- [Archivo versionado](../scripts/graph/snapshot.ts): fuentes/tests, configuración, catálogo, semilla v1, todos los archivos de ejecución y manifiestos de extractor/ejecución; hashes y bytes se verifican al publicar/cargar. Revisión por contenido, no supuesto commit Git. Sin observaciones; `observationsHash: null`.
- `changed` compara el registro completo: un cambio de hash de archivo puede marcar como cambiadas varias ubicaciones/evidencias sin que cambie la topología. Altas/bajas de aristas se distinguen por identidad semántica; renombrado no se empareja por heurística.
- [Análisis](../scripts/graph/analyze.ts): une dependencias previas/posteriores solo en la proyección para selección; ambos v2 permanecen separados. Cambios de topología, altas/bajas, nuevos diagnósticos y ámbito no revisado seleccionan todo. Diagnósticos ya existentes pueden permanecer acotados por declaraciones del login si el cambio no altera topología ni introduce incertidumbre; no se afirma ausencia de dependencias externas.
- La UI G2 muestra CRUD, delta y diagnósticos. El inspector G3 se documenta a continuación. Catálogo, configuración y tests no se editan por la API. Historial de snapshots persiste; análisis y resultados de la sesión permanecen en memoria del servidor (máximo 32 análisis), y los informes de ejecución viven aparte. No hay retención automática de archivos históricos.

## 9. Inspector G3 y contrato de navegación

`GET /api/snapshots/:id/locators?evidence=<id>` o `?node=<id>&index=<entero>` busca exclusivamente identidades ya presentes en el snapshot SHA-256 solicitado. No admite ruta ni rango arbitrario. Responde `snapshotId`, `revision`, `path`, `sourceHash`, `content`, `kind`, `start`, `end` y, para declaración/configuración, `pointer` y `relatedSource?`. En un locator de fuente utiliza su rango original; en uno de configuración/declaración recorre el JSON Pointer del documento archivado y obtiene el rango exacto del valor JSON. No sustituye `relatedSource` por código sin rango. Los offsets son UTF-16, de base 1 y fin exclusivo. Fuente ausente, hash alterado, selector inválido o pointer no verificable producen error sin enlace. Esta ruta no reconstruye el checkout y por tanto conserva acceso a pruebas antiguas incluso tras fallar un refresh actual.

La UI lee este contrato del grafo v2 antes/después sin amalgamar revisiones. Dirección del hecho: consumidor → dependencia; la política de impacto se inspecciona separadamente. La vista «servicio» agrupa por raíces configuradas, **no** deduce servicios runtime. El lienzo representa un vecindario acotado para ser legible; filtros/índice consultan los nodos y aristas completos. Los estados añadida/retirada/cambiada remiten a sus snapshots correspondientes. Los tests revisados se muestran explícitamente como declaraciones, no cobertura medida. No hay soporte nuevo de recursos distribuidos ni observaciones en G3.

## 10. Implementación acotada G4: inventario HTTP externo

- [Plantilla autónoma](../examples/external-inventory/package.json) materializada fuera del checkout en un Git local limpio. [Carga](../scripts/graph/snapshot.ts) captura sus bytes y revisión de commit, independientes de la revisión `content:` del producto; un commit vacío cambia el ID del snapshot. La comprobación de actualidad considera bytes **y** revisión Git, sin fusionar archivos de repositorios diferentes.
- [Binding declarado](../impact/inventory-binding.json) y [extractor](../scripts/graph/inventory-http.ts) soportan exclusivamente entorno `local`, servicio `inventory`, `GET /v1/stock/:sku` y contrato v1. Requieren contrato coincidente y ocurrencias AST verificables del método y ruta en cliente y proveedor (incluido el guard y matcher de ruta del servidor); comentarios o URLs coincidentes no bastan. Las aristas `invokes-endpoint` (cliente→endpoint) y `exposes` (endpoint→proveedor) conservan evidencia con repositorio/revisión/rango reales. Una URL igual en otro entorno, método/ruta alterados o contrato divergente **no** producen dependencia autoritativa; emiten diagnóstico. No se infieren servicios arbitrarios desde URLs.
- Sin raíz externa hay repositorio `contract-only`, revisión `contract:<hash>` y endpoint calificado sin ubicación. No hay arista a código del proveedor ni falsa navegación. Si hay fuente externa, su catálogo de tests se publica como `not-integrated`; la suite login disponible sigue siendo la única ejecutada por selected/full. La federación de runners y reglas de impacto distribuidas son G6, no G4. Relaciones no soportadas y cambios de topología amplían conservadoramente a los 39 tests **disponibles**; no se atribuye éxito a tests externos desconocidos.
- [Contrato consumidor](../tests/contract/inventory.test.ts) y [tests HTTP/grafo](../tests/dependency-graph/http-inventory.test.ts) verifican método/calificadores, schema, source/revisión, incompatibilidad de contrato y delta de relaciones, modo contract-only y persistencia histórica. [Prueba de navegación Chromium](../scripts/verify-evidence-browser.ts) abre código externo archivado desde la UI. Los archivos anteriores G2/G3, sin repositorio ni catálogo externo, siguen validados con sus hashes originales.

## 11. Implementación acotada G5: RabbitMQ

- Raíces añadidas: mensajería compartida, notificaciones y preparación; alias de módulos workspace resueltos por TypeScript. La [topología JSON](../packages/messaging/src/topology.json) se archiva como fuente de producto editable con locators de configuración, no se sustituye por valores del entorno del proceso que inspecciona el snapshot.
- [Adaptador](../scripts/graph/messaging.ts), procedencia `rabbitmq-topology` v2: verifica declaraciones/calls concretas del publicador, transporte, servicio y handler; exige formas AST acotadas de construcción de topología, binding y selección de cola. No toma un helper homónimo como el import real. Comentarios y formato no definen una dependencia. No es análisis universal de flujo, reachability o mutación de objetos.
- Identidad de canal/suscripción: producto/repositorio + entorno + broker lógico + exchange + routing key + schema/version (y cola para suscripción). El prefijo runtime `BROKER_NAMESPACE` aísla ejecuciones de la misma topología; no es observado por el extractor ni cambia una identidad lógica por sí solo. Desplegar otra topología requiere versionar broker/entorno/configuración, no inferirla de una URL o socket.
- Relaciones: publicador → canal `publishes`; suscripción → canal `subscribes`; consumidor → suscripción `processes`; handler → consumidor `realizes`; canal → schema `implements`; broker → canal `contains` estructural. Cada relación conserva evidencia de código/configuración real. No se añade consumidor → consumidor por compartir broker o módulo de transporte. La cola fallida está inventariada, sin inventar una arista observada de entrega.
- Alta/baja de consumidor deja delta y fuentes históricas navegables. Binding/routing dinámico, helper homónimo, suscripción sustituida o handler retirado dejan diagnóstico y no relación autoritativa. Configuración/esquema incompatibles no se promueven. Los snapshots pre-G5 conservan sus bytes/hashes; no se reescriben para inventar hechos de mensajería.
- Políticas siguen `discovery-conservative-v1`; no se incorpora selección distribuida, federación ni cobertura medida. Los tests reales nuevos se ejecutan por sus suites explícitas, no se añaden de forma implícita al catálogo legacy de 39 tests. [Pruebas del extractor](../tests/dependency-graph/messaging.test.ts) y [navegación Chromium](../scripts/verify-evidence-browser.ts) verifican identidad, negativos, delta y salto a rango/JSON Pointer archivado.