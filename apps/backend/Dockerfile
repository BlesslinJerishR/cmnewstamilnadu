# Backend image (API and worker share it; the compose command picks the entrypoint).
# Build from the repository root:  docker build -f apps/backend/Dockerfile -t cmnews-backend .

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN npm ci --workspace packages/shared --workspace apps/backend --include-workspace-root=false
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN npm run build -w packages/shared && npm run build -w apps/backend \
 && npm prune --omit=dev --workspace apps/backend --include-workspace-root=false

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/backend/dist ./dist
COPY --from=build /repo/apps/backend/migrations ./migrations
COPY --from=build /repo/apps/backend/package.json ./package.json
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
