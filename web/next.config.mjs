import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin()

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true
  },
  // Standalone output for Docker runtime
  output: 'standalone',
  async headers() {
    // Global security + caching headers
    const common = [
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'Pragma', value: 'no-cache' },
      { key: 'Expires', value: '0' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      // CSP without inline scripts/styles. Avoid unsafe-inline. Use only hashed/nonce if necessary (not used here).
      { key: 'Content-Security-Policy', value: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        // Temporarily allow inline scripts for hydration; follow-up: switch to nonce-based CSP
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'"
      ].join('; ') }
    ]
    return [
      { source: '/:path*', headers: common }
    ]
  }
  ,async redirects() {
    return [
      { source: '/', destination: '/en', permanent: false },
      { source: '/dashboard', destination: '/en/dashboard', permanent: false },
      { source: '/explore', destination: '/en/explore', permanent: false },
      { source: '/settings', destination: '/en/settings', permanent: false },
      { source: '/legal/privacy', destination: '/en/legal/privacy', permanent: false }
    ]
  }
}

export default withNextIntl(nextConfig)
