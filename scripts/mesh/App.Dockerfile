ARG RUNTIME_IMAGE
FROM ${RUNTIME_IMAGE}
WORKDIR /app
COPY apps/backend/dist apps/backend/dist
COPY apps/notifications/dist apps/notifications/dist
COPY apps/preparation/dist apps/preparation/dist
COPY apps/frontend/dist apps/frontend/dist
COPY scripts/mesh/frontend.mjs scripts/mesh/frontend.mjs
ENV DATA_DIR=/data IMPACT_MESH_NAMESPACE=impact-g8
CMD ["node", "apps/backend/dist/main.js"]
