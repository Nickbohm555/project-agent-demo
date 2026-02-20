FROM node:22-bookworm-slim

WORKDIR /app

ARG CODEX_CLI_VERSION=0.104.0

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

# Native build deps for packages like @lydell/node-pty on Linux.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates openssl curl gnupg \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI (gh) for HTTPS auth inside the container.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex@${CODEX_CLI_VERSION}

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 43217 43218

RUN chmod +x /app/docker/entrypoint.sh

ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["pnpm", "dev"]
