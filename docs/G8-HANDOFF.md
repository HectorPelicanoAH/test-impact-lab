# Traspaso — G8 y siguiente fase

Fecha: 2026-10-06. **G1–G8 completadas**. El último «sigue» autorizó exclusivamente G8. Se preservan cambios locales G7/G8 sin commit/push; sin agentes, cambio automático de modelo ni despliegue externo. **G9 requiere otro «sigue»**, modelo recomendado por la preferencia acordada: **GPT-6 Sol / high**.

Leer [SDD](SDD-DEPENDENCY-GRAPH.md), [estado/evidencias](DEPENDENCY-GRAPH-STATE.md) y [G8 operación/límites](G8-SERVICE-MESH.md). G9 debe completar recorridos de overlays → delta → evidencia → selección → ejecución y auditoría final, sin introducir listas escenario → tests. No confundir bindings de workload/bytes TCP con pruebas de evento/handler ni coverage.

G8 añade un perfil local kind/Kubernetes/Istio/Kiali/Prometheus con seis servicios reales y kubeconfig propio. `pnpm mesh:setup` instala herramientas fijadas con checksums oficiales; `pnpm test:mesh` llama al entrypoint que crea, mide y retira un perfil. `mesh:up/status/check/view/down` admite operación interactiva por UUID. `mesh:inspect <UUID>` abre evidencia/fuentes archivadas incluso tras limpiar el clúster/inventario. El perfil básico no requiere Docker/Kubernetes.

Aceptación final: perfil `db40042e-4b38-4e96-a9f1-64d9a61ad4e5`, snapshot `037fd6b5e06f73b0a2d0b922180b803ea391535c4ce88e44f3ef068fb2becd81`, grafo Kiali real **6 workloads/5 comunicaciones**. Seis pedidos generan **6 consultas Inventory**; seis lecturas generan **0** mientras la dependencia estática persiste. Hay bytes AMQP en ambos consumidores/publicador; no se inventan aristas de eventos. Las seis versiones/revisiones están resueltas. Dataset y comparación se archivan/verifican junto con el hash G7, sin cambiar selección estática.

[Contadores/Kiali/bindings reales](../impact/evidence/g8-mesh.json) y [resumen](../impact/evidence/g8-mesh-summary.json) están versionados. Informes amplios, snapshots y capturas en `.impact-runs/mesh/<UUID>/` quedan locales. `MESH_DATASET_PATH=impact/evidence/g8-mesh.json pnpm dev` importa el dataset, pero Inventory queda pendiente sin su revisión/fuente original. Para una reproducción completa de ese archivo local: `pnpm mesh:inspect db40042e-4b38-4e96-a9f1-64d9a61ad4e5`.

Validación: **185 Vitest/3 Chromium** en `pnpm validate` (5/1 omitidos básicos), **5 integraciones RabbitMQ/4 Chromium** en `test:messaging`, aceptación mesh real exit 0 con limpieza automática y **14 tests focalizados** mesh/network/G7. Grafo estático **368 nodos/531 aristas/430 diagnósticos**; semilla legacy **69/84/39**. Al cierre no quedan clusters kind ni tags de imágenes propios G8. Docker necesitó recuperación en reintentos fallidos; incidencias y recursos retirados constan en el registro, sin contarlos como aceptación.

Límites: contadores muestreados, bindings de código declarados, resets/duplicados rechazados, incompatibilidad de namespace/versión/revisión pendiente; TCP no prueba evento/suscripción/handler ni efecto de negocio. Los archives no tienen retención automática. Continúan SQLite experimental, bundle Monaco y runner local sin sandbox del sistema operativo.

**Fase G8 completada. Para iniciar G9, selecciona GPT-6 Sol / high y escribe «sigue».**
