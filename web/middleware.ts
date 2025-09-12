import createMiddleware from 'next-intl/middleware'

export default createMiddleware({
  locales: ['en', 'zh-CN', 'ja'],
  defaultLocale: 'en',
  localePrefix: 'as-needed'
})

export const config = {
  matcher: [
    '/',
    '/(en|zh-CN|ja)/:path*'
  ]
}

