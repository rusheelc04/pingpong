# Build everything once, then run the production server from the compiled workspace output.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/server/package.json apps/server/package.json
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev

COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages/shared/dist packages/shared/dist

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD sh -c 'wget -qO- "http://localhost:${PORT:-3001}/api/healthz" || exit 1'
CMD ["npm", "start"]
