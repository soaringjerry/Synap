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
          <p className="muted">A modern survey platform for psychology & behavioral research: fast Go backend, React frontend, privacy by default, and AI-compatible design.</p>
          <div style={{ height: 12 }} />
          <Link className="neon-btn" to="/admin">Start Creating Survey</Link>
          <span style={{ display: 'inline-block', width: 8 }} />
          <Link className="neon-btn" to="/auth">Register / Login</Link>
        </section>
      </div>
    </div>
  )
}

