FROM node:24-bookworm-slim
WORKDIR /app
RUN chown node:node /app
USER node
ENV NEXT_TELEMETRY_DISABLED=1

COPY --chown=node:node package.json package-lock.json ./
# TypeScript/tsx are used by migrations and the automation companion at runtime.
RUN npm ci --include=dev && npm cache clean --force
COPY --chown=node:node . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
