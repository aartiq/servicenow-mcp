FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# Install ALL deps (the build needs typescript/tsc); pruned to production after build.
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
