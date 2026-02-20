#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="${GIT_CONFIG_GLOBAL:-/root/.config/git/config}"

if ! git config --global --get credential.helper >/dev/null 2>&1; then
  git config --global credential.helper "!/usr/bin/gh auth git-credential"
fi

exec "$@"
