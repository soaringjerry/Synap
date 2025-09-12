import { useTranslations } from 'next-intl'
import Link from 'next/link'

export default function HomePage() {
  const t = useTranslations('marketing')
  return (
    <>
      <section className="mb-6">
        <h1 className="glitch text-4xl md:text-6xl" data-text={t('heroTitle')}>{t('heroTitle')}</h1>
        <p className="text-text-secondary max-w-2xl mt-2">{t('tagline')}</p>
        <div className="mt-5 flex gap-3">
          <Link href="/en/dashboard" className="btn btn-primary">{t('ctaPrimary')}</Link>
          <Link href="/en/explore" className="btn btn-ghost">{t('ctaSecondary')}</Link>
        </div>
      </section>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-2xl font-display">{t('feature.speed.title')}</h3>
          <p className="text-text-secondary mt-1">{t('feature.speed.desc')}</p>
        </div>
        <div className="card">
          <h3 className="text-2xl font-display">{t('feature.design.title')}</h3>
          <p className="text-text-secondary mt-1">{t('feature.design.desc')}</p>
        </div>
      </section>
    </>
  )
}

