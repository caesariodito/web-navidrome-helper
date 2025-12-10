# syntax=docker/dockerfile:1

FROM node:20-bullseye AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ .
RUN npm run build

FROM node:20-bullseye AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev

FROM node:20-bullseye AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY server ./server
COPY --from=web-build /app/web/dist ./web/dist
EXPOSE 5000
WORKDIR /app/server
CMD ["node", "src/index.js"]
