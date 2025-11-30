###### Builder
FROM node:20-bookworm AS build

WORKDIR /app

COPY package*.json ./
# npm ci is strict about lockfile type; use install to avoid yarn.lock conflicts
RUN npm install

COPY . .
RUN npm run build

###### Runtime
FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV TMP_DIR=/app/tmp

COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
RUN npm install --omit=dev
RUN mkdir -p "$TMP_DIR"

CMD ["node", "dist/index.js"]
