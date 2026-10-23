# syntax=docker/dockerfile:1.7
# ---- build stage: Node 22, reproducible install, production bundle ------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY angular.json tsconfig.json tsconfig.app.json .postcssrc.json ./
COPY public ./public
COPY src ./src
RUN npx ng build --configuration production

# ---- runtime stage: unprivileged nginx serving static files and proxying the API -----------
FROM nginxinc/nginx-unprivileged:1.27-alpine
LABEL org.opencontainers.image.title="trade-capture-terminal"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/blotter/browser /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
