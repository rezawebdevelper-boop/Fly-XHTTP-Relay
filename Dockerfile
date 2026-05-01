# ── Build stage (install deps if any added later) ──────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
# No external runtime dependencies — skip npm install
# (add "RUN npm ci --omit=dev" here if you add packages later)

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=base /app/package.json ./
COPY src/ ./src/

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]
