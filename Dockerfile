# syntax=docker/dockerfile:1
# Build with: docker build --build-context framework=../framework -t builder-run .
FROM node:24-slim AS build
RUN npm install --global vite-plus@0.3.0

# Named context keeps the active sibling checkout usable without publishing packages.
# Copy only build inputs, never either checkout's credentials, data, .workspace or node_modules.
WORKDIR /app/framework
COPY --from=framework package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vite.config.ts ./
COPY --from=framework src ./src
COPY --from=framework packages/http/package.json packages/http/vite.config.ts ./packages/http/
COPY --from=framework packages/http/src ./packages/http/src
COPY --from=framework packages/sqlite/browser/package.json packages/sqlite/browser/vite.config.ts ./packages/sqlite/browser/
COPY --from=framework packages/sqlite/browser/src ./packages/sqlite/browser/src
COPY --from=framework packages/inference/yair/core/package.json packages/inference/yair/core/vite.config.ts ./packages/inference/yair/core/
COPY --from=framework packages/inference/yair/core/src ./packages/inference/yair/core/src
COPY --from=framework packages/inference/yair/providers/openai/package.json packages/inference/yair/providers/openai/vite.config.ts ./packages/inference/yair/providers/openai/
COPY --from=framework packages/inference/yair/providers/openai/src ./packages/inference/yair/providers/openai/src
RUN vp install --frozen-lockfile
ENV PATH=/app/framework/node_modules/.bin:$PATH
RUN vp pack
WORKDIR /app/framework/packages/http
RUN vp run build
WORKDIR /app/framework/packages/sqlite/browser
RUN vp run build
WORKDIR /app/framework/packages/inference/yair/core
RUN vp run build
WORKDIR /app/framework/packages/inference/yair/providers/openai
RUN vp run build

WORKDIR /app/builder.run
ENV PATH=/app/builder.run/node_modules/.bin:$PATH
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vite.config.ts ./
COPY src ./src
COPY static ./static
RUN vp install --frozen-lockfile
ENV VITE_DEPLOYMENT=server
RUN vp build

FROM node:24-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app/builder.run
COPY --from=build /app/framework /app/framework
COPY --from=build /app/builder.run/node_modules ./node_modules
COPY --from=build /app/builder.run/package.json ./package.json
COPY --from=build /app/builder.run/build ./build
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME /data
CMD ["node", "build/index.js"]
