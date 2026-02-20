FROM node:22-bookworm-slim

WORKDIR /app

ARG CODEX_CLI_VERSION=0.104.0

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

# Native build deps for packages like @lydell/node-pty on Linux.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates openssl \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex@${CODEX_CLI_VERSION}

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 43217 43218

CMD ["pnpm", "dev"]
