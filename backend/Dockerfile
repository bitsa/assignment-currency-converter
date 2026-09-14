# Built from the repository root so the single workspace lockfile is used:
#   docker build -f backend/Dockerfile .

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json backend/
RUN npm ci --workspace backend --include-workspace-root
COPY backend/ backend/
RUN npm run build --workspace backend

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
RUN npm ci --workspace backend --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
USER node
WORKDIR /app/backend
EXPOSE 3000
# Run node directly: npm would print non-JSON banner lines to stdout.
CMD ["node", "dist/main.js"]
