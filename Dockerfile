# syntax=docker/dockerfile:1
# Duas imagens a partir do mesmo monorepo:
#   --target app  API, ETL e migrações (rodam com tsx, como no Render)
#   --target web  front Next.js em modo standalone

# ---- dependências de API, ETL e banco (sem o front) ----
FROM node:22-alpine AS server-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/etl/package.json apps/etl/
COPY packages/db/package.json packages/db/
RUN npm ci --workspace @econ/api --workspace @econ/etl --workspace @econ/db

# ---- app: API, ETL e migrações ----
FROM server-deps AS app
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY apps/etl apps/etl
COPY packages/db packages/db
ENV NODE_ENV=production
USER node
EXPOSE 3333
CMD ["npm", "run", "start", "-w", "@econ/api"]

# ---- build do front ----
FROM node:22-alpine AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @econ/web
COPY tsconfig.base.json ./
COPY apps/web apps/web
# O Next embute NEXT_PUBLIC_* no bundle em tempo de build: é o endereço da API visto pelo navegador.
ARG NEXT_PUBLIC_API_URL=http://localhost:3333
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @econ/web

# ---- web: só o necessário para servir ----
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
