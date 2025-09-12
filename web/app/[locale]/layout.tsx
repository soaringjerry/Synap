import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals-import.css'
import { NextIntlClientProvider } from 'next-intl'
import { ReactNode } from 'react'
import { getMessages } from '../../lib/i18n/getMessages'
import { Navbar } from '../../components/Navbar'
export const dynamic = 'force-dynamic'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const space = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Synap · Cyber Nocturne',
  description: 'Fast, neon, and professional. Built for night runners.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: { title: 'Synap', description: 'Cyber nocturne UI', type: 'website' }
}

export default async function RootLayout({ children, params }: { children: ReactNode; params: { locale: string } }) {
  const { locale } = params
  const locales = ['en', 'zh-CN', 'ja'] as const
  if (!locales.includes(locale as any)) notFound()
  const messages = await getMessages(locale)

  return (
    <html lang={locale} className="dark">
      <body className={`${inter.variable} ${space.variable} ${mono.variable}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <header className="app-header">
            <div className="container">
              <Navbar />
            </div>
          </header>
          <main className="page">
            <div className="container">{children}</div>
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
