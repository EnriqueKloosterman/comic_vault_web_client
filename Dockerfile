# Build
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Runtime: nginx estático + proxy /api al backend
FROM nginx:1.27-alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
EXPOSE 80
