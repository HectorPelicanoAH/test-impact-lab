ARG RUNTIME_IMAGE
FROM ${RUNTIME_IMAGE}
WORKDIR /inventory
COPY src src
COPY contract contract
ENV IMPACT_MESH_NAMESPACE=impact-g8 INVENTORY_PORT=3003
CMD ["node", "--experimental-strip-types", "src/main.ts"]
