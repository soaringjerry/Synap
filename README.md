# Synap

**Synap** is a modern platform for psychological and behavioral research. It helps researchers design and run surveys, capture insights, and explore new ways of blending traditional methods with AI-driven analysis.

## Features

* **Survey Builder** — customizable questionnaires (not limited to Likert scales)
* **Automated Metrics** — reliability checks such as Cronbach’s α
* **Region-Aware Privacy** — PDPA by default; GDPR/CCPA/PIPL applied when stricter
* **Lightweight & Fast** — Go + TypeScript with SQLite as default storage
* **AI Integration (Planned)** — automated analysis, summarization, adaptive survey design

## Why Synap

* Built for psychology students, researchers, and developers
* Scales from class assignments to full research projects
* Scientific rigor with developer-friendly workflows

## Tech Stack

* **Backend:** Go + SQLite
* **Frontend:** TypeScript + React (Vite)
* **API Contract:** OpenAPI (auto-generated SDKs)

## Getting Started

### Requirements

* Go 1.23+
* Node.js 20+ and npm
* SQLite 3.x

### Clone

```bash
git clone https://github.com/soaringjerry/Synap.git
cd Synap
```

### Backend (Go)

```bash
# Example: run the API server (adjust path if your entrypoint differs)
go run ./cmd/server
```

Environment variables (examples):

```bash
export SYNAP_DB_PATH=./data/synap.db
export SYNAP_ADDR=:8080
```

### Frontend (TypeScript)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Docker (GHCR)

Images (amd64):

- `ghcr.io/soaringjerry/synap-backend` — backend API only
- `ghcr.io/soaringjerry/synap` — fullstack (backend + built frontend static)
- `ghcr.io/soaringjerry/synap-dev` — dev image (backend + frontend dev server)

Run backend-only:

```bash
docker run -d --name synap -p 8080:8080 \
  -e SYNAP_ADDR=:8080 \
  ghcr.io/soaringjerry/synap-backend:latest
```

Run fullstack (serves Web + API on 8080):

```bash
docker run -d --name synap -p 8080:8080 \
  -e SYNAP_ADDR=:8080 \
  ghcr.io/soaringjerry/synap:latest
```

One‑click deploy (Scheme A: Docker + Compose + Caddy + Watchtower):

```bash
# Dev channel (auto‑update)
curl -fsSL https://raw.githubusercontent.com/soaringjerry/Synap/main/scripts/quick-deploy.sh \
  | sudo bash -s -- --channel dev --domain <your-domain> --email you@example.com --dir /opt/synap

# Stable channel (latest)
curl -fsSL https://raw.githubusercontent.com/soaringjerry/Synap/main/scripts/quick-deploy.sh \
  | sudo bash -s -- --channel latest --domain <your-domain> --email you@example.com --dir /opt/synap

Use behind your own Nginx (no Caddy, custom port):

```bash
curl -fsSL https://raw.githubusercontent.com/soaringjerry/Synap/main/scripts/quick-deploy.sh \
  | sudo bash -s -- --channel latest --edge none --port 9000 --dir /opt/synap
# Then in Nginx, proxy_pass http://127.0.0.1:9000;
```

More options in `docs/deploy.md`.

## Configuration

* `SYNAP_DB_PATH` — SQLite database file path (default `./data/synap.db`)
* `SYNAP_ADDR` — server listen address (default `:8080`)
* `SYNAP_REGION_MODE` — privacy mode: `auto` (geo-aware) or `pdpa`/`gdpr`/`ccpa`/`pipl`
* `SYNAP_STATIC_DIR` — when set, backend serves static files from this directory (used by fullstack image)

## Data & Privacy

- Primary storage is in Singapore. Transport is HTTPS/TLS; at-rest encryption configurable.
- We use Cloudflare CDN for performance and security. Requests may pass through edge nodes, but survey/response data resides only in our Singapore origin and is not retained at the edge. Cloudflare may temporarily process limited network metadata (e.g., IP) for routing/security; it is not used for advertising. See Privacy.
- Raw IPs are **not stored** in content data. Only minimal technical logs may be kept for security/quality control.
- GDPR/PDPA alignment: we aim to follow core principles. Controllers remain responsible for lawful basis and data-subject rights.
- See: `/legal/privacy` (website) and `docs/legal/privacy.md`. Terms: `/legal/terms` and `docs/legal/terms.md`.

## Roadmap

* [ ] AI-assisted reliability/validity checks
* [ ] Cognitive/behavioral task support beyond surveys
* [ ] Visualization dashboards (responses, metrics)
* [ ] Team collaboration & roles
* [ ] Export pipelines (CSV, JSON, SPSS/R) and APIs

## Contributing

Contributions are welcome. Please use Conventional Commits (`feat:`, `fix:`, etc.) and ensure lint/tests pass before opening a PR. See `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`.

## License

This project is available for **personal and non-commercial use**.
For **commercial use**, please contact the author for a commercial license.

## Contact

Author: [Jerry](https://github.com/soaringjerry)
Email: *synap@forgotmail.com*

Additional docs: see `docs/ci-cd.md`, `docs/deploy.md`, `docs/i18n.md`.
More docs:
- Installation: `docs/installation.md`
- Quick Start: `docs/quick-start.md`
- API: `docs/api/rest.md`
- Configuration: `docs/configuration.md`
- Architecture: `docs/architecture.md`
- Development: `docs/development.md`
- Testing: `docs/testing.md`
- Roadmap: `ROADMAP.md`
- FAQ: `docs/faq.md`
