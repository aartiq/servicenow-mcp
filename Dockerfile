FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
