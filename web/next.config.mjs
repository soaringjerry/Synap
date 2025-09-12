/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true
  },
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
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'", // allow Tailwind injected styles
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'"
      ].join('; ') }
    ]
    return [
      { source: '/:path*', headers: common }
    ]
  }
}

export default nextConfig

