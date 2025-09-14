# Changelog

All notable changes to this project will be documented here.

## Unreleased
- Initial MVP scaffolding (Go backend, React frontend)
- In‑memory APIs for survey flow; exports and α metric
- Dev/Fullstack/Backend images and one‑click deploy
- i18n (en/zh) and professional UI refresh
- Admin auth (JWT), tenant scaffolding
## Unreleased

- E2EE
  - Creation-time key setup (generate in browser or upload public key); E2EE/Region locked after creation
  - Export flow clarified: encrypted bundle (.json with manifest + Ed25519 + ciphertext) and local plaintext export (browser-only JSONL/CSV long|wide with readable EN/ZH texts). HTTP CSV responses include BOM (Excel-safe)
  - Local private key import for decryption（JSON 文件，仅存浏览器）
  - CSV exports disabled on server when E2EE=ON（明文留在本地）；高级分析在服务器端禁用（仅基础计数）
  - New endpoints: POST /api/exports/e2ee (create short link), GET /api/exports/e2ee?job=...&token=...

- Consent
  - Interactive confirmations 简化为 Off / Optional / Required 三段式（每项可设），支持 EN/ZH 标签；高级模式提供可视化编辑与即时报错
  - Signature requirement toggle（signature_required）；同意证据哈希存储，支持参与者下载 PDF 副本（拦截时下载 HTML 兜底）
  - 管理端保存 consent_config；前端提交 responses/bulk 支持 consent_id；服务器导出 CSV 包含 consent.*（1/0）
  - New endpoint: POST /api/consent/sign

- Participant self-service (GDPR)
  - Non‑E2EE: GET /api/self/participant/export, POST /api/self/participant/delete（POST 修正）
  - E2EE: GET /api/self/e2ee/export, POST /api/self/e2ee/delete

- Admin
  - Danger Zone: DELETE /api/admin/scales/{id}/responses (purge responses); delete scale from list
  - Create/Manage Scale: E2EE + Consent 指引更清晰；Likert 锚点模板（Agree/Frequency 5、Agree/Bipolar 7、Monopolar 5）与自定义；可选择“数字+文字”模式

- UX/Responsive
  - Mobile: larger tap targets, Likert wrap (max 5/row), sticky submit bar, 16px inputs (prevent iOS zoom)
  - AI Translation: clearer steps, quick target chips, provider readiness check, per‑item include toggles

- Code quality
  - Refactor: reduce cyclomatic complexity in export/admin handlers
  - gofmt fixes, i18n check (code-used keys) 增强
