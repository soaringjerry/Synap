# Installation Guide

## Requirements
- Go 1.23+
- Node 20+ and npm
- SQLite 3.x

## Local Setup

```bash
# Clone
git clone https://github.com/soaringjerry/Synap.git
cd Synap

# Backend
go run ./cmd/server

# Frontend
cd frontend
npm ci
npm run dev
```

## Docker / GHCR

See README for image references and one‑click deploy via `scripts/quick-deploy.sh`.

