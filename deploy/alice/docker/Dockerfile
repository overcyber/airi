# syntax=docker/dockerfile:1
#
# Images of the Alice deployment (Plan 05). The build context is the root of the monorepo.
#
#   web        AIRI stage-web, offline build, served by Nginx on HTTP and HTTPS.
#   companion  The alice-companion service, one instance per data volume.
#
# Build with Compose: `docker compose -f deploy/alice/compose.yaml build`.

# The build image has gcc, make, python3, and git for native modules. The runtime image is small.
ARG BUILD_IMAGE=node:26-trixie
ARG NODE_IMAGE=node:26-trixie-slim
ARG NGINX_IMAGE=nginx:1.30-alpine

# Workspace with the dependencies of the lockfile.
FROM ${BUILD_IMAGE} AS workspace
# NOTICE:
# The Node 25 and later images have no corepack, so `corepack enable` fails with "not found".
# Source: node:26-trixie has /usr/local/bin/npm and no corepack.
# Removal condition: none while the base image has no corepack.
# The build passed with pnpm 12.16.1 and with 11.24.0 (`packageManager` of the root package.json).
ARG PNPM_VERSION=12.16.1
RUN npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app
ENV pnpm_config_store_dir=/root/.pnpm-store
ENV CI=true

# Only the lockfile decides this layer, so a source change does not download the dependencies again.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches/ ./patches/
RUN --mount=type=cache,id=alice-pnpm-store,target=/root/.pnpm-store \
  pnpm fetch

COPY . .
RUN --mount=type=cache,id=alice-pnpm-store,target=/root/.pnpm-store \
  pnpm install --frozen-lockfile --offline

# Offline build of the web app: no cloud feature flags, no analytics, local fonts.
FROM workspace AS web-build

ARG VITE_AIRI_OFFLINE=true
ARG VITE_ENABLE_ANALYTICS=false
ENV VITE_AIRI_OFFLINE=${VITE_AIRI_OFFLINE}
# The Nginx of the `web` image forwards /proxy/nvidia/, /proxy/llm/, /proxy/tts/, /proxy/stt/, and /mqtt.
ENV VITE_AIRI_PROXY=true
ENV VITE_ENABLE_ANALYTICS=${VITE_ENABLE_ANALYTICS}
ENV NODE_OPTIONS=--max-old-space-size=8192

RUN pnpm -F @proj-airi/stage-web run build

# Companion with its production dependencies only.
FROM workspace AS companion-build

# NOTICE:
# A deploy installs one package, so the workspace patches of other packages are unused, and
# pnpm stops with ERR_PNPM_UNUSED_PATCH. Source: patchedDependencies in pnpm-workspace.yaml.
# Removal condition: pnpm deploy ignores patches of packages outside the deployed package.

RUN pnpm --config.allow-unused-patches=true --filter @proj-airi/alice-companion deploy --prod --legacy /out

# Avatar tools: converts the Eva GLB of TalkingHead to VRM (scripts/preparar.sh runs it).
# Only the converter and tsx, which is a dev dependency, so the deploy keeps dev dependencies.
FROM workspace AS tools-build

RUN pnpm --config.allow-unused-patches=true --filter @proj-airi/alice-avatar-tools deploy --legacy /out

FROM ${NODE_IMAGE} AS tools

WORKDIR /app
COPY --from=tools-build /out ./
USER node
ENTRYPOINT ["node_modules/.bin/tsx", "src/cli.ts"]

FROM ${NGINX_IMAGE} AS web

COPY --from=web-build /app/apps/stage-web/dist /usr/share/nginx/html
COPY deploy/alice/docker/nginx/templates/ /etc/nginx/templates/
COPY --chmod=755 deploy/alice/docker/nginx/40-airi-setup.sh /docker-entrypoint.d/40-airi-setup.sh

# Defaults. Compose sets them from `.env`.
ENV AIRI_MQTT_WS_UPSTREAM=host.docker.internal:9001
ENV AIRI_LLM_UPSTREAM=http://host.docker.internal:11434
ENV AIRI_TTS_UPSTREAM=http://host.docker.internal:8880
ENV AIRI_STT_UPSTREAM=http://host.docker.internal:9100
ENV AIRI_STT_TRANSCRIBE_PATH=/v1/audio/transcriptions
ENV NEOALICE_API_UPSTREAM=http://host.docker.internal:8080

EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

FROM ${NODE_IMAGE} AS companion

WORKDIR /app
COPY --from=companion-build /out ./
COPY --chmod=755 deploy/alice/docker/companion-entrypoint.sh /usr/local/bin/companion-entrypoint.sh

ENV NODE_ENV=production
ENV ALICE_COMPANION_DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

ENTRYPOINT ["/usr/local/bin/companion-entrypoint.sh"]
CMD ["node_modules/.bin/tsx", "src/bin/run.ts"]
