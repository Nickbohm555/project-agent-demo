#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not found on PATH."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose is required but not available."
  exit 1
fi

echo "Ensuring containers are up..."
docker compose up -d --build app

sleep 2
if ! docker compose ps --status=running | grep -q "app"; then
  echo "Container app is not running. Recent logs:"
  docker compose logs --tail=50 app || true
  exit 1
fi

echo "Configuring git identity inside container..."
read -r -p "Git user.name: " GIT_NAME
read -r -p "Git user.email: " GIT_EMAIL
if [[ -z "${GIT_NAME}" || -z "${GIT_EMAIL}" ]]; then
  echo "Git name/email cannot be empty."
  exit 1
fi

echo "Configuring git credential helper inside container..."
docker compose exec app git config --global credential.helper "!/usr/bin/gh auth git-credential"

docker compose exec app git config --global user.name "${GIT_NAME}"
docker compose exec app git config --global user.email "${GIT_EMAIL}"

echo "Logging in to GitHub inside container (one-time)..."
docker compose exec app /usr/bin/gh auth login -h github.com

echo "Verifying GitHub auth..."
docker compose exec app /usr/bin/gh auth status

echo "Done."
