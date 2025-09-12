import { useTranslations } from 'next-intl'

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
      <section className="card md:col-span-4">
        <h3 className="text-xl font-display">{t('widgets.status')}</h3>
        <div className="mt-2 text-text-secondary">{t('widgets.statusDesc')}</div>
      </section>
      <section className="card md:col-span-8">
        <h3 className="text-xl font-display">{t('widgets.activity')}</h3>
        <div className="mt-2 text-text-secondary">{t('widgets.activityDesc')}</div>
      </section>
      <section className="card md:col-span-12">
        <h3 className="text-xl font-display">{t('widgets.quick')}</h3>
        <div className="mt-2 text-text-secondary">{t('widgets.quickDesc')}</div>
      </section>
    </div>
  )
}

