# G8 — Perfil local de service mesh

El perfil opcional despliega frontend, Orders API, Inventory independiente, Notifications, Preparation y RabbitMQ en un clúster kind propio con sidecars Istio. Prometheus conserva los contadores y Kiali muestra el grafo real. El perfil básico y la selección estática siguen funcionando sin Kubernetes.

## Prerequisitos y versiones

Node/pnpm del proyecto, Docker en ejecución con al menos 6 GiB y 4 CPU asignados (equipo de aceptación: macOS arm64, 8 GiB/10 CPU), espacio para imágenes y `kubectl` 1.34–1.36 (medido: 1.36.1). El arranque comprueba esa [compatibilidad de minor oficial](https://kubernetes.io/releases/version-skew-policy/). Reservar aproximadamente 10 GB libres para herramientas, imágenes e informes. Se admiten macOS/Linux arm64/amd64; otros equipos requieren adaptación y validación.

Las versiones están fijadas en [versions.json](../scripts/mesh/versions.json): kind 0.31.0, Kubernetes 1.35.0, Istio 1.31.0, Kiali 2.27.0, Prometheus 3.10.0, config-reloader 0.89.0, Node 24.18.0 y RabbitMQ 4.2.0. Nodo Kubernetes/runtime/RabbitMQ usan digest; los addons usan tags exactos. No se afirma que los tags de addons sean inmutables. La comprobación registra versiones reales del servidor, imágenes de Deployments e image IDs de los pods.

Compatibilidad comprobada en la [tabla oficial de Istio](https://istio.io/latest/docs/releases/supported-releases/): Istio 1.31 admite Kubernetes 1.32–1.36. El digest del nodo procede de la [release oficial de kind 0.31.0](https://github.com/kubernetes-sigs/kind/releases/tag/v0.31.0). Los addons son los publicados en [Istio 1.31.0](https://github.com/istio/istio/tree/1.31.0/samples/addons), con tag Kiali fijado a su patch exacto; siguen el [quick start de Kiali](https://kiali.io/docs/installation/quick-start/). Este despliegue pequeño es de laboratorio local.

## Operación

Desde la raíz del checkout:

```sh
pnpm mesh:setup
pnpm test:mesh
```

`mesh:setup` descarga kind/istioctl en `.impact-tools/mesh`, comprueba SHA-256 contra las releases oficiales y guarda los checksums. No cambia instalaciones globales. `test:mesh` crea un perfil nuevo, despliega, genera tráfico, verifica métricas/Kiali/archivo/web y retira su clúster, tags de imágenes e inventario temporal en `finally`. Un fallo de arranque guarda diagnósticos y solicita limpieza del mismo perfil.

Para mantener un perfil abierto:

```sh
pnpm mesh:up
# Copiar el UUID mostrado por el arranque:
PROFILE_ID=<UUID>
pnpm mesh:status "$PROFILE_ID"
pnpm mesh:check "$PROFILE_ID"
pnpm mesh:view "$PROFILE_ID"
# Ctrl+C cierra los port-forwards, conserva el clúster.
pnpm mesh:down "$PROFILE_ID"
pnpm mesh:inspect "$PROFILE_ID"
```

`mesh:view` muestra las URLs loopback de `/orders` y Kiali. `mesh:check` captura dos ventanas y conserva el clúster abierto; si cambió código desde el build, exige recrearlo. `mesh:inspect` abre **IMPACT GRAPH → Service mesh** con las fuentes/dataset del archivo medido y funciona después de la limpieza, sin Kubernetes ni el checkout externo. Ctrl+C cierra esos dos servidores. Una versión diferente del extractor puede impedir reconstruir el mismo ID; el JSON archivado continúa disponible.

Cada perfil tiene namespace `impact-g8` dentro de un clúster nuevo `impact-g8-<UUID-prefix>`. El kubeconfig está en `.impact-runs/mesh/<UUID>/kubeconfig`; todos los comandos usan ese archivo/contexto. Se comprueba identidad del contenedor kind y servidor loopback antes de usar kubectl; una colisión con un nombre preexistente se rechaza. No se consulta ni cambia el contexto global. La limpieza opera sobre el nombre, imágenes y fuente temporal del perfil indicado. Las herramientas/imágenes base quedan como caché; evidencias/logs/archivos permanecen en su directorio ignorado por Git. No ejecutar limpiezas globales de Docker ni Kubernetes.

Kiali usa autenticación anónima en este clúster propio. Los port-forwards se limitan a `127.0.0.1`; no hay ingress, LoadBalancer ni servicios públicos. Las credenciales RabbitMQ son del demo local. `IMPACT_MESH_NAMESPACE=impact-g8` permite escuchar en interfaces del pod y admitir exclusivamente FQDN conocidos de ese namespace. Sin ese opt-in, los procesos siguen limitados a loopback. `enableServiceLinks: false` evita que Kubernetes sustituya `INVENTORY_PORT` numérico por una URL TCP de Service.

## Adaptador y archivo

[verify-mesh.ts](../scripts/verify-mesh.ts) consulta `istio_requests_total` e `istio_tcp_sent_bytes_total` con `reporter="source"` y namespace `impact-g8`, mediante la API de Prometheus. Guarda contadores completos antes/después, timestamps de ventana, labels de workload/canonical revision, revisiones de código e image IDs comprobados contra pods reales. Guarda además el JSON de `/kiali/api/namespaces/graph`. `platform.json` y `deployed-resources.json` conservan los recursos medidos.

[mesh.ts](../scripts/graph/mesh.ts) valida `MeshDataset` v1 y resta cada serie antes de agrupar por workloads/namespaces/versiones. Rechaza resets detectados del contador; hay que volver a capturar una baseline tras reiniciar workloads. No usa proximidad temporal ni nombres similares para resolver código. Exige namespace, versión, revisión del repositorio y selector único de catálogo; incompatibilidad o ambigüedad dejan `pending` sin enlace a código/arista.

`DiscoveryArchive.meshDataset` conserva el dato bruto; `GraphSnapshotV2.mesh` añade una comparación por comunicación/ventana, sin añadir/eliminar nodos ni aristas estáticas. `observationsHash` cubre `{traces, mesh}` cuando hay mesh; sin mesh conserva la identidad G7. Publicar/cargar un archivo vuelve a validar el hash y la correlación. Overlays conservan los contadores y revisan los enlaces contra la nueva revisión; no reducen la selección de tests por ausencia de tráfico. `GET /api/snapshots/:id/mesh` devuelve solo datos de un archivo validado, sin aceptar rutas de archivos del navegador.

`MESH_DATASET_PATH=<mesh.json> pnpm dev` importa un dataset desde una ruta de configuración del servidor. Debe combinarse con la revisión de código y `INVENTORY_ROOT` originales para correlación completa. Sin la fuente/revisión externa, Inventory queda pendiente. Para inspeccionar una medición ya terminada, preferir `mesh:inspect <UUID>`, que lee bytes archivados.

## Ventanas y límites

La aceptación hace un warmup, crea seis pedidos mediante frontend → Orders API → Inventory y verifica ambos efectos persistidos desde dentro de los pods consumidores. Después consulta seis veces el pedido guardado mediante frontend → Orders API. Esa lectura no vuelve a consultar Inventory: el contador queda estable mientras la dependencia declarada/estática sigue presente. Se espera a que los scrapes de Prometheus reflejen el tráfico; los límites son ventanas de contadores muestreados, no timestamps individuales por solicitud.

La arista estática comparada es la existente `invokes-endpoint` de InventoryClient al contrato Inventory v1. Otras relaciones solo declaran configuración o comunicación de workloads. Los anchors de código de los bindings son declaraciones explícitas de despliegue; un sidecar no descubre qué función se ejecutó. TCP incluye protocolo AMQP, acknowledgements/heartbeats y conexiones: no permite identificar evento, suscripción, handler ni éxito de negocio. La presencia de efectos se comprueba por separado en aceptación, sin convertir bytes en aristas `publishes`/`subscribes`/`processes`.

No hay cobertura universal, retención automática de archivos/métricas ni despliegue externo. No observar una dependencia no demuestra que sea innecesaria. Istio/Kiali pueden mostrar tasas históricas del intervalo de su gráfico, que difieren de los deltas discretos archivados. Se conserva el aviso previo de tamaño del bundle Monaco y SQLite experimental.
