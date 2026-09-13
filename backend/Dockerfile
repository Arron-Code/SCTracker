FROM node:22-alpine AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json backend/eslint.config.js ./
COPY backend/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY backend/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
