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
WEB_PORT="3000"     # host port for Next.js web when EDGE=none
FRONT_PORT="5173"   # legacy dev server port (kept for compatibility)
WATCH_INTERVAL="60"  # seconds for Watchtower polling (default dev-friendly)
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
    --web-port) WEB_PORT="$2"; shift 2 ;;
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
  local image web_image synap_tag
  if [[ "$CHANNEL" == "dev" ]]; then
    image="ghcr.io/${OWNER}/synap-backend"; synap_tag="latest"
  else
    image="ghcr.io/${OWNER}/synap-backend"; synap_tag="$CHANNEL"
  fi
  web_image="ghcr.io/${OWNER}/synap-web:${synap_tag}"

  # Dev frontend URL (in-container) for proxying / to Vite dev server
  local dev_front_url=""
  if [[ "$CHANNEL" == "dev" ]]; then
    dev_front_url="http://127.0.0.1:5173"
  fi

  cat > .env <<EOF
GHCR_OWNER=${OWNER}
SYNAP_IMAGE=${image}
SYNAP_TAG=${synap_tag}
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
WATCH_INTERVAL=${WATCH_INTERVAL}
# Backend and Web host ports (used by compose only)
BACKEND_PORT=${PORT}
WEB_PORT=${WEB_PORT}
FRONT_PORT=${FRONT_PORT}
DEV_FRONTEND_URL=${dev_front_url}
WEB_IMAGE=${web_image}
BACKEND_IMAGE=${image}:${synap_tag}
EOF

  # Write compose file
  if [[ "$EDGE" == "caddy" ]]; then
    cat > docker-compose.yml <<'YAML'
name: synap

services:
  synap:
    image: ${BACKEND_IMAGE}
    env_file: .env
    environment:
      - SYNAP_ADDR=:8080
      - SYNAP_DB_PATH=/data/synap.db
      - SYNAP_STATIC_DIR=
      - SYNAP_DEV_FRONTEND_URL=
    volumes:
      - synap-data:/data
    restart: unless-stopped
    labels:
      - com.centurylinklabs.watchtower.enable=true

  web:
    image: ${WEB_IMAGE}
    env_file: .env
    environment:
      - NODE_ENV=production
      # Force Next.js to listen on 3000 in-container regardless of other vars
      - PORT=3000
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
      - web
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
    image: ${BACKEND_IMAGE}
    env_file: .env
    environment:
      - SYNAP_ADDR=:8080
      - SYNAP_DB_PATH=/data/synap.db
      - SYNAP_STATIC_DIR=
      - SYNAP_DEV_FRONTEND_URL=
    ports:
      - "127.0.0.1:${BACKEND_PORT}:8080"
    volumes:
      - synap-data:/data
    restart: unless-stopped
    labels:
      - com.centurylinklabs.watchtower.enable=true

  web:
    image: ${WEB_IMAGE}
    env_file: .env
    environment:
      - NODE_ENV=production
      - PORT=3000
    ports:
      - "127.0.0.1:${WEB_PORT}:3000"
    restart: unless-stopped

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
  # Global no-store headers (in addition to Next/Go responses)
  header Cache-Control "no-store, no-cache, must-revalidate, max-age=0"
  header Pragma "no-cache"
  header Expires "0"
  @api path /api*
  route @api {
    reverse_proxy synap:8080
  }
  route {
    reverse_proxy web:3000
  }
}

:80 {
  encode zstd gzip
  header Cache-Control "no-store, no-cache, must-revalidate, max-age=0"
  header Pragma "no-cache"
  header Expires "0"
  @api path /api*
  route @api {
    reverse_proxy synap:8080
  }
  route {
    reverse_proxy web:3000
  }
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
