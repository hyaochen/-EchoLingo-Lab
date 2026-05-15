# ---------- Builder stage ----------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/seedData.ts ./src/seedData.ts
COPY --from=builder /app/index.html ./index.html
COPY --from=builder /app/vite.config.ts ./vite.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY docker-start.sh ./docker-start.sh
RUN chmod +x docker-start.sh

EXPOSE 5173 8787

CMD ["./docker-start.sh"]
