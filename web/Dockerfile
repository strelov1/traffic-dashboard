FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Without this corepack blocks on a confirmation prompt when it fetches pnpm.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
# Vite inlines this at build time, so the API origin is fixed in the image. It
# must be the origin the browser can reach, not the one the API container has.
ARG VITE_API_ORIGIN=http://localhost:3000
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY web web
RUN pnpm --filter @derq/web build

FROM nginx:1.29-alpine AS runtime
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
