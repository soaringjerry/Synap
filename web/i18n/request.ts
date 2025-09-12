import {getRequestConfig} from 'next-intl/server'

export default getRequestConfig(async ({locale}) => {
  const supported = ['en', 'zh-CN', 'ja'] as const
  const loc = supported.includes(locale as any) ? locale : 'en'
  const messages = (await import(`../messages/${loc}.json`)).default
  return { locale: loc, messages }
})
