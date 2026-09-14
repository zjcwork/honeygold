# Build on the target server so native dependencies match its architecture.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV HONEYGOLD_RUNTIME=node
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HONEYGOLD_RUNTIME=node HONEYGOLD_DATA_DIR=/app/data PORT=3000
ENV TZ=Asia/Shanghai
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "node_modules/vinext/dist/cli.js", "start", "--hostname", "0.0.0.0", "--port", "3000"]
