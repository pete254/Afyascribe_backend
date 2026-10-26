# Stage 1: build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: run
FROM node:24-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Uploaded files (docker-compose.yml mounts the `uploads` volume here). Made
# now, owned by `node`, so the volume starts out writable by the application
# and by nothing else.
RUN mkdir -p /data/uploads && chown node:node /data/uploads && chmod 700 /data/uploads

# Run as the image's unprivileged `node` user, not root: a compromise of the
# application should not be a compromise of the container.
USER node

EXPOSE 3000

# The heap ceiling suited Render's 512 MB instance; on the VPS it can be raised
# with NODE_OPTIONS in .env.
CMD ["node", "dist/main"]
