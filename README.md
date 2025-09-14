# Synap

**Synap** is a modern platform for psychological and behavioral research. It helps researchers design and run surveys, capture insights, and explore new ways of blending traditional methods with AI-driven analysis.

## Features

* **Survey Builder** — customizable questionnaires (not limited to Likert scales)
* **Automated Metrics** — reliability checks such as Cronbach’s α
* **Consent & Compliance** — configurable interactive confirmations（Off/Optional/Required 三段式），可选签名；证据哈希存储；GDPR 自助导出/删除；知情同意支持 Markdown 渲染
* **Region-Aware Privacy** — PDPA by default; GDPR/CCPA/PIPL applied when stricter
* **End‑to‑End Encryption** — 端到端加密（创建时开启）；密钥在浏览器生成，私钥不外发；管理端可下载加密包；浏览器内本地解密导出 JSONL/CSV（长/宽），题干为可读文本
* **Lightweight & Fast** — Go + TypeScript with encrypted snapshot storage (DB backends planned)
* **AI Integration (Planned)** — automated analysis, summarization, adaptive survey design

## Why Synap

* Built for psychology students, researchers, and developers
* Scales from class assignments to full research projects
* Scientific rigor with developer-friendly workflows

## Tech Stack

* **Backend:** Go
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
export SYNAP_ENC_KEY=$(openssl rand -base64 32)
export SYNAP_ADDR=:8080
```

### Frontend (TypeScript)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Admin quick path:
- Create Scale → Basics + End‑to‑end Encryption（生成或上传公钥，创建后锁定）+ Consent（版本号、交互式确认、是否需要签名）。Likert 锚点可选择模板（同意/频率 5 点、同意/双极性 7 点、单极性 5 点）或自定义，支持“数字+文字”模式
- Manage Scale → 分享链接；E2EE=ON 时，服务器仅提供加密包下载；明文导出在浏览器本地完成（JSONL/CSV 长宽），题干为 EN/ZH 可读文本；E2EE=OFF 时，服务器 CSV 导出可用

Participant UX:
- 问卷顶部会显示“本问卷已启用端到端加密”的提示：作答在浏览器内加密；除问卷管理方外任何人（包括平台）不可见
- 同意副本支持下载 PDF（浏览器打印）。若浏览器拦截，会自动下载 HTML 作为兜底

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

* `SYNAP_DB_PATH` — Encrypted snapshot file path (default `./data/synap.db`)
* `SYNAP_ENC_KEY` — 32‑byte encryption key (Base64 or raw; required for persistence)
* `SYNAP_ADDR` — server listen address (default `:8080`)
* `SYNAP_REGION_MODE` — privacy mode: `auto` (geo-aware) or `pdpa`/`gdpr`/`ccpa`/`pipl`
* `SYNAP_STATIC_DIR` — when set, backend serves static files from this directory (used by fullstack image)

## Data & Privacy

- Primary storage is in Singapore. Transport is HTTPS/TLS; at‑rest encryption is required for persistence.
- We use Cloudflare CDN for performance and security. Requests may pass through edge nodes, but survey/response data resides only in our Singapore origin and is not retained at the edge. Cloudflare may temporarily process limited network metadata (e.g., IP) for routing/security; it is not used for advertising. See Privacy.
- Raw IPs are **not stored** in content data. Only minimal technical logs may be kept for security/quality control.
- Consent evidence is stored as a hashed record; participants receive a downloadable JSON copy.
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

Additional docs: see `docs/ci-cd.md`, `docs/deploy.md`, `docs/i18n.md`, `docs/persistence.md`.
See also E2EE design and usage: `docs/e2ee.md`.
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
