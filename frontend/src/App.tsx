import React, { useMemo, useState } from 'react'

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
  const [items] = useState<Item[]>(() => [
    { id: 'I1', stem: lang === 'zh' ? '我对当前学习进度感到满意' : 'I am satisfied with my current study progress.' },
    { id: 'I2', stem: lang === 'zh' ? '我喜欢在压力下工作' : 'I enjoy working under pressure.', reverse: true },
    { id: 'I3', stem: lang === 'zh' ? '我能专注于手头任务' : 'I can stay focused on tasks.' },
  ])
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
            <div>
              <select value={lang} onChange={e => setLang(e.target.value as any)} className="neon-btn" aria-label="Language">
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
          </div>
          <div className="divider" />
          {items.map((it) => (
            <div key={it.id} className="item">
              <div className="label">{it.stem}{it.reverse ? ' · (R)' : ''}</div>
              <LikertScale points={points} value={answers[it.id] ?? 0} onChange={(v) => setAnswers(a => ({ ...a, [it.id]: v }))} />
            </div>
          ))}
          <div className="divider" />
          <div className="muted">Total score: {total}</div>
          <div style={{ height: 12 }} />
          <button className="neon-btn" onClick={() => alert('Submitted! (wire API next)')}>Submit</button>
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
        </section>
      </div>
    </div>
  )
}
