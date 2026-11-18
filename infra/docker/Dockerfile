# One multi-stage Dockerfile for every Node app in the monorepo.
#   docker build -f infra/docker/Dockerfile --build-arg APP=api -t bizgo-api .
# APP: api | worker | storefront-web | backoffice-web
# NOTE: written for Docker but NOT executed in the authoring environment (Docker unavailable); see README.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY web ./web
COPY backend ./backend
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
ARG APP
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY docs ./docs
RUN pnpm --filter @bizgo/db generate \
 && pnpm --filter @bizgo/shared build \
 && pnpm --filter @bizgo/db build \
 && pnpm --filter @bizgo/${APP} build

FROM base AS runtime
ARG APP
ENV NODE_ENV=production APP=${APP}
COPY --from=build /repo /repo
RUN addgroup -S bizgo && adduser -S bizgo -G bizgo && chown -R bizgo:bizgo /repo
USER bizgo
CMD ["sh", "-c", "pnpm --filter @bizgo/${APP} start"]
