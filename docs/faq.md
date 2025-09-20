# FAQ & Troubleshooting

## I get `404 page not found` on `/`
- Backend‑only image serves API; use fullstack image or provide static at `SYNAP_STATIC_DIR`.
- In dev, backend proxies `/` to Vite when `SYNAP_DEV_FRONTEND_URL` is set.

## Dev returns HTML for `/api/*` (JSON parse error)
- When using Vite (5173), ensure proxy is enabled (we configure `/api` → 8080).
- Or call the backend port directly.

## Watchtower updates too slow
- Set `WATCH_INTERVAL=60` (default) or pass `--watch-interval 60` to the quick‑deploy script.
- Trigger manual check: `docker compose exec watchtower watchtower --run-once`.

## i18n not switching
- Use the language selector (top‑right). Choice persists and updates URL `?lang`.
- Items reload by `lang`, UI uses react‑i18next.

## Where is data stored? Does it go through CDN?

中文：

- 我们的服务器和数据库主要位于新加坡，个人数据将存储与处理在该地区。
- 为提升全球访问速度，我们使用 Cloudflare 的 CDN 与边缘缓存，用户请求在传输过程中可能会经过 Cloudflare 边缘节点，但问卷与个人数据仅存放于新加坡服务器，不在边缘长期保留。
- Cloudflare 在传输过程中可能会短暂处理有限的网络元数据（如 IP），仅用于路由与安全，且不用于广告或未经同意的用途。我们确保该处理符合 GDPR 与 PDPA 要求，并已签署 DPA（参见 Cloudflare Customer DPA）。

English:

- Our servers and databases are primarily located in Singapore, where personal data is stored and processed.
- To improve global performance, we use Cloudflare for CDN and edge caching. Requests may pass through Cloudflare’s edge nodes during transmission, but survey data is stored only in our Singapore servers and not retained at the edge.
- Cloudflare may temporarily process limited network metadata (e.g., IP addresses) for routing and security, not for advertising or unauthorized purposes. We ensure this processing remains compliant with GDPR and PDPA, and we have signed a DPA (see Cloudflare Customer DPA).
## 如何在导出里看到提交时间？

- 非 E2EE：
  - 长表 `long` 已包含 `submitted_at` 列。
  - 宽表 `wide` 也包含 `submitted_at` 列（每参与者一行）。
- E2EE：
  - 浏览器内解密生成的 CSV 同样包含 `submitted_at`，其值来自加密包条目的 `created_at`。

## 为什么 CSV 里的文本总是英文？

- 为便于分析，服务端导出（非 E2EE）会将非数值题的文本答案在保存时统一映射为英文（基于 `options_i18n`）。
- E2EE 的浏览器端导出也会在本地对非数值题做相同的映射。题目列头与同意列名统一为英文，不影响 E2EE 安全性。
