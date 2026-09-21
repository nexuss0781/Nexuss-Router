FROM node:22-bookworm-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV RENDER_DATA_DIR=/var/data/omniroute

COPY --from=builder --chown=node:node /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/render ./render
COPY --from=builder --chown=node:node /app/next.config.mjs ./next.config.mjs

RUN mkdir -p /var/data/omniroute && chown -R node:node /var/data/omniroute
USER node
EXPOSE 10000

CMD ["npm", "run", "render:start"]
