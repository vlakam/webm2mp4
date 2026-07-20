###### Builder
FROM node:20-bookworm AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

###### Runtime
FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV TMP_DIR=/app/tmp
ENV CACHE_DB_PATH=/app/data/cache.db

COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json /app/yarn.lock ./
RUN yarn install --frozen-lockfile --production=true
RUN mkdir -p "$TMP_DIR" /app/data

CMD ["node", "dist/index.js"]
