FROM mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN chmod +x docker-start.sh

EXPOSE 5173 8787

CMD ["./docker-start.sh"]

