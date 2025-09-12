#!/usr/bin/env bash
# Quick deploy script for Synap (Scheme A: Docker + Compose + Caddy + Watchtower)
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/soaringjerry/Synap/main/scripts/quick-deploy.sh | bash -s -- \
#     --owner your-gh-username --channel dev --domain synap.example.com --email you@example.com --dir /opt/synap

set -euo pipefail

OWNER="soaringjerry"
CHANNEL="latest"   # dev|latest|<tag>
DOMAIN=""
EMAIL=""
TARGET_DIR="/opt/synap"
PORT="8080"         # host port when not using caddy (backend -> 8080)
FRONT_PORT="5173"   # host port for frontend dev server (maps -> 5173)
WATCH_INTERVAL="300" # seconds for Watchtower polling
EDGE="caddy"        # caddy|none (none = expose 127.0.0.1:$PORT)

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--owner) OWNER="$2"; shift 2 ;;
    -c|--channel) CHANNEL="$2"; shift 2 ;;
    -d|--domain) DOMAIN="$2"; shift 2 ;;
    -e|--email) EMAIL="$2"; shift 2 ;;
    --dir) TARGET_DIR="$2"; shift 2 ;;
    -p|--port) PORT="$2"; shift 2 ;;
    --edge) EDGE="$2"; shift 2 ;;
    --front-port) FRONT_PORT="$2"; shift 2 ;;
    --watch-interval) WATCH_INTERVAL="$2"; shift 2 ;;
    -h|--help)
      echo "Options: --owner <ghcr-owner> --channel <dev|latest|tag> --domain <host> --email <email> --dir <path>";
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "[synap] owner=$OWNER channel=$CHANNEL domain=${DOMAIN:-<none>} edge=$EDGE port=$PORT front-port=$FRONT_PORT watch-interval=${WATCH_INTERVAL}s target=$TARGET_DIR"

need_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "Please run as root (use sudo)." >&2
    exit 1
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    echo "[synap] docker found: $(docker --version)"; return
  fi
  echo "[synap] installing docker via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
}

ensure_compose() {
  if docker compose version >/dev/null 2>&1; then
    echo "[synap] docker compose available"; return
  fi
  echo "[synap] installing docker compose plugin..."
  local dest="/usr/local/lib/docker/cli-plugins/docker-compose"
  mkdir -p "$(dirname "$dest")"
  local uname_s=$(uname -s)
  local uname_m=$(uname -m)
  curl -L "https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-${uname_s}-${uname_m}" -o "$dest"
  chmod +x "$dest"
}

prepare_files() {
  mkdir -p "$TARGET_DIR"
  cd "$TARGET_DIR"

  # Decide image
  local image synap_tag
  if [[ "$CHANNEL" == "dev" ]]; then
    image="ghcr.io/${OWNER}/synap-dev"; synap_tag="latest"
  else
    image="ghcr.io/${OWNER}/synap"; synap_tag="$CHANNEL"
  fi

  cat > .env <<EOF
GHCR_OWNER=${OWNER}
SYNAP_IMAGE=${image}
SYNAP_TAG=${synap_tag}
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
WATCH_INTERVAL=${WATCH_INTERVAL}
PORT=${PORT}
FRONT_PORT=${FRONT_PORT}
EOF

  # Write compose file
  if [[ "$EDGE" == "caddy" ]]; then
    cat > docker-compose.yml <<'YAML'
name: synap

services:
  synap:
    image: ${SYNAP_IMAGE:-ghcr.io/${GHCR_OWNER:-soaringjerry}/synap}:${SYNAP_TAG:-latest}
    env_file: .env
    environment:
      - SYNAP_ADDR=:8080
      - SYNAP_DB_PATH=/data/synap.db
      - SYNAP_STATIC_DIR=/public
    volumes:
      - synap-data:/data
    restart: unless-stopped
    labels:
      - com.centurylinklabs.watchtower.enable=true

  caddy:
    image: caddy:2-alpine
    env_file: .env
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - synap
    restart: unless-stopped
    labels:
      - com.centurylinklabs.watchtower.enable=true

  watchtower:
    image: containrrr/watchtower:latest
    command: --interval ${WATCH_INTERVAL:-300} --cleanup --label-enable
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped

volumes:
  synap-data:
  caddy-data:
  caddy-config:
YAML
  else
    # EDGE=none: expose backend to 127.0.0.1:$PORT and (optionally) frontend dev to 127.0.0.1:$FRONT_PORT
    cat > docker-compose.yml <<'YAML'
name: synap

services:
  synap:
    image: ${SYNAP_IMAGE:-ghcr.io/${GHCR_OWNER:-soaringjerry}/synap}:${SYNAP_TAG:-latest}
    env_file: .env
    environment:
      - SYNAP_ADDR=:8080
      - SYNAP_DB_PATH=/data/synap.db
      - SYNAP_STATIC_DIR=/public
    ports:
      - "127.0.0.1:${PORT}:8080"
      - "127.0.0.1:${FRONT_PORT}:5173"
    volumes:
      - synap-data:/data
    restart: unless-stopped
    labels:
      - com.centurylinklabs.watchtower.enable=true

  watchtower:
    image: containrrr/watchtower:latest
    command: --interval ${WATCH_INTERVAL:-300} --cleanup --label-enable
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped

volumes:
  synap-data:
YAML
  fi

  # Caddyfile (only if caddy edge)
  if [[ "$EDGE" == "caddy" ]]; then
    cat > Caddyfile <<'CADDY'
{
  email {$EMAIL}
}

{$DOMAIN} {
  encode zstd gzip
  reverse_proxy synap:8080
}

:80 {
  encode zstd gzip
  reverse_proxy synap:8080
}
CADDY
  fi
}

bring_up() {
  cd "$TARGET_DIR"
  echo "[synap] pulling images..."
  docker compose pull || true
  echo "[synap] starting stack..."
  docker compose up -d
  echo "[synap] stack is up. Health: http://${DOMAIN:-localhost}/health"
}

main() {
  need_root
  install_docker
  ensure_compose
  prepare_files
  bring_up
}

main "$@"
