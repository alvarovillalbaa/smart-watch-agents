FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/control-plane/package.json services/control-plane/package.json
COPY packages/agent-connector/package.json packages/agent-connector/package.json
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --workspace @watch-agents/control-plane
COPY services/control-plane/src ./services/control-plane/src
COPY contracts ./contracts
COPY scripts/hubctl.mjs ./scripts/hubctl.mjs
USER node
EXPOSE 8787
CMD ["node", "services/control-plane/src/server.mjs"]
