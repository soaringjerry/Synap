# Synap Web (Cyber Nocturne UI)

Next.js App Router implementation of the “赛博夜行” spec.

## Tech
- Next.js 14 (App Router, TypeScript)
- Tailwind CSS + CSS Variables (Design Tokens)
- next-intl (i18n: en, zh-CN, ja)
- Radix Primitives (on-demand), lucide-react, framer-motion
- react-hook-form + zod, Zustand
- Storybook for components

## Run

```bash
cd web
npm i
npm run dev
```

Open http://localhost:3000 → auto locale prefix (e.g., /en).

## Caching & Security (strict by default)
- Cache-Control: no-store (all routes)
- Pragma: no-cache, Expires: 0
- CSP: default-src 'self'; style-src allows inline for Tailwind; no service worker
- Referrer-Policy: strict-origin-when-cross-origin
- X-Frame-Options: DENY

Toggle policy (future): switch to HTML no-store + asset long cache via contenthash.

## Design Tokens
See `styles/tokens.css` and Tailwind theme extensions. Dark default, light optional.

## i18n
- Locale prefix routes: /en, /zh-CN, /ja
- Namespaces: common, marketing, dashboard, settings

## Accessibility
- Semantic landmarks, focus-visible ring
- Colors meet WCAG AA targets
- Respects prefers-reduced-motion; settings allow motion/neon intensity control

## No Service Worker
PWA is disabled. Do not register SW in examples.

## Storybook
```bash
npm run storybook
```

## CI
Add Node checks for `web/` in repo CI; build outputs `.next`.

