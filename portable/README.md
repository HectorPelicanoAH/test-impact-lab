# Test Impact Portable

Base independiente para incorporar análisis de impacto a distintos proyectos mediante una skill, adaptadores deterministas y artefactos comunes.

**Estado: extracción inicial E0.** La inspección y el visor funcionan. La generación completa del grafo, la cobertura por test, el baseline, la selección y el runner de CI se desarrollarán siguiendo el [SDD](docs/SDD.md). Consulta el [estado](docs/IMPLEMENTATION-STATE.md).

## Probar ahora

Requiere Node.js 22 o superior. No necesita instalar dependencias, compilar ni arrancar servicios del laboratorio.

Desde esta raíz:

```sh
node bin/impact.mjs --help
node bin/impact.mjs inspect --root /ruta/al/proyecto --out /tmp/inspection.json
node bin/impact.mjs view examples/system.json
```

El último comando imprime una URL local. El ejemplo está marcado como ilustrativo: no simula ejecuciones ni afirma coverage medida.

La inspección lee manifiestos y enumera candidatos por patrón. No ejecuta scripts ni configuración del proyecto y no constituye todavía un catálogo autoritativo de tests.

## Uso de la UI común

- Buscar por nombre, ID o ruta sobre todos los nodos.
- Filtrar por grupo/repositorio, tipo de nodo, relación y clase de evidencia.
- Paginar el conjunto sin perder nodos del modelo.
- Abrir un nodo, navegar sus dependencias/consumidores y consultar cada evidencia.
- Ver fuentes archivadas cuando se hayan incluido expresamente.
- Consultar diagnósticos paginados y distinguir declaraciones, estática, observaciones y ejecución medida.

El canvas muestra los enlaces entre los nodos de la página visible; el inspector conserva todos los enlaces del nodo con su propia paginación. La UI no calcula porcentajes globales de coverage con un denominador desconocido.

## Abrir datos del laboratorio

El puente acepta un grafo v2 o el archivo completo generado por test-impact-lab:

```sh
node bin/impact.mjs import-v2 /ruta/a/snapshot-v2.json --out /tmp/view.json
node bin/impact.mjs validate /tmp/view.json
node bin/impact.mjs view /tmp/view.json
```

Si necesitas navegar los bytes archivados, añade `--include-sources` al importar un archivo que contenga `sources` y `configuration`. Se comprueban los hashes disponibles de los localizadores. Sin esa opción, se conservan las referencias pero no se copian contenidos.

Un import v2 no certifica un baseline ni convierte sujetos revisados en coverage. El formato `test-impact-view/1` es de consulta; el contrato completo de bundles se desarrollará en P2.

## Crear el nuevo repositorio

Puedes usar directamente esta carpeta como raíz. Para obtener una copia limpia en otro directorio vacío:

```sh
node scripts/export.mjs /ruta/vacia/test-impact
cd /ruta/vacia/test-impact
git init
git add .
git commit -m "Initial portable test-impact toolkit"
```

El exportador copia código, UI, skill, documentación, ejemplo y comprobaciones. No copia historial Git, dependencias instaladas, datos generados ni aplicaciones de la demo. Rechaza destinos con contenido.

La creación de un remoto y el push se hacen después, con el nombre y cuenta que elijas.

## Instalar la CLI en un proyecto consumidor

La distribución actual permite una instalación local:

```sh
cd /ruta/al/proyecto-consumidor
npm install --save-dev /ruta/al/toolkit
npm exec -- impact inspect --root .
```

También puedes invocar siempre `node /ruta/al/toolkit/bin/impact.mjs`. No es necesario publicar en un registro para probarla.

## Instalar la skill

Copia `skills/test-impact-onboard/` al directorio de skills de tu agente. En un entorno con `~/.codex/skills/`:

```sh
mkdir -p ~/.codex/skills
cp -R skills/test-impact-onboard ~/.codex/skills/
```

Después, abre el proyecto consumidor e invoca:

> Usa $test-impact-onboard para inspeccionar este proyecto, extraer sus necesidades y preparar su SDD de incorporación.

La skill es autocontenida. Si la CLI está disponible, `impact info` le permite localizar el SDD del toolkit y sus capacidades. No requiere que este laboratorio esté presente.

## Experiencia final prevista

Este es el flujo objetivo del SDD; los comandos de baseline/check/run **aún no están implementados**:

1. La skill inspecciona el proyecto, redacta su SDD y configura/implementa sus adaptadores.
2. `impact baseline create` genera grafo, catálogo y cobertura atribuible de la matriz registrada.
3. `impact check --base origin/main --working-tree` calcula la selección sin ejecutar tests.
4. `impact run --analysis <id> --collect-coverage` ejecuta el plan y actualiza evidencia.
5. `impact view` permite consultar los artefactos con la UI común.
6. CI recupera un baseline compatible, calcula impacto, ejecuta y publica evidencia. Opera sin IA.

Ante evidencia insuficiente, se amplía selección o se ejecuta la suite completa disponible. No se deduce ausencia de impacto por ausencia de hits.

## Estructura

```text
bin/       CLI
src/       núcleo de consulta, inspección, puente v2 y servidor local
ui/        visor genérico sin build ni dependencias externas
skills/    skill instalable y recursos de incorporación
docs/      SDD, estado y procedencia
examples/  artefacto ilustrativo del contrato visual
scripts/   exportación a raíz independiente
test/      comprobaciones del paquete
```

## Comprobaciones

```sh
node --test
```

Cubren integridad/identidad, paginación/búsqueda, distinción de evidencia importada, inspección sin ejecución, API de lectura y exportación independiente.
