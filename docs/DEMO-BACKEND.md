# Demo de descubrimiento explicado — 15–20 minutos

Demo objetivo: 8 de octubre de 2026. Guion para la nueva experiencia de [SDD-DEMO-GUIADA.md](SDD-DEMO-GUIADA.md). Borrado, reconstrucción, consola y revisión por fases están implementados. El [registro del ensayo funcional](DEMO-GUIDED-VALIDATION.md) recoge las comprobaciones y capturas.

## Preparación en una hora

| Tiempo | Preparación |
| --- | --- |
| 0–15 min | Leer este guion y comprender las cinco técnicas del descubrimiento. |
| 15–45 min | Practicar construcción, consumidor y contrato HTTP en la versión implementada. Abrir evidencias y ejecutar el contrato. |
| 45–60 min | Ensayar en voz alta, comprobar duración y dejar la aplicación en su estado inicial. |

La entrega está en `feat/demo-guided-discovery`, basada en la rama que contiene los journeys. El entorno y los navegadores de prueba están instalados en este equipo. La web está en `http://127.0.0.1:5175`. Si necesitas volver a arrancarla, usa desde la raíz del repositorio:

```sh
CI=true PLAYWRIGHT_BROWSERS_PATH=/private/tmp/test-impact-lab-browsers pnpm dev
```

Arranca aplicaciones, explorador y proveedor de inventario temporal. El directorio de navegadores es el instalado en este equipo; en otro equipo se debe instalar Chromium de Playwright y usar su ubicación. Para presentar, empieza con **New consumer**, sin cambios aplicados y con la primera fase visible.

## Apertura — 0 a 2 minutos

«Voy a mostrar cómo obtenemos el mapa de dependencias, cómo lo justificamos y cómo utilizamos un cambio real para decidir qué tests ejecutar.»

Señala los pasos: **Construir mapeo → Aplicar cambio → Calcular impacto → Revisar y ejecutar**.

«La consola recoge las fases ejecutadas. Podemos revisarlas una a una sin repetir el proceso.»

## Construir el grafo — 2 a 7 minutos

Pulsa **Borrar mapeo**. Muestra «Sin mapeo» y que el código sigue disponible. Pulsa **Generar mapeo** y revisa las fases con **Anterior/Siguiente**.

| Paso | Qué decir |
| --- | --- |
| Capturar / Inventariar fuentes | «Partimos de estos archivos y repositorios, con esta revisión de sus fuentes.» |
| Resolver código | «El compilador interpreta la estructura del código y resuelve imports y llamadas a declaraciones concretas.» |
| Vincular arquitectura y tests | «Los objetivos revisados de los tests vinculan pruebas con piezas del código. Esto expresa intención; no es cobertura medida.» |
| Leer proveedor / Conectar HTTP | «Fijamos una revisión Git del proveedor. El adaptador comprueba cliente, endpoint, método y contrato.» |
| Descubrir eventos y consumidores | «Otro adaptador reconoce publicaciones, colas y registros explícitos de handlers.» |
| Validar y publicar | «Guardamos un mapeo reproducible con las evidencias que lo justifican.» |

Al avanzar, señala cómo aparecen las relaciones. Abre una evidencia de código y vuelve al paso.

«El proceso puede terminar rápidamente; esta vista permite revisar después lo que ocurrió. La información viene de esa ejecución real.»

## Journey New consumer — 7 a 12 minutos

Aplica **New consumer** y abre el diff. Señala la función `audit`, su registro y la entrada de suscripción en la topología.

«Añadimos código y una configuración que conecta el consumidor con su cola. Vamos a ver qué descubre el analizador.»

Pulsa **Calcular test impact**. Usa las fases **Comparar el código → Resolver código → Descubrir eventos y consumidores → Explicar la incertidumbre → Presentar la selección**. En Resolver código aparece el símbolo `audit`; en Eventos aparece su consumidor y cola. En **Relación visible**, elige «se suscribe · audit.order-created.v1…» y pulsa **Abrir evidencia**: se resalta la entrada real de `audit` en la topología. También puedes elegir «registra handler» para abrir su registro.

«El mapa descubre estas relaciones porque encuentra el registro y la configuración. El cambio está en una copia de trabajo: no hemos desplegado un servicio nuevo ni creado tests automáticamente.»

Muestra el motivo de selección conservadora:

«Hay un archivo añadido y ha cambiado la topología. Las reglas actuales amplían la selección local. La pantalla explica esa decisión y distingue las suites distribuidas por disponibilidad.»

## Journey External HTTP contract — 12 a 18 minutos

Aplica **External HTTP contract**. Sustituye el cambio anterior y parte del código base fijado. Abre el diff del contrato.

«El cliente declara respuesta v2, mientras el proveedor y el parser siguen en v1.»

Calcula impacto y elige **Conectar HTTP**. Señala `missing-contract` y **No hay un binding HTTP verificable**. Pulsa **Ver binding retirado · antes del cambio** y **Abrir evidencia**: se abre la llamada original de `InventoryClient.ts`. **Volver a la relación** devuelve al inspector; **Volver al mapa posterior** devuelve al resultado del cambio.

«La relación necesita que contrato, versión y binding coincidan. Al dejar de coincidir, conservamos el hecho anterior para explicar qué ha cambiado.»

Ve a **Revisar y ejecutar tests** y pulsa **RUN SELECTED TESTS**. Mientras termina el runner, vuelve a IMPACT GRAPH y muestra **Explicar la incertidumbre**. Vuelve a TESTS para ver el resultado. El resultado guiado distingue 39 tests locales de las suites distribuidas; el botón del runner suma ambas unidades.

«Ahora ejecutamos tests sobre el mismo código que acabamos de analizar.»

Ensayo confirmado: falla `inventory-contract`, pasan los 39 tests locales del login y las otras 9 suites disponibles. El runner tardó 120 segundos; puedes explicar la selección mientras trabaja. Un estado unavailable o skipped no cuenta como un pase. En este perfil, las dos suites que necesitan RabbitMQ permanecen unavailable.

## Cierre y preguntas — 18 a 20 minutos

«Hemos visto de dónde salen las relaciones, cómo un cambio modifica el mapa y cómo las evidencias y políticas justifican la selección de tests.»

| Pregunta | Respuesta breve |
| --- | --- |
| ¿Usa IA para construir el grafo o seleccionar tests? | No. Usa extractores, evidencias versionadas y políticas deterministas. |
| ¿Todo es automático? | El compilador y los adaptadores descubren patrones soportados. Los objetivos de tests y parte de la arquitectura del login son declaraciones revisadas. |
| ¿Y si una llamada es dinámica? | Si no se demuestra el destino queda un diagnóstico. La incertidumbre puede ampliar la selección. |
| ¿Las trazas sustituyen al mapa? | Aportan tráfico observado de una revisión y ventana. Su ausencia no elimina una dependencia estática. |
| ¿La actualización es incremental? | Actualmente se reconstruye el índice completo. «Desde cero» vuelve a ejecutar la extracción. |
| ¿Añadir un consumidor crea cobertura? | Descubre código y bindings. La cobertura requiere tests y mediciones propias. |

**Unresolved dependency** queda de reserva: el método HTTP depende de una expresión; el binding no se demuestra, la selección se amplía y la ejecución puede seguir pasando porque en este entorno devuelve GET.

## Ensayo y estado inicial

Comprueba borrado/reconstrucción, una evidencia de código, otra de configuración y el fallo contractual esperado. Conserva capturas como respaldo, identificadas como resultados del ensayo. Deja el mapeo listo, sin cambios aplicados y con el primer paso visible.

La demo principal enseña descubrimiento estático e impacto sin requerir broker, telemetría ni mesh activos. El recorrido funcional tiene capturas de respaldo. Reserva los últimos 15 minutos de preparación para ensayar tu exposición con cronómetro; el reparto anterior da una demo de 18 minutos más preguntas.
