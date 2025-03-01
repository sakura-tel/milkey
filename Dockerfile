FROM node:18.20.7-bullseye AS builder

ENV NODE_ENV=production
WORKDIR /misskey

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential

COPY package.json yarn.lock ./
RUN yarn install
COPY . ./
RUN yarn build


FROM node:18.20.7-bullseye-slim AS runner

WORKDIR /misskey

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
 ffmpeg tini curl wget libjemalloc-dev libjemalloc2 \
 && ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so \
 && apt-get -y clean \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /misskey/node_modules ./node_modules
COPY --from=builder /misskey/built ./built
COPY . ./

ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so
ENV NODE_ENV=production
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "migrateandstart"]
