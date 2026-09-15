# Built from the repository root so the single workspace lockfile is used:
#   docker build -f tools/monobank-mock/Dockerfile .

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY tools/monobank-mock/package.json tools/monobank-mock/
RUN npm ci --workspace tools/monobank-mock --include-workspace-root
COPY tools/monobank-mock/ tools/monobank-mock/
RUN npm run build --workspace tools/monobank-mock

# No runtime dependencies: the server uses node:http only.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/tools/monobank-mock/dist dist
COPY --from=build /app/tools/monobank-mock/fixtures fixtures
USER node
EXPOSE 8081
CMD ["node", "dist/main.js"]
