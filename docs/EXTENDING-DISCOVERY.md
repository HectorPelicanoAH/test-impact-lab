# Añadir un proyecto o extractor

El índice autoritativo se construye con bytes capturados, identidades cualificadas y evidencia resoluble. No se añaden aristas por nombres parecidos, diagramas o ausencia de tráfico. Esta guía describe el código actual; no promete soporte automático para otros lenguajes o frameworks.

## Proyecto dentro del producto

1. Añadir una raíz explícita en `impact/discovery.json`, con extensiones, exclusiones y límites. `scripts/graph/files.ts` valida rutas, UTF-8, symlinks, tamaño y colisiones de mayúsculas/Unicode. Los archivos desconectados también entran en el inventario.
2. Declarar aliases reales en `moduleAliases` y en la configuración de TypeScript/runtime. Incluir sus bytes en los inputs de extracción y ejecución. No añadir un alias solo para hacer aparecer una relación.
3. Ejecutar `pnpm graph:discover` y revisar diagnósticos y locators en la web. Cada archivo/símbolo pertenece a producto/repositorio; la revisión y los hashes quedan en el snapshot.
4. Registrar pruebas reales y sujetos revisados en `impact/evidence/federated-tests.json`, solo para los runners fijos admitidos. Esta declaración indica intención, no cobertura medida. Los IDs de tests y comandos no se aceptan desde el cliente.
5. Verificar dependencias añadidas/eliminadas, homónimos, cambios de orden, fallos de parseo y selección conservadora. Ejecutar selected/full con una mutación que full detecte, y exigir que selected no omita ese fallo.

La vista de compatibilidad conserva las políticas revisadas del login. Para ampliar su catálogo original hacen falta metadatos de tests y revisión de políticas; añadir un archivo descubierto no declara automáticamente tests ni rutas ejecutables.

## Repositorio independiente

El ejemplo `scripts/inventory/materialize.mjs` crea un Git separado fuera del checkout. `loadWorkspace` exige una raíz Git propia y limpia, fija HEAD y captura código, contrato y tests bajo `external/inventory/`. Su eliminación corresponde únicamente al creador de una raíz temporal; una raíz proporcionada por el usuario se conserva.

Para un segundo proveedor se necesita un loader explícito con namespace propio, revisión verificable y fronteras equivalentes; no basta con añadir una carpeta a `roots`. Registrar contratos de cliente/proveedor y un binding cualificado por servicio, entorno, método/ruta/versión. Con solo contrato, declarar `contract-only` y pruebas externas inaccesibles. Las raíces de proveedores archivados son de lectura: un overlay no modifica ni despliega su repositorio.

## Extractor

1. Implementar un adaptador acotado en `scripts/graph/`. Usar el checker para resolución léxica, no coincidencias de texto para inferir identidades. Los adaptadores HTTP/RabbitMQ reconocen patrones concretos y configuración validada; patrones desconocidos producen diagnósticos.
2. Construir nodos/aristas mediante `GraphBuilder`. Asociar cada hecho con rango UTF-16 o JSON pointer, hash de origen, revisión, versión de extractor y motivo. No emitir una conexión resuelta si no se puede probar destino y origen.
3. Integrarlo en `buildArchive`; capturar todas sus entradas y versionar su implementación. `validateArchive` comprueba manifiestos, identidades, evidencia, fuentes y correlaciones. `locateSource` debe poder abrir cada prueba autoritativa desde los bytes archivados, incluyendo BEFORE tras borrar un archivo.
4. Definir la política causal en el motor federado, con positivos y negativos. Compartir broker no conecta consumidores entre sí. Una publicación/esquema puede afectar a ambos; un handler afecta a su propia cola. Dependencias desconocidas obligan a selección conservadora dentro del catálogo disponible, sin prometer cobertura desconocida.
5. Crear un corpus con oráculo independiente: aliases, homónimos, rutas soportadas/no soportadas, llamadas indirectas/dinámicas, archivo desconectado y parseo fallido. Medir precisión/exhaustividad por tipo; un diagnóstico no es un acierto de relación. Añadir pruebas que rechacen aristas falsas y evidencia adulterada.
6. Ejecutar `pnpm validate`, `pnpm graph:legacy:check`, `pnpm graph:audit` y los recorridos afectados. Publicar equipo, tamaño, repeticiones y alcance de los tiempos.

## Observaciones y actualización

OpenTelemetry y mesh son datasets separados con ventana, entorno, servicio, versión y revisión. Correlacionar solo identidades compatibles y únicas; mantener datos incompatibles pendientes. Tráfico TCP no identifica un evento o handler. No convertir tráfico en cobertura ni eliminar una dependencia porque no se observó.

Actualmente un cambio reconstruye todo el grafo; el fingerprint evita extracción si los inputs no cambiaron. No existe actualización parcial del programa TypeScript. Los overlays se analizan contra su snapshot fijado; `RELOAD SNAPSHOT` lee los inputs actuales y descarta el overlay. El watcher combina eventos y polling, conserva el último archivo válido ante errores y no hace válidos análisis antiguos para ejecutar sobre inputs nuevos.
