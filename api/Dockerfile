# Build context is the repository root: the lockfile and the workspace manifest
# live there, and pnpm needs both to resolve a workspace package.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Without this corepack blocks on a confirmation prompt when it fetches pnpm.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY api api
RUN pnpm --filter @derq/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --prod --filter @derq/api
COPY --from=build /app/api/dist api/dist
COPY api/migrations api/migrations
USER node
EXPOSE 3000
CMD ["node", "api/dist/index.js"]
