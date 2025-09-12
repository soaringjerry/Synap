import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function Home() {
  const { t } = useTranslation()
  return (
    <div className="container">
      <div className="hero">
        <div className="glitch" data-text={t('title')}>{t('title')}</div>
        <div className="muted">{t('tagline')}</div>
      </div>
      <div className="row">
        <section className="card span-6">
          <h3 style={{ marginTop: 0 }}>Synap</h3>
          <p className="muted">{t('home_intro')}</p>
          <div style={{ height: 12 }} />
          <Link className="neon-btn" to="/admin">{t('cta_create')}</Link>
          <span style={{ display: 'inline-block', width: 8 }} />
          <Link className="neon-btn" to="/auth">{t('cta_auth')}</Link>
        </section>
      </div>
    </div>
  )
}
