import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlphaGauge } from '../components/AlphaGauge'
import { Sparkline } from '../components/Sparkline'
import { Heatmap } from '../components/Heatmap'

export function Home() {
  const { t } = useTranslation()
  return (
    <>
      {/* Hero */}
      <section className="hero hero-cyber">
        <div className="hero-inner">
          <div className="scanlines" aria-hidden />
          <h1 className="glitch mega" data-text={t('home.hero.title')}>{t('home.hero.title')}</h1>
          <p className="muted lead" style={{maxWidth: '72ch'}}>{t('home.hero.subtitle')}</p>
          <div className="cta-row">
            <Link className="btn btn-primary" to="/auth">{t('home.hero.cta_primary')}</Link>
            <Link className="btn btn-ghost" to="/admin">{t('home.hero.cta_secondary')}</Link>
          </div>
          <div className="hero-decoration" aria-hidden>
            <div className="neon-divider" />
            <div className="neon-dots" />
          </div>
        </div>
      </section>

      {/* Showcase: visually communicate research capability */}
      <section className="row">
        <div className="span-12 neo-panel">
          <div className="panel-head">
            <h3 className="section-title">{t('home.showcase.title')}</h3>
            <div className="panel-actions" aria-hidden>
              <span className="dot"/><span className="dot"/><span className="dot"/>
            </div>
          </div>
          <div className="showcase-grid">
            <div className="showcase-item tilt">
              <div className="showcase-title">Cronbach α</div>
              <AlphaGauge value={0.87} label={t('home.showcase.alpha')} />
            </div>
            <div className="showcase-item tilt">
              <div className="showcase-title">{t('home.showcase.progress')}</div>
              <Sparkline points={[3,5,4,6,7,6,8,9,8,10]} />
              <div className="muted sub">{t('home.showcase.spark_hint')}</div>
            </div>
            <div className="showcase-item tilt">
              <div className="showcase-title">{t('home.showcase.heatmap')}</div>
              <Heatmap rows={7} cols={12} />
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="row">
        <div className="span-12 feature-wrap">
          <h3 className="section-title">{t('home.use.title')}</h3>
          <div className="use-grid">
            <div className="feature-card tilt">🎓 {t('home.use.psych')}</div>
            <div className="feature-card tilt">🏫 {t('home.use.edu')}</div>
            <div className="feature-card tilt">🧪 {t('home.use.paper')}</div>
            <div className="feature-card tilt">👫 {t('home.use.social')}</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="row">
        <div className="span-12 feature-wrap">
          <h3 className="section-title">{t('home.features.title')}</h3>
          <div className="feat-grid">
            <div className="feat feature-card tilt">
              <div className="feat-k">{t('home.features.online.k')}</div>
              <div className="muted">{t('home.features.online.v')}</div>
            </div>
            <div className="feat feature-card tilt">
              <div className="feat-k">{t('home.features.progress.k')}</div>
              <div className="muted">{t('home.features.progress.v')}</div>
            </div>
            <div className="feat feature-card tilt">
              <div className="feat-k">{t('home.features.export.k')}</div>
              <div className="muted">{t('home.features.export.v')}</div>
            </div>
            <div className="feat feature-card tilt">
              <div className="feat-k">{t('home.features.i18n.k')}</div>
              <div className="muted">{t('home.features.i18n.v')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo CTA + Preview */}
      <section className="row">
        <div className="span-12 demo-wrap neo-panel">
          <div className="panel-head">
            <h3 className="section-title">Demo</h3>
          </div>
          <div className="demo-grid">
            <div className="demo-copy">
              <p className="muted" style={{maxWidth:'68ch'}}>{t('home.demo.text')}</p>
              <div className="cta-row" style={{marginTop:12}}>
                <Link className="btn btn-primary" to="/admin">{t('home.demo.button')}</Link>
              </div>
            </div>
            <div className="demo-preview tilt" aria-label="Survey Preview">
              <div className="demo-card">
                <div className="demo-title">Likert Preview</div>
                <div className="demo-item">I stay focused on tasks.
                  <div className="scale" style={{marginTop:8}}>
                    {[1,2,3,4,5].map(v=> (
                      <button key={v} className={`bubble ${v===4?'active':''}`} aria-hidden>{v}</button>
                    ))}
                  </div>
                </div>
                <div className="demo-item">I enjoy working under pressure.
                  <div className="scale" style={{marginTop:8}}>
                    {[1,2,3,4,5].map(v=> (
                      <button key={v} className={`bubble ${v===2?'active':''}`} aria-hidden>{v}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility */}
      <section className="row">
        <div className="span-12 neo-panel">
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
        <div className="span-12 neo-panel" style={{textAlign:'center'}}>
          <h3 className="section-title">{t('home.cta.title')}</h3>
          <div style={{height:10}} />
          <Link className="btn btn-primary" to="/auth">{t('home.cta.button')}</Link>
        </div>
      </section>
    </>
  )
}
