# Estado — Generación portable de grafos y selección de tests

Fecha de actualización: **2026-10-19**.

SDD: [SDD.md](SDD.md).

## Alcance autorizado

El usuario pidió generar un SDD exhaustivo (P0) y después preparar en su rama una base independiente que pueda convertirse en otro repositorio (E0). La implementación completa P1–P8 queda pendiente.

El SDD es general: la selección del primer stack y repositorio se realiza después de inspeccionarlos. No se presupone frontend, backend ni su coexistencia.

## Fases

| Fase | Estado | Resultado / siguiente condición |
| --- | --- | --- |
| P0 — Especificación | Completada | SDD, este registro y enlace en README. |
| E0 — Extracción y empaquetado | Completada | Raíz autocontenida, exportador, CLI de inspección, visor, puente v2 y skill inicial validados. |
| P1 — Inspección y necesidades | Pendiente | Designar un repositorio accesible e iniciar el alcance de inspección. |
| P2 — Contrato y corpus | Pendiente | Esquemas, validadores, identidad y conformidad. |
| P3 — Grafo y catálogo | Pendiente | Primer adaptador elegido con la evidencia de P1. |
| P4 — Instrumentación | Pendiente | Atribución de coverage, baseline y OTel según necesidades. |
| P5 — Impacto | Pendiente | Exclusión, vigencia, incrementalidad y selected/full. |
| P6 — CLI y CI | Pendiente | Operación reproducible y primer wrapper validado. |
| P7 — UI común | Pendiente | Consulta portable, filtros y mediciones de escala. |
| P8 — Skill y auditoría | Pendiente | Segunda incorporación y evidencia final de adopción. |

## Decisiones fijadas

- Priorizar determinismo, evidencia verificable y herramientas del ecosistema.
- Cobertura por test o grupo demostrable como evidencia de ejecución de código.
- OpenTelemetry para contexto, correlación y observaciones; no sustituye coverage.
- Enlaces E2E→código de producto únicamente mediante instrumentación atribuible.
- Otros tipos de test pueden tener dependencias estáticas, conservando la distinción frente a coverage.
- Sin asociaciones manuales de QA como fundamento para excluir regresión.
- Unidades agrupadas si la captura individual mezcla contadores o resulta inviable.
- Baseline inicial costoso y check posterior sin ejecutar tests.
- Evidencia histórica positiva más análisis anterior/posterior y ampliación ante incertidumbre.
- Herencia de evidencia solo con compatibilidad demostrada, no solo con ausencia de hits.
- Contratos como límites explícitos, sin confundir schema igual con compatibilidad semántica.
- Artefactos comunes para CLI, CI y UI; el motor no consulta un LLM.
- Niveles de razonamiento recomendados por tarea/fase, sin modelos concretos.

## Trabajo de P0

- Revisados los SDD y contratos actuales, el análisis base/destino y los límites de G7.
- Consultadas fuentes oficiales de OTel/W3C, cobertura, JSON Schema, JCS y source maps.
- Documentados requisitos R01–R18, artefactos, captura, vigencia, algoritmo, experiencia de CLI, CI, UI, skill y operación.
- Definidas fases P0–P8, aceptación, matriz de trazabilidad y decisiones pendientes.
- Creado un enlace de descubrimiento en README.

## Validación de esta entrega

La entrega original P0 fue documental. E0 añade CLI de inspección y consulta, normalización/validación del formato visual, importación v2 y skill inicial. No implementa selección, baseline instrumentado ni integración CI.

Revisión de cierre:

- Formato del diff y whitespace comprobados, incluidos los documentos nuevos.
- Enlaces locales y anchors del índice resueltos; bloques de código cerrados.
- Requisitos R01–R18 y fases P0–P8 presentes y trazados.
- Recomendaciones expresadas por nivel de razonamiento, sin modelos concretos.
- Revisadas las condiciones de reutilización, ausencia de hits, atribución concurrente, contratos y fallback de CI.

## Entrega E0

- Raíz independiente con paquete Node, binario CLI y cero dependencias de runtime externas.
- CLI disponible: `inspect`, `validate`, `import-v2`, `view` e `info`.
- Visor de lectura con búsqueda global, filtros, paginación de nodos/enlaces/diagnósticos e inspector de evidencia.
- Puente v2 que conserva declaraciones revisadas y no certifica el dataset como baseline.
- Skill autocontenida con referencia y plantilla de SDD de incorporación.
- Exportador que prepara un directorio vacío sin historial Git, servicios ni datos de la demo.
- SDD/estado trasladados a esta raíz; las ubicaciones anteriores del laboratorio conservan enlaces de continuación.
- README con uso disponible, instalación local, exportación y flujo futuro.

### Verificación E0

Validado con Node.js 24.18.0:

- `node --test` desde la raíz del paquete: **7/7 correctas**, sin skips. Incluye ejecutar la CLI desde una copia exportada y rechazar comandos todavía no disponibles.
- Exportación a una raíz temporal e instalación offline en otro proyecto consumidor: correctas; el binario instalado ejecuta `info` e `inspect`.
- Validador oficial de skill-creator: **Skill is valid!** PyYAML se instaló únicamente en un directorio temporal eliminado al terminar.
- Chromium contra un archivo real v2 del laboratorio: **382 nodos, 545 relaciones y 452 diagnósticos**. Búsqueda, evidencia, filtros, paginación y viewport de 390 px correctos, sin errores de página.
- Capturas de escritorio/móvil conservadas en `.impact-runs/portable-browser/` del laboratorio de validación; son evidencia local y no se exportan con la herramienta.
- Enlaces locales de documentación contenidos dentro de la raíz exportable, sintaxis JS y formato del diff revisados.

El ensayo de navegador se reproduce en el laboratorio mediante `node scripts/verify-portable-browser.mjs --snapshot <archivo-v2>`. Usa Playwright del laboratorio; no añade esa dependencia al toolkit.

Incidencias resueltas: el sandbox inicial impedía abrir el puerto local de la prueba HTTP; la comprobación se ejecutó con ese permiso. El primer ensayo móvil detectó desbordamiento por contenido largo; se corrigieron contenedores/fuentes y se paginaron diagnósticos antes del cierre.

### Límites vigentes

`test-impact-view/1` es un contrato experimental de consulta. P2 sigue pendiente para los bundles completos. No hay baseline instrumentado, selector, runner de selección ni wrapper CI operativo. Los candidatos de inspección no son un catálogo autoritativo. Los comandos futuros fallan explícitamente.

## Continuación

Leer primero el SDD y este estado. Tras cerrar E0, el siguiente trabajo es P1: auditar reutilización e inspeccionar el repositorio que designe el usuario, produciendo capacidades, necesidades y SDD de incorporación.

Si no hay repositorio piloto accesible, se puede avanzar en auditoría interna autorizada, conservando pendiente la inspección real. No se inventarán resultados ni se dará P1 por completada.
