#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="${GIT_CONFIG_GLOBAL:-/root/.config/git/config}"

if ! git config --global --get credential.helper >/dev/null 2>&1; then
  git config --global credential.helper "!/usr/bin/gh auth git-credential"
fi

env_flag() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

if env_flag "${PI_ENABLE_WHATSAPP_GATEWAY:-false}"; then
  provider="$(printf '%s' "${PI_WHATSAPP_PROVIDER:-baileys}" | tr '[:upper:]' '[:lower:]')"
  if [[ "$provider" != "baileys" && "$provider" != "cloud-api" ]]; then
    echo "[entrypoint] Invalid PI_WHATSAPP_PROVIDER=$provider (expected baileys|cloud-api)" >&2
    exit 1
  fi

  if [[ "$provider" == "baileys" ]]; then
    auth_dir="${PI_WHATSAPP_AUTH_DIR:-/app/.whatsapp-auth}"
    mkdir -p "$auth_dir"
    echo "[entrypoint] WhatsApp gateway (baileys) enabled."
    echo "[entrypoint] Baileys auth dir: $auth_dir"
    if env_flag "${PI_WHATSAPP_PRINT_QR:-true}"; then
      echo "[entrypoint] QR printing is enabled; scan in WhatsApp Linked Devices on first connect."
    fi
  fi

  if [[ "$provider" == "cloud-api" ]]; then
    missing_vars=()
    for required_var in WHATSAPP_ACCESS_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_VERIFY_TOKEN; do
      if [[ -z "${!required_var:-}" ]]; then
        missing_vars+=("$required_var")
      fi
    done

    if env_flag "${WHATSAPP_WEBHOOK_VALIDATE_SIGNATURE:-true}" && [[ -z "${WHATSAPP_APP_SECRET:-}" ]]; then
      missing_vars+=("WHATSAPP_APP_SECRET")
    fi

    if [[ "${#missing_vars[@]}" -gt 0 ]]; then
      echo "[entrypoint] WhatsApp gateway (cloud-api) enabled but missing required env vars: ${missing_vars[*]}" >&2
      exit 1
    fi

    echo "[entrypoint] WhatsApp gateway (cloud-api) env validation passed."
  fi
fi

exec "$@"
