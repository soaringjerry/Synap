import { useTranslations } from 'next-intl'

export default function ExplorePage() {
  const t = useTranslations('marketing')
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[1,2,3].map((i)=> (
        <div className="card" key={i}>
          <h3 className="text-xl font-display">{t('panels.itemTitle', { index: i })}</h3>
          <p className="text-text-secondary mt-1">{t('panels.itemDesc')}</p>
        </div>
      ))}
    </div>
  )
}

