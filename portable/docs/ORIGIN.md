# Procedencia y separación

Esta distribución se prepara en la rama `feat/instalable` de test-impact-lab. La revisión de origen anterior a la extracción es `29050d51e4f11e5808994e62531100c1b8dae807`.

## Reutilizado

El serializador canónico y el hash de `src/core.mjs` se extraen de `scripts/graph/core.ts`, eliminando imports y tipos específicos del laboratorio. Se añaden normalización y validación para un formato de consulta explícitamente experimental.

El diseño visual conserva la idea de grafo, tabla de tests e inspector de evidencia. La implementación del visor es nueva, sin React/Monaco/React Flow y sin dependencias de login, pedidos, Inventory, broker, escenas o editor de producto.

El puente `src/import-v2.mjs` lee un grafo/archivo v2 exportado. No importa el selector legacy ni sus reglas, y conserva los sujetos revisados como declaraciones. Valida la estructura del formato visual, no certifica la autenticidad del dataset ni su completitud como baseline.

## Fuera de esta raíz

La demo, servicios, tests del producto y archivos de escenario se conservan en el laboratorio de origen. No se copian al exportar esta distribución.

El descubridor completo y el motor de impacto del laboratorio utilizan configuración y metadatos específicos. Su adaptación al contrato general requiere P1–P5; no se han trasladado como si fueran un motor universal.

Los SDD históricos de dependencias, el contrato v2 y la auditoría G9 sirven como antecedentes. Sus rutas originales se mencionan en el SDD como documentación histórica y no son imports o enlaces necesarios para ejecutar el paquete.

## Formatos

`test-impact-view/1` es un formato de lectura/visualización de la extracción E0. No es todavía el bundle completo de P2 y no representa una certificación de cobertura o de exclusión de tests.

El SDD general y la skill están preparados para evolucionar con versiones explícitas. La publicación y licencia de una distribución pública se decidirán después; este paquete está marcado privado y UNLICENSED.
