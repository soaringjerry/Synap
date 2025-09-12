import React, { useEffect, useMemo, useState } from 'react'
import { seedSample, listItems, submitBulk, getAlpha } from './api/client'

type Item = { id: string; stem: string; reverse?: boolean }

function LikertScale({ points, value, onChange }: { points?: number; value: number; onChange: (v: number) => void }) {
  const p = points ?? 5
  return (
    <div className="scale">
      {Array.from({ length: p }).map((_, i) => {
        const v = i + 1
        return (
          <button key={v} type="button" className={"bubble" + (value === v ? " active" : "")}
            onClick={() => onChange(v)} aria-pressed={value === v}>
            {v}
          </button>
        )
      })}
    </div>
  )
}

function reverseScore(raw: number, points: number) { return (points + 1) - raw }

export function App() {
  const [lang, setLang] = useState<'en' | 'zh'>(() => (navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'))
  const [scaleId, setScaleId] = useState('SAMPLE')
  const [items, setItems] = useState<Item[]>([])
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const points = 5

  const total = useMemo(() => {
    let sum = 0
    for (const it of items) {
      const v = answers[it.id]
      if (!v) continue
      sum += it.reverse ? reverseScore(v, points) : v
    }
    return sum
  }, [answers, items])

  useEffect(() => {
    listItems(scaleId, lang).then(({ items }) => {
      setItems(items.map(it => ({ id: it.id, stem: it.stem, reverse: it.reverse_scored })))
      setAnswers({})
    }).catch(() => setItems([]))
  }, [scaleId, lang])

  const [msg, setMsg] = useState('')
  const [alpha, setAlpha] = useState<number | null>(null)

  const submit = async () => {
    try {
      const payload = Object.entries(answers).map(([item_id, v]) => ({ item_id, raw_value: v }))
      const r = await submitBulk(scaleId, '', payload)
      setMsg(`Submitted ${r.count} answers. pid=${r.participant_id}`)
      const a = await getAlpha(scaleId)
      setAlpha(a.alpha)
    } catch (e: any) {
      setMsg(e.message || String(e))
    }
  }

  return (
    <div className="container">
      <div className="hero">
        <div className="glitch" data-text="Synap — Cyber Survey">Synap — Cyber Survey</div>
        <div className="muted">Neon vibes · subtle chaos · focused research</div>
      </div>

      <div className="row">
        <section className="card span-6">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Quick Survey</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="neon-btn" onClick={async () => { await seedSample(); setScaleId('SAMPLE'); const { items } = await listItems('SAMPLE', lang); setItems(items.map(it => ({ id: it.id, stem: it.stem, reverse: it.reverse_scored })))} }>Seed Sample</button>
              <select value={lang} onChange={e => setLang(e.target.value as any)} className="neon-btn" aria-label="Language">
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
          </div>
          <div className="divider" />
          {items.length === 0 && <div className="muted">No items. Click Seed Sample.</div>}
          {items.map((it) => (
            <div key={it.id} className="item">
              <div className="label">{it.stem}{it.reverse ? ' · (R)' : ''}</div>
              <LikertScale points={points} value={answers[it.id] ?? 0} onChange={(v) => setAnswers(a => ({ ...a, [it.id]: v }))} />
            </div>
          ))}
          <div className="divider" />
          <div className="muted">Total score: {total}</div>
          <div style={{ height: 12 }} />
          <button className="neon-btn" onClick={submit}>Submit</button>
          {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
          {alpha != null && <div className="muted" style={{ marginTop: 4 }}>Cronbach's α: {alpha.toFixed(3)}</div>}
        </section>

        <section className="card span-6 offset">
          <h3 style={{ marginTop: 0 }}>Status</h3>
          <div className="divider" />
          <p className="muted" style={{ marginTop: 0 }}>
            Backend health: <a href="/health" target="_blank" rel="noreferrer">/health</a>
          </p>
          <p className="muted">
            Style: neon accents, broken grid, subtle glitch overlays; function stays clean.
          </p>
          <button className="neon-btn" onClick={() => window.location.reload()}>Reload</button>
          <div style={{ height: 12 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="neon-btn" href={`/api/export?format=long&scale_id=${encodeURIComponent(scaleId)}`} target="_blank" rel="noreferrer">Export Long CSV</a>
            <a className="neon-btn" href={`/api/export?format=wide&scale_id=${encodeURIComponent(scaleId)}`} target="_blank" rel="noreferrer">Export Wide CSV</a>
            <a className="neon-btn" href={`/api/export?format=score&scale_id=${encodeURIComponent(scaleId)}`} target="_blank" rel="noreferrer">Export Score CSV</a>
          </div>
        </section>
      </div>
    </div>
  )
}
