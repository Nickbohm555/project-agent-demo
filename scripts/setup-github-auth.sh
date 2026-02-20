#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENABLE_WHATSAPP_GATEWAY="false"
WHATSAPP_PROVIDER="baileys"
WHATSAPP_AUTH_DIR="/app/.whatsapp-auth"
WHATSAPP_PRINT_QR="true"
WHATSAPP_SELF_CHAT_MODE="false"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not found on PATH."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose is required but not available."
  exit 1
fi

echo "Optional: configure WhatsApp gateway for this run."
read -r -p "Enable WhatsApp gateway now? [y/N]: " ENABLE_WA_INPUT
ENABLE_WA_INPUT="${ENABLE_WA_INPUT:-N}"
ENABLE_WA_LOWER="$(printf '%s' "$ENABLE_WA_INPUT" | tr '[:upper:]' '[:lower:]')"
if [[ "$ENABLE_WA_LOWER" == "y" || "$ENABLE_WA_LOWER" == "yes" ]]; then
  ENABLE_WHATSAPP_GATEWAY="true"
  read -r -p "Provider (baileys/cloud-api) [baileys]: " WA_PROVIDER_INPUT
  WA_PROVIDER_INPUT="${WA_PROVIDER_INPUT:-baileys}"
  if [[ "$WA_PROVIDER_INPUT" == "baileys" || "$WA_PROVIDER_INPUT" == "cloud-api" ]]; then
    WHATSAPP_PROVIDER="$WA_PROVIDER_INPUT"
  else
    echo "Invalid provider: $WA_PROVIDER_INPUT"
    exit 1
  fi

  if [[ "$WHATSAPP_PROVIDER" == "baileys" ]]; then
    read -r -p "Auth dir inside container [/app/.whatsapp-auth]: " WA_AUTH_DIR_INPUT
    WHATSAPP_AUTH_DIR="${WA_AUTH_DIR_INPUT:-/app/.whatsapp-auth}"
    # Always print QR so the user can scan it directly in the terminal
    WHATSAPP_PRINT_QR="true"
    read -r -p "Enable self-chat mode (message yourself)? [y/N]: " WA_SELF_CHAT_INPUT
    WA_SELF_CHAT_INPUT="${WA_SELF_CHAT_INPUT:-N}"
    WA_SELF_CHAT_LOWER="$(printf '%s' "$WA_SELF_CHAT_INPUT" | tr '[:upper:]' '[:lower:]')"
    if [[ "$WA_SELF_CHAT_LOWER" == "y" || "$WA_SELF_CHAT_LOWER" == "yes" ]]; then
      WHATSAPP_SELF_CHAT_MODE="true"
    fi
  fi
fi

# ── Phase 1: Start container WITHOUT WhatsApp so we can do git/GitHub setup ──
echo "Starting container (WhatsApp disabled for initial setup)..."
PI_ENABLE_WHATSAPP_GATEWAY="false" \
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

# ── Phase 2: Restart with WhatsApp enabled so QR appears fresh ──
if [[ "$ENABLE_WHATSAPP_GATEWAY" == "true" ]]; then
  echo ""
  echo "Git/GitHub setup complete. Restarting container with WhatsApp gateway enabled..."
  PI_ENABLE_WHATSAPP_GATEWAY="$ENABLE_WHATSAPP_GATEWAY" \
  PI_WHATSAPP_PROVIDER="$WHATSAPP_PROVIDER" \
  PI_WHATSAPP_AUTH_DIR="$WHATSAPP_AUTH_DIR" \
  PI_WHATSAPP_PRINT_QR="$WHATSAPP_PRINT_QR" \
  PI_WHATSAPP_SELF_CHAT_MODE="$WHATSAPP_SELF_CHAT_MODE" \
  docker compose up -d app

  sleep 2
  if ! docker compose ps --status=running | grep -q "app"; then
    echo "Container app is not running after restart. Recent logs:"
    docker compose logs --tail=50 app || true
    exit 1
  fi

  echo ""
  echo "WhatsApp gateway config:"
  echo "  PI_ENABLE_WHATSAPP_GATEWAY=$ENABLE_WHATSAPP_GATEWAY"
  echo "  PI_WHATSAPP_PROVIDER=$WHATSAPP_PROVIDER"
  echo "  PI_WHATSAPP_AUTH_DIR=$WHATSAPP_AUTH_DIR"
  echo "  PI_WHATSAPP_PRINT_QR=$WHATSAPP_PRINT_QR"
  echo "  PI_WHATSAPP_SELF_CHAT_MODE=$WHATSAPP_SELF_CHAT_MODE"

  if [[ "$WHATSAPP_PROVIDER" == "baileys" && "$WHATSAPP_PRINT_QR" == "true" ]]; then
    echo ""
    echo "Waiting for WhatsApp QR code — scan it with your phone (Ctrl+C to stop)..."
    echo ""
    # Use --no-log-prefix if supported, fall back to plain -f otherwise
    if docker compose logs --no-log-prefix --help >/dev/null 2>&1; then
      docker compose logs -f --no-log-prefix app
    else
      docker compose logs -f app 2>&1 | sed 's/^[^ ]* | //'
    fi
  else
    echo "Done."
  fi
else
  echo ""
  echo "Done. WhatsApp gateway is disabled."
fi
