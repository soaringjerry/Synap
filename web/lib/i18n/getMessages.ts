export async function getMessages(locale: string) {
  switch (locale) {
    case 'zh-CN':
      return (await import('../../messages/zh-CN.json')).default
    case 'ja':
      return (await import('../../messages/ja.json')).default
    default:
      return (await import('../../messages/en.json')).default
  }
}

