# syntax=docker/dockerfile:1
# Build with: docker build -t builder-run .
FROM node:24-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global vite-plus@0.3.0

WORKDIR /app/builder.run
ENV PATH=/app/builder.run/node_modules/.bin:$PATH
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vite.config.ts ./
COPY src ./src
COPY static ./static
RUN vp install --frozen-lockfile
ENV VITE_DEPLOYMENT=server
RUN vp run build:server

FROM node:24-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app/builder.run
COPY --from=build /app/builder.run/node_modules ./node_modules
COPY --from=build /app/builder.run/package.json ./package.json
COPY --from=build /app/builder.run/build ./build
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME /data
CMD ["node", "build/index.js"]
