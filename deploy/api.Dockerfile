# api / worker 共通イメージ。TypeScript は Node 24 の型ストリップで直接実行する。
FROM node:24-alpine

RUN apk add --no-cache ffmpeg tini

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY shared ./shared
COPY server/src ./server/src
COPY server/drizzle ./server/drizzle

RUN mkdir -p /data/audio && chown node:node /data/audio
USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/main.ts"]
