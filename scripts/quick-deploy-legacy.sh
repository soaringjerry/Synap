#!/usr/bin/env bash
# Quick deploy (LEGACY FULLSTACK: backend + old Vite static in one image)
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/soaringjerry/Synap/main/scripts/quick-deploy-legacy.sh | bash -s -- \
#     --owner your-gh-username --channel latest --edge none --port 9000 --dir /opt/synap

set -euo pipefail

OWNER="soaringjerry"
CHANNEL="latest"   # dev|latest|<tag>
DOMAIN=""
EMAIL=""
TARGET_DIR="/opt/synap"
PORT="8080"         # host port when not using caddy
WATCH_INTERVAL="60"  # seconds
EDGE="caddy"        # caddy|none

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--owner) OWNER="$2"; shift 2 ;;
    -c|--channel) CHANNEL="$2"; shift 2 ;;
    -d|--domain) DOMAIN="$2"; shift 2 ;;
    -e|--email) EMAIL="$2"; shift 2 ;;
    --dir) TARGET_DIR="$2"; shift 2 ;;
    -p|--port) PORT="$2"; shift 2 ;;
    --edge) EDGE="$2"; shift 2 ;;
    --watch-interval) WATCH_INTERVAL="$2"; shift 2 ;;
    -h|--help) echo "Options: --owner <ghcr-owner> --channel <dev|latest|tag> --domain <host> --email <email> --dir <path> --edge <caddy|none> --port <host-port>"; exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "[synap-legacy] owner=$OWNER channel=$CHANNEL domain=${DOMAIN:-<none>} edge=$EDGE port=$PORT watch-interval=${WATCH_INTERVAL}s target=$TARGET_DIR"

need_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "Please run as root (use sudo)." >&2
    exit 1
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    echo "[synap-legacy] docker found: $(docker --version)"; return
  fi
  echo "[synap-legacy] installing docker via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
}

ensure_compose() {
  if docker compose version >/dev/null 2>&1; then
    echo "[synap-legacy] docker compose available"; return
  fi
  echo "[synap-legacy] installing docker compose plugin..."
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

  local synap_tag image
  if [[ "$CHANNEL" == "dev" ]]; then synap_tag="latest"; else synap_tag="$CHANNEL"; fi
  image="ghcr.io/${OWNER}/synap:${synap_tag}"

  cat > .env <<EOF
GHCR_OWNER=${OWNER}
FULLSTACK_IMAGE=${image}
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
WATCH_INTERVAL=${WATCH_INTERVAL}
BACKEND_PORT=${PORT}
EOF

  if [[ "$EDGE" == "caddy" ]]; then
    cat > docker-compose.yml <<'YAML'
name: synap

services:
  synap:
    image: ${FULLSTACK_IMAGE}
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
    cat > Caddyfile <<'CADDY'
{
  email {$EMAIL}
}

{$DOMAIN} {
  encode zstd gzip
  header Cache-Control "no-store, no-cache, must-revalidate, max-age=0"
  header Pragma "no-cache"
  header Expires "0"
  reverse_proxy synap:8080
}

:80 {
  encode zstd gzip
  header Cache-Control "no-store, no-cache, must-revalidate, max-age=0"
  header Pragma "no-cache"
  header Expires "0"
  reverse_proxy synap:8080
}
CADDY
  else
    cat > docker-compose.yml <<'YAML'
name: synap

services:
  synap:
    image: ${FULLSTACK_IMAGE}
    env_file: .env
    environment:
      - SYNAP_ADDR=:8080
      - SYNAP_DB_PATH=/data/synap.db
      - SYNAP_STATIC_DIR=/public
    ports:
      - "127.0.0.1:${BACKEND_PORT}:8080"
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
}

bring_up() {
  cd "$TARGET_DIR"
  echo "[synap-legacy] pulling images..."
  docker compose pull || true
  echo "[synap-legacy] starting stack..."
  docker compose up -d --remove-orphans
  echo "[synap-legacy] stack is up. Health: http://${DOMAIN:-localhost}/health"
}

main() {
  need_root
  install_docker
  ensure_compose
  prepare_files
  bring_up
}

main "$@"

