import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function Home() {
  const { t } = useTranslation()
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <h1 className="glitch" data-text={t('home.hero.title')}>{t('home.hero.title')}</h1>
        <p className="muted" style={{maxWidth: '62ch'}}>{t('home.hero.subtitle')}</p>
        <div style={{ height: 14 }} />
        <div className="cta-row">
          <Link className="btn btn-primary" to="/auth">{t('home.hero.cta_primary')}</Link>
          <Link className="btn btn-ghost" to="/admin">{t('home.hero.cta_secondary')}</Link>
        </div>
      </section>

      {/* Why Synap */}
      <section className="row">
        <div className="card span-12">
          <h3 className="section-title">Why Synap</h3>
          <div className="value-bullets">
            <div className="bullet">🧠 {t('home.why.research')}</div>
            <div className="bullet">📊 {t('home.why.stats')}</div>
            <div className="bullet">🔒 {t('home.why.privacy')}</div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="row">
        <div className="card span-12">
          <h3 className="section-title">{t('home.use.title')}</h3>
          <div className="use-grid">
            <div>🎓 {t('home.use.psych')}</div>
            <div>🏫 {t('home.use.edu')}</div>
            <div>🧪 {t('home.use.paper')}</div>
            <div>👫 {t('home.use.social')}</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="row">
        <div className="card span-12">
          <h3 className="section-title">{t('home.features.title')}</h3>
          <div className="feat-grid">
            <div className="feat">
              <div className="feat-k">{t('home.features.online.k')}</div>
              <div className="muted">{t('home.features.online.v')}</div>
            </div>
            <div className="feat">
              <div className="feat-k">{t('home.features.progress.k')}</div>
              <div className="muted">{t('home.features.progress.v')}</div>
            </div>
            <div className="feat">
              <div className="feat-k">{t('home.features.export.k')}</div>
              <div className="muted">{t('home.features.export.v')}</div>
            </div>
            <div className="feat">
              <div className="feat-k">{t('home.features.i18n.k')}</div>
              <div className="muted">{t('home.features.i18n.v')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo CTA */}
      <section className="row">
        <div className="card span-12">
          <h3 className="section-title">Demo</h3>
          <p className="muted" style={{maxWidth:'72ch'}}>{t('home.demo.text')}</p>
          <div style={{height:12}} />
          <Link className="btn btn-primary" to="/admin">{t('home.demo.button')}</Link>
        </div>
      </section>

      {/* Credibility */}
      <section className="row">
        <div className="card span-12">
          <h3 className="section-title">{t('home.cred.title')}</h3>
          <ul className="kv-list">
            <li><b>{t('home.cred.rigorous.k')}</b> — <span className="muted">{t('home.cred.rigorous.v')}</span></li>
            <li><b>{t('home.cred.reliable.k')}</b> — <span className="muted">{t('home.cred.reliable.v')}</span></li>
            <li><b>{t('home.cred.global.k')}</b> — <span className="muted">{t('home.cred.global.v')}</span></li>
            <li><b>{t('home.cred.compliant.k')}</b> — <span className="muted">{t('home.cred.compliant.v')}</span></li>
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="row">
        <div className="card span-12" style={{textAlign:'center'}}>
          <h3 className="section-title">{t('home.cta.title')}</h3>
          <div style={{height:10}} />
          <Link className="btn btn-primary" to="/auth">{t('home.cta.button')}</Link>
        </div>
      </section>
    </>
  )
}
