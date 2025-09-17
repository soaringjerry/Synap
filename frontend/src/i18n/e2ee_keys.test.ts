import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import zh from './locales/zh.json'

const requiredKeys = [
  'local_plain_ready',
  'local_decrypt_button',
  'local_decrypt_csv_long',
  'local_decrypt_csv_wide',
  'local_csv_long_ready',
  'local_csv_wide_ready',
]

describe('i18n e2ee keys', () => {
  const locales: Record<string, Record<string, string>> = {
    en: (((en as Record<string, unknown>).common as Record<string, unknown>)?.e2ee ?? {}) as Record<string, string>,
    zh: (((zh as Record<string, unknown>).common as Record<string, unknown>)?.e2ee ?? {}) as Record<string, string>,
  }

  it.each(Object.entries(locales))('locale %s includes required e2ee keys', (_locale, section) => {
    requiredKeys.forEach(key => {
      expect(section).toHaveProperty(key)
      expect(typeof section[key]).toBe('string')
      expect((section[key] as string).length).toBeGreaterThan(0)
    })
  })
})
