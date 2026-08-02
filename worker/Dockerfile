# syntax=docker/dockerfile:1.7
#
# STARR Worker — production container for Hetzner deployment.
#
# Build:
#   docker build -t starr-worker:latest -f worker/Dockerfile worker/
# Run:
#   docker run --env-file worker/.env -p 3100:3100 starr-worker:latest
#
# The Playwright base image bundles the matching Chromium, ffmpeg, and all
# system libs. Pin the version to match the `playwright` dep in package.json
# (currently 1.58.x — bump in lockstep when upgrading).
#
# Multi-stage so the final image excludes dev deps and TypeScript sources.

# ── Stage 1: build TypeScript ────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Install build tooling. node:22-bookworm-slim already includes git/openssl.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Reduce node_modules to production-only after compilation.
RUN npm prune --omit=dev

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
# Playwright's official image. Includes Chromium + matching driver + system libs.
# When bumping `playwright` in package.json, bump this tag in lockstep.
FROM mcr.microsoft.com/playwright:v1.58.2-jammy AS runtime

ENV NODE_ENV=production \
    PORT=3100 \
    PLAYWRIGHT_HEADLESS=true \
    BROWSER_BACKEND=local \
    CAPTCHA_PROVIDER=stub

WORKDIR /app

# Pull in compiled JS + production node_modules from the build stage.
COPY --from=build /app/dist        ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Logs directory used by PM2-style logging if the host wants to mount it.
RUN mkdir -p /app/logs && chown -R pwuser:pwuser /app

# Drop privileges. The Playwright image ships with the `pwuser` non-root user.
USER pwuser

# Deploy identity, surfaced by /healthz so a running container can be matched to a commit.
#   docker build --build-arg BUILD_SHA=$(git rev-parse --short HEAD) …
ARG BUILD_SHA=unknown
ENV BUILD_SHA=${BUILD_SHA}

# Liveness. /healthz now exists (research plan R1 — it did not, and this probe restarted every
# container built from this file, forever). It is deliberately NOT /health: that one launches
# Chromium and calls Supabase on every request, and returns 503 for config-only warnings, so as a
# 30-second probe it would both thrash the host and kill a working worker over a missing
# nice-to-have credential. /healthz answers the narrower question — should this container keep
# running — from a cached browser probe. See src/infra/health.ts.
#
# start-period 90s matches BOOT_GRACE_MS: a cold container reports `starting` (200) until its first
# browser probe lands, so it is never killed mid-boot.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3100)+'/healthz', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

EXPOSE 3100
CMD ["node", "dist/index.js"]
