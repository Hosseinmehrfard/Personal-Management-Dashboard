FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
COPY server ./server
COPY tests ./tests
RUN npm run check && npm run build

FROM node:22-alpine
ARG DASHBOARD_REVISION=
ENV NODE_ENV=production PORT=4173 HOST=0.0.0.0 DASHBOARD_REVISION=${DASHBOARD_REVISION}
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=4s --start-period=40s CMD node -e "fetch('http://127.0.0.1:4173/health').then(x=>process.exit(x.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/index.js"]
