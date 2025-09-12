import createMiddleware from 'next-intl/middleware'

export default createMiddleware({
  locales: ['en', 'zh-CN', 'ja'],
  defaultLocale: 'en',
  localePrefix: 'as-needed'
})

// Run on all app routes except API and assets so locale is always injected.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'
  ]
}
