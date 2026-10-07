# SDD — Descubrimiento explicado y demo guiada

Fecha: 2026-10-07. Demo objetivo: 2026-10-08, 15–20 minutos. Estado: implementación completada en `feat/demo-guided-discovery`; validación funcional registrada en [DEMO-GUIDED-VALIDATION.md](DEMO-GUIDED-VALIDATION.md).

Amplía la rama `docs/dependency-graph-sdd` (`93089f1`, G1–G9 completadas). Mantiene sus extractores, evidencias, snapshots, políticas y runners. La nueva rama parte de esa versión con journeys y conserva este documento y el [guion](DEMO-BACKEND.md).

## 1. Objetivo y alcance para mañana

El presentador borra el mapeo activo, reconstruye el grafo desde sus fuentes y explica cómo aparece cada tipo de relación. Después aplica un journey, calcula el impacto y muestra por qué se seleccionan tests. La consola de la web y el mapa avanzan sobre la misma fase y permiten abrir una evidencia concreta.

La preparación debe caber en una hora: 15 minutos de lectura del guion, 30 de práctica y 15 de ensayo. Presupone el entorno instalado. Los dos cambios principales para backend son **New consumer** y **External HTTP contract**.

La entrega incluye borrado y reconstrucción reales, registro de fases, consola explicativa, revisión paso a paso sincronizada con el mapa y ejecución desde el resultado. La pantalla debe responder: «¿Qué se descubre?», «¿Con qué técnica?», «¿Qué demuestra esta relación?» y «¿Cómo influye el cambio en los tests?».

Se reutiliza el inspector técnico como detalle avanzado. No se amplían patrones de extracción, políticas de selección ni cobertura. La demo principal usa `pnpm dev`, con el proveedor de inventario y sin levantar RabbitMQ, Collector ni Kubernetes. Los bindings de eventos se descubren mediante el código y la configuración; añadir un consumidor al overlay no despliega un servicio.

## 2. Experiencia propuesta

La vista del journey tiene tres zonas: barra con los pasos y la acción siguiente; mapa con inspector contextual; consola debajo. El detalle técnico empieza cerrado. El código y los tests siguen accesibles.

Pasos: **Construir mapeo → Aplicar cambio → Calcular impacto → Revisar y ejecutar**.

| Acción | Comportamiento |
| --- | --- |
| Borrar mapeo | Elimina la asociación de la sesión con el mapeo activo y sus análisis ejecutables. Muestra «Sin mapeo». Conserva código, configuración y cambios del overlay. |
| Generar mapeo | Ejecuta la extracción completa de las fuentes base fijadas, aunque sus huellas no hayan cambiado. Publica al completar la validación. |
| Reconstruir desde cero | Repite la generación e invalida el impacto anterior; conserva los cambios del usuario. |
| Aplicar cambio | Aplica la transformación existente del journey y abre su diff. Conserva el mapeo base para comparar. |
| Calcular test impact | Analiza el cambio real, reconstruye el grafo posterior y explica la selección. Requiere mapeo base válido y cambios aplicados. |
| Revisar paso a paso | Recorre fases registradas con Anterior/Siguiente; muestra los hechos disponibles hasta la fase elegida. |
| Ver resultado | Lleva al final del registro y al mapa completo del recorrido. |

El estado del motor —en curso, terminado o fallido— se distingue del paso que está revisando el presentador. Revisar el registro no ejecuta otra extracción ni recalcula impacto. No se añaden esperas artificiales para simular actividad: el proceso real puede terminar rápidamente y revisarse después.

## 3. Descubrir el grafo paso a paso

Cada fase muestra una frase breve, técnica, resultado real y un ejemplo de evidencia cuando exista. Los recuentos proceden de la operación. La consola principal resume diagnósticos y permite abrirlos sin volcar cientos de registros.

| Fase | Técnica y explicación |
| --- | --- |
| Inventariar | Raíces, exclusiones y huellas del contenido. «Estos archivos y repositorios están incluidos en el mapeo». Mostrar disponibilidad del proveedor externo. |
| Resolver código | AST y símbolos del compilador TypeScript. «Este import o llamada se resuelve a esta declaración». Mostrar los destinos no resueltos como diagnósticos. |
| Conectar contratos | Adaptadores HTTP y RabbitMQ con contratos y registros explícitos. «Este cliente coincide con este endpoint» o «Esta suscripción vincula esta cola con este handler». |
| Relacionar tests | Catálogo y sujetos revisados. «Esta declaración vincula el test con esta pieza». Aclarar que expresa intención, no cobertura medida. |
| Validar y publicar | Validación y snapshot inmutable. «El mapeo queda listo y se pueden abrir sus evidencias». |

Las subfases reflejan el orden real de los extractores. La interfaz puede agruparlas para enseñar, pero no atribuye una relación a una técnica distinta de la que la produjo.

Si hay observaciones cargadas, se identifican como tráfico de su revisión y ventana temporal. Si no las hay, se indica «Sin observaciones cargadas». Su ausencia no elimina dependencias. Esta fase es opcional para la demo principal.

## 4. Explicar Calculate test impact

1. **Comparar código:** archivos y rangos cambiados frente al snapshot base; abrir diff.
2. **Actualizar mapeo:** extraer las fuentes del overlay y mostrar relaciones añadidas o retiradas. Las retiradas siguen navegables en su versión anterior.
3. **Aplicar políticas:** identificar las entidades cambiadas y explicar propagación y límites de contratos. Mostrar un camino causal cuando el motor lo tenga.
4. **Resolver incertidumbre:** explicar qué obliga a ampliar la selección. Las altas de archivos y cambios de topología amplían el catálogo local con las reglas actuales.
5. **Presentar selección:** distinguir tests locales de suites distribuidas, seleccionados de excluidos y disponibles de inaccesibles. Mostrar sus motivos y acceso a ejecutar.

La consola expresa decisiones reales. Si se selecciona todo por incertidumbre, muestra ese motivo en lugar de inventar un camino por test. El cálculo no indica que los tests hayan pasado: sus resultados aparecen tras ejecutar los runners existentes.

## 5. Consola y mapa legible

Los mensajes son deterministas y derivan de eventos del backend. Cada evento contiene fase, secuencia, estado, explicación, técnica y referencias a evidencia o diagnóstico cuando existan. Una línea principal responde qué ocurrió; «Ver técnica» y «Ver evidencia» aportan detalle.

Ejemplo de New consumer, completado con datos y referencias reales:

```text
Código: he encontrado la función audit y su declaración.
Técnica: AST y resolución de símbolos TypeScript.

Eventos: la configuración declara una suscripción y una cola para audit.
Técnica: adaptador RabbitMQ y lectura de topología explícita.

Relación: el registro vincula este consumidor con su handler.
Evidencia: abrir el código o la configuración que justifica el vínculo.

Impacto: se ha añadido un archivo y ha cambiado la topología.
Decisión: amplío la selección local con la política conservadora actual.
```

El mapa se centra en el journey o camino causal seleccionado. Ordena las relaciones por recorrido y agrupa estructura secundaria; abandona la cuadrícula de los primeros 20 nodos. Los grupos se basan en entidades y áreas declaradas, sin inferir servicios por carpetas.

Objetivo visual: aproximadamente 6–12 elementos relevantes. Si hay más, agrupar o desplegar; no descartar conexiones necesarias para entender el resultado. El índice y el inspector conservan acceso al grafo completo.

Las relaciones usan nombres comprensibles: «importa», «llama», «renderiza», «publica», «se suscribe», «procesa». Los estados llevan texto además de color: descubierto, añadido, retirado o cambiado. IDs, hashes y políticas quedan en el detalle. Un grupo visual conserva referencias a sus relaciones originales y no crea enlaces autoritativos nuevos.

Cada paso de descubrimiento muestra únicamente los hechos registrados hasta esa fase. Esta proyección visual no selecciona tests. El mapa de hechos conserva consumidor → dependencia; un camino de impacto se identifica como recorrido de propagación.

## 6. Implementación mínima

- Instrumentar `buildArchive`, sus extractores y `analyzeOverlay` mediante un observador de progreso opcional, conservando el significado de sus salidas y políticas.
- Registrar operaciones de construcción/análisis con ID propio, estado y eventos ordenados. Consola y mapa consumen el mismo registro. La API permite consultar progreso y resultado; polling es suficiente.
- Separar ID de operación e ID de snapshot: reconstrucciones iguales pueden producir el mismo snapshot y registros distintos. «Desde cero» ejecuta los extractores; una lectura de caché se identifica expresamente.
- Asociar el mapeo activo a la sesión. Borrar invalida esa asociación y los análisis correspondientes; conserva snapshots históricos y archivos de evidencia. El refresco o watcher no lo reactiva sin una generación solicitada. Mantener las fuentes disponibles para el editor aunque esté «Sin mapeo».
- Enlazar eventos con IDs y locators existentes. Los enlaces se abren contra el snapshot correcto cuando esté publicado, sin estimar líneas.
- Mantener controles de sesión existentes. El cliente sigue enviando fuentes y referencias de snapshot, sin comandos ni listas de tests elegidos por journey.
- Ignorar resultados tardíos tras borrar, cambiar el overlay o iniciar una operación que los sustituya. Deshabilitar borrado durante una ejecución activa y mostrar el motivo.

Estados: **Sin mapeo / Construyendo / Listo / Desactualizado / Error**. Cambiar las fuentes base invalida su vigencia. Cambiar el overlay conserva el base para comparar, pero invalida el análisis anterior.

Un error queda en su fase y ofrece reintento explícito. Una construcción fallida no publica un mapeo parcial ni habilita el cálculo. Los archivos y cambios siguen disponibles para corregirlo.

## 7. Demo de 15–20 minutos

| Minutos | Mostrar | Idea principal |
| --- | --- | --- |
| 0–2 | Pasos y consola | El mapa procede de fuentes y evidencias verificables. |
| 2–7 | Borrar, generar desde cero y revisar fases | Inventario, resolución del compilador y bindings explícitos. Abrir una evidencia. |
| 7–12 | New consumer: diff, cálculo y mapa actualizado | Descubrir handler/suscripción, explicar selección conservadora y límites de despliegue/cobertura. |
| 12–18 | External HTTP contract: fases, before/after y ejecución | Aparece missing-contract, se retira el binding y falla inventory-contract al ejecutar. |
| 18–20 | Resultado y preguntas | Diferenciar descubrimiento, selección y ejecución. |

**Unresolved dependency** queda como alternativa para preguntas. Los runners pueden terminar mientras se revisa la evidencia. Conservar capturas del ensayo como respaldo, identificadas como ejecución previa.

## 8. Aceptación

1. Borrar deja «Sin mapeo», deshabilita el cálculo y conserva cambios. Un refresh de la web o workspace no resucita el mapeo de la sesión.
2. Generar ejecuta fases reales; iguales entradas producen el mismo grafo normalizado y cada operación conserva su registro.
3. Anterior/Siguiente sincroniza explicación y relaciones de la fase. No altera la selección, repite operaciones ni finge actividad en curso.
4. Las relaciones conservan evidencia de su extractor. Se abre al menos una evidencia de código y una de configuración.
5. New consumer muestra hechos añadidos y el motivo real de ampliación del catálogo local, sin afirmar cobertura o despliegue nuevos.
6. External HTTP contract muestra el binding retirado y su evidencia anterior. El runner detecta el fallo contractual esperado; unavailable o skipped no cuentan como passed.
7. Instrumentar no cambia grafo ni selección para las mismas entradas. Se comprueban invalidación de respuestas tardías y un fallo de extracción.
8. Se completa un ensayo real de 15–20 minutos en el equipo y versión de presentación, sin buscar manualmente entre cientos de nodos ni abrir documentación técnica para explicar las fases.

Validación proporcional: pruebas de estado/eventos y equivalencia; recorrido web borrar → construir → revisar → aplicar → calcular → evidencia; ejecución real del contrato. Registrar comandos, resultados y capturas. La aceptación se basa en el ensayo nuevo, no solo en la auditoría histórica G9.

## 9. Orden de implementación

**D1 — Proceso visible:** operaciones, instrumentación, borrado de sesión, construcción desde cero y registro del análisis.

**D2 — Experiencia guiada:** consola, revisión por fases, mapa del journey, inspector y acceso a tests.

**D3 — Ensayo:** validar los dos casos, corregir navegación/textos, registrar resultados y ajustar el guion a 15–20 minutos.

D1–D3 forman una única entrega enfocada en la demo. Se reutiliza G1–G9, sin reiniciar sus fases. El registro de validación distingue la implementación, el recorrido funcional comprobado y el ensayo cronometrado que realizará el presentador.
