# SDD — Descubrimiento de dependencias y sistemas distribuidos

Fecha: 2026-10-05. Estado: G1–G6 completadas; G7 pendiente de autorización. Evidencias y siguiente acción en [el registro de estado](DEPENDENCY-GRAPH-STATE.md).

Este documento amplía [el SDD original](SDD.md). Conserva el login, el motor determinista, las explicaciones causales y las ejecuciones reales. Las fases G1–G9 pertenecen a esta ampliación y no renumeran las fases históricas.

## 1. Objetivo

Al añadir, modificar o eliminar una pantalla, función, servicio o suscripción, descubrir sus dependencias, actualizar el grafo y explicar el impacto en los tests. Cada conexión debe remitir a evidencia verificable. El ejemplo incluirá código de un producto externo al repositorio, HTTP, eventos, broker, consumidores y observabilidad.

No se pretende resolver universalmente cualquier lenguaje, framework o destino dinámico. El ámbito soportado y los huecos de detección serán visibles. No habrá LLM en la selección de tests ni en la construcción autoritativa de relaciones durante la ejecución.

## 2. Protocolo obligatorio de ejecución humana

1. Crear este SDD no autoriza a iniciar G1. Esperar un «sigue» humano.
2. Cada «sigue» autoriza exclusivamente la siguiente fase pendiente, incluyendo sus pruebas, correcciones y documentación. No autoriza todas las fases restantes.
3. Al terminar una fase, detenerse. No iniciar código, instalaciones, servicios ni investigaciones propias de la siguiente fase.
4. Entregar: cambios, evidencias de aceptación, pruebas ejecutadas y resultados, limitaciones, archivos relevantes, siguiente fase y modelo recomendado. Cerrar con «Fase Gx completada. Para iniciar Gy, selecciona [modelo/esfuerzo] y escribe “sigue”».
5. Si falta un criterio obligatorio, declarar la fase incompleta y explicar el bloqueo; no avanzar ni convertir trabajo pendiente en una aceptación implícita.
6. Las correcciones solicitadas pertenecen a la fase actual y no consumen ni implican autorización para la siguiente.
7. Mantener `docs/DEPENDENCY-GRAPH-STATE.md` desde G1 con fases pendientes/en curso/completadas, decisiones, comandos, resultados y siguiente acción. En otro hilo, leer este SDD y ese estado antes de trabajar.
8. No cambiar automáticamente el modelo ni crear agentes adicionales. La selección de modelo la realiza el usuario. No publicar repositorios, desplegar en servicios externos ni enviar cambios remotos como consecuencia implícita de un «sigue».

## 3. Modelos recomendados

Las asignaciones son recomendaciones de ingeniería, no garantías de rendimiento. Se usan modelos expuestos por este entorno: `gpt-6-astra` y `gpt-6-sol`. «High» y «xhigh» indican esfuerzo de razonamiento. Si la interfaz no ofrece el modelo indicado, acordar una alternativa antes de empezar; no sustituirlo silenciosamente.

| Fase | Entrega | Modelo | Esfuerzo |
| --- | --- | --- | --- |
| G1 | Contrato del grafo, corpus y evaluación CodeGraphContext | GPT-6 Astra | xhigh |
| G2 | Descubrimiento estático y actualización versionada | GPT-6 Astra | high |
| G3 | Inspector de evidencias y navegación al código | GPT-6 Sol | high |
| G4 | Pedidos, inventario externo y contratos HTTP | GPT-6 Sol | high |
| G5 | Broker, eventos, consumidores y fallos | GPT-6 Astra | high |
| G6 | Reglas de impacto distribuidas y ejecución entre proyectos | GPT-6 Sol | high |
| G7 | Trazas y correlación con código | GPT-6 Sol | high |
| G8 | Escenario de service mesh | GPT-6 Sol | high |
| G9 | Recorridos web, auditoría y entrega reproducible | GPT-6 Sol | high |

Para ahorrar tokens, el usuario acordó usar Sol / high también en G6 y G9. Si la auditoría final descubre decisiones nuevas de arquitectura, se puede reconsiderar ese esfuerzo antes de iniciar G9; no se cambia de modelo automáticamente. Referencia oficial consultada: [comparación de modelos de OpenAI](https://developers.openai.com/api/docs/models/compare?model=gpt-6-sol). La disponibilidad en la aplicación puede diferir del catálogo de API.

## 4. Punto de partida

- `scripts/generate-graph.ts` parte de nodos registrados en `impact/evidence/architecture.json` y extrae referencias a módulos.
- Las llamadas y sujetos de tests dependen en gran parte de metadatos revisados.
- Una dependencia interna desconocida de un nodo analizado produce error, pero no se realiza un inventario de todos los archivos del producto.
- La web usa un snapshot cargado por el servidor; editar código no reconstruye actualmente la topología.
- El grafo permite destacar caminos de tests, pero no inspeccionar el origen exacto de cada arista.
- El runner ejecuta código editado en overlays locales; no es un sandbox de sistema operativo.

G1 verificará el estado real y registrará una línea base. Los recuentos históricos no serán criterios rígidos de aceptación.

## 5. Arquitectura propuesta

Flujo: repositorios + contratos + configuración → extractores → evidencias normalizadas → snapshot del grafo → motor de impacto → selección explicada → runners.

La telemetría entra mediante otro adaptador, como observaciones versionadas. No reemplaza las dependencias estáticas ni elimina relaciones por ausencia de tráfico.

### Identidad y evidencia

- Nodos: archivo, símbolo, pantalla, ruta, servicio, endpoint, contrato HTTP, esquema de evento, canal, suscripción, consumidor, recurso de broker y test.
- Identidad con espacio de nombres de repositorio/producto y símbolo o recurso. La revisión pertenece al snapshot, evitando colisiones entre proyectos y versiones.
- Aristas tipadas: importa, llama, renderiza, enruta, implementa, invoca endpoint, publica, suscribe, procesa y ejercita. Su dirección se documenta por tipo; no se invierten todas con la misma regla.
- Evidencia: clase (estática, configuración, declaración revisada, cobertura medida u observación), extractor y versión, archivo/rango/símbolo o referencia de traza/configuración, revisión, justificación y estado de resolución.
- Una relación puede tener varias evidencias. Deducir una llamada por coincidencia de nombre no basta para considerarla resuelta.
- Observaciones: servicio/versión/entorno, ventana temporal y referencias de spans. Las relaciones ambiguas permanecen sin correlacionar, con motivo explícito.
- Snapshot: hashes del código, contratos, configuración, catálogo, extractores y políticas. Si incorpora observaciones a un análisis, fijar también su conjunto y hash.
- Diferencias: altas, bajas y cambios. Un renombrado sin identidad demostrable se representa como baja y alta, sin inventar continuidad.
- Diagnósticos: referencia dinámica, fuente inaccesible, contrato ausente, extractor no soportado, parseo fallido y evidencia caducada.

### Invariantes

1. Misma entrada versionada y mismas políticas producen el mismo grafo normalizado y selección.
2. Cada arista autoritativa tiene evidencia; las inferencias pendientes no se presentan como certezas.
3. Importar, llamar, ejecutar y comprobar mediante assertions son conceptos diferentes.
4. El análisis de un cambio considera dependencias anteriores y posteriores, incluyendo archivos eliminados.
5. Incertidumbre amplía la selección: si no se demuestra un ámbito seguro, seleccionar todo el catálogo disponible y explicar que eso no cubre tests externos desconocidos.
6. Un contrato sin cambios de esquema no garantiza comportamiento compatible. Las reglas explican su alcance y conservan evidencia de integración/journey.
7. Una prueba afectada pero inaccesible se muestra como no ejecutada; nunca como pasada.
8. Mantener el flujo actual de login, límites del runner y separación entre código del producto y herramientas de análisis.

## 6. Ejemplo de producto

```text
Pantalla de pedidos → API de pedidos → Producto de inventario (HTTP)
                           ↓
                    Guarda el pedido + outbox
                           ↓
                    Publica OrderCreated v1
                           ↓
                     Broker / canal
                       ↙         ↘
                Notificaciones   Preparación
```

La pantalla crea un pedido y consulta su estado. Inventario responde disponibilidad. Dos consumidores independientes procesan el mismo evento. Los avisos se almacenan en un buzón local de demo, sin enviar correo real. El estado de preparación debe consultarse a su servicio o mediante una integración explícita, nunca por memoria compartida oculta.

Decisión propuesta: RabbitMQ como broker real, con dos colas/suscripciones, reintentos limitados y cola de mensajes fallidos. Versiones, librerías y configuración exactas se fijan tras verificar documentación en G5. El outbox y la deduplicación por identificador de evento evitan prometer entrega exactamente una vez.

Inventario será un proyecto autónomo con código, contrato, dependencias, tests y manifiesto propios. Para distribuir la demo, su plantilla puede vivir en `examples/external-inventory/`; un comando la materializará en una raíz independiente fuera del checkout, con identidad Git propia y revisión registrada. La validación entre repositorios usará esa raíz, sin imports de implementación entre ambos. No hace falta crear un repositorio remoto. También habrá un modo de inventario accesible solo mediante contrato.

## 7. Fases y criterios de aceptación

### G1 — Contrato, corpus y decisión de indexador

**Entrada:** autorización humana inicial. **Modelo:** Astra / xhigh.

Trabajo:

- Auditar el estado actual y ejecutar la validación de referencia.
- Diseñar esquema v2, migración desde v1, identidad, evidencias, diagnósticos y límites entre archivos, símbolos y entidades semánticas existentes.
- Crear un corpus pequeño con verdad esperada revisada: imports, alias, reexportaciones, símbolos homónimos, JSX, callbacks, interfaces/inyección, imports dinámicos literales y no literales, altas/bajas/renombrados.
- Evaluar CodeGraphContext y el analizador TypeScript con el mismo corpus. Registrar versiones, precisión y exhaustividad por relación, falsos enlaces, omisiones, procedencia, actualización, requisitos y tiempo de indexación.
- Documentar la decisión: TypeScript, CGC o combinación mediante adaptadores. CGC no será dependencia obligatoria si no conserva evidencia o empeora la corrección. Si no puede ejecutarse, registrar la limitación y no atribuirle resultados.

**Entregables:** contrato del grafo, corpus con resultados, ADR de indexador y registro de estado.

**Aceptación:** cada caso se clasifica como resuelto correctamente o diagnóstico explícito; ningún enlace falso se acepta como autoritativo; elección sustentada en resultados y migración definida. No sustituir aún el generador de producción.

**Parada:** esperar «sigue» para G2.

### G2 — Descubrimiento estático y actualización

**Entrada:** G1 completada. **Modelo:** Astra / high.

- Inventariar el código de producto mediante raíces/exclusiones explícitas, incluyendo archivos todavía no conectados a una entrada.
- Implementar el adaptador elegido: imports, JSX, llamadas resolubles y patrones de rutas soportados, con rangos exactos. Mantener declaraciones revisadas para relaciones no deducibles.
- Versionar la salida y presentar delta de nodos/aristas. Migrar la evidencia existente sin perder las reglas del login.
- Añadir reconstrucción reproducible y modo de vigilancia. Publicar snapshots de forma atómica; una extracción fallida no deja un grafo parcialmente actualizado.
- Ampliar los overlays y API de edición para altas/modificaciones/bajas dentro de raíces autorizadas; evitar traversal y colisiones. El explorador podrá añadir una pantalla en su copia de trabajo y recalcular sin alterar el checkout.
- Invalidar análisis antiguos al cambiar las entradas; conservar snapshots para explicar resultados históricos.

**Aceptación:** añadir, conectar, modificar y eliminar una pantalla actualiza las relaciones correctas; un archivo desconectado se descubre; un destino dinámico genera diagnóstico; dos reconstrucciones equivalentes tienen el mismo hash. Comparar actualización vigilada con reconstrucción completa. Probar aplicación de altas/bajas en overlays y compatibilidad del login.

**Parada:** esperar «sigue» para G3.

### G3 — Inspector de evidencias

**Entrada:** G2 completada. **Modelo:** Sol / high.

- Hacer seleccionables nodos y aristas, con inspector de tipo, procedencia, revisión y motivo.
- Abrir el código/configuración del snapshot correcto en sus líneas; mostrar ausencia de fuente sin fabricar un enlace.
- Recorrer dependencias y consumidores, filtrar tipos/evidencias y mostrar diagnósticos y delta del grafo.
- Incorporar vistas sistema/servicio/código y explicar dirección de dependencias frente a dirección de impacto.
- Permitir crear la pantalla del ejemplo guiado desde la web y observar su aparición.

**Aceptación:** navegar desde una arista al fragmento real y volver al camino; inspeccionar evidencia manual y estática; distinguir nuevas/eliminadas; navegación por teclado y revisión visual en escritorio y pantalla estrecha. E2E del ciclo nueva pantalla → actualización → evidencia.

**Parada:** esperar «sigue» para G4.

### G4 — Pedidos y producto externo HTTP

**Entrada:** G3 completada. **Modelo:** Sol / high.

- Implementar pantalla, API de pedidos y producto independiente de inventario descritos en la sección 6.
- Declarar contrato HTTP versionado y extraer relaciones de cliente/endpoint/proveedor sin confundir URLs coincidentes de distintos entornos.
- Configurar catálogo multirrepositorio con fuentes locales permitidas, identidades y revisiones fijadas. Mostrar código de inventario en la web.
- Crear tests unitarios, de contrato, integración HTTP y E2E de disponibilidad/indisponibilidad; representar timeout y error externo.
- Añadir variante de fuente externa inaccesible: mostrar contrato y límite de visibilidad.

**Aceptación:** pedido real consulta inventario en otro proceso/raíz; no hay imports de su implementación; navegación al código externo y su revisión; cambio de contrato aparece en el delta. Arranque documentado y fallos externos comprobados. Hasta G6, ampliar conservadoramente selección para relaciones nuevas no soportadas.

**Parada:** esperar «sigue» para G5.

### G5 — Eventos, broker y consumidores

**Entrada:** G4 completada. **Modelo:** Astra / high.

- Añadir broker real, publicación por outbox y contrato `OrderCreated v1` con identificador, versión y correlación.
- Implementar consumidores de notificaciones y preparación, deduplicación, reintento limitado y mensajes fallidos.
- Extraer relaciones desde llamadas/configuración de publicación, bindings y suscripciones. Identificar canales por broker lógico y entorno, no solo por nombre.
- Representar un consumidor añadido/eliminado y routing dinámico sin resolver. Compartir broker no crea por sí solo dependencia entre servicios.
- Añadir pruebas de contrato, integración con broker, duplicados, reintento, fallo definitivo y recuperación del publicador.

**Aceptación:** ambos consumidores reciben el evento; un duplicado no duplica efectos; el fallo de uno no bloquea al otro; tras agotar reintentos el mensaje llega a la cola fallida; las conexiones saltan a código/configuración reales. Las pruebas esperan condiciones con timeout, no pausas fijas arbitrarias.

**Parada:** esperar «sigue» para G6.

### G6 — Impacto distribuido y runners

**Entrada:** G5 completada. **Modelo:** Sol / high, acordado con el usuario.

- Definir y probar políticas por tipo de relación y cambio; evitar convertir el flujo de mensajes en una inversión indiscriminada de aristas.
- Usar grafos anterior/posterior; gestionar ciclos, consumidores retirados, schemas versionados y contratos de comportamiento.
- Federar catálogo y ejecución local de los proyectos aprobados, con comandos fijos derivados en servidor y overlays por raíz. No aceptar comandos del navegador.
- Separar tests afectados, disponibles, ejecutados, fallidos y no ejecutables. Comparaciones selected/full usan las mismas revisiones, datos iniciales y ámbito de ejecución.
- Si existe evidencia de cobertura por test, versionarla y distinguir ejecución de assertions; nunca reinterpretar imports de tests como cobertura medida.

**Aceptación obligatoria:**

| Cambio | Resultado que debe demostrarse |
| --- | --- |
| Componente de pedidos | Camino a tests de su pantalla |
| Contrato de inventario | Evaluación de proveedor y consumidores HTTP |
| Schema OrderCreated | Evaluación de productor y ambos consumidores |
| Implementación local de notificaciones | No arrastra preparación sin una dependencia demostrada |
| Publicador cambia comportamiento sin cambiar schema | No se declara inocuo por mantener el esquema |
| Suscripción eliminada | Usa evidencia previa y tests relevantes |
| Destino desconocido | Selección conservadora y límite explicado |
| Fuente/tests externos inaccesibles | Tests pendientes o cobertura desconocida, nunca éxito inventado |

Cada selección/exclusión tiene causa. En mutaciones controladas, selected detecta los mismos fallos relevantes que full; cualquier fallo omitido impide cerrar la fase. Las listas esperadas pertenecen a tests del motor, nunca a reglas de escenarios en producción.

**Parada:** esperar «sigue» para G7.

### G7 — Trazas y correlación

**Entrada:** G6 completada. **Modelo:** Sol / high.

- Instrumentar HTTP, outbox, publicación, consumo y reintentos con OpenTelemetry; propagar contexto y usar enlaces de spans cuando corresponda.
- Añadir Collector/backend local, versiones fijadas y un adaptador que vincule observaciones a identidades del grafo.
- Mostrar recorrido observado, tiempos medidos, errores, revisión y ventana temporal; identificar mensajes/lotes sin deducir relaciones solo por cercanía temporal.
- Conservar dependencias estáticas sin tráfico. Telemetría no correlacionable queda como observación pendiente.
- Mantener análisis reproducible fijando las observaciones usadas; sin telemetría el análisis estático sigue funcionando.

**Aceptación:** traza real desde pantalla/HTTP hasta publicación y ambos consumidores; reintento visible sin duplicar dependencia lógica; una versión incompatible no se mezcla silenciosamente; ausencia de tráfico no elimina conexiones. Reiniciar observabilidad no rompe el ejemplo básico.

**Parada:** esperar «sigue» para G8.

### G8 — Service mesh

**Entrada:** G7 completada. **Modelo:** Sol / high.

- Crear perfil local opcional de Kubernetes con Istio/Kiali; fijar versiones compatibles tras verificar documentación y prerequisitos del equipo.
- Desplegar los servicios del ejemplo y generar tráfico real; importar evidencia de comunicación mediante un adaptador documentado.
- Mapear servicio/workload/versión al catálogo y mostrar comparación entre relaciones declaradas, estáticas y observadas.
- Explicar el límite: el tráfico hacia el broker no identifica por sí mismo evento, suscripción ni función consumidora.
- Proveer arranque, comprobación y limpieza de los recursos creados, sin tocar clusters ajenos ni convertir Kubernetes en requisito del flujo básico.

**Aceptación:** grafo de tráfico real entre servicios, evidencia consultable y correlación de versión; discrepancia demostrable entre dependencia existente y no observada. Verificar que el perfil básico sigue funcionando. Si falta infraestructura, entregar artefactos pero dejar esta fase incompleta hasta validación real; no usar capturas inventadas.

**Parada:** esperar «sigue» para G9.

### G9 — Recorridos didácticos y auditoría final

**Entrada:** G8 completada. **Modelo:** Sol / high, acordado con el usuario.

- Completar en la web recorridos de pantalla nueva, contrato HTTP externo, evento incompatible, nuevo consumidor, reintento/fallo y dependencia no resuelta.
- Cada recorrido aplica cambios de código/configuración en overlays y muestra delta → evidencia → impacto → ejecución. No enviar nombres de escenarios como sustituto de análisis.
- Añadir explicación breve de qué detecta cada fuente, cómo actualizar, límites de visibilidad y diferencias entre dependencias, tráfico y cobertura.
- Auditar corpus, reproducibilidad, identidades, fronteras, scripts de arranque/limpieza y preservación del login.
- Ejecutar validación completa del producto, ejemplos HTTP/broker, selected/full, E2E web y perfil mesh. Medir indexación completa/incremental y registrar equipo/tamaño, sin prometer cifras universales.
- Actualizar README, arquitectura, estado, limitaciones y guía para añadir un proyecto/extractor.

**Aceptación:** todos los casos de la matriz siguiente tienen demostración y pruebas; cada conexión autoritativa es inspeccionable; no hay resultados simulados; instrucciones reproducibles desde un entorno limpio y limitaciones visibles. Resolver defectos detectados antes de cerrar.

**Parada final:** entregar resultados y detenerse. Cualquier ampliación requiere una nueva instrucción humana.

## 8. Matriz de trazabilidad

| Necesidad | Fases | Evidencia final |
| --- | --- | --- |
| Pantalla nueva y actualización | G2, G3, G9 | Alta/baja en overlay y delta verificable |
| Dependencias a nivel de código | G1–G3 | Corpus, precisión/exhaustividad y salto a líneas |
| Evaluar CodeGraphContext | G1, G2 | ADR, resultados y adaptador o descarte justificado |
| Producto externo con código | G4, G6 | Proyecto autónomo y ejecución multirrepositorio |
| Solo contrato externo disponible | G4, G6 | Visibilidad limitada y tests no ejecutables |
| Eventos/broker/múltiples consumidores | G5, G6 | Procesamiento real y selección causal |
| Reintentos, duplicados y fallos | G5, G7 | Tests e historial de trazas |
| Service mesh | G8 | Tráfico real y correlación con grafo |
| Destinos dinámicos y omisiones | G1, G2, G6 | Diagnóstico y fallback conservador |
| Explicación en la web | G3, G7, G9 | Recorridos E2E e inspección visual |
| Control humano | Todas | Cierre de fase y espera de «sigue» |

## 9. Cierre común y límites

Las fases con cambios ejecutarán pruebas apropiadas, validación de grafo y comprobación de formato. Las fases que toquen el motor o integración ejecutarán además la regresión pertinente del login. Registrar comandos y resultados reales; no repetir toda la suite sin necesidad en fases solo documentales.

Los contratos/extractores nuevos se añaden mediante adaptadores. El grafo normalizado y el motor no dependerán de una base de datos concreta. La demo local conserva su modelo de confianza; ejecución pública, autenticación de producción, despliegue cloud, repositorios privados arbitrarios y soporte universal de lenguajes quedan fuera.

## 10. Fuentes para decisiones posteriores

- [CodeGraphContext](https://github.com/CodeGraphContext/CodeGraphContext): verificar versión y capacidades mediante el corpus en G1.
- [OpenTelemetry messaging](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/messaging/messaging-spans.md): revisar convenciones y estabilidad al implementar G7.
- [Istio/Kiali](https://istio.io/latest/docs/tasks/observability/kiali/): grafos de tráfico observado, a validar en G8.

## 11. Prompt de arranque

> Lee docs/SDD-DEPENDENCY-GRAPH.md y, si existe, docs/DEPENDENCY-GRAPH-STATE.md. Este «sigue» autoriza solo la siguiente fase pendiente. Completa su alcance, valida sus criterios y entrega evidencias. No inicies la fase posterior. Al terminar indica el modelo/esfuerzo de la siguiente y espera otro «sigue» humano.
